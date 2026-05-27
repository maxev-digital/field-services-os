import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try { await requireAdmin(); } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [citiesRes, neighborhoodsRes, sourcesRes] = await Promise.all([
    prisma.$queryRaw<{ city: string }[]>`
      SELECT DISTINCT city FROM storm_prospects
      WHERE city IS NOT NULL AND city != ''
      ORDER BY city
    `,
    prisma.$queryRaw<{ neighborhood: string }[]>`
      SELECT DISTINCT neighborhood FROM storm_prospects
      WHERE neighborhood IS NOT NULL AND neighborhood != ''
      ORDER BY neighborhood
    `,
    prisma.$queryRaw<{ source: string }[]>`
      SELECT DISTINCT source FROM storm_prospects
      WHERE source IS NOT NULL AND source != ''
      ORDER BY source
    `,
  ]);

  return NextResponse.json({
    cities:        citiesRes.map(r => r.city),
    neighborhoods: neighborhoodsRes.map(r => r.neighborhood),
    sources:       sourcesRes.map(r => r.source),
  });
}
