"""
Pull Tarrant County Appraisal District (TCAD) parcel data for Benbrook area.
Uses spatial query by bounding box — returns Owner_Name on every record.
Upserts into parcels table, replacing OSM rows that lack owner names.
"""
import json, time, math, logging
import urllib.request, urllib.parse
import psycopg2
from psycopg2.extras import execute_values

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
log = logging.getLogger()

DB_URL   = "postgresql://roofworks:roofworks_secure_2026@localhost:5440/roofworks"
TCAD_URL = "https://tad.newedgeservices.com/arcgis/rest/services/OD_TAD/OD_ParcelView/MapServer/0/query"

# Benbrook 76126 + surrounding Tarrant County storm-affected area
BBOX = {"xmin": -97.54, "ymin": 32.64, "xmax": -97.43, "ymax": 32.74}

# Residential property codes in Texas CAD
RESIDENTIAL_CODES = {"A", "A1", "A2", "A3", "A4", "A5", "B", "B1", "B2", "B3"}

BATCH_SIZE = 500  # objectIds per request

def get_conn():
    return psycopg2.connect(DB_URL)

def arcgis_get(params):
    url = TCAD_URL + "?" + urllib.parse.urlencode(params)
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "RoofWorks/1.0"})
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as e:
            wait = 5 * (attempt + 1)
            log.warning(f"Attempt {attempt+1} failed: {e} — retrying in {wait}s")
            time.sleep(wait)
    return None

def centroid(rings):
    """Average of first ring vertices as lat/lon centroid."""
    if not rings:
        return None, None
    ring = rings[0]
    lons = [p[0] for p in ring]
    lats = [p[1] for p in ring]
    return round(sum(lats)/len(lats), 7), round(sum(lons)/len(lons), 7)

def is_owner_occupied(attrs):
    situs  = (attrs.get("Situs_Addr") or "").strip().upper()
    o_addr = (attrs.get("Owner_Addr") or "").strip().upper()
    if not situs or not o_addr:
        return True  # default to owner-occupied if unknown
    return situs[:10] == o_addr[:10]

def safe_int(v):
    try:
        s = str(v).strip()
        return int(s) if s else None
    except (ValueError, TypeError):
        return None

def safe_float(v):
    try:
        s = str(v).strip()
        return float(s) if s else None
    except (ValueError, TypeError):
        return None

def upsert_parcels(conn, rows):
    if not rows:
        return 0
    records = [(
        r["apn"], r["cad_source"], r.get("owner_name"),
        r.get("owner_mail_addr"), r.get("owner_mail_city"),
        "TX", r.get("owner_mail_zip"),
        r["prop_address"], r.get("prop_city"), r.get("prop_zip"),
        r.get("year_built"), r.get("living_sqft"), r.get("total_value"),
        r.get("prop_type", "A1"), r.get("is_owner_occupied", True),
        r["county"], r["lat"], r["lon"],
    ) for r in rows]

    with conn.cursor() as cur:
        execute_values(cur, """
            INSERT INTO parcels (
              apn, cad_source, owner_name,
              owner_mail_addr, owner_mail_city, owner_mail_state, owner_mail_zip,
              prop_address, prop_city, prop_zip,
              year_built, living_sqft, total_value,
              prop_type, is_owner_occupied, county, lat, lon
            ) VALUES %s
            ON CONFLICT (apn) DO UPDATE SET
              owner_name        = EXCLUDED.owner_name,
              owner_mail_addr   = EXCLUDED.owner_mail_addr,
              owner_mail_city   = EXCLUDED.owner_mail_city,
              owner_mail_zip    = EXCLUDED.owner_mail_zip,
              prop_city         = EXCLUDED.prop_city,
              prop_zip          = EXCLUDED.prop_zip,
              year_built        = EXCLUDED.year_built,
              living_sqft       = EXCLUDED.living_sqft,
              total_value       = EXCLUDED.total_value,
              is_owner_occupied = EXCLUDED.is_owner_occupied,
              cad_source        = EXCLUDED.cad_source,
              lat               = EXCLUDED.lat,
              lon               = EXCLUDED.lon
        """, records)
    conn.commit()
    return len(records)

def main():
    conn = get_conn()

    # Step 1: get all objectIds in bbox
    log.info("Fetching object IDs for Benbrook bbox...")
    id_data = arcgis_get({
        "geometry":     json.dumps(BBOX),
        "geometryType": "esriGeometryEnvelope",
        "inSR":         "4326",
        "spatialRel":   "esriSpatialRelIntersects",
        "returnIdsOnly": "true",
        "f":            "json",
    })
    if not id_data or "objectIds" not in id_data:
        log.error(f"Failed to get IDs: {id_data}")
        return

    all_ids = id_data["objectIds"]
    log.info(f"Total parcels in bbox: {len(all_ids)}")

    total_inserted = 0
    total_skipped  = 0

    for i in range(0, len(all_ids), BATCH_SIZE):
        batch_ids = all_ids[i : i + BATCH_SIZE]
        log.info(f"Batch {i//BATCH_SIZE + 1}: fetching IDs {batch_ids[0]}–{batch_ids[-1]} ({len(batch_ids)} records)")

        data = arcgis_get({
            "objectIds":  ",".join(map(str, batch_ids)),
            "outFields":  "Account_Nu,Owner_Name,Owner_Addr,Owner_City,Owner_Zip,Situs_Addr,ZipCode,Year_Built,Living_Are,Total_Valu,Property_C",
            "outSR":      "4326",
            "f":          "json",
        })
        if not data or "features" not in data:
            log.warning(f"Empty response for batch {i//BATCH_SIZE + 1}")
            time.sleep(2)
            continue

        rows = []
        for feat in data["features"]:
            attrs = feat.get("attributes", {})
            geom  = feat.get("geometry", {})

            prop_code = (attrs.get("Property_C") or "").strip()
            if prop_code not in RESIDENTIAL_CODES:
                total_skipped += 1
                continue

            lat, lon = centroid(geom.get("rings", []))
            if not lat or not lon:
                total_skipped += 1
                continue

            situs = (attrs.get("Situs_Addr") or "").strip().upper()
            if not situs:
                total_skipped += 1
                continue

            acct   = (attrs.get("Account_Nu") or "").strip()
            apn    = f"tcad_{acct}" if acct else f"tcad_obj_{batch_ids[0]}"

            zip_   = (attrs.get("ZipCode") or attrs.get("Owner_Zip") or "").strip()[:5]
            owner  = (attrs.get("Owner_Name") or "").strip() or None

            o_addr = (attrs.get("Owner_Addr") or "").strip().upper() or None
            o_city = (attrs.get("Owner_City") or "").strip().upper() or None
            o_zip  = (attrs.get("Owner_Zip")  or "").strip()[:5]    or None

            year   = safe_int(attrs.get("Year_Built"))
            sqft   = safe_int(attrs.get("Living_Are"))
            val    = safe_float(attrs.get("Total_Valu")) or None
            if val == 0:
                val = None  # TCAD often has 0 instead of NULL

            rows.append({
                "apn":              apn,
                "cad_source":       "tcad_arcgis",
                "owner_name":       owner,
                "owner_mail_addr":  o_addr,
                "owner_mail_city":  o_city,
                "owner_mail_zip":   o_zip,
                "prop_address":     situs,
                "prop_city":        "BENBROOK",
                "prop_zip":         zip_ or "76126",
                "year_built":       year,
                "living_sqft":      sqft,
                "total_value":      val,
                "prop_type":        prop_code,
                "is_owner_occupied": is_owner_occupied(attrs),
                "county":           "tarrant",
                "lat":              lat,
                "lon":              lon,
            })

        if rows:
            n = upsert_parcels(conn, rows)
            total_inserted += n
            log.info(f"  → Upserted {n} residential parcels (skipped {total_skipped} non-residential so far)")

        time.sleep(0.5)  # be polite to the API

    conn.close()
    log.info(f"\nDONE — {total_inserted} residential parcels upserted with owner names")

if __name__ == "__main__":
    main()
