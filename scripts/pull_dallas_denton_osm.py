"""
Dallas County + Denton County — OpenStreetMap Overpass pull
Pulls residential addresses from OSM, inserts into parcels table.
Same approach as pull_storm_parcels.py (Parker/Johnson/Wise counties).
Splits each county into a 3x3 grid to stay within Overpass limits.

Run: python pull_dallas_denton_osm.py
     python pull_dallas_denton_osm.py --county dallas
     python pull_dallas_denton_osm.py --county denton
"""
import json, time, os, math, logging, argparse, hashlib, urllib.parse
import urllib.request, urllib.error
import psycopg2
from psycopg2.extras import execute_values

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(message)s",
    handlers=[logging.StreamHandler(), logging.FileHandler("/tmp/dallas_denton_osm.log")]
)
log = logging.getLogger()

DB_URL       = "postgresql://roofworks:roofworks_secure_2026@localhost:5440/roofworks"
OVERPASS_URL = "https://overpass-api.de/api/interpreter"
DELAY        = 2.0   # seconds between Overpass requests

COUNTIES = {
    "dallas": {
        "county": "dallas",
        "bbox":   (32.54, -97.04, 33.02, -96.47),
        "grid":   4,   # split into 4x4 = 16 sub-cells
    },
    "denton": {
        "county": "denton",
        "bbox":   (33.00, -97.70, 33.60, -96.85),
        "grid":   3,
    },
}

def get_conn():
    return psycopg2.connect(DB_URL)

def overpass_query(s, w, n, e):
    query = f"""
[out:json][timeout:60];
(
  node["building"="house"]["addr:street"]({s},{w},{n},{e});
  node["building"="residential"]["addr:street"]({s},{w},{n},{e});
  node["addr:street"]["addr:housenumber"]({s},{w},{n},{e});
  way["building"="house"]["addr:street"]({s},{w},{n},{e});
  way["building"="residential"]["addr:street"]({s},{w},{n},{e});
);
out center tags;
"""
    data = urllib.parse.urlencode({"data": query}).encode()
    req  = urllib.request.Request(OVERPASS_URL, data=data,
                                  headers={"Content-Type": "application/x-www-form-urlencoded",
                                           "User-Agent": "RoofWorksAdmin/1.0 contact:info@roofworksoftexas.com"})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=90) as resp:
                return json.loads(resp.read())
        except Exception as e:
            log.warning(f"  Overpass attempt {attempt+1} failed: {e}")
            time.sleep(5 * (attempt + 1))
    return {"elements": []}

def element_to_row(el, county):
    tags = el.get("tags", {})
    hn   = tags.get("addr:housenumber", "").strip()
    st   = tags.get("addr:street", "").strip()
    if not hn or not st:
        return None

    prop_address = f"{hn} {st}".upper()
    prop_city    = (tags.get("addr:city", "") or tags.get("addr:suburb", "") or
                    tags.get("is_in:city", "")).strip().upper() or county.upper()
    prop_zip     = tags.get("addr:postcode", "").strip()

    if el["type"] == "node":
        lat, lon = el.get("lat"), el.get("lon")
    else:
        c = el.get("center", {})
        lat, lon = c.get("lat"), c.get("lon")

    if lat is None or lon is None:
        return None

    # Deterministic APN so re-runs upsert cleanly
    apn = "osm-" + hashlib.md5(f"{county}:{prop_address}:{prop_city}:{prop_zip}".encode()).hexdigest()[:16]

    return {
        "apn":              apn,
        "cad_source":       "osm",
        "owner_name":       None,
        "owner_mail_addr":  None,
        "owner_mail_city":  None,
        "owner_mail_state": "TX",
        "owner_mail_zip":   None,
        "prop_address":     prop_address[:300],
        "prop_city":        prop_city[:100],
        "prop_zip":         prop_zip[:10] or None,
        "year_built":       None,
        "living_sqft":      None,
        "total_value":      None,
        "prop_type":        "A",
        "is_owner_occupied": True,
        "county":           county,
        "lat":              round(lat, 7),
        "lon":              round(lon, 7),
    }

def upsert_rows(conn, rows):
    if not rows:
        return 0
    seen = {}
    for r in rows:
        seen[r["apn"]] = r
    records = [(
        r["apn"], r["cad_source"], r["owner_name"],
        r["owner_mail_addr"], r["owner_mail_city"], r["owner_mail_state"], r["owner_mail_zip"],
        r["prop_address"], r["prop_city"], r["prop_zip"],
        r["year_built"], r["living_sqft"], r["total_value"],
        r["prop_type"], r["is_owner_occupied"], r["county"],
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
              prop_city  = EXCLUDED.prop_city,
              prop_zip   = COALESCE(EXCLUDED.prop_zip, parcels.prop_zip),
              county     = EXCLUDED.county,
              lat        = EXCLUDED.lat,
              lon        = EXCLUDED.lon
        """, records)
    conn.commit()
    return len(records)

def pull_county(county_key):
    cfg    = COUNTIES[county_key]
    county = cfg["county"]
    s0, w0, n0, e0 = cfg["bbox"]
    grid   = cfg["grid"]

    lat_step = (n0 - s0) / grid
    lon_step = (e0 - w0) / grid
    cells    = [(s0 + i*lat_step, w0 + j*lon_step,
                 s0 + (i+1)*lat_step, w0 + (j+1)*lon_step)
                for i in range(grid) for j in range(grid)]

    log.info(f"=== {county.upper()} — {len(cells)} sub-cells ===")
    conn        = get_conn()
    total_rows  = 0
    total_cells = len(cells)

    for idx, (s, w, n, e) in enumerate(cells, 1):
        log.info(f"  Cell {idx}/{total_cells} — bbox ({s:.3f},{w:.3f},{n:.3f},{e:.3f})")
        result   = overpass_query(s, w, n, e)
        elements = result.get("elements", [])
        rows     = [r for el in elements if (r := element_to_row(el, county))]
        if rows:
            inserted   = upsert_rows(conn, rows)
            total_rows += inserted
            log.info(f"    {len(elements)} elements → {inserted} rows upserted (total: {total_rows})")
        else:
            log.info(f"    {len(elements)} elements → 0 rows")
        time.sleep(DELAY)

    conn.close()
    log.info(f"=== {county.upper()} COMPLETE — {total_rows} total rows ===")

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--county", choices=["dallas", "denton", "both"], default="both")
    args = parser.parse_args()

    targets = ["dallas", "denton"] if args.county == "both" else [args.county]
    for c in targets:
        pull_county(c)
    log.info("All done.")

if __name__ == "__main__":
    main()
