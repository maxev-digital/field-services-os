"""
TAD Tarrant County — ArcGIS REST Pull
No download portal account needed. Pulls residential parcels from the public
TAD MapServer, computes polygon centroids for lat/lon, inserts into parcels table.

Run: python pull_tad_arcgis.py
     python pull_tad_arcgis.py --resume 200000   (restart from OBJECTID 200000)
     python pull_tad_arcgis.py --storm-only       (only parcels in April 25 storm bbox)
"""

import os, sys, time, json, logging, argparse
import requests
import psycopg2
from psycopg2.extras import execute_values

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler("/tmp/tad_pull.log"),
    ]
)
log = logging.getLogger("tad_pull")

BASE_URL  = "https://tad.newedgeservices.com/arcgis/rest/services/OD_TAD/OD_ParcelView/MapServer/0"
BATCH     = 2000       # max records per query
MAX_OID   = 850_000    # conservative upper bound — stops when batches return 0
DELAY     = 0.4        # seconds between requests (polite rate limiting)
DB_URL    = os.environ.get("DATABASE_URL", "postgresql://roofworks:roofworks@localhost:5440/roofworks")

# Residential state use codes to keep (A=single fam, B=multi fam)
RESIDENTIAL_PREFIX = ("A", "B")

# April 25 storm impact bbox for Tarrant County (used with --storm-only)
STORM_BBOX = {"lat_min": 32.55, "lat_max": 33.05, "lon_min": -97.75, "lon_max": -97.10}

# TAD city code -> name mapping (common Tarrant county codes)
CITY_CODES = {
    "003": "AZLE", "026": "FORT WORTH", "027": "FORT WORTH",
    "028": "FORT WORTH", "029": "FORT WORTH", "030": "FORT WORTH",
    "031": "FORT WORTH", "032": "FORT WORTH", "033": "FORT WORTH",
    "034": "FORT WORTH", "035": "FORT WORTH", "040": "ARLINGTON",
    "041": "ARLINGTON", "042": "ARLINGTON", "043": "ARLINGTON",
    "060": "BEDFORD", "061": "EULESS", "062": "HURST",
    "063": "GRAPEVINE", "064": "SOUTHLAKE", "065": "COLLEYVILLE",
    "066": "KELLER", "067": "NORTH RICHLAND HILLS", "068": "RICHLAND HILLS",
    "069": "WATAUGA", "070": "HALTOM CITY", "071": "SAGINAW",
    "072": "LAKE WORTH", "073": "WHITE SETTLEMENT", "074": "BENBROOK",
    "075": "CROWLEY", "076": "BURLESON", "077": "KENNEDALE",
    "078": "MANSFIELD", "079": "GRAND PRAIRIE", "080": "EVERMAN",
    "081": "FOREST HILL", "082": "RIVER OAKS", "083": "WESTOVER HILLS",
    "084": "PELICAN BAY", "085": "EAGLE MOUNTAIN",
}


def get_conn():
    return psycopg2.connect(DB_URL)


def centroid_from_rings(rings):
    """Compute simple centroid of the first polygon ring."""
    if not rings or not rings[0]:
        return None, None
    ring = rings[0]
    lon = sum(p[0] for p in ring) / len(ring)
    lat = sum(p[1] for p in ring) / len(ring)
    # Sanity check for Tarrant County bounds
    if 32.0 < lat < 33.5 and -98.5 < lon < -96.5:
        return round(lat, 7), round(lon, 7)
    return None, None


def safe_str(v, maxlen=None):
    if v is None:
        return None
    s = str(v).strip()
    if not s or s in ("0", "null", "NULL"):
        return None
    return s[:maxlen] if maxlen else s


def safe_int(v):
    s = safe_str(v)
    if not s:
        return None
    try:
        i = int(float(s.replace(",", "")))
        return i if i > 0 else None
    except (ValueError, TypeError):
        return None


def safe_float(v):
    s = safe_str(v)
    if not s:
        return None
    try:
        f = float(s.replace(",", ""))
        return f if f > 0 else None
    except (ValueError, TypeError):
        return None


def fetch_batch(oid_start, oid_end):
    """Fetch one OBJECTID range from the TAD REST API."""
    params = {
        "where":          f"OBJECTID >= {oid_start} AND OBJECTID < {oid_end}",
        "outFields":      "Account_Nu,Owner_Name,Owner_Addr,Owner_City,Owner_Zip,Situs_Addr,City,ZipCode,Year_Built,Living_Are,Total_Valu,State_Use_",
        "returnGeometry": "true",
        "outSR":          "4326",
        "f":              "json",
    }
    for attempt in range(3):
        try:
            resp = requests.get(f"{BASE_URL}/query", params=params, timeout=30)
            resp.raise_for_status()
            d = resp.json()
            if "error" in d:
                log.warning(f"API error at OID {oid_start}: {d['error']}")
                return []
            return d.get("features", [])
        except Exception as e:
            log.warning(f"Attempt {attempt+1} failed for OID {oid_start}: {e}")
            time.sleep(2 ** attempt)
    return []


def features_to_rows(features, storm_only=False):
    """Convert ArcGIS features to parcel row dicts."""
    rows = []
    for feat in features:
        a = feat.get("attributes", {})

        state_use = safe_str(a.get("State_Use_")) or ""
        if not any(state_use.startswith(p) for p in RESIDENTIAL_PREFIX):
            continue

        lat, lon = centroid_from_rings(feat.get("geometry", {}).get("rings"))
        if lat is None:
            continue

        # Storm-area filter
        if storm_only:
            if not (STORM_BBOX["lat_min"] <= lat <= STORM_BBOX["lat_max"] and
                    STORM_BBOX["lon_min"] <= lon <= STORM_BBOX["lon_max"]):
                continue

        apn      = safe_str(a.get("Account_Nu"), 50)
        situs    = safe_str(a.get("Situs_Addr"), 300)
        if not apn or not situs:
            continue

        city_code = safe_str(a.get("City")) or ""
        city_name = CITY_CODES.get(city_code, "FORT WORTH")  # default to Fort Worth if unknown

        yr = safe_int(a.get("Year_Built"))
        if yr and not (1800 < yr < 2030):
            yr = None

        # Owner-occupied: mailing address matches property address
        mail_addr = safe_str(a.get("Owner_Addr"), 300)
        is_owner_occ = (
            bool(mail_addr) and
            mail_addr.strip().lower()[:30] == situs.strip().lower()[:30]
        )

        rows.append({
            "apn":             apn,
            "cad_source":      "tarrant",
            "owner_name":      safe_str(a.get("Owner_Name"),  200),
            "owner_mail_addr": mail_addr,
            "owner_mail_city": safe_str(a.get("Owner_City"),  100),
            "owner_mail_state":"TX",
            "owner_mail_zip":  safe_str(a.get("Owner_Zip"),    10),
            "prop_address":    situs,
            "prop_city":       city_name,
            "prop_zip":        safe_str(a.get("ZipCode"), 10),
            "year_built":      yr,
            "living_sqft":     safe_int(a.get("Living_Are")),
            "total_value":     safe_float(a.get("Total_Valu")),
            "prop_type":       state_use[:10],
            "is_owner_occupied": is_owner_occ,
            "county":          "tarrant",
            "lat":             lat,
            "lon":             lon,
        })
    return rows


def upsert_rows(conn, rows):
    if not rows:
        return 0
    records = [(
        r["apn"], r["cad_source"],
        r.get("owner_name"),
        r.get("owner_mail_addr"), r.get("owner_mail_city"),
        r.get("owner_mail_state"), r.get("owner_mail_zip"),
        r.get("prop_address"), r.get("prop_city"), r.get("prop_zip"),
        r.get("year_built"), r.get("living_sqft"),
        r.get("total_value"),
        r.get("prop_type"), r.get("is_owner_occupied"), r.get("county"),
        r["lat"], r["lon"],
    ) for r in rows]

    with conn.cursor() as cur:
        execute_values(cur, """
            INSERT INTO parcels (
              apn, cad_source,
              owner_name,
              owner_mail_addr, owner_mail_city, owner_mail_state, owner_mail_zip,
              prop_address, prop_city, prop_zip,
              year_built, living_sqft,
              total_value,
              prop_type, is_owner_occupied, county,
              lat, lon
            ) VALUES %s
            ON CONFLICT (apn) DO UPDATE SET
              owner_name        = EXCLUDED.owner_name,
              owner_mail_addr   = EXCLUDED.owner_mail_addr,
              prop_address      = EXCLUDED.prop_address,
              prop_city         = EXCLUDED.prop_city,
              prop_zip          = EXCLUDED.prop_zip,
              year_built        = COALESCE(EXCLUDED.year_built, parcels.year_built),
              living_sqft       = COALESCE(EXCLUDED.living_sqft, parcels.living_sqft),
              total_value       = COALESCE(EXCLUDED.total_value, parcels.total_value),
              prop_type         = EXCLUDED.prop_type,
              is_owner_occupied = EXCLUDED.is_owner_occupied,
              county            = EXCLUDED.county,
              lat               = EXCLUDED.lat,
              lon               = EXCLUDED.lon
        """, records)
    conn.commit()
    return len(records)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--resume",     type=int, default=1,     help="Start OBJECTID (for resuming)")
    parser.add_argument("--storm-only", action="store_true",     help="Only parcels in April 25 storm bbox")
    parser.add_argument("--max-oid",    type=int, default=MAX_OID)
    args = parser.parse_args()

    mode = "STORM AREA ONLY" if args.storm_only else "FULL TARRANT COUNTY"
    log.info("=" * 60)
    log.info(f"TAD ArcGIS Pull — {mode}")
    log.info(f"OID range: {args.resume} → {args.max_oid} | Batch: {BATCH}")
    log.info("=" * 60)

    conn = get_conn()
    total_inserted = 0
    total_features = 0
    empty_batches  = 0

    oid = args.resume
    while oid < args.max_oid:
        oid_end = oid + BATCH
        features = fetch_batch(oid, oid_end)

        if not features:
            empty_batches += 1
            if empty_batches >= 10:
                log.info(f"10 consecutive empty batches at OID {oid} — likely past end of data")
                break
            oid = oid_end
            time.sleep(DELAY)
            continue

        empty_batches = 0
        total_features += len(features)
        rows = features_to_rows(features, storm_only=args.storm_only)

        if rows:
            inserted = upsert_rows(conn, rows)
            total_inserted += inserted

        pct = 100 * (oid - args.resume) / max(1, args.max_oid - args.resume)
        log.info(
            f"OID {oid:>7}-{oid_end:<7} | "
            f"features={len(features):>4} | res_rows={len(rows):>4} | "
            f"total={total_inserted:>6} | {pct:.1f}%"
        )

        oid = oid_end
        time.sleep(DELAY)

    conn.close()

    log.info("")
    log.info("=" * 60)
    log.info(f"COMPLETE — {mode}")
    log.info(f"  Total API features:   {total_features:,}")
    log.info(f"  Residential inserted: {total_inserted:,}")
    log.info("=" * 60)
    log.info("")
    log.info("NEXT: Re-run storm lead gen to pick up Tarrant county:")
    log.info("  cd /var/www/roof-works-admin")
    log.info("  npx tsx scripts/storm_generate_leads.ts --date 20260425")


if __name__ == "__main__":
    main()
