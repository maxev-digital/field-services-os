/**
 * GET  /api/admin/storm/operations  — Storm pipeline status + history
 * POST /api/admin/storm/operations  — Manually trigger lead generation for a date
 *                                     (skip-trace NOT included — requires manual auth in UI)
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrInternal } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';

const BASE = 'http://localhost:3020';

export async function GET(req: NextRequest) {
  try { await requireAdminOrInternal(req); } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [history, prospectCounts, callCounts] = await Promise.all([
    prisma.$queryRaw<any[]>`
      SELECT date, hail_count, dfw_hail, max_hail, has_dfw_hail, updated_at
      FROM storm_history
      ORDER BY date DESC
      LIMIT 21
    `,
    prisma.$queryRaw<any[]>`
      SELECT
        storm_date,
        COUNT(*)                                                       AS total,
        SUM(CASE WHEN phone IS NOT NULL     THEN 1 ELSE 0 END)        AS with_phone,
        SUM(CASE WHEN status = 'CONTACTED'  THEN 1 ELSE 0 END)        AS contacted,
        SUM(CASE WHEN status = 'INTERESTED' THEN 1 ELSE 0 END)        AS interested,
        SUM(CASE WHEN status = 'CONVERTED'  THEN 1 ELSE 0 END)        AS converted
      FROM storm_prospects
      WHERE storm_date IS NOT NULL
      GROUP BY storm_date
      ORDER BY storm_date DESC
      LIMIT 21
    `,
    prisma.$queryRaw<any[]>`
      SELECT
        sp.storm_date,
        COUNT(rc.id)                                                   AS total_calls,
        SUM(CASE WHEN rc.duration_seconds > 10 THEN 1 ELSE 0 END)     AS answered
      FROM retell_calls rc
      JOIN storm_prospects sp ON rc.prospect_id = sp.id
      WHERE sp.storm_date IS NOT NULL
      GROUP BY sp.storm_date
      ORDER BY sp.storm_date DESC
      LIMIT 21
    `,
  ]);

  const prospectMap = new Map(prospectCounts.map((r: any) => [r.storm_date, r]));
  const callMap     = new Map(callCounts.map((r: any) => [r.storm_date, r]));

  const events = history.map((h: any) => {
    const dateStr   = String(h.date);
    const isoDate   = `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
    const prospects = prospectMap.get(isoDate) || {};
    const calls     = callMap.get(isoDate)     || {};
    return {
      date:         isoDate,
      date_compact: dateStr,
      dfw_hail:     Number(h.dfw_hail   || 0),
      max_hail_in:  Number(h.max_hail   || 0) / 100,
      has_dfw_hail: Boolean(h.has_dfw_hail),
      prospects:    Number(prospects.total      || 0),
      with_phone:   Number(prospects.with_phone || 0),
      contacted:    Number(prospects.contacted  || 0),
      interested:   Number(prospects.interested || 0),
      converted:    Number(prospects.converted  || 0),
      total_calls:  Number(calls.total_calls    || 0),
      answered:     Number(calls.answered       || 0),
      pipeline_ran: Number(prospects.total      || 0) > 0,
    };
  });

  async function fetchSpcCount(yymmdd: string): Promise<number> {
    try {
      const res = await fetch(
        `https://www.spc.noaa.gov/climo/reports/${yymmdd}_rpts_filtered_hail.csv`,
        { headers: { 'User-Agent': 'RoofWorksAdmin/1.0' }, signal: AbortSignal.timeout(8000) }
      );
      if (!res.ok) return -1;
      const text = await res.text();
      return text.split('\n').filter(l => l.trim() && !l.startsWith('Time') && l.includes(',TX,')).length;
    } catch { return -1; }
  }

  function ctDateStr(offsetDays = 0): { yymmdd: string; isoDate: string } {
    const month  = new Date().getUTCMonth() + 1;
    const offset = (month >= 3 && month <= 11) ? 5 : 6;
    const ms = Date.now() - offset * 3600000 + offsetDays * 86400000;
    const d  = new Date(ms);
    const yyyy = d.getUTCFullYear();
    const mm   = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd   = String(d.getUTCDate()).padStart(2, '0');
    return { yymmdd: `${String(yyyy).slice(2)}${mm}${dd}`, isoDate: `${yyyy}-${mm}-${dd}` };
  }

  const today     = ctDateStr(0);
  const yesterday = ctDateStr(-1);
  const [todayCount, yesterdayCount] = await Promise.all([
    fetchSpcCount(today.yymmdd),
    fetchSpcCount(yesterday.yymmdd),
  ]);

  return NextResponse.json({
    events,
    spc_live: {
      today:     { date: today.isoDate,     tx_reports: todayCount },
      yesterday: { date: yesterday.isoDate, tx_reports: yesterdayCount },
    },
  });
}

export async function POST(req: NextRequest) {
  try { await requireAdminOrInternal(req); } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { date, force = false } = await req.json();
  if (!date) return NextResponse.json({ error: 'date required (YYYYMMDD)' }, { status: 400 });

  const isoDate = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;

  if (!force) {
    const existing = await prisma.storm_prospects.count({ where: { storm_date: isoDate } });
    if (existing > 0) {
      return NextResponse.json({
        skipped:  true,
        reason:   `Already have ${existing} prospects for ${isoDate}. Use force=true to re-run.`,
        existing,
      });
    }
  }

  let spcPoints: any[] = [];
  const yymmdd = `${date.slice(2, 4)}${date.slice(4, 6)}${date.slice(6, 8)}`;
  try {
    const res = await fetch(
      `https://www.spc.noaa.gov/climo/reports/${yymmdd}_rpts_filtered_hail.csv`,
      { headers: { 'User-Agent': 'RoofWorksAdmin/1.0' }, signal: AbortSignal.timeout(10000) }
    );
    if (res.ok) {
      const text = await res.text();
      spcPoints = text.replace(/\r/g, '').split('\n').slice(1).flatMap(line => {
        const c = line.split(',');
        if (c.length < 7) return [];
        const lat  = parseFloat(c[5]);
        const lon  = parseFloat(c[6]);
        const size = parseInt(c[1], 10);
        if (isNaN(lat) || isNaN(lon) || isNaN(size)) return [];
        if (c[4]?.trim().toUpperCase() !== 'TX') return [];
        return [{ lat, lon, size_in: size / 100, county: c[3]?.trim() || '', location: c[2]?.trim() || '' }];
      });
    }
  } catch {}

  const internalKey = req.headers.get('x-internal-key') || process.env.ADMIN_SECRET || '';
  const headers: Record<string, string> = {
    'Content-Type':   'application/json',
    'cookie':         req.headers.get('cookie') || '',
    'x-internal-key': internalKey,
  };

  const results: any = { date, isoDate, steps: {} };

  try {
    const r = await fetch(`${BASE}/api/admin/storm/generate-leads`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        date,
        spc_points:    spcPoints.length > 0 ? spcPoints : undefined,
        minHailSize:   0.75,
        maxProperties: 5000,
      }),
      signal: AbortSignal.timeout(180000),
    });
    const d = await r.json();
    results.steps.generate_leads = {
      created:     d.created     ?? 0,
      total_found: d.total_found ?? 0,
      mode:        d.mode        ?? 'swath',
      spc_points:  spcPoints.length,
    };
  } catch (e: any) {
    results.steps.generate_leads = { error: e.message };
    return NextResponse.json({ ...results, aborted: 'generate_leads failed' });
  }

  return NextResponse.json({ ...results, complete: true });
}
