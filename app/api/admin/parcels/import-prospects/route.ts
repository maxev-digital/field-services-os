import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';
import { randomUUID } from 'crypto';

export async function POST(req: NextRequest) {
  try { await requireAdmin(); } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { parcel_ids, neighborhood } = await req.json();
  if (!Array.isArray(parcel_ids) || !parcel_ids.length) {
    return NextResponse.json({ error: 'parcel_ids required' }, { status: 400 });
  }

  const parcels = await prisma.$queryRaw<any[]>`
    SELECT id, owner_name, prop_address, prop_city, prop_zip,
           lat, lon, year_built, living_sqft, total_value, county
    FROM parcels
    WHERE id = ANY(${parcel_ids}::int[])
  `;

  if (!parcels.length) {
    return NextResponse.json({ prospect_ids: [], new_count: 0 });
  }

  const existing = await prisma.$queryRaw<{ id: string; parcel_id: number }[]>`
    SELECT id, parcel_id FROM storm_prospects
    WHERE parcel_id = ANY(${parcel_ids}::int[])
  `;
  const existingByParcel = new Map(existing.map(e => [e.parcel_id, e.id]));

  const prospectIds: string[] = [];
  const toInsert: any[] = [];

  for (const p of parcels) {
    const existingId = existingByParcel.get(p.id);
    if (existingId) {
      // Update neighborhood if provided and not already set
      if (neighborhood) {
        await prisma.$executeRaw`
          UPDATE storm_prospects SET neighborhood = ${neighborhood}
          WHERE id = ${existingId} AND neighborhood IS NULL
        `;
      }
      prospectIds.push(existingId);
      continue;
    }

    const newId = randomUUID();
    toInsert.push({
      id:           newId,
      name:         p.owner_name || null,
      address:      p.prop_address || '',
      city:         p.prop_city || 'BENBROOK',
      zip:          p.prop_zip || null,
      lat:          p.lat ?? null,
      lon:          p.lon ?? null,
      year_built:   p.year_built ?? null,
      home_value:   p.total_value ?? null,
      county:       p.county || null,
      parcel_id:    p.id,
      neighborhood: neighborhood || null,
      source:       'parcels_map',
      damage_type:  'hail',
      status:       'NEW',
    });
    prospectIds.push(newId);
  }

  if (toInsert.length) {
    await prisma.storm_prospects.createMany({
      data: toInsert,
      skipDuplicates: true,
    });
  }

  return NextResponse.json({
    prospect_ids:   prospectIds,
    new_count:      toInsert.length,
    existing_count: existing.length,
    neighborhood:   neighborhood || null,
  });
}
