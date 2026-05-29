"""
TAD (Tarrant County Appraisal District) Ingest — Standalone
Drop-and-run script once you have the TAD files from tad.org/data-download/

Expected files in /tmp/cad_downloads/:
  tad_residential.zip   OR  tad_fullset.zip  (property data)
  tad_location.zip      (lat/lon coordinates — avoids slow Census geocoding)

Run: python ingest_tad.py
"""

import os, sys, io, csv, zipfile, logging, time
from pathlib import Path
import requests
import psycopg2
from psycopg2.extras import execute_values

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("tad_ingest")

DB_URL    = os.environ.get("DATABASE_URL", "postgresql://roofworks:roofworks@localhost:5440/roofworks")
CACHE_DIR = Path("/tmp/cad_downloads")
CACHE_DIR.mkdir(exist_ok=True)


def get_conn():
    return psycopg2.connect(DB_URL)


def extract_from_zip(zip_path: Path, ext: str = ".txt"):
    try:
        with zipfile.ZipFile(zip_path) as zf:
            for name in zf.namelist():
                if name.lower().endswith(ext):
                    log.info(f"  Extracting {name} from {zip_path.name}")
                    with zf.open(name) as f:
                        return f.read().decode("latin-1", errors="replace")
    except Exception as e:
        log.error(f"ZIP extract error: {e}")
    return None


def load_tad_locations() -> dict:
    """Parse PropertyLocation.zip -> {AccountNum: (lat, lon)}"""
    loc_path = CACHE_DIR / "tad_location.zip"
    if not loc_path.exists():
        log.warning("tad_location.zip not found — will geocode via Census API (slow)")
        return {}

    text = extract_from_zip(loc_path, ".txt") or extract_from_zip(loc_path, ".csv")
    if not text:
        log.warning("Could not read tad_location.zip contents")
        return {}

    coords = {}
    # Try pipe-delimited first, then comma
    delim = "|" if "|" in text.splitlines()[0] else ","
    reader = csv.DictReader(io.StringIO(text), delimiter=delim)
    headers = reader.fieldnames or []
    log.info(f"  Location file headers: {headers[:10]}")

    for row in reader:
        acct = (
            row.get("AccountNum") or row.get("ACCT") or row.get("Acct") or
            row.get("Account") or row.get("account_num") or ""
        ).strip()
        lat_raw = (
            row.get("Lat") or row.get("LAT") or row.get("Latitude") or
            row.get("Y") or row.get("lat") or row.get("PROP_LAT") or ""
        ).strip()
        lon_raw = (
            row.get("Lon") or row.get("LON") or row.get("Longitude") or
            row.get("X") or row.get("lon") or row.get("PROP_LON") or ""
        ).strip()
        if not acct or not lat_raw or not lon_raw:
            continue
        try:
            lat, lon = float(lat_raw), float(lon_raw)
            # Sanity-check: Tarrant County lat/lon range
            if 32.4 < lat < 33.2 and -98.2 < lon < -96.8:
                coords[acct] = (lat, lon)
        except ValueError:
            continue

    log.info(f"Location file: {len(coords):,} Tarrant county coordinates loaded")
    return coords


def parse_tad_property(text: str, location_map: dict) -> list:
    """Parse pipe-delimited TAD data, filter to residential, merge lat/lon."""
    rows = []
    delim = "|" if "|" in text.splitlines()[0] else ","
    reader = csv.DictReader(io.StringIO(text), delimiter=delim)
    headers = reader.fieldnames or []
    log.info(f"  Property file headers (first 15): {headers[:15]}")

    skipped_commercial = 0

    for row in reader:
        apn = (
            row.get("AccountNum") or row.get("ACCT") or row.get("Account") or ""
        ).strip()
        prop_class = (
            row.get("StateCode") or row.get("STATE_CD") or row.get("PropType") or
            row.get("PropertyType") or ""
        ).strip().upper()

        # Skip non-residential (A=single fam, B=multi, C=vacant res, D=farm/ranch, E=rural)
        if prop_class and not any(prop_class.startswith(c) for c in ("A", "B", "C", "D", "E")):
            skipped_commercial += 1
            continue

        owner      = (row.get("OwnerName")  or row.get("OWNER_NM")   or "").strip()
        owner2     = (row.get("OwnerName2") or "").strip()
        mail_addr  = (row.get("OwnerAddr")  or row.get("MAIL_ADDR")  or "").strip()
        mail_city  = (row.get("OwnerCity")  or row.get("MAIL_CITY")  or "").strip()
        mail_state = (row.get("OwnerState") or row.get("MAIL_STATE") or "TX").strip()
        mail_zip   = (row.get("OwnerZip")   or row.get("MAIL_ZIP")   or "").strip()
        prop_addr  = (row.get("SitusAddr")  or row.get("SITUS_ADDR") or "").strip()
        prop_city  = (row.get("SitusCity")  or row.get("SITUS_CITY") or "").strip()
        prop_zip   = (row.get("SitusZip")   or row.get("SITUS_ZIP")  or "").strip()
        yr_built   = (row.get("YearBuilt")  or row.get("YR_BUILT")   or "").strip()
        sqft       = (row.get("LivingArea") or row.get("LIVING_AREA")or "").strip()
        tot_sqft   = (row.get("TotalArea")  or row.get("TOTAL_AREA") or "").strip()
        land_val   = (row.get("LandValue")  or row.get("LAND_VAL")   or "").strip()
        impr_val   = (row.get("ImprValue")  or row.get("IMPR_VAL")   or "").strip()
        tot_val    = (row.get("TotalValue") or row.get("TOTAL_VAL")  or "").strip()

        if not apn or not prop_addr:
            continue

        def safe_int(v):
            try: return int(float(v.replace(",", ""))) if v else None
            except: return None

        def safe_float(v):
            try: return float(v.replace(",", "")) if v else None
            except: return None

        yr = safe_int(yr_built)
        if yr and not (1800 < yr < 2030):
            yr = None

        # Merge coordinates from location file
        lat, lon = location_map.get(apn, (None, None))

        rows.append({
            "apn":             apn,
            "cad_source":      "tarrant",
            "owner_name":      owner[:200]     if owner      else None,
            "owner_name2":     owner2[:200]    if owner2     else None,
            "owner_mail_addr": mail_addr[:300] if mail_addr  else None,
            "owner_mail_city": mail_city[:100] if mail_city  else None,
            "owner_mail_state":mail_state[:2]  if mail_state else None,
            "owner_mail_zip":  mail_zip[:10]   if mail_zip   else None,
            "prop_address":    prop_addr[:300] if prop_addr  else None,
            "prop_city":       prop_city[:100] if prop_city  else None,
            "prop_zip":        prop_zip[:10]   if prop_zip   else None,
            "year_built":      yr,
            "living_sqft":     safe_int(sqft),
            "total_sqft":      safe_int(tot_sqft),
            "land_value":      safe_float(land_val),
            "impr_value":      safe_float(impr_val),
            "total_value":     safe_float(tot_val),
            "prop_class":      prop_class[:10] if prop_class else None,
            "lat":             lat,
            "lon":             lon,
        })

    if skipped_commercial:
        log.info(f"  Skipped {skipped_commercial:,} non-residential parcels")
    return rows


def geocode_missing(rows: list) -> list:
    """Census batch geocoder for rows still missing lat/lon after location merge."""
    needs = [r for r in rows if not r.get("lat") or not r.get("lon")]
    if not needs:
        log.info("All rows have coordinates from location file — no geocoding needed")
        return rows

    log.info(f"Geocoding {len(needs):,} rows via Census API (~1,000/min)...")
    geocoded_count = 0
    BATCH = 1000

    for i in range(0, len(needs), BATCH):
        batch = needs[i:i + BATCH]
        csv_lines = []
        for j, r in enumerate(batch):
            addr  = (r.get("prop_address") or "").replace('"', "")
            city  = (r.get("prop_city")    or "").replace('"', "")
            state = "TX"
            zipco = (r.get("prop_zip")     or "").replace('"', "")
            csv_lines.append(f'{j},"{addr}","{city}","{state}","{zipco}"')

        try:
            resp = requests.post(
                "https://geocoding.geo.census.gov/geocoder/locations/addressbatch",
                files={"addressFile": ("batch.csv", "\n".join(csv_lines).encode(), "text/csv")},
                data={"benchmark": "Public_AR_Current", "format": "json"},
                timeout=90,
            )
            if resp.ok:
                for line in resp.text.strip().split("\n"):
                    parts = line.split(",")
                    if len(parts) >= 6 and parts[2].strip() == "Match":
                        try:
                            idx = int(parts[0].strip())
                            lon_s, lat_s = parts[5].strip().strip('"').split(",")
                            batch[idx]["lat"] = float(lat_s)
                            batch[idx]["lon"] = float(lon_s)
                            geocoded_count += 1
                        except Exception:
                            pass
        except Exception as e:
            log.warning(f"Geocoding batch {i // BATCH + 1} failed: {e}")

        done = min(i + BATCH, len(needs))
        log.info(f"  Progress: {done:,}/{len(needs):,} submitted | {geocoded_count:,} matched")
        time.sleep(0.5)

    log.info(f"Geocoding done: {geocoded_count:,}/{len(needs):,} matched")
    return rows  # mutated in-place


def upsert_parcels(rows: list):
    if not rows:
        log.warning("No rows to insert")
        return

    conn = get_conn()
    inserted = 0
    try:
        with conn.cursor() as cur:
            for i in range(0, len(rows), 2000):
                batch = rows[i:i + 2000]
                records = [(
                    r["apn"], r["cad_source"],
                    r.get("owner_name"), r.get("owner_name2"),
                    r.get("owner_mail_addr"), r.get("owner_mail_city"),
                    r.get("owner_mail_state"), r.get("owner_mail_zip"),
                    r.get("prop_address"), r.get("prop_city"), r.get("prop_zip"),
                    r.get("year_built"), r.get("living_sqft"), r.get("total_sqft"),
                    None, None, None, None,
                    r.get("land_value"), r.get("impr_value"), r.get("total_value"),
                    None, None, r.get("prop_class"),
                    r.get("lat"), r.get("lon"),
                ) for r in batch]

                execute_values(cur, """
                    INSERT INTO parcels (
                      apn, cad_source, owner_name, owner_name2,
                      owner_mail_addr, owner_mail_city, owner_mail_state, owner_mail_zip,
                      prop_address, prop_city, prop_zip,
                      year_built, living_sqft, total_sqft,
                      stories, construction, roof_type, foundation,
                      land_value, impr_value, total_value,
                      sale_date, sale_price, prop_class,
                      lat, lon
                    ) VALUES %s
                    ON CONFLICT (apn, cad_source) DO UPDATE SET
                      owner_name      = EXCLUDED.owner_name,
                      owner_mail_addr = EXCLUDED.owner_mail_addr,
                      prop_address    = EXCLUDED.prop_address,
                      year_built      = EXCLUDED.year_built,
                      living_sqft     = EXCLUDED.living_sqft,
                      total_value     = EXCLUDED.total_value,
                      lat             = COALESCE(EXCLUDED.lat, parcels.lat),
                      lon             = COALESCE(EXCLUDED.lon, parcels.lon),
                      updated_at      = NOW()
                """, records)
                conn.commit()
                inserted += len(records)
                log.info(f"  Upserted {inserted:,}...")
    except Exception as e:
        conn.rollback()
        log.error(f"Upsert error: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    log.info("=" * 60)
    log.info("TAD (Tarrant County) Ingest")
    log.info("=" * 60)

    # Find property data file — accept any of these names
    prop_path = None
    for candidate in [
        "tad_residential.zip", "tad_fullset.zip",
        "PropertyData-Residential.zip", "PropertyData-FullSet.zip",
    ]:
        p = CACHE_DIR / candidate
        if p.exists():
            prop_path = p
            log.info(f"Found property file: {p}")
            break

    if not prop_path:
        log.error("")
        log.error("No TAD property file found in /tmp/cad_downloads/")
        log.error("")
        log.error("DOWNLOAD INSTRUCTIONS:")
        log.error("  1. Go to https://www.tad.org/data-download/")
        log.error("  2. Download 'Property Data - Residential' -> save as tad_residential.zip")
        log.error("  3. Download 'Property Location'           -> save as tad_location.zip")
        log.error("  4. SCP to VPS:")
        log.error("       scp -i ~/.ssh/id_ed25519 tad_residential.zip root@72.60.43.168:/tmp/cad_downloads/tad_residential.zip")
        log.error("       scp -i ~/.ssh/id_ed25519 tad_location.zip    root@72.60.43.168:/tmp/cad_downloads/tad_location.zip")
        log.error("  5. Run:  python /var/www/roof-works-admin/python-services/cad/ingest_tad.py")
        sys.exit(1)

    # Step 1: Load location coordinates
    log.info("\nStep 1/3: Loading PropertyLocation coordinates...")
    location_map = load_tad_locations()

    # Step 2: Parse property data
    log.info("\nStep 2/3: Parsing property data...")
    text = extract_from_zip(prop_path, ".txt") or extract_from_zip(prop_path, ".csv")
    if not text:
        log.error("Could not extract data from property ZIP")
        sys.exit(1)

    rows = parse_tad_property(text, location_map)
    log.info(f"Parsed {len(rows):,} residential parcels")

    with_coords = sum(1 for r in rows if r.get("lat"))
    pct = 100 * with_coords // len(rows) if rows else 0
    log.info(f"Coordinates from location file: {with_coords:,}/{len(rows):,} ({pct}%)")

    # Step 3: Geocode remaining (if any)
    log.info("\nStep 3/3: Geocoding + inserting...")
    rows = geocode_missing(rows)
    upsert_parcels(rows)

    final_coords = sum(1 for r in rows if r.get("lat"))
    log.info("")
    log.info("=" * 60)
    log.info("TAD INGEST COMPLETE")
    log.info(f"  Parcels loaded:        {len(rows):,}")
    log.info(f"  With coordinates:      {final_coords:,}")
    log.info(f"  Without coordinates:   {len(rows) - final_coords:,}")
    log.info("=" * 60)
    log.info("")
    log.info("NEXT: Run lead gen to pick up Tarrant county prospects:")
    log.info("  cd /var/www/roof-works-admin")
    log.info("  npx tsx scripts/storm_generate_leads.ts --date 20260425")
    log.info("")
    log.info("Then re-run for April 26 data tomorrow:")
    log.info("  npx tsx scripts/storm_generate_leads.ts --date 20260426")
