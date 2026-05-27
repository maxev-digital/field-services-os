/**
 * POST /api/admin/storm/generate-leads
 * Generates storm_prospects from a hail swath for a given date.
 *
 * Two modes:
 *   - spc_points provided → build circle polygons from SPC lat/lon (immediate, no SWDI lag)
 *   - no spc_points       → fall back to swath API (MRMS/SWDI polygons)
 *
 * Accepts x-internal-key header for server-to-server calls (storm-alert.js).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrInternal } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';

const MRMS_BASE = 'http://127.0.0.1:8001';

// ── Circle polygon from lat/lon center + radius (miles) ──────────────────────
function createCirclePolygon(
  centerLat: number,
  centerLon: number,
  radiusMiles: number,
  steps = 36
): { type: 'Polygon'; coordinates: number[][][] } {
  const latDeg = radiusMiles / 69.0;
  const lonDeg = radiusMiles / (69.0 * Math.cos((centerLat * Math.PI) / 180));
  const ring: number[][] = [];
  for (let i = 0; i <= steps; i++) {
    const a = (2 * Math.PI * i) / steps;
    ring.push([
      centerLon + lonDeg * Math.cos(a),
      centerLat + latDeg * Math.sin(a),
    ]);
  }
  return { type: 'Polygon', coordinates: [ring] };
}

function radiusForHailSize(sizeIn: number): number {
  if (sizeIn >= 3.0) return 4.0;
  if (sizeIn >= 2.0) return 3.0;
  if (sizeIn >= 1.5) return 2.5;
  if (sizeIn >= 1.0) return 2.0;
  if (sizeIn >= 0.75) return 1.5;
  return 1.0;
}

// ── Priority score ────────────────────────────────────────────────────────────
function priorityScore(
  hailIn: number,
  value: number | null,
  yearBuilt: number | null,
  ownerOccupied: boolean
): number {
  let hail = 0;
  if      (hailIn >= 3.0)  hail = 40;
  else if (hailIn >= 2.0)  hail = 34;
  else if (hailIn >= 1.5)  hail = 28;
  else if (hailIn >= 1.0)  hail = 20;
  else if (hailIn >= 0.75) hail = 12;
  else                     hail = 6;

  const val        = Math.min(value || 0, 500000);
  const valueScore = Math.round((val / 500000) * 30);

  let age = 10;
  if (yearBuilt) {
    const roofAge = new Date().getFullYear() - yearBuilt;
    if      (roofAge >= 20) age = 20;
    else if (roofAge >= 15) age = 16;
    else if (roofAge >= 10) age = 12;
    else if (roofAge >= 5)  age = 6;
    else                    age = 2;
  }

  const ownerBonus = ownerOccupied ? 10 : 0;
  return Math.min(100, hail + valueScore + age + ownerBonus);
}

// ── Handler ───────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try { await requireAdminOrInternal(req); } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const {
    date,
    minHailSize     = 0.75,
    excludeRentals  = true,
    excludeExisting = true,
    maxProperties   = 5000,
    cities          = [] as string[],
    zips            = [] as string[],
    spc_points,                          // [{lat, lon, size_in, county?, location?}]
  } = body;

  if (!date) return NextResponse.json({ error: 'date required (YYYYMMDD)' }, { status: 400 });

  // ── Build swath features ──────────────────────────────────────────────────
  let swathFeatures: any[] = [];

  if (spc_points && Array.isArray(spc_points) && spc_points.length > 0) {
    // Mode A: SPC points → circle polygons (instant, no SWDI lag)
    swathFeatures = spc_points
      .filter((p: any) => p.size_in >= minHailSize)
      .map((p: any) => ({
        type:       'Feature',
        properties: { threshold_in: p.size_in, source: 'spc', county: p.county || '' },
        geometry:   createCirclePolygon(p.lat, p.lon, radiusForHailSize(p.size_in)),
      }));
    console.log(`[generate-leads] SPC mode: ${swathFeatures.length} circles from ${spc_points.length} points`);
  } else {
    // Mode B: Swath API (MRMS → SWDI fallback)
    try {
      const host  = req.headers.get('host') || 'localhost:3020';
      const proto = process.env.NODE_ENV === 'production' ? 'https' : 'http';
      const swathRes = await fetch(
        `${proto}://${host}/api/admin/storm/swath?date=${date}`,
        {
          headers: { cookie: req.headers.get('cookie') || '', 'x-internal-key': req.headers.get('x-internal-key') || '' },
          signal: AbortSignal.timeout(20000),
        }
      );
      const swath = await swathRes.json();
      swathFeatures = swath.features || [];
    } catch (e: any) {
      return NextResponse.json({ error: `Swath fetch failed: ${e.message}` }, { status: 500 });
    }
  }

  if (swathFeatures.length === 0) {
    return NextResponse.json({ created: 0, message: 'No hail swath data found for this date.' });
  }

  // ── Query properties in each polygon ─────────────────────────────────────
  const propertyMap = new Map<number, { prop: any; hailIn: number }>();

  for (const feature of swathFeatures) {
    const thresholdIn: number = feature.properties?.threshold_in ?? 0.5;
    if (thresholdIn < minHailSize) continue;

    try {
      const params = new URLSearchParams({
        exclude_rentals:  String(excludeRentals),
        exclude_existing: String(excludeExisting),
        limit:  String(maxProperties),
        offset: '0',
      });
      const propRes = await fetch(`${MRMS_BASE}/properties?${params}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(feature.geometry),
        signal:  AbortSignal.timeout(60000),
      });
      if (!propRes.ok) continue;
      const data = await propRes.json();
      for (const prop of (data.properties || [])) {
        const existing = propertyMap.get(prop.id);
        if (!existing || thresholdIn > existing.hailIn) {
          propertyMap.set(prop.id, { prop, hailIn: thresholdIn });
        }
      }
    } catch { continue; }
  }

  // ── City/zip filter ───────────────────────────────────────────────────────
  if (cities.length > 0 || zips.length > 0) {
    const citySet = new Set(cities.map((c: string) => c.toLowerCase()));
    const zipSet  = new Set(zips);
    for (const [id, entry] of propertyMap) {
      const matchCity = !citySet.size || citySet.has((entry.prop.city || '').toLowerCase());
      const matchZip  = !zipSet.size  || zipSet.has((entry.prop.zip  || '').slice(0, 5));
      if (!matchCity && !matchZip) propertyMap.delete(id);
    }
  }

  if (propertyMap.size === 0) {
    return NextResponse.json({
      created: 0,
      message: 'No properties found in hail swath. Ensure parcel data covers this area.',
    });
  }

  // ── Score and create prospects ─────────────────────────────────────────────
  const stormDateStr = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
  const entries      = Array.from(propertyMap.values());

  const existingAddresses = new Set(
    (await prisma.storm_prospects.findMany({
      where:  { storm_date: stormDateStr },
      select: { address: true },
    })).map(p => p.address.toLowerCase().trim())
  );

  const toCreate = entries
    .filter(({ prop }) => !existingAddresses.has((prop.address || '').toLowerCase().trim()))
    .map(({ prop, hailIn }) => {
      const ownerOccupied = !prop.isLikelyRental;
      const score         = priorityScore(hailIn, prop.value, prop.yearBuilt, ownerOccupied);
      const valueStr      = prop.value ? `$${Math.round(prop.value).toLocaleString()}` : null;
      return {
        name:           prop.owner    || null,
        address:        prop.address  || '',
        city:           prop.city     || 'Dallas',
        zip:            prop.zip      || null,
        county:         prop.county   || null,
        damage_type:    'hail',
        source:         `storm_${stormDateStr}`,
        lat:            prop.lat      ?? null,
        lon:            prop.lon      ?? null,
        hail_size_in:   hailIn,
        priority_score: score,
        home_value:     prop.value    ?? null,
        year_built:     prop.yearBuilt ?? null,
        storm_date:     stormDateStr,
        parcel_id:      prop.id       ?? null,
        notes: [
          `Auto-generated from ${stormDateStr} hail event`,
          `Hail: ${hailIn}"`,
          prop.yearBuilt ? `Built: ${prop.yearBuilt}` : null,
          valueStr       ? `Value: ${valueStr}`       : null,
          ownerOccupied  ? 'Owner-occupied'           : 'Likely rental',
        ].filter(Boolean).join(' | '),
      };
    });

  let created = 0;
  const CHUNK = 500;
  for (let i = 0; i < toCreate.length; i += CHUNK) {
    const result = await prisma.storm_prospects.createMany({
      data: toCreate.slice(i, i + CHUNK),
      skipDuplicates: true,
    });
    created += result.count;
  }

  const tiers: Record<string, number> = {};
  for (const { hailIn } of entries) {
    const label =
      hailIn >= 3.0  ? '3"+ Catastrophic'   :
      hailIn >= 2.0  ? '2"+ Major'           :
      hailIn >= 1.5  ? '1.5"+ Significant'   :
      hailIn >= 1.0  ? '1"+ Damaging'        :
      hailIn >= 0.75 ? '0.75"+ Moderate'     :
                       '0.5"+ Any Hail';
    tiers[label] = (tiers[label] || 0) + 1;
  }

  return NextResponse.json({
    created,
    total_found:      propertyMap.size,
    already_existed:  propertyMap.size - toCreate.length,
    storm_date:       stormDateStr,
    mode:             spc_points ? 'spc_circles' : 'swath',
    tiers,
  });
}
