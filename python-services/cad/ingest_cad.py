"""
DFW CAD Property Data Ingestion Pipeline
Downloads bulk property data from Texas County Appraisal Districts
and loads into PostgreSQL parcels table with lat/lon columns.
Spatial queries done in Python with Shapely (no PostGIS required).

Supported CADs:
  - TAD (Tarrant) — pipe-delimited, daily updates
  - DCAD (Dallas) — comma-delimited, annual
  - Collin CAD — via Texas.gov open data portal
  - Denton CAD — fixed-width ASCII

Run: python ingest_cad.py --cad tad
     python ingest_cad.py --cad all

Requirements:
  pip install psycopg2-binary requests tqdm
"""

import os, sys, re, csv, io, zipfile, logging, argparse
from pathlib import Path
from typing import Optional
import requests
import psycopg2
from psycopg2.extras import execute_values

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
log = logging.getLogger("cad_ingest")

# ── Database connection ───────────────────────────────────────────────────────
DB_URL = os.environ.get("DATABASE_URL", "postgresql://postgres:postgres@localhost:5440/roofworks")

# ── Download cache ────────────────────────────────────────────────────────────
CACHE_DIR = Path("/tmp/cad_downloads")
CACHE_DIR.mkdir(exist_ok=True)

# ── Schema creation SQL ───────────────────────────────────────────────────────
CREATE_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS parcels (
  id              SERIAL PRIMARY KEY,
  apn             TEXT,
  cad_source      TEXT NOT NULL,
  owner_name      TEXT,
  owner_name2     TEXT,
  owner_mail_addr TEXT,
  owner_mail_city TEXT,
  owner_mail_state TEXT,
  owner_mail_zip  TEXT,
  prop_address    TEXT,
  prop_city       TEXT,
  prop_zip        TEXT,
  year_built      INTEGER,
  living_sqft     INTEGER,
  total_sqft      INTEGER,
  stories         NUMERIC(3,1),
  construction    TEXT,
  roof_type       TEXT,
  foundation      TEXT,
  land_value      NUMERIC(12,2),
  impr_value      NUMERIC(12,2),
  total_value     NUMERIC(12,2),
  sale_date       TEXT,
  sale_price      NUMERIC(12,2),
  prop_class      TEXT,
  lat             NUMERIC(10,7),
  lon             NUMERIC(10,7),
  updated_at      TIMESTAMP DEFAULT NOW(),
  UNIQUE(apn, cad_source)
);

CREATE INDEX IF NOT EXISTS idx_parcels_lat_lon ON parcels(lat, lon);
CREATE INDEX IF NOT EXISTS idx_parcels_apn ON parcels(apn);
CREATE INDEX IF NOT EXISTS idx_parcels_zip ON parcels(prop_zip);
CREATE INDEX IF NOT EXISTS idx_parcels_cad ON parcels(cad_source);
"""

def get_conn():
    return psycopg2.connect(DB_URL)

def ensure_schema():
    log.info("Ensuring parcels table exists...")
    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute(CREATE_SCHEMA_SQL)
    conn.commit()
    conn.close()
    log.info("Schema ready.")


# ── TAD (Tarrant County Appraisal District) ───────────────────────────────────
TAD_PROP_URL = "https://www.tad.org/data-download/PropertyData-FullSet.zip"
TAD_RES_URL  = "https://www.tad.org/data-download/PropertyData-Residential.zip"
TAD_COMP_URL = "https://www.tad.org/data-download/ResidentialCompAttributes.zip"
TAD_LOC_URL  = "https://www.tad.org/data-download/PropertyLocation.zip"

def download_file(url: str, filename: str) -> Optional[Path]:
    dest = CACHE_DIR / filename
    if dest.exists():
        log.info(f"Cache hit: {filename}")
        return dest
    log.info(f"Downloading {url} → {filename}")
    try:
        r = requests.get(url, timeout=120, stream=True, headers={"User-Agent": "RoofWorksAdmin/1.0"})
        r.raise_for_status()
        with open(dest, 'wb') as f:
            for chunk in r.iter_content(65536):
                f.write(chunk)
        return dest
    except Exception as e:
        log.error(f"Download failed: {e}")
        return None

def extract_file_from_zip(zip_path: Path, extension: str = '.txt') -> Optional[str]:
    """Extract the first matching file from a ZIP, return its contents."""
    try:
        with zipfile.ZipFile(zip_path) as zf:
            for name in zf.namelist():
                if name.lower().endswith(extension):
                    with zf.open(name) as f:
                        return f.read().decode('latin-1', errors='replace')
    except Exception as e:
        log.error(f"ZIP extract error: {e}")
    return None

def parse_tad_property(text: str) -> list[dict]:
    """Parse TAD PropertyData-FullSet (pipe-delimited)."""
    rows = []
    lines = text.splitlines()
    if not lines:
        return rows

    # TAD pipe-delimited — first line is header
    reader = csv.DictReader(io.StringIO(text), delimiter='|')
    for row in reader:
        # Field names vary slightly by year — try common patterns
        apn       = (row.get('AccountNum') or row.get('ACCT') or '').strip()
        owner     = (row.get('OwnerName') or row.get('OWNER_NM') or '').strip()
        owner2    = (row.get('OwnerName2') or '').strip()
        mail_addr = (row.get('OwnerAddr') or row.get('MAIL_ADDR') or '').strip()
        mail_city = (row.get('OwnerCity') or row.get('MAIL_CITY') or '').strip()
        mail_state= (row.get('OwnerState') or row.get('MAIL_STATE') or '').strip()
        mail_zip  = (row.get('OwnerZip') or row.get('MAIL_ZIP') or '').strip()
        prop_addr = (row.get('SitusAddr') or row.get('SITUS_ADDR') or '').strip()
        prop_city = (row.get('SitusCity') or row.get('SITUS_CITY') or '').strip()
        prop_zip  = (row.get('SitusZip') or row.get('SITUS_ZIP') or '').strip()
        yr_built  = row.get('YearBuilt') or row.get('YR_BUILT') or ''
        sqft      = row.get('LivingArea') or row.get('LIVING_AREA') or ''
        tot_sqft  = row.get('TotalArea') or row.get('TOTAL_AREA') or ''
        land_val  = row.get('LandValue') or row.get('LAND_VAL') or ''
        impr_val  = row.get('ImprValue') or row.get('IMPR_VAL') or ''
        tot_val   = row.get('TotalValue') or row.get('TOTAL_VAL') or ''
        prop_class= row.get('StateCode') or row.get('STATE_CD') or ''

        if not apn or not prop_addr:
            continue

        rows.append({
            'apn': apn,
            'cad_source': 'tad',
            'owner_name': owner[:200] if owner else None,
            'owner_name2': owner2[:200] if owner2 else None,
            'owner_mail_addr': mail_addr[:300] if mail_addr else None,
            'owner_mail_city': mail_city[:100] if mail_city else None,
            'owner_mail_state': mail_state[:2] if mail_state else None,
            'owner_mail_zip': mail_zip[:10] if mail_zip else None,
            'prop_address': prop_addr[:300] if prop_addr else None,
            'prop_city': prop_city[:100] if prop_city else None,
            'prop_zip': prop_zip[:10] if prop_zip else None,
            'year_built': int(yr_built) if yr_built.strip().isdigit() and 1800 < int(yr_built.strip()) < 2030 else None,
            'living_sqft': int(float(sqft)) if sqft.strip() else None,
            'total_sqft': int(float(tot_sqft)) if tot_sqft.strip() else None,
            'land_value': float(land_val.replace(',','')) if land_val.strip() else None,
            'impr_value': float(impr_val.replace(',','')) if impr_val.strip() else None,
            'total_value': float(tot_val.replace(',','')) if tot_val.strip() else None,
            'prop_class': prop_class[:10] if prop_class else None,
        })
    return rows


def geocode_batch(rows: list[dict]) -> list[dict]:
    """
    Add lat/lon to rows using Texas CAD lat/lon fields if present,
    otherwise use Census geocoding API for missing ones.
    (Free, no API key needed, rate limited to ~1000/min)
    """
    geocoded = []
    needs_geocoding = []

    for r in rows:
        if r.get('lat') and r.get('lon'):
            geocoded.append(r)
        elif r.get('prop_address') and r.get('prop_zip'):
            needs_geocoding.append(r)
        else:
            geocoded.append(r)

    if needs_geocoding:
        log.info(f"Geocoding {len(needs_geocoding)} addresses via Census API...")
        # Process in batches using Census Geocoder batch endpoint
        BATCH_SIZE = 1000
        for i in range(0, len(needs_geocoding), BATCH_SIZE):
            batch = needs_geocoding[i:i+BATCH_SIZE]
            # Build CSV for Census batch geocoder
            csv_rows = []
            for j, r in enumerate(batch):
                addr = r.get('prop_address','')
                city = r.get('prop_city','')
                state = r.get('owner_mail_state','TX') or 'TX'
                zipcode = r.get('prop_zip','')
                csv_rows.append(f'{j},"{addr}","{city}","{state}","{zipcode}"')
            csv_data = '\n'.join(csv_rows)

            try:
                resp = requests.post(
                    'https://geocoding.geo.census.gov/geocoder/locations/addressbatch',
                    files={'addressFile': ('batch.csv', csv_data.encode(), 'text/csv')},
                    data={'benchmark': 'Public_AR_Current', 'vintage': 'Current_Current', 'format': 'json'},
                    timeout=60,
                )
                if resp.ok:
                    result_lines = resp.text.strip().split('\n')
                    for line in result_lines:
                        parts = line.split(',')
                        if len(parts) >= 6 and parts[2].strip() == 'Match':
                            idx = int(parts[0].strip())
                            coords = parts[5].strip().strip('"')
                            lon_str, lat_str = coords.split(',')
                            try:
                                batch[idx]['lat'] = float(lat_str)
                                batch[idx]['lon'] = float(lon_str)
                            except Exception:
                                pass
            except Exception as e:
                log.warning(f"Geocoding batch {i//BATCH_SIZE} failed: {e}")

            geocoded.extend(batch)

    return geocoded


def upsert_parcels(rows: list[dict], batch_size=2000):
    """Bulk upsert rows into parcels table."""
    if not rows:
        return

    conn = get_conn()
    inserted = 0
    try:
        with conn.cursor() as cur:
            for i in range(0, len(rows), batch_size):
                batch = rows[i:i+batch_size]
                records = []
                for r in batch:
                    lat = r.get('lat')
                    lon = r.get('lon')
                    records.append((
                        r.get('apn'), r.get('cad_source'), r.get('owner_name'), r.get('owner_name2'),
                        r.get('owner_mail_addr'), r.get('owner_mail_city'), r.get('owner_mail_state'), r.get('owner_mail_zip'),
                        r.get('prop_address'), r.get('prop_city'), r.get('prop_zip'),
                        r.get('year_built'), r.get('living_sqft'), r.get('total_sqft'),
                        r.get('stories'), r.get('construction'), r.get('roof_type'), r.get('foundation'),
                        r.get('land_value'), r.get('impr_value'), r.get('total_value'),
                        r.get('sale_date'), r.get('sale_price'), r.get('prop_class'),
                        lat, lon,
                    ))

                execute_values(cur, """
                    INSERT INTO parcels (
                      apn, cad_source, owner_name, owner_name2,
                      owner_mail_addr, owner_mail_city, owner_mail_state, owner_mail_zip,
                      prop_address, prop_city, prop_zip,
                      year_built, living_sqft, total_sqft, stories, construction, roof_type, foundation,
                      land_value, impr_value, total_value, sale_date, sale_price, prop_class,
                      lat, lon
                    ) VALUES %s
                    ON CONFLICT (apn, cad_source) DO UPDATE SET
                      owner_name=EXCLUDED.owner_name,
                      owner_mail_addr=EXCLUDED.owner_mail_addr,
                      prop_address=EXCLUDED.prop_address,
                      year_built=EXCLUDED.year_built,
                      living_sqft=EXCLUDED.living_sqft,
                      total_value=EXCLUDED.total_value,
                      roof_type=EXCLUDED.roof_type,
                      lat=EXCLUDED.lat,
                      lon=EXCLUDED.lon,
                      updated_at=NOW()
                """, records)

                conn.commit()
                inserted += len(records)
                log.info(f"  Upserted {inserted} records...")

    except Exception as e:
        conn.rollback()
        log.error(f"Upsert error: {e}")
        raise
    finally:
        conn.close()

    log.info(f"Done. Total upserted: {inserted}")


def ingest_tad():
    log.info("=== Ingesting TAD (Tarrant County) ===")

    # TAD blocks automated downloads — use pre-downloaded file if present
    manual_path = CACHE_DIR / "tad_fullset.zip"
    if manual_path.exists():
        log.info(f"Using pre-downloaded TAD file: {manual_path}")
        zip_path = manual_path
    else:
        log.warning("TAD requires manual download (they block bots).")
        log.warning("1. Visit: https://www.tad.org/data-download/")
        log.warning("2. Download 'Property Data Full Set' ZIP")
        log.warning(f"3. Save to: {manual_path}")
        log.error("tad_fullset.zip not found — skipping TAD ingestion")
        return

    text = extract_file_from_zip(zip_path, '.txt') or extract_file_from_zip(zip_path, '.csv')
    if not text:
        log.error("Could not extract TAD data file from ZIP")
        return

    log.info(f"Parsing TAD data ({len(text):,} bytes)...")
    rows = parse_tad_property(text)
    log.info(f"Parsed {len(rows):,} parcels")

    # Geocode ones without lat/lon
    rows = geocode_batch(rows)
    upsert_parcels(rows)


def ingest_dcad():
    """Dallas CAD — annual bulk download."""
    log.info("=== Ingesting DCAD (Dallas County) ===")
    # DCAD publishes via dallascad.org/dataproducts.aspx
    # The URL changes annually — check site for current year's URL
    log.warning("DCAD requires manual download from dallascad.org/dataproducts.aspx")
    log.warning("Download the 'No Values' ZIP and place it at /tmp/cad_downloads/dcad.zip")

    zip_path = CACHE_DIR / "dcad.zip"
    if not zip_path.exists():
        log.error("dcad.zip not found. Download manually from DCAD website.")
        return

    text = extract_file_from_zip(zip_path, '.csv') or extract_file_from_zip(zip_path, '.txt')
    if not text:
        log.error("Could not extract DCAD data file")
        return

    log.info(f"Parsing DCAD data ({len(text):,} bytes)...")
    # DCAD is comma-delimited with similar fields
    rows = []
    reader = csv.DictReader(io.StringIO(text))
    for row in reader:
        apn = (row.get('ACCT_NUM') or row.get('Account') or '').strip()
        if not apn:
            continue
        rows.append({
            'apn': apn,
            'cad_source': 'dcad',
            'owner_name': (row.get('OWNER_NM1') or row.get('OwnerName') or '')[:200].strip() or None,
            'owner_mail_addr': (row.get('MAIL_ADDR') or '')[:300].strip() or None,
            'owner_mail_city': (row.get('MAIL_CITY') or '')[:100].strip() or None,
            'owner_mail_state': (row.get('MAIL_STATE') or '')[:2].strip() or None,
            'owner_mail_zip': (row.get('MAIL_ZIP') or '')[:10].strip() or None,
            'prop_address': (row.get('SITUS_ADDR') or row.get('PropertyAddress') or '')[:300].strip() or None,
            'prop_city': (row.get('SITUS_CITY') or '')[:100].strip() or None,
            'prop_zip': (row.get('SITUS_ZIP') or '')[:10].strip() or None,
            'year_built': int(row['YR_BUILT']) if row.get('YR_BUILT','').strip().isdigit() else None,
            'living_sqft': int(float(row['LIVING_AREA'])) if row.get('LIVING_AREA','').strip() else None,
            'total_value': float(row['TOTAL_VAL'].replace(',','')) if row.get('TOTAL_VAL','').strip() else None,
            'prop_class': (row.get('STATE_CD') or '')[:10].strip() or None,
        })

    log.info(f"Parsed {len(rows):,} DCAD parcels")
    rows = geocode_batch(rows)
    upsert_parcels(rows)


def ingest_collin():
    """Collin CAD via Texas.gov Open Data Portal."""
    log.info("=== Ingesting Collin CAD ===")
    # Collin CAD open data — check collincad.org/open-data-portal/ for current URL
    # Export as CSV from their portal
    log.warning("Collin CAD: Download CSV from collincad.org/open-data-portal/ → save as /tmp/cad_downloads/collin.csv")

    csv_path = CACHE_DIR / "collin.csv"
    if not csv_path.exists():
        log.error("collin.csv not found.")
        return

    rows = []
    with open(csv_path, 'r', encoding='latin-1') as f:
        reader = csv.DictReader(f)
        for row in reader:
            apn = (row.get('AccountNumber') or row.get('ACCT') or '').strip()
            if not apn:
                continue
            rows.append({
                'apn': apn,
                'cad_source': 'collin',
                'owner_name': (row.get('OwnerName') or '')[:200].strip() or None,
                'owner_mail_addr': (row.get('MailingAddress') or '')[:300].strip() or None,
                'owner_mail_city': (row.get('MailingCity') or '')[:100].strip() or None,
                'owner_mail_state': (row.get('MailingState') or '')[:2].strip() or None,
                'owner_mail_zip': (row.get('MailingZip') or '')[:10].strip() or None,
                'prop_address': (row.get('SitusAddress') or row.get('PropertyAddress') or '')[:300].strip() or None,
                'prop_city': (row.get('SitusCity') or '')[:100].strip() or None,
                'prop_zip': (row.get('SitusZip') or '')[:10].strip() or None,
                'year_built': int(row['YearBuilt']) if row.get('YearBuilt','').strip().isdigit() else None,
                'living_sqft': int(float(row.get('LivingArea','0') or '0')) or None,
                'total_value': float(row.get('TotalValue','0').replace(',','') or '0') or None,
                'prop_class': (row.get('StateCode') or '')[:10].strip() or None,
            })

    log.info(f"Parsed {len(rows):,} Collin parcels")
    rows = geocode_batch(rows)
    upsert_parcels(rows)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='DFW CAD Property Data Ingestor')
    parser.add_argument('--cad', choices=['tad','dcad','collin','all'], default='tad')
    parser.add_argument('--skip-schema', action='store_true')
    args = parser.parse_args()

    if not args.skip_schema:
        ensure_schema()

    if args.cad in ('tad','all'):
        ingest_tad()
    if args.cad in ('dcad','all'):
        ingest_dcad()
    if args.cad in ('collin','all'):
        ingest_collin()

    log.info("All done!")
