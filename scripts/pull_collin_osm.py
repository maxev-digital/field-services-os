"""
Collin County + surrounding DFW suburbs — OSM Overpass pull
Covers Plano, Frisco, McKinney, Allen, Richardson, Garland (partial),
Wylie, Sachse, Murphy, Rowlett, Rockwall, Fate, Forney, Kaufman.
Uses a 6x6 grid per county bbox for thorough coverage.

Run: python3 pull_collin_osm.py
"""
import json, time, os, logging, hashlib, urllib.parse, urllib.request, urllib.error
import psycopg2
from psycopg2.extras import execute_values

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(message)s",
    handlers=[logging.StreamHandler(), logging.FileHandler("/tmp/collin_osm.log")]
)
log = logging.getLogger()

DB_URL       = "postgresql://roofworks:roofworks_secure_2026@localhost:5440/roofworks"
OVERPASS_URL = "https://overpass-api.de/api/interpreter"
DELAY        = 2.5

COUNTIES = {
    "collin":   {"bbox": (33.00, -97.05, 33.55, -96.40), "grid": 6},
    "rockwall": {"bbox": (32.82, -96.60, 33.10, -96.30), "grid": 4},
    "kaufman":  {"bbox": (32.55, -96.60, 32.95, -96.05), "grid": 4},
    "ellis":    {"bbox": (32.15, -97.25, 32.65, -96.55), "grid": 4},
    "johnson":  {"bbox": (32.15, -97.60, 32.65, -97.10), "grid": 4},
    "parker":   {"bbox": (32.55, -98.20, 33.05, -97.55), "grid": 4},
    "wise":     {"bbox": (33.00, -97.95, 33.50, -97.30), "grid": 4},
}

def get_conn():
    return psycopg2.connect(DB_URL)

def overpass_query(s, w, n, e):
    query = f"""
[out:json][timeout:60];
(
  node["addr:street"]["addr:housenumber"]({s},{w},{n},{e});
  way["building"~"house|residential|detached|semidetached_house"]["addr:street"]({s},{w},{n},{e});
  way["addr:street"]["addr:housenumber"]({s},{w},{n},{e});
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
            time.sleep(8 * (attempt + 1))
    return {"elements": []}

def element_to_row(el, county):
    tags = el.get("tags", {})
    hn   = tags.get("addr:housenumber", "").strip()
    st   = tags.get("addr:street", "").strip()
    if not hn or not st:
        return None
    prop_address = f"{hn} {st}".upper()
    prop_city    = (tags.get("addr:city") or tags.get("addr:suburb") or
                    tags.get("is_in:city") or "").strip().upper() or county.upper()
    prop_zip     = tags.get("addr:postcode", "").strip()
    if el["type"] == "node":
        lat, lon = el.get("lat"), el.get("lon")
    else:
        c = el.get("center", {})
        lat, lon = c.get("lat"), c.get("lon")
    if lat is None or lon is None:
        return None
    apn = "osm-" + hashlib.md5(f"{county}:{prop_address}:{prop_city}:{prop_zip}".encode()).hexdigest()[:16]
    return {
        "apn": apn, "cad_source": "osm", "owner_name": None,
        "owner_mail_addr": None, "owner_mail_city": None, "owner_mail_state": "TX", "owner_mail_zip": None,
        "prop_address": prop_address[:300], "prop_city": prop_city[:100],
        "prop_zip": prop_zip[:10] or None, "year_built": None, "living_sqft": None,
        "total_value": None, "prop_type": "A", "is_owner_occupied": True,
        "county": county, "lat": round(lat, 7), "lon": round(lon, 7),
    }

def upsert_rows(conn, rows):
    if not rows: return 0
    seen = {r["apn"]: r for r in rows}
    records = [(r["apn"], r["cad_source"], r["owner_name"],
                r["owner_mail_addr"], r["owner_mail_city"], r["owner_mail_state"], r["owner_mail_zip"],
                r["prop_address"], r["prop_city"], r["prop_zip"],
                r["year_built"], r["living_sqft"], r["total_value"],
                r["prop_type"], r["is_owner_occupied"], r["county"],
                r["lat"], r["lon"]) for r in seen.values()]
    with conn.cursor() as cur:
        execute_values(cur, """
            INSERT INTO parcels (apn, cad_source, owner_name,
              owner_mail_addr, owner_mail_city, owner_mail_state, owner_mail_zip,
              prop_address, prop_city, prop_zip, year_built, living_sqft, total_value,
              prop_type, is_owner_occupied, county, lat, lon)
            VALUES %s
            ON CONFLICT (apn) DO UPDATE SET
              prop_city = EXCLUDED.prop_city,
              prop_zip  = COALESCE(EXCLUDED.prop_zip, parcels.prop_zip),
              lat = EXCLUDED.lat, lon = EXCLUDED.lon
        """, records)
    conn.commit()
    return len(records)

def pull_county(county_key):
    cfg = COUNTIES[county_key]
    s0, w0, n0, e0 = cfg["bbox"]
    grid = cfg["grid"]
    lat_step = (n0 - s0) / grid
    lon_step = (e0 - w0) / grid
    cells = [(s0 + i*lat_step, w0 + j*lon_step,
              s0 + (i+1)*lat_step, w0 + (j+1)*lon_step)
             for i in range(grid) for j in range(grid)]
    log.info(f"=== {county_key.upper()} — {len(cells)} cells ===")
    conn = get_conn()
    total = 0
    for idx, (s, w, n, e) in enumerate(cells, 1):
        log.info(f"  [{idx}/{len(cells)}] bbox ({s:.3f},{w:.3f},{n:.3f},{e:.3f})")
        result   = overpass_query(s, w, n, e)
        elements = result.get("elements", [])
        rows     = [r for el in elements if (r := element_to_row(el, county_key))]
        if rows:
            n_ups = upsert_rows(conn, rows)
            total += n_ups
            log.info(f"    {len(elements)} elements → {n_ups} upserted (total: {total})")
        else:
            log.info(f"    {len(elements)} elements → 0 rows")
        time.sleep(DELAY)
    conn.close()
    log.info(f"=== {county_key.upper()} DONE — {total} rows ===")

def main():
    for county in COUNTIES:
        pull_county(county)
    log.info("All done.")

if __name__ == "__main__":
    main()
