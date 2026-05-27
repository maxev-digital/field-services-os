import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';

export async function GET(_req: NextRequest) {
  try { await requireAdmin(); } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [byCounty, byZip, totals] = await Promise.all([
    prisma.$queryRaw<any[]>`
      SELECT county, count(*)::int AS total,
        sum(case when is_owner_occupied then 1 else 0 end)::int AS owner_occ,
        count(distinct prop_zip)::int AS zip_count
      FROM parcels
      GROUP BY county ORDER BY total DESC`,

    prisma.$queryRaw<any[]>`
      SELECT prop_zip AS zip, prop_city AS city, county,
        count(*)::int AS total,
        sum(case when is_owner_occupied then 1 else 0 end)::int AS owner_occ
      FROM parcels
      WHERE prop_zip IS NOT NULL AND prop_zip != ''
      GROUP BY prop_zip, prop_city, county
      ORDER BY total DESC`,

    prisma.$queryRaw<any[]>`
      SELECT count(*)::int AS total_parcels,
        sum(case when is_owner_occupied then 1 else 0 end)::int AS owner_occ,
        count(distinct prop_zip)::int AS zip_count,
        count(distinct county)::int AS county_count
      FROM parcels`,
  ]);

  return NextResponse.json({ byCounty, byZip, totals: totals[0] });
}
