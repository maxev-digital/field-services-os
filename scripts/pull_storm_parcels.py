"""
Pulls residential addresses from OpenStreetMap Overpass API for the 3 counties
hit by the April 28, 2026 DFW hail storm, then inserts into the parcels table.

Targets:
  Parker County: 4.5" hail — Millsap, Cresson, Godley areas
  Johnson County: 3.5" hail — Godley, Joshua, Cleburne areas
  Wise County: 1.75" hail — Chico, Paradise, Rhome areas
"""
import json, time, os, math, logging
import urllib.request
import psycopg2
from psycopg2.extras import execute_values

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
log = logging.getLogger()

DB_URL = "postgresql://roofworks:roofworks_secure_2026@localhost:5440/roofworks"

# ── Storm target bboxes (S, W, N, E) ──────────────────────────────────────────
STORM_ZONES = [
    {
        "name": "Parker County",
        "county": "parker",
        "hail_in": 4.5,
        "bbox": (32.50, -98.10, 32.90, -97.50),   # Millsap, Cresson, Godley
        "city_default": "MILLSAP",
    },
    {
        "name": "Johnson County",
        "county": "johnson",
        "hail_in": 3.5,
        "bbox": (32.30, -97.65, 32.60, -97.25),   # Godley, Joshua, Cleburne
        "city_default": "GODLEY",
    },
    {
        "name": "Wise County",
        "county": "wise",
        "hail_in": 1.75,
        "bbox": (32.95, -97.75, 33.30, -97.35),   # Chico, Paradise, Rhome
        "city_default": "CHICO",
    },
]

OVERPASS_URL = "https://overpass-api.de/api/interpreter"

# ── Create parcels table if missing ───────────────────────────────────────────
CREATE_TABLE = """
CREATE TABLE IF NOT EXISTS parcels (
    id               SERIAL PRIMARY KEY,
    apn              TEXT UNIQUE,
    cad_source       TEXT,
    owner_name       TEXT,
    owner_mail_addr  TEXT,
    owner_mail_city  TEXT,
    owner_mail_state TEXT DEFAULT 'TX',
    owner_mail_zip   TEXT,
    prop_address     TEXT,
    prop_city        TEXT,
    prop_zip         TEXT,
    year_built       INTEGER,
    living_sqft      INTEGER,
    total_value      FLOAT,
    prop_type        TEXT DEFAULT 'A',
    is_owner_occupied BOOLEAN DEFAULT TRUE,
    county           TEXT,
    lat              FLOAT,
    lon              FLOAT,
    created_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_parcels_lat_lon ON parcels(lat, lon);
CREATE INDEX IF NOT EXISTS idx_parcels_county ON parcels(county);
"""

def get_conn():
    return psycopg2.connect(DB_URL)

def query_overpass(bbox):
    """Query Overpass API for nodes/ways with address tags in the bbox."""
    s, w, n, e = bbox
    query = f"""
[out:json][timeout:60];
(
  node["addr:housenumber"]["addr:street"]({s},{w},{n},{e});
  way["building"]["addr:housenumber"]["addr:street"]({s},{w},{n},{e});
  way["building:levels"]["addr:housenumber"]["addr:street"]({s},{w},{n},{e});
);
out center body;
"""
    data = query.encode("utf-8")
    req = urllib.request.Request(
        OVERPASS_URL,
        data=data,
        headers={"Content-Type": "application/x-www-form-urlencoded",
                 "User-Agent": "RoofWorksStormLeads/1.0"},
        method="POST"
    )
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as e:
            log.warning(f"Overpass attempt {attempt+1} failed: {e}")
            time.sleep(5 * (attempt + 1))
    return None

def extract_lat_lon(element):
    """Get lat/lon from node or way (way uses center)."""
    if element["type"] == "node":
        return element.get("lat"), element.get("lon")
    elif element["type"] == "way":
        center = element.get("center", {})
        return center.get("lat"), center.get("lon")
    return None, None

def build_address(tags):
    """Construct full address from OSM address tags."""
    parts = []
    if tags.get("addr:housenumber"):
        parts.append(tags["addr:housenumber"])
    if tags.get("addr:street"):
        parts.append(tags["addr:street"])
    return " ".join(parts) if parts else None

def safe_str(v, maxlen=None):
    if v is None: return None
    s = str(v).strip().upper()
    return s[:maxlen] if maxlen and s else s or None

def upsert_parcels(conn, rows):
    if not rows: return 0
    seen = {}
    for r in rows:
        seen[r["apn"]] = r
    rows = list(seen.values())

    records = [(
        r["apn"], r["cad_source"],
        r.get("owner_name"),
        r.get("owner_mail_addr"), r.get("owner_mail_city"),
        "TX", r.get("owner_mail_zip"),
        r["prop_address"], r.get("prop_city"), r.get("prop_zip"),
        r.get("year_built"), r.get("living_sqft"),
        r.get("total_value"),
        r.get("prop_type", "A"), r.get("is_owner_occupied", True),
        r["county"], r["lat"], r["lon"],
    ) for r in rows]

    with conn.cursor() as cur:
        execute_values(cur, """
            INSERT INTO parcels (
              apn, cad_source,
              owner_name, owner_mail_addr, owner_mail_city, owner_mail_state, owner_mail_zip,
              prop_address, prop_city, prop_zip,
              year_built, living_sqft, total_value,
              prop_type, is_owner_occupied, county, lat, lon
            ) VALUES %s
            ON CONFLICT (apn) DO UPDATE SET
              prop_city = EXCLUDED.prop_city,
              prop_zip  = EXCLUDED.prop_zip,
              county    = EXCLUDED.county,
              lat       = EXCLUDED.lat,
              lon       = EXCLUDED.lon
        """, records)
    conn.commit()
    return len(records)

def is_residential(tags):
    """Filter to likely residential buildings."""
    building = tags.get("building", "")
    use = tags.get("landuse", "")
    amenity = tags.get("amenity", "")
    shop = tags.get("shop", "")

    # Exclude commercial, industrial, etc.
    skip_buildings = {"commercial", "industrial", "retail", "office", "warehouse",
                      "school", "hospital", "church", "cathedral", "government",
                      "public", "supermarket", "garage", "carport", "shed"}
    if building.lower() in skip_buildings:
        return False
    if amenity or shop:
        return False
    return True

def main():
    conn = get_conn()

    # Create table
    with conn.cursor() as cur:
        cur.execute(CREATE_TABLE)
    conn.commit()
    log.info("Parcels table ready")

    total_inserted = 0

    for zone in STORM_ZONES:
        log.info(f"\n{'='*60}")
        log.info(f"Zone: {zone['name']}  ({zone['hail_in']}\" hail)")
        log.info(f"Bbox: {zone['bbox']}")

        result = query_overpass(zone["bbox"])
        if not result:
            log.warning(f"No Overpass response for {zone['name']}")
            continue

        elements = result.get("elements", [])
        log.info(f"OSM elements returned: {len(elements)}")

        rows = []
        for el in elements:
            tags = el.get("tags", {})
            if not is_residential(tags):
                continue

            lat, lon = extract_lat_lon(el)
            if not lat or not lon:
                continue

            # Sanity check coords in bbox
            s, w, n, e = zone["bbox"]
            if not (s <= lat <= n and w <= lon <= e):
                continue

            addr = build_address(tags)
            if not addr:
                continue

            city = safe_str(tags.get("addr:city") or tags.get("addr:town") or zone["city_default"])
            zipcode = safe_str(tags.get("addr:postcode"), 10)
            osm_id = f"osm_{el['type']}_{el['id']}"

            # Year built from start_date tag
            year_built = None
            start_date = tags.get("start_date", "")
            if start_date and len(start_date) >= 4:
                try:
                    y = int(start_date[:4])
                    if 1800 < y < 2030:
                        year_built = y
                except ValueError:
                    pass

            rows.append({
                "apn":              osm_id,
                "cad_source":       "osm_overpass",
                "owner_name":       None,
                "owner_mail_addr":  None,
                "owner_mail_city":  None,
                "owner_mail_zip":   None,
                "prop_address":     addr,
                "prop_city":        city,
                "prop_zip":         zipcode,
                "year_built":       year_built,
                "living_sqft":      None,
                "total_value":      None,
                "prop_type":        "A",
                "is_owner_occupied": True,
                "county":           zone["county"],
                "lat":              round(lat, 7),
                "lon":              round(lon, 7),
            })

        log.info(f"Residential addresses found: {len(rows)}")
        if rows:
            inserted = upsert_parcels(conn, rows)
            total_inserted += inserted
            log.info(f"Inserted: {inserted}")

        time.sleep(3)  # Overpass rate limit courtesy

    conn.close()
    log.info(f"\n{'='*60}")
    log.info(f"DONE — Total parcels inserted: {total_inserted}")
    log.info(f"\nRun next:")
    log.info(f"  cd /var/www/roof-works-admin")
    log.info(f"  npx tsx scripts/storm_generate_leads.ts --date 20260428 --min-hail 0.75")

if __name__ == "__main__":
    main()
