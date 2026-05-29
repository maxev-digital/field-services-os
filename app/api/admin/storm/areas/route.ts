/**
 * GET /api/admin/storm/areas?date=YYYYMMDD&minHailSize=0.75
 *
 * Previews affected areas for a storm from storm_prospects already in DB.
 * Groups by city/zip with hail tier, property counts, avg value, priority score.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';

function tier(hailIn: number): string {
  if (hailIn >= 3.0)  return '3"+ Catastrophic';
  if (hailIn >= 2.0)  return '2"+ Major';
  if (hailIn >= 1.5)  return '1.5"+ Significant';
  if (hailIn >= 1.0)  return '1"+ Damaging';
  if (hailIn >= 0.75) return '0.75"+ Moderate';
  return '< 0.75"';
}

function priorityScore(maxHail: number, avgValue: number, count: number): number {
  const hailScore  = Math.min(40, Math.round((maxHail / 3.0) * 40));
  const valueScore = Math.min(30, Math.round((Math.min(avgValue, 500000) / 500000) * 30));
  const countScore = Math.min(20, Math.round((Math.min(count, 500) / 500) * 20));
  return Math.min(100, hailScore + valueScore + countScore + 10);
}

export async function GET(req: NextRequest) {
  try { await requireAdmin(); } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const dateParam   = searchParams.get('date');
  const minHailSize = parseFloat(searchParams.get('minHailSize') || '0.75');

  if (!dateParam) return NextResponse.json({ error: 'date required (YYYYMMDD)' }, { status: 400 });

  const stormDate = dateParam.length === 8
    ? `${dateParam.slice(0,4)}-${dateParam.slice(4,6)}-${dateParam.slice(6,8)}`
    : dateParam;

  const rows = await prisma.$queryRaw<any[]>`
    SELECT
      COALESCE(city, 'Unknown')                       AS city,
      COALESCE(zip, '')                               AS zip,
      COUNT(*)::int                                   AS count,
      COALESCE(MAX(hail_size_in), 0)::float           AS max_hail,
      COALESCE(AVG(home_value), 0)::float             AS avg_value,
      COALESCE(MAX(home_value), 0)::float             AS max_value,
      COUNT(CASE WHEN phone IS NOT NULL THEN 1 END)::int  AS has_phone,
      COUNT(CASE WHEN email IS NOT NULL THEN 1 END)::int  AS has_email,
      COALESCE(AVG(priority_score), 0)::float         AS avg_score
    FROM storm_prospects
    WHERE storm_date = ${stormDate}
      AND COALESCE(hail_size_in, 0) >= ${minHailSize}
    GROUP BY city, zip
    ORDER BY COUNT(*) DESC
  `;

  if (!rows.length) {
    return NextResponse.json({
      date:             stormDate,
      areas:            [],
      total_properties: 0,
      total_areas:      0,
      est_total_cost:   0,
      message:          `No storm prospects found for ${stormDate} with hail ≥ ${minHailSize}". Run Storm Lead Gen first.`,
    });
  }

  const areas = rows.map(r => {
    const count    = Number(r.count);
    const maxHail  = Number(r.max_hail);
    const avgValue = Number(r.avg_value);
    const score    = priorityScore(maxHail, avgValue, count);
    const estSkip  = parseFloat((count * 0.10).toFixed(0));
    const estCalls = parseFloat((count * 0.25 * 2 * 0.11).toFixed(0));

    return {
      city:           r.city,
      zip:            r.zip,
      count,
      max_hail:       maxHail,
      hail_tier:      tier(maxHail),
      avg_value:      Math.round(avgValue),
      max_value:      Math.round(Number(r.max_value)),
      has_phone:      Number(r.has_phone),
      has_email:      Number(r.has_email),
      avg_score:      Math.round(Number(r.avg_score)),
      priority_score: score,
      est_skip_cost:  estSkip,
      est_call_cost:  estCalls,
      est_total_cost: estSkip + estCalls,
    };
  }).sort((a, b) => b.priority_score - a.priority_score);

  return NextResponse.json({
    date:             stormDate,
    min_hail_size:    minHailSize,
    total_properties: areas.reduce((s, a) => s + a.count, 0),
    total_areas:      areas.length,
    est_total_cost:   areas.reduce((s, a) => s + a.est_total_cost, 0),
    areas,
  });
}
