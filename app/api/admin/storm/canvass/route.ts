/**
 * GET /api/admin/storm/canvass
 * Query storm_prospects with full filtering for the canvass tool.
 * Params: date, county, city, zip, min_hail, min_value, year_from, sort, order, limit, offset
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try { await requireAdmin(); } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const p          = req.nextUrl.searchParams;
  const dateParam  = p.get('date') || '';
  const county     = p.get('county') || '';
  const city       = p.get('city') || '';
  const zip        = p.get('zip') || '';
  const minHail    = parseFloat(p.get('min_hail') || '0');
  const minValue   = parseInt(p.get('min_value') || '0');
  const yearFrom   = parseInt(p.get('year_from') || '0');
  const sortCol    = p.get('sort') || 'priority_score';
  const sortDir    = p.get('order') === 'asc' ? 'ASC' : 'DESC';
  const limit      = Math.min(parseInt(p.get('limit') || '500'), 1000);
  const offset     = parseInt(p.get('offset') || '0');

  if (!dateParam) return NextResponse.json({ error: 'date required' }, { status: 400 });

  const stormDate = dateParam.length === 8
    ? `${dateParam.slice(0,4)}-${dateParam.slice(4,6)}-${dateParam.slice(6,8)}`
    : dateParam;

  // Build WHERE clauses
  const clauses: Prisma.Sql[] = [Prisma.sql`storm_date = ${stormDate}`];
  if (county)           clauses.push(Prisma.sql`LOWER(county) = LOWER(${county})`);
  if (city)             clauses.push(Prisma.sql`LOWER(city) = LOWER(${city})`);
  if (zip)              clauses.push(Prisma.sql`zip = ${zip}`);
  if (minHail > 0)      clauses.push(Prisma.sql`COALESCE(hail_size_in, 0) >= ${minHail}`);
  if (minValue > 0)     clauses.push(Prisma.sql`COALESCE(home_value, 0) >= ${minValue}`);
  if (yearFrom > 0)     clauses.push(Prisma.sql`COALESCE(year_built, 9999) >= ${yearFrom}`);

  const where = Prisma.join(clauses, ' AND ');

  const validSorts: Record<string, string> = {
    priority_score: 'priority_score',
    hail_size_in:   'hail_size_in',
    home_value:     'home_value',
    year_built:     'year_built',
    city:           'city',
    zip:            'zip',
  };
  const orderCol = validSorts[sortCol] || 'priority_score';

  const [totalRows, prospects, filterOptions] = await Promise.all([
    prisma.$queryRaw<{ count: bigint }[]>(
      Prisma.sql`SELECT COUNT(*) as count FROM storm_prospects WHERE ${where}`
    ),
    prisma.$queryRaw<any[]>(
      Prisma.sql`
        SELECT
          id, name, address, city, zip, county,
          phone, email,
          hail_size_in, home_value, year_built,
          priority_score, status,
          lat, lon
        FROM storm_prospects
        WHERE ${where}
        ORDER BY ${Prisma.raw(`${orderCol} ${sortDir} NULLS LAST`)}
        LIMIT ${limit} OFFSET ${offset}
      `
    ),
    // Get available filter options for this date (unfiltered)
    prisma.$queryRaw<any[]>(
      Prisma.sql`
        SELECT
          ARRAY_AGG(DISTINCT county ORDER BY county) FILTER (WHERE county IS NOT NULL)    AS counties,
          ARRAY_AGG(DISTINCT city   ORDER BY city)   FILTER (WHERE city   IS NOT NULL)    AS cities,
          ARRAY_AGG(DISTINCT zip    ORDER BY zip)    FILTER (WHERE zip    IS NOT NULL AND zip != '') AS zips,
          MIN(hail_size_in) AS min_hail_all,
          MAX(hail_size_in) AS max_hail_all,
          COUNT(*) AS total_all,
          COUNT(CASE WHEN phone IS NOT NULL THEN 1 END) AS has_phone,
          ROUND(AVG(home_value))  AS avg_value,
          ROUND(AVG(priority_score)) AS avg_score
        FROM storm_prospects
        WHERE storm_date = ${stormDate}
      `
    ),
  ]);

  const total = Number(totalRows[0]?.count ?? 0);
  const fo    = filterOptions[0] || {};

  return NextResponse.json({
    prospects,
    total,
    offset,
    limit,
    filters: {
      counties: fo.counties || [],
      cities:   fo.cities   || [],
      zips:     fo.zips     || [],
    },
    summary: {
      total_all:  Number(fo.total_all  || 0),
      has_phone:  Number(fo.has_phone  || 0),
      avg_value:  Number(fo.avg_value  || 0),
      avg_score:  Number(fo.avg_score  || 0),
      min_hail:   Number(fo.min_hail_all || 0),
      max_hail:   Number(fo.max_hail_all || 0),
    },
  });
}
