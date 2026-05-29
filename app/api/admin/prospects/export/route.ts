/**
 * GET /api/admin/prospects/export
 * Exports storm_prospects as CSV for BatchSkipTracing / Skip Genie upload.
 * Filter by storm_date, status, no_email=1 (un-enriched only), min_score.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';

function escapeCsv(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export async function GET(req: NextRequest) {
  try { await requireAdmin(); } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const stormDate = searchParams.get('storm_date');
  const status    = searchParams.get('status');
  const noEmail   = searchParams.get('no_email') === '1';
  const noPhone   = searchParams.get('no_phone') === '1';
  const minScore  = parseInt(searchParams.get('min_score') || '0');
  const limit     = Math.min(parseInt(searchParams.get('limit') || '5000'), 10000);

  const where: any = {};
  if (stormDate) where.storm_date = stormDate;
  if (status && status !== 'all') where.status = status;
  if (noEmail) where.email = null;
  if (noPhone) where.phone = null;
  if (minScore > 0) where.priority_score = { gte: minScore };

  const prospects = await prisma.storm_prospects.findMany({
    where,
    orderBy: { priority_score: 'desc' },
    take: limit,
    select: {
      id: true, name: true, address: true, city: true, zip: true,
      phone: true, email: true, hail_size_in: true, priority_score: true,
      storm_date: true, year_built: true, home_value: true,
    },
  });

  const headers = [
    'rw_id', 'first_name', 'last_name', 'address', 'city', 'state', 'zip',
    'phone', 'email', 'hail_size_in', 'priority_score', 'storm_date', 'year_built', 'home_value',
  ];

  const rows = prospects.map(p => {
    const parts = (p.name || '').trim().split(/\s+/);
    const first = parts.length > 1 ? parts.slice(0, -1).join(' ') : parts[0] || '';
    const last  = parts.length > 1 ? parts[parts.length - 1] : '';
    return [
      p.id, first, last, p.address, p.city, 'TX', p.zip || '',
      p.phone || '', p.email || '', p.hail_size_in ?? '', p.priority_score ?? '',
      p.storm_date || '', p.year_built ?? '', p.home_value ?? '',
    ].map(escapeCsv).join(',');
  });

  const csv = [headers.join(','), ...rows].join('\n');
  const filename = stormDate
    ? `storm-prospects-${stormDate.replace(/-/g,'')}.csv`
    : 'storm-prospects.csv';

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
