/**
 * GET /api/admin/jobs/[id]/canvass?radius=0.25&limit=150
 * Returns nearby residential parcels for door-knock canvassing after a job.
 * Matches job address to parcels/storm_prospects to get lat/lon, then radial search.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try { await requireAdmin(); } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const radius = parseFloat(req.nextUrl.searchParams.get('radius') || '0.25');
  const limit  = Math.min(parseInt(req.nextUrl.searchParams.get('limit') || '150'), 300);

  // Get the job
  const job = await prisma.jobs.findUnique({
    where: { id: params.id },
    include: { customer: { select: { name: true } } },
  });
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

  // Find lat/lon: try storm_prospects first, then parcels
  let lat: number | null = null;
  let lon: number | null = null;

  const prospect = await prisma.$queryRaw<{ lat: number; lon: number }[]>`
    SELECT lat, lon FROM storm_prospects
    WHERE lat IS NOT NULL AND lon IS NOT NULL
      AND LOWER(address) ILIKE ${`%${job.address.split(',')[0].trim().toLowerCase()}%`}
    LIMIT 1
  `;
  if (prospect[0]) { lat = Number(prospect[0].lat); lon = Number(prospect[0].lon); }

  if (!lat || !lon) {
    const parcel = await prisma.$queryRaw<{ lat: number; lon: number }[]>`
      SELECT lat, lon FROM parcels
      WHERE lat IS NOT NULL AND lon IS NOT NULL
        AND LOWER(prop_address) ILIKE ${`%${job.address.split(',')[0].trim().toLowerCase()}%`}
      LIMIT 1
    `;
    if (parcel[0]) { lat = Number(parcel[0].lat); lon = Number(parcel[0].lon); }
  }

  if (!lat || !lon) {
    return NextResponse.json({
      job: { id: job.id, address: job.address },
      error: 'Could not geocode job address — no matching parcel found',
      parcels: [],
      total: 0,
    });
  }

  // Degrees per mile at DFW latitude (~33°N)
  const degPerMile = 1 / 69.0;
  const delta      = radius * degPerMile;

  const nearby = await prisma.$queryRaw<any[]>`
    SELECT
      prop_address, prop_city, prop_zip,
      owner_name,
      total_value,
      year_built,
      living_sqft,
      is_owner_occupied,
      lat, lon,
      ROUND(
        (3959 * acos(
          LEAST(1.0, cos(radians(${lat})) * cos(radians(lat))
            * cos(radians(lon) - radians(${lon}))
            + sin(radians(${lat})) * sin(radians(lat))
        ))::numeric, 3
      ) AS distance_miles
    FROM parcels
    WHERE lat IS NOT NULL AND lon IS NOT NULL
      AND lat BETWEEN ${lat - delta} AND ${lat + delta}
      AND lon BETWEEN ${lon - delta} AND ${lon + delta}
      AND prop_type IN ('residential', 'R', 'SFR', '1', 'SF', 'RS', 'A')
         OR prop_type IS NULL
    ORDER BY distance_miles ASC
    LIMIT ${limit + 1}
  `;

  const parcels = nearby
    .filter((p: any) => Number(p.distance_miles) <= radius && p.prop_address)
    .slice(0, limit);

  return NextResponse.json({
    job: { id: job.id, address: job.address, customer: job.customer?.name },
    center: { lat, lon },
    radius,
    parcels,
    total: parcels.length,
  });
}
