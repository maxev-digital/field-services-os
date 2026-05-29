"""
Backfill stories column for Dallas County parcels using DCAD RESSTRTYP field.
Pulls OBJECTID + RESSTRTYP from DCAD, maps to float stories value, bulk-updates parcels.

Run: python update_dcad_stories.py
"""
import json, time, logging, urllib.request, urllib.parse, urllib.error
import psycopg2
from psycopg2.extras import execute_values

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(message)s",
    handlers=[logging.StreamHandler(), logging.FileHandler("/tmp/dcad_stories.log")]
)
log = logging.getLogger()

DB_URL     = "postgresql://roofworks:roofworks_secure_2026@localhost:5440/roofworks"
ARCGIS_URL = "https://maps.dcad.org/prdwa/rest/services/Property/ParcelQuery/MapServer/4/query"
PAGE_SIZE  = 4000
DELAY      = 0.3

STRTYPE_MAP = {
    'ONE STORY':                  1.0,
    'ONE AND ONE HALF STORIES':   1.5,
    'TWO STORIES':                2.0,
    'TWO AND ONE HALF STORIES':   2.5,
    'THREE STORIES':              3.0,
}

def fetch_page(offset):
    params = urllib.parse.urlencode({
        "where":          "USECD='1'",
        "outFields":      "OBJECTID,RESSTRTYP",
        "returnGeometry": "false",
        "resultOffset":   offset,
        "resultRecordCount": PAGE_SIZE,
        "f":              "json",
    })
    url = f"{ARCGIS_URL}?{params}"
    for attempt in range(4):
        try:
            with urllib.request.urlopen(url, timeout=60) as resp:
                return json.loads(resp.read())
        except Exception as e:
            log.warning(f"  Attempt {attempt+1} failed at offset {offset}: {e}")
            time.sleep(5 * (attempt + 1))
    return {"features": []}

def bulk_update(conn, pairs):
    """pairs: list of (apn, stories_float_or_None)"""
    if not pairs:
        return 0
    with conn.cursor() as cur:
        execute_values(cur, """
            UPDATE parcels SET stories = v.stories
            FROM (VALUES %s) AS v(apn, stories)
            WHERE parcels.apn = v.apn
        """, pairs, template="(%s, %s::real)")
    conn.commit()
    return len(pairs)

def main():
    conn   = psycopg2.connect(DB_URL)
    offset = 0
    total  = 0
    skipped = 0

    while True:
        log.info(f"Fetching offset {offset}…")
        data     = fetch_page(offset)
        features = data.get("features", [])
        if not features:
            log.info("No more features — done.")
            break

        pairs = []
        for f in features:
            attrs    = f.get("attributes", {})
            oid      = attrs.get("OBJECTID")
            strtyp   = (attrs.get("RESSTRTYP") or "").strip().upper()
            stories  = STRTYPE_MAP.get(strtyp)   # None for N/A or unknown
            apn      = f"dcad-{oid}"
            pairs.append((apn, stories))

        updated = bulk_update(conn, pairs)
        none_count = sum(1 for _, s in pairs if s is None)
        total  += updated
        skipped += none_count
        log.info(f"  {len(features)} fetched → {updated} updated ({none_count} N/A) — total {total}")

        if not data.get("exceededTransferLimit", False):
            log.info("Last page reached.")
            break
        offset += PAGE_SIZE
        time.sleep(DELAY)

    conn.close()
    log.info(f"=== COMPLETE — {total} rows updated, {skipped} N/A ===")

if __name__ == "__main__":
    main()
