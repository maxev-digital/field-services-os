"""
Pull residential addresses in Benbrook TX 76126 (La Bandera at Team Ranch area)
from OpenStreetMap Overpass API and insert into parcels table.
"""
import json, time, logging
import urllib.request
import psycopg2
from psycopg2.extras import execute_values

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
log = logging.getLogger()

DB_URL = "postgresql://roofworks:roofworks_secure_2026@localhost:5440/roofworks"
OVERPASS_URL = "https://overpass-api.de/api/interpreter"

# Benbrook 76126 — wider bbox to capture all of La Bandera + surrounding neighborhoods
ZONES = [
    {
        "name": "Benbrook 76126 — La Bandera / Team Ranch",
        "county": "tarrant",
        "bbox": (32.64, -97.54, 32.74, -97.43),
        "city_default": "BENBROOK",
        "zip_default": "76126",
    },
    {
        "name": "Benbrook 76116 — Eastern Benbrook",
        "county": "tarrant",
        "bbox": (32.70, -97.44, 32.76, -97.37),
        "city_default": "BENBROOK",
        "zip_default": "76116",
    },
]

def get_conn():
    return psycopg2.connect(DB_URL)

def query_overpass(bbox):
    s, w, n, e = bbox
    query = f"""
[out:json][timeout:90];
(
  node["addr:housenumber"]["addr:street"]({s},{w},{n},{e});
  way["building"]["addr:housenumber"]["addr:street"]({s},{w},{n},{e});
  way["building:levels"]["addr:housenumber"]["addr:street"]({s},{w},{n},{e});
);
out center body;
"""
    data = query.encode("utf-8")
    req = urllib.request.Request(
        OVERPASS_URL, data=data,
        headers={"Content-Type": "application/x-www-form-urlencoded", "User-Agent": "RoofWorksStormLeads/1.0"},
        method="POST"
    )
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as e:
            log.warning(f"Overpass attempt {attempt+1} failed: {e}")
            time.sleep(10 * (attempt + 1))
    return None

def extract_lat_lon(el):
    if el["type"] == "node":
        return el.get("lat"), el.get("lon")
    elif el["type"] == "way":
        c = el.get("center", {})
        return c.get("lat"), c.get("lon")
    return None, None

def safe_str(v, maxlen=None):
    if v is None: return None
    s = str(v).strip().upper()
    return (s[:maxlen] if maxlen else s) or None

SKIP_BUILDINGS = {"commercial","industrial","retail","office","warehouse",
                  "school","hospital","church","cathedral","government",
                  "public","supermarket","garage","carport","shed"}

def is_residential(tags):
    if tags.get("building","").lower() in SKIP_BUILDINGS: return False
    if tags.get("amenity") or tags.get("shop"): return False
    return True

def upsert_parcels(conn, rows):
    if not rows: return 0
    deduped = {r["apn"]: r for r in rows}
    records = [(
        r["apn"], r["cad_source"],
        r.get("owner_name"),
        r.get("prop_address"), r.get("prop_city"), r.get("prop_zip"),
        r.get("year_built"), r.get("living_sqft"), r.get("total_value"),
        r.get("is_owner_occupied", True), r["county"], r["lat"], r["lon"],
    ) for r in deduped.values()]

    with conn.cursor() as cur:
        execute_values(cur, """
            INSERT INTO parcels (
              apn, cad_source, owner_name,
              prop_address, prop_city, prop_zip,
              year_built, living_sqft, total_value,
              is_owner_occupied, county, lat, lon
            ) VALUES %s
            ON CONFLICT (apn) DO UPDATE SET
              prop_city = EXCLUDED.prop_city,
              prop_zip  = EXCLUDED.prop_zip,
              lat       = EXCLUDED.lat,
              lon       = EXCLUDED.lon
        """, records)
    conn.commit()
    return len(deduped)

def main():
    conn = get_conn()
    total = 0

    for zone in ZONES:
        log.info(f"\n{'='*60}")
        log.info(f"Zone: {zone['name']}")
        log.info(f"Bbox: {zone['bbox']}")

        result = query_overpass(zone["bbox"])
        if not result:
            log.warning(f"No response for {zone['name']}")
            continue

        elements = result.get("elements", [])
        log.info(f"OSM elements: {len(elements)}")

        rows = []
        for el in elements:
            tags = el.get("tags", {})
            if not is_residential(tags): continue
            lat, lon = extract_lat_lon(el)
            if not lat or not lon: continue
            s, w, n, e = zone["bbox"]
            if not (s <= lat <= n and w <= lon <= e): continue

            num = tags.get("addr:housenumber", "")
            street = tags.get("addr:street", "")
            if not num or not street: continue
            addr = f"{num} {street}".strip().upper()

            city = safe_str(tags.get("addr:city") or tags.get("addr:town") or zone["city_default"])
            zipcode = safe_str(tags.get("addr:postcode") or zone["zip_default"], 10)
            osm_id = f"osm_{el['type']}_{el['id']}"

            year_built = None
            sd = tags.get("start_date", "")
            if sd and len(sd) >= 4:
                try:
                    y = int(sd[:4])
                    if 1800 < y < 2030: year_built = y
                except ValueError: pass

            rows.append({
                "apn": osm_id, "cad_source": "osm_overpass",
                "owner_name": None,
                "prop_address": addr, "prop_city": city, "prop_zip": zipcode,
                "year_built": year_built, "living_sqft": None, "total_value": None,
                "is_owner_occupied": True, "county": zone["county"],
                "lat": round(lat, 7), "lon": round(lon, 7),
            })

        log.info(f"Residential rows: {len(rows)}")
        if rows:
            n_inserted = upsert_parcels(conn, rows)
            total += n_inserted
            log.info(f"Upserted: {n_inserted}")

        time.sleep(3)

    conn.close()
    log.info(f"\nDONE — Total: {total}")

if __name__ == "__main__":
    main()
