/**
 * POST /api/admin/storm/pipeline
 * Runs the full storm outreach pipeline:
 *   1. Generate leads for a storm date
 *   2. Skip trace all new prospects without phones
 *   3. Launch voice campaign (time-gated 9am–7pm CT)
 *
 * Called by the Telegram bot after user approves a storm alert.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';

const BASE = 'http://localhost:3020';

function ctHour(): number {
  const d = new Date();
  d.setMinutes(d.getMinutes() - 360); // UTC-6 CT
  return d.getHours();
}

export async function POST(req: NextRequest) {
  try { await requireAdmin(); } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { date, min_hail_size = 0.75, max_properties = 1000, cities = [], zips = [] } = await req.json();
  if (!date) return NextResponse.json({ error: 'date required (YYYYMMDD)' }, { status: 400 });

  const cookie = req.headers.get('cookie') || '';
  const headers = { 'Content-Type': 'application/json', cookie };

  const results: any = { date, min_hail_size, steps: {} };

  // ── Step 1: Generate leads ──────────────────────────────────────────────
  try {
    const r = await fetch(`${BASE}/api/admin/storm/generate-leads`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ date, minHailSize: min_hail_size, maxProperties: max_properties, cities, zips }),
      signal: AbortSignal.timeout(60000),
    });
    const d = await r.json();
    results.steps.generate_leads = {
      created:        d.created ?? 0,
      total_found:    d.total_found ?? 0,
      already_existed: d.already_existed ?? 0,
      tiers:          d.tiers ?? {},
    };
    console.log(`[pipeline] Generated ${d.created} leads for ${date}`);
  } catch (e: any) {
    results.steps.generate_leads = { error: e.message };
    return NextResponse.json({ ...results, aborted: 'generate_leads failed' });
  }

  const created = results.steps.generate_leads.created ?? 0;
  if (created === 0 && (results.steps.generate_leads.already_existed ?? 0) === 0) {
    return NextResponse.json({ ...results, message: 'No properties found in hail swath' });
  }

  // ── Step 2: Skip trace new prospects (no phone) ─────────────────────────
  try {
    // Get IDs of new prospects without phones for this storm date
    const stormDateStr = `${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}`;
    const prospectsRes = await fetch(
      `${BASE}/api/admin/prospects?storm_date=${stormDateStr}&has_phone=0&limit=500`,
      { headers, signal: AbortSignal.timeout(15000) }
    );
    const pd = await prospectsRes.json();
    const ids = (pd.prospects || []).map((p: any) => p.id);

    if (ids.length > 0) {
      const stRes = await fetch(`${BASE}/api/admin/prospects/skip-trace`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ prospect_ids: ids }),
        signal: AbortSignal.timeout(120000),
      });
      const sd = await stRes.json();
      results.steps.skip_trace = {
        sent:    sd.total_sent ?? 0,
        found:   sd.found ?? 0,
        updated: sd.updated ?? 0,
      };
      console.log(`[pipeline] Skip traced ${ids.length} prospects, found ${sd.found} phones`);
    } else {
      results.steps.skip_trace = { message: 'No new prospects needed skip trace' };
    }
  } catch (e: any) {
    results.steps.skip_trace = { error: e.message };
  }

  // ── Step 3: Voice campaign (only 9am–7pm CT) ────────────────────────────
  const hour = ctHour();
  if (hour < 9 || hour >= 19) {
    results.steps.voice_campaign = {
      skipped: true,
      reason:  `Outside calling hours (CT hour: ${hour}). Campaign queued — rerun between 9am–7pm.`,
    };
    return NextResponse.json(results);
  }

  try {
    // Get all prospects for this storm with phones and not yet contacted
    const stormDateStr = `${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}`;
    const callRes = await fetch(
      `${BASE}/api/admin/prospects?storm_date=${stormDateStr}&has_phone=1&status=NEW&limit=500`,
      { headers, signal: AbortSignal.timeout(15000) }
    );
    const cd = await callRes.json();
    const callIds = (cd.prospects || []).map((p: any) => p.id);

    if (callIds.length > 0) {
      const vcRes = await fetch(`${BASE}/api/admin/outreach/voice-campaign`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ prospect_ids: callIds, storm_date: stormDateStr }),
        signal: AbortSignal.timeout(300000),
      });
      const vd = await vcRes.json();
      results.steps.voice_campaign = {
        total:      vd.total ?? 0,
        dispatched: vd.dispatched ?? 0,
        skipped:    vd.skipped ?? 0,
        errors:     vd.errors?.length ?? 0,
      };
      console.log(`[pipeline] Voice campaign: ${vd.dispatched} calls dispatched`);
    } else {
      results.steps.voice_campaign = { message: 'No callable prospects found' };
    }
  } catch (e: any) {
    results.steps.voice_campaign = { error: e.message };
  }

  return NextResponse.json({ ...results, complete: true });
}
