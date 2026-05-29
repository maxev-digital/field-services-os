import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';

function cleanCity(c: string) {
  return (c || '').replace(/\s*\(.*?\)\s*/g, '').trim();
}

export async function POST(req: NextRequest) {
  try { await requireAdmin(); } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { zips, stormDate, stormLabel, ownerOccOnly, maxPerZip } = await req.json();

  if (!zips?.length)  return NextResponse.json({ error: 'No zips selected' }, { status: 400 });
  if (!stormDate)     return NextResponse.json({ error: 'stormDate required' }, { status: 400 });

  let inserted = 0, skipped = 0;

  for (const zip of zips) {
    const limit = maxPerZip ?? 5000;
    let rows: any[];
    if (ownerOccOnly) {
      rows = await prisma.$queryRaw<any[]>`
        SELECT owner_name, prop_address, prop_city, prop_zip, county, total_value
        FROM parcels
        WHERE prop_zip = ${zip} AND is_owner_occupied = true
        LIMIT ${limit}`;
    } else {
      rows = await prisma.$queryRaw<any[]>`
        SELECT owner_name, prop_address, prop_city, prop_zip, county, total_value
        FROM parcels
        WHERE prop_zip = ${zip}
        LIMIT ${limit}`;
    }

    for (const p of rows) {
      const address = (p.prop_address || '').trim() || null;
      if (!address) { skipped++; continue; }
      const city    = cleanCity(p.prop_city || '');
      const name    = (p.owner_name || '').trim() || null;
      const score   = p.total_value ? Math.min(10, Math.round(Number(p.total_value) / 30000)) : 5;

      try {
        await prisma.$executeRaw`
          INSERT INTO storm_prospects
            (id, name, address, city, zip, county, status, source, storm_date,
             priority_score, notes, created_at, updated_at)
          SELECT
            gen_random_uuid()::text,
            ${name},
            ${address},
            ${city || 'Unknown'},
            ${zip},
            ${p.county ?? null},
            'NEW'::"ProspectStatus",
            ${'parcel_import'},
            ${stormDate},
            ${score},
            ${stormLabel ?? null},
            NOW(), NOW()
          WHERE NOT EXISTS (
            SELECT 1 FROM storm_prospects
            WHERE address = ${address} AND zip = ${zip}
          )`;
        inserted++;
      } catch { skipped++; }
    }
  }

  return NextResponse.json({ ok: true, inserted, skipped, zips: zips.length });
}

export async function GET(req: NextRequest) {
  try { await requireAdmin(); } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const raw = req.nextUrl.searchParams.get('zips') ?? '';
  const zips = raw.split(',').filter(Boolean);
  const ownerOccOnly = req.nextUrl.searchParams.get('ownerOccOnly') === 'true';
  if (!zips.length) return NextResponse.json({ total: 0, owner_occ: 0 });

  let rows: any[];
  if (ownerOccOnly) {
    rows = await prisma.$queryRaw<any[]>`
      SELECT count(*)::int AS total,
        sum(case when is_owner_occupied then 1 else 0 end)::int AS owner_occ
      FROM parcels WHERE prop_zip = ANY(${zips}::text[]) AND is_owner_occupied = true`;
  } else {
    rows = await prisma.$queryRaw<any[]>`
      SELECT count(*)::int AS total,
        sum(case when is_owner_occupied then 1 else 0 end)::int AS owner_occ
      FROM parcels WHERE prop_zip = ANY(${zips}::text[])`;
  }
  return NextResponse.json(rows[0]);
}
