import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try { await requireAdmin(); } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const lat      = parseFloat(searchParams.get('lat')    || '0');
  const lon      = parseFloat(searchParams.get('lon')    || '0');
  const radiusMi = parseFloat(searchParams.get('radius_miles') || '0.5');
  const zip      = searchParams.get('zip') || '';
  const latMin   = parseFloat(searchParams.get('lat_min') || '0');
  const latMax   = parseFloat(searchParams.get('lat_max') || '0');
  const lonMin   = parseFloat(searchParams.get('lon_min') || '0');
  const lonMax   = parseFloat(searchParams.get('lon_max') || '0');
  const limit    = Math.min(parseInt(searchParams.get('limit') || '2000'), 25000);

  let parcels: any[];
  let totalAvailable = 0;

  if (latMin && latMax && lonMin && lonMax) {
    // Storm swath bbox query — loads full hail footprint for a county
    const countRes = await prisma.$queryRaw<[{count: bigint}]>`
      SELECT COUNT(*) as count FROM parcels
      WHERE lat BETWEEN ${latMin} AND ${latMax}
        AND lon BETWEEN ${lonMin} AND ${lonMax}
        AND lat IS NOT NULL AND lon IS NOT NULL
    `;
    totalAvailable = Number(countRes[0].count);

    parcels = await prisma.$queryRaw`
      SELECT p.id, p.apn, p.owner_name, p.prop_address, p.prop_city, p.prop_zip,
             p.year_built, p.living_sqft, p.total_value, p.is_owner_occupied,
             p.lat, p.lon, p.county, p.stories,
             NULL::numeric AS dist_miles,
             EXISTS(
               SELECT 1 FROM storm_prospects sp
               WHERE sp.parcel_id = p.id AND sp.phone IS NOT NULL
             ) AS enriched
      FROM parcels p
      WHERE p.lat BETWEEN ${latMin} AND ${latMax}
        AND p.lon BETWEEN ${lonMin} AND ${lonMax}
        AND p.lat IS NOT NULL AND p.lon IS NOT NULL
      ORDER BY p.lat, p.lon
      LIMIT ${limit}
    `;
  } else if (lat && lon) {
    const latDelta = radiusMi / 69.0;
    const lonDelta = radiusMi / (69.0 * Math.cos(lat * Math.PI / 180));

    const countRes = await prisma.$queryRaw<[{count: bigint}]>`
      SELECT COUNT(*) as count FROM parcels
      WHERE lat BETWEEN ${lat - latDelta} AND ${lat + latDelta}
        AND lon BETWEEN ${lon - lonDelta} AND ${lon + lonDelta}
        AND lat IS NOT NULL AND lon IS NOT NULL
    `;
    totalAvailable = Number(countRes[0].count);

    parcels = await prisma.$queryRaw`
      SELECT p.id, p.apn, p.owner_name, p.prop_address, p.prop_city, p.prop_zip,
             p.year_built, p.living_sqft, p.total_value, p.is_owner_occupied,
             p.lat, p.lon, p.county, p.stories,
             ROUND(CAST(
               3959 * acos(
                 LEAST(1.0, cos(radians(${lat})) * cos(radians(p.lat)) *
                 cos(radians(p.lon) - radians(${lon})) +
                 sin(radians(${lat})) * sin(radians(p.lat)))
               ) AS numeric
             ), 2) AS dist_miles,
             EXISTS(
               SELECT 1 FROM storm_prospects sp
               WHERE sp.parcel_id = p.id AND sp.phone IS NOT NULL
             ) AS enriched
      FROM parcels p
      WHERE p.lat BETWEEN ${lat - latDelta} AND ${lat + latDelta}
        AND p.lon BETWEEN ${lon - lonDelta} AND ${lon + lonDelta}
        AND p.lat IS NOT NULL AND p.lon IS NOT NULL
      ORDER BY dist_miles ASC
      LIMIT ${limit}
    `;
  } else if (zip) {
    const countRes = await prisma.$queryRaw<[{count: bigint}]>`
      SELECT COUNT(*) as count FROM parcels
      WHERE prop_zip = ${zip} AND lat IS NOT NULL AND lon IS NOT NULL
    `;
    totalAvailable = Number(countRes[0].count);

    parcels = await prisma.$queryRaw`
      SELECT p.id, p.apn, p.owner_name, p.prop_address, p.prop_city, p.prop_zip,
             p.year_built, p.living_sqft, p.total_value, p.is_owner_occupied,
             p.lat, p.lon, p.county, p.stories,
             NULL::numeric AS dist_miles,
             EXISTS(
               SELECT 1 FROM storm_prospects sp
               WHERE sp.parcel_id = p.id AND sp.phone IS NOT NULL
             ) AS enriched
      FROM parcels p
      WHERE p.prop_zip = ${zip} AND p.lat IS NOT NULL AND p.lon IS NOT NULL
    `;
  } else {
    return NextResponse.json({ error: 'lat/lon, bbox, or zip required' }, { status: 400 });
  }

  return NextResponse.json({
    parcels,
    total: parcels.length,
    total_available: totalAvailable,
    truncated: parcels.length < totalAvailable,
  });
}
