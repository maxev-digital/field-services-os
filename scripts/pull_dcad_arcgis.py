"""
DCAD Dallas County — ArcGIS REST Pull (offset pagination)
Uses resultOffset instead of OID range — works correctly on high-OID services.
682k residential parcels expected.

Run: python3 pull_dcad_arcgis.py
     python3 pull_dcad_arcgis.py --resume 50000
"""
import os, sys, time, json, logging, argparse, urllib.request, urllib.parse
import psycopg2
from psycopg2.extras import execute_values

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(message)s",
    handlers=[logging.StreamHandler(), logging.FileHandler("/tmp/dcad_pull.log")]
)
log = logging.getLogger()

BASE_URL = "https://maps.dcad.org/prdwa/rest/services/Property/ParcelQuery/MapServer/4"
BATCH    = 4000   # DCAD max is 4000
DELAY    = 0.4
DB_URL   = "postgresql://roofworks:roofworks_secure_2026@localhost:5440/roofworks"

def get_conn():
    return psycopg2.connect(DB_URL)

def centroid_from_rings(rings):
    if not rings or not rings[0]:
        return None, None
    ring = rings[0]
    lon = sum(p[0] for p in ring) / len(ring)
    lat = sum(p[1] for p in ring) / len(ring)
    if 32.4 < lat < 33.1 and -97.2 < lon < -96.3:
        return round(lat, 7), round(lon, 7)
    return None, None

def safe_str(v, maxlen=None):
    if v is None: return None
    s = str(v).strip()
    if not s or s.lower() in ("null", "0"): return None
    return s[:maxlen] if maxlen else s

def safe_int(v):
    try:
        i = int(float(v))
        return i if i > 0 else None
    except: return None

def safe_float(v):
    try:
        f = float(v)
        return f if f > 0 else None
    except: return None

def get_total_count():
    params = urllib.parse.urlencode({"where": "USECD='1'", "returnCountOnly": "true", "f": "json"})
    req = urllib.request.Request(f"{BASE_URL}/query?{params}", headers={"User-Agent": "RoofWorksAdmin/1.0"})
    with urllib.request.urlopen(req, timeout=15) as r:
        d = json.loads(r.read())
    return d.get("count", 0)

def fetch_batch(offset):
    params = urllib.parse.urlencode({
        "where": "USECD='1'",
        "outFields": "OBJECTID,SITEADDRESS,OWNERNME1,PSTLCITY,PSTLZIP5,RESFLRAREA,RESYRBLT,CNTASSDVAL",
        "returnGeometry": "true",
        "outSR": "4326",
        "resultOffset": offset,
        "resultRecordCount": BATCH,
        "f": "json"
    })
    url = f"{BASE_URL}/query?{params}"
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "RoofWorksAdmin/1.0"})
            with urllib.request.urlopen(req, timeout=45) as r:
                return json.loads(r.read())
        except Exception as e:
            log.warning(f"  Attempt {attempt+1} failed at offset {offset}: {e}")
            time.sleep(5 * (attempt + 1))
    return {"features": []}

def upsert_rows(conn, rows):
    if not rows: return 0
    seen = {r["apn"]: r for r in rows}
    records = [(
        r["apn"], "dcad",
        r["owner_name"], None, None, "TX", None,
        r["prop_address"], r["prop_city"], r["prop_zip"],
        r["year_built"], r["living_sqft"], r["total_value"],
        "A", True, "dallas",
        r["lat"], r["lon"],
    ) for r in seen.values()]
    with conn.cursor() as cur:
        execute_values(cur, """
            INSERT INTO parcels (
              apn, cad_source, owner_name,
              owner_mail_addr, owner_mail_city, owner_mail_state, owner_mail_zip,
              prop_address, prop_city, prop_zip,
              year_built, living_sqft, total_value,
              prop_type, is_owner_occupied, county,
              lat, lon
            ) VALUES %s
            ON CONFLICT (apn) DO UPDATE SET
              owner_name  = COALESCE(EXCLUDED.owner_name, parcels.owner_name),
              prop_city   = COALESCE(EXCLUDED.prop_city, parcels.prop_city),
              prop_zip    = COALESCE(EXCLUDED.prop_zip, parcels.prop_zip),
              year_built  = COALESCE(EXCLUDED.year_built, parcels.year_built),
              living_sqft = COALESCE(EXCLUDED.living_sqft, parcels.living_sqft),
              total_value = COALESCE(EXCLUDED.total_value, parcels.total_value),
              lat         = EXCLUDED.lat,
              lon         = EXCLUDED.lon
        """, records)
    conn.commit()
    return len(records)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--resume", type=int, default=0, help="Resume from offset")
    args = parser.parse_args()

    log.info("=== DCAD Dallas County Pull ===")
    total = get_total_count()
    log.info(f"Total residential parcels: {total:,}")

    conn = get_conn()
    total_upserted = 0
    offset = args.resume

    while True:
        data = fetch_batch(offset)
        features = data.get("features", [])
        if not features:
            log.info(f"No more features at offset {offset} — done.")
            break

        rows = []
        for feat in features:
            a = feat.get("attributes", {})
            g = feat.get("geometry", {})
            lat, lon = centroid_from_rings(g.get("rings", []))
            if lat is None: continue

            addr = safe_str(a.get("SITEADDRESS"), 300)
            if not addr: continue

            city = (safe_str(a.get("PSTLCITY"), 100) or "DALLAS").strip().upper()
            oid  = int(a.get("OBJECTID", 0))
            apn  = f"dcad-{oid}"

            rows.append({
                "apn":         apn,
                "owner_name":  safe_str(a.get("OWNERNME1"), 200),
                "prop_address": addr.upper(),
                "prop_city":   city,
                "prop_zip":    safe_str(a.get("PSTLZIP5"), 10),
                "year_built":  safe_int(a.get("RESYRBLT")),
                "living_sqft": safe_int(a.get("RESFLRAREA")),
                "total_value": safe_float(a.get("CNTASSDVAL")),
                "lat": lat, "lon": lon,
            })

        n = upsert_rows(conn, rows) if rows else 0
        total_upserted += n
        pct = (offset + len(features)) / total * 100 if total else 0
        log.info(f"  offset {offset:>7} | fetched {len(features):>4} | upserted {n:>4} | total {total_upserted:>7} | {pct:.1f}%")

        if not data.get("exceededTransferLimit") and len(features) < BATCH:
            log.info("Final page reached.")
            break

        offset += BATCH
        time.sleep(DELAY)

    conn.close()
    log.info(f"=== DONE — {total_upserted:,} rows upserted ===")

if __name__ == "__main__":
    main()
