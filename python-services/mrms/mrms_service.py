"""
MRMS Hail Swath Microservice
Downloads NOAA MRMS MESH_Max_1440min GRIB2 files, processes them into
hail swath GeoJSON polygons at multiple severity thresholds.

Runs as FastAPI on port 8001. Called by the Next.js storm API.

Install:
  pip install fastapi uvicorn pygrib numpy rasterio shapely requests python-dotenv

Run:
  uvicorn mrms_service:app --host 127.0.0.1 --port 8001 --workers 1
"""

import os, io, gzip, logging, hashlib
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

import requests
import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

# Optional imports — graceful fallback if not installed
try:
    import pygrib
    HAS_PYGRIB = True
except ImportError:
    HAS_PYGRIB = False
    logging.warning("pygrib not installed — MRMS processing unavailable")

try:
    import rasterio
    from rasterio.features import shapes as rasterio_shapes
    from rasterio.transform import from_bounds
    HAS_RASTERIO = True
except ImportError:
    HAS_RASTERIO = False
    logging.warning("rasterio not installed — polygon extraction unavailable")

try:
    from shapely.geometry import shape, mapping, box
    from shapely.ops import unary_union
    HAS_SHAPELY = True
except ImportError:
    HAS_SHAPELY = False
    logging.warning("shapely not installed — polygon merging unavailable")

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("mrms")

app = FastAPI(title="MRMS Hail Swath Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3020", "http://127.0.0.1:3020"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

CACHE_DIR = Path("/tmp/mrms_cache")
CACHE_DIR.mkdir(exist_ok=True)

# DFW bounding box (generous)
DFW_BBOX = (-98.5, 32.0, -95.5, 33.9)  # DFW + Collin/Rockwall/Kaufman/Fannin coverage

# Hail severity thresholds in mm (1 inch = 25.4 mm)
THRESHOLDS_MM = [
    {"min_mm": 76.2,  "min_in": 3.0,  "label": "3\"+ (Catastrophic)", "color": "#7c3aed"},
    {"min_mm": 50.8,  "min_in": 2.0,  "label": "2\"+ (Major)",         "color": "#dc2626"},
    {"min_mm": 38.1,  "min_in": 1.5,  "label": "1.5\"+ (Significant)", "color": "#ea580c"},
    {"min_mm": 25.4,  "min_in": 1.0,  "label": "1\"+ (Damaging)",      "color": "#d97706"},
    {"min_mm": 12.7,  "min_in": 0.5,  "label": "0.5\"+ (Any Hail)",    "color": "#16a34a"},
]


def ct_date(offset_days=0) -> str:
    """Return YYYYMMDD in Central Time."""
    d = datetime.now(timezone.utc) - timedelta(hours=5) + timedelta(days=offset_days)  # CDT = UTC-5
    return d.strftime("%Y%m%d")


def build_archive_url(date_str: str, hour: int = 23, minute: int = 30) -> str:
    """Iowa State MTArchive URL for MESH_Max_1440min."""
    yyyy = date_str[:4]
    mm = date_str[4:6]
    dd = date_str[6:8]
    time_str = f"{hour:02d}{minute:02d}00"
    return (
        f"https://mtarchive.geol.iastate.edu/{yyyy}/{mm}/{dd}/mrms/ncep/"
        f"MESH_Max_1440min/MESH_Max_1440min_00.50_{date_str}-{time_str}.grib2.gz"
    )


def build_ncep_url() -> str:
    """NCEP real-time latest MESH_Max_1440min URL."""
    return "https://mrms.ncep.noaa.gov/data/2D/MESH_Max_1440min/MRMS_MESH_Max_1440min.latest.grib2.gz"


def download_grib2(url: str) -> Optional[bytes]:
    """Download and decompress a .grib2.gz file. Returns raw GRIB2 bytes or None."""
    cache_key = hashlib.md5(url.encode()).hexdigest()
    cache_file = CACHE_DIR / f"{cache_key}.grib2"

    if cache_file.exists():
        log.info(f"Cache hit: {url}")
        return cache_file.read_bytes()

    log.info(f"Downloading: {url}")
    try:
        r = requests.get(url, timeout=30, headers={"User-Agent": "RoofWorksAdmin/1.0"})
        if r.status_code != 200:
            log.warning(f"HTTP {r.status_code} for {url}")
            return None
        data = gzip.decompress(r.content)
        cache_file.write_bytes(data)
        return data
    except Exception as e:
        log.error(f"Download failed: {e}")
        return None


def grib2_to_polygons(grib2_bytes: bytes) -> list:
    """
    Parse GRIB2 MESH data → list of GeoJSON-like features, one per threshold.
    Returns [] if dependencies not available.
    """
    if not all([HAS_PYGRIB, HAS_RASTERIO, HAS_SHAPELY]):
        log.warning("Missing dependencies — returning empty polygon list")
        return []

    try:
        # Write to temp file (pygrib needs a file path)
        tmp = CACHE_DIR / "current.grib2"
        tmp.write_bytes(grib2_bytes)

        grbs = pygrib.open(str(tmp))
        grb = grbs.read(1)[0]
        grbs.close()

        data, lats, lons = grb.data()

        # Normalize 0-360 lons to -180-180 (MRMS GRIB2 uses 0-360)
        lons = np.where(lons > 180, lons - 360.0, lons)

        # Clip to DFW bounding box
        min_lon, min_lat, max_lon, max_lat = DFW_BBOX
        lat_mask = (lats >= min_lat) & (lats <= max_lat)
        lon_mask = (lons >= min_lon) & (lons <= max_lon)
        region_mask = lat_mask & lon_mask

        if not region_mask.any():
            log.warning("No data in DFW bounding box")
            return []

        # Extract DFW subregion
        rows = np.where(region_mask.any(axis=1))[0]
        cols = np.where(region_mask.any(axis=0))[0]
        data_clip = data[rows[0]:rows[-1]+1, cols[0]:cols[-1]+1]
        lats_clip = lats[rows[0]:rows[-1]+1, cols[0]:cols[-1]+1]
        lons_clip = lons[rows[0]:rows[-1]+1, cols[0]:cols[-1]+1]

        # Replace fill/missing with 0
        data_clip = np.where(data_clip > 5000, 0, data_clip)
        data_clip = np.where(data_clip < 0, 0, data_clip)

        # Build rasterio transform
        transform = from_bounds(
            lons_clip.min(), lats_clip.min(),
            lons_clip.max(), lats_clip.max(),
            data_clip.shape[1], data_clip.shape[0]
        )

        dfw_box = box(*DFW_BBOX)
        features = []

        for t in THRESHOLDS_MM:
            mask = (data_clip >= t["min_mm"]).astype(np.uint8)
            if mask.sum() == 0:
                continue

            polys = []
            for geom_dict, val in rasterio_shapes(mask, transform=transform):
                if val == 1:
                    try:
                        poly = shape(geom_dict).intersection(dfw_box)
                        if not poly.is_empty and poly.area > 0.0001:
                            polys.append(poly)
                    except Exception:
                        continue

            if not polys:
                continue

            try:
                merged = unary_union(polys)
                # Smooth slightly
                merged = merged.simplify(0.005, preserve_topology=True)
                if merged.is_empty:
                    continue

                features.append({
                    "type": "Feature",
                    "geometry": mapping(merged),
                    "properties": {
                        "threshold_mm": t["min_mm"],
                        "threshold_in": t["min_in"],
                        "label": t["label"],
                        "color": t["color"],
                    }
                })
            except Exception as e:
                log.error(f"Polygon merge error at {t['min_in']}\": {e}")

        return features

    except Exception as e:
        log.error(f"GRIB2 processing error: {e}")
        return []


@app.get("/health")
def health():
    return {
        "status": "ok",
        "has_pygrib": HAS_PYGRIB,
        "has_rasterio": HAS_RASTERIO,
        "has_shapely": HAS_SHAPELY,
    }


@app.get("/swath/{date_str}")
def get_swath(date_str: str):
    """
    Get hail swath polygons for a specific date (YYYYMMDD).
    Tries Iowa State archive for past dates, NCEP for today.
    """
    if len(date_str) != 8 or not date_str.isdigit():
        raise HTTPException(status_code=400, detail="date must be YYYYMMDD")

    today = ct_date(0)
    yesterday = ct_date(-1)
    grib2_bytes = None

    if date_str == today:
        # Try NCEP real-time first
        grib2_bytes = download_grib2(build_ncep_url())

    if grib2_bytes is None:
        # MESH_Max_1440min at 23:30 UTC on date D covers D-1 18:30 CDT to D 18:30 CDT,
        # so it captures the CDT *previous* evening's storm — off by one for CDT calendar dates.
        # The file at 05:30 UTC on D+1 covers D 00:30 CDT to D+1 00:30 CDT — correctly
        # represents storms that happened during CDT calendar date D.
        from datetime import datetime as _dt, timedelta as _td
        try:
            d_plus_1 = (_dt.strptime(date_str, '%Y%m%d') + _td(days=1)).strftime('%Y%m%d')
        except Exception:
            d_plus_1 = None

        candidates = []
        if d_plus_1:
            # CDT-aligned: try next-UTC-day early morning first
            candidates += [(d_plus_1, 5, 30), (d_plus_1, 6, 0), (d_plus_1, 4, 30)]
        # Legacy fallback (off by one for evening storms but works for morning storms)
        candidates += [(date_str, 23, 30), (date_str, 23, 0), (date_str, 22, 30), (date_str, 22, 0)]

        for (try_date, hour, minute) in candidates:
            url = build_archive_url(try_date, hour, minute)
            grib2_bytes = download_grib2(url)
            if grib2_bytes:
                break

    if grib2_bytes is None:
        # Return empty but valid response — UI will fall back to SWDI
        return {"type": "FeatureCollection", "features": [], "source": "none", "date": date_str}

    features = grib2_to_polygons(grib2_bytes)

    return {
        "type": "FeatureCollection",
        "features": features,
        "source": "mrms_mesh_max_1440min",
        "date": date_str,
        "thresholds": THRESHOLDS_MM,
    }


@app.get("/swath")
def get_swath_today():
    """Get today's hail swath (Central Time)."""
    return get_swath(ct_date(0))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8001)


# ── Property Lookup (no PostGIS required — uses Shapely) ──────────────────────

import os, json
try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
    HAS_PSYCOPG2 = True
except ImportError:
    HAS_PSYCOPG2 = False

DB_URL = os.environ.get("DATABASE_URL", "postgresql://roofworks:roofworks_secure_2026@localhost:5440/roofworks")

from fastapi import Body
from typing import Any

@app.post("/properties")
def get_properties_in_polygon(
    polygon: dict = Body(...),
    exclude_rentals: bool = False,
    exclude_existing: bool = False,
    min_year_built: int = None,
    limit: int = 500,
    offset: int = 0,
):
    """
    Find properties (from CAD parcel data) within a hail swath polygon.
    Uses Shapely point-in-polygon — no PostGIS required.
    """
    if not HAS_PSYCOPG2:
        raise HTTPException(status_code=503, detail="psycopg2 not installed")
    if not HAS_SHAPELY:
        raise HTTPException(status_code=503, detail="shapely not installed")

    from shapely.geometry import shape as shapely_shape, Point

    try:
        poly_geom = shapely_shape(polygon)
        bbox = poly_geom.bounds  # (minx, miny, maxx, maxy)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid polygon: {e}")

    try:
        conn = psycopg2.connect(DB_URL)
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # Check if parcels table exists
            cur.execute("SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='parcels')")
            if not cur.fetchone()['exists']:
                return {"properties": [], "total": 0, "message": "Property database not loaded yet."}

            # Bounding box pre-filter (fast, uses lat/lon columns)
            filters = [
                "lon >= %s AND lon <= %s AND lat >= %s AND lat <= %s",
                "lat IS NOT NULL AND lon IS NOT NULL",
            ]
            params = [bbox[0], bbox[2], bbox[1], bbox[3]]

            if min_year_built:
                filters.append("year_built >= %s")
                params.append(min_year_built)

            where = " AND ".join(filters)
            cur.execute(f"""
                SELECT p.*, c.id as customer_id, c.name as customer_name
                FROM parcels p
                LEFT JOIN customers c ON LOWER(TRIM(c.address)) = LOWER(TRIM(p.prop_address))
                WHERE {where}
                ORDER BY RANDOM() LIMIT 50000
            """, params)
            bbox_rows = cur.fetchall()
        conn.close()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB error: {e}")

    # Shapely point-in-polygon filter
    results = []
    for row in bbox_rows:
        try:
            pt = Point(float(row['lon']), float(row['lat']))
            if not poly_geom.contains(pt):
                continue
        except Exception:
            continue

        is_rental = False
        if row.get('owner_mail_addr') and row.get('prop_address'):
            is_rental = row['owner_mail_addr'].lower().strip() != row['prop_address'].lower().strip()

        is_customer = row.get('customer_id') is not None

        if exclude_rentals and is_rental:
            continue
        if exclude_existing and is_customer:
            continue

        results.append({
            "id": row['id'],
            "apn": row['apn'],
            "source": row['cad_source'],
            "owner": row.get('owner_name'),
            "ownerMailAddress": ", ".join(filter(None, [
                row.get('owner_mail_addr'), row.get('owner_mail_city'),
                row.get('owner_mail_state'), row.get('owner_mail_zip'),
            ])),
            "address": row.get('prop_address'),
            "city": row.get('prop_city'),
            "zip": row.get('prop_zip'),
            "county": row.get('county'),
            "yearBuilt": row.get('year_built'),
            "sqft": row.get('living_sqft'),
            "roofType": row.get('roof_type'),
            "propType": row.get('prop_type'),
            "value": float(row['total_value']) if row.get('total_value') else None,
            "lat": float(row['lat']) if row.get('lat') else None,
            "lon": float(row['lon']) if row.get('lon') else None,
            "isLikelyRental": is_rental,
            "isExistingCustomer": is_customer,
            "customerId": row.get('customer_id'),
            "customerName": row.get('customer_name'),
        })

    total = len(results)
    results.sort(key=lambda r: r.get('value') or 0, reverse=True)
    paged = results[offset:offset + limit]

    return {"properties": paged, "total": total, "limit": limit, "offset": offset}
