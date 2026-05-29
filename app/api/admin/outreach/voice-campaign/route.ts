/**
 * POST /api/admin/outreach/voice-campaign
 * Dispatches outbound AI calls via Retell to a batch of storm prospects.
 *
 * Suppression rules (checked per-record before dialing):
 *   - Phone in dnc_list            → skip permanently
 *   - call_attempts >= 3           → skip (max 3 total attempts)
 *   - Status HARD_NO < 90 days     → skip
 *   - Status NO_INTEREST < 30 days → skip
 *   - Status DNC                   → skip permanently
 *   - No phone / invalid           → skip
 *
 * Time-of-day guard: 9am–7pm CT only (TCPA compliance).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';

const RETELL_API_KEY = process.env.RETELL_API_KEY!;
const RETELL_FROM    = '+12144915254';
const STORM_AGENT_ID = 'agent_c9780bbd08613e299d1b6036ce';
const RETELL_BASE    = 'https://api.retellai.com';
const CALL_DELAY_MS  = 200;

const MAX_ATTEMPTS   = 3;
const HARD_NO_DAYS   = 90;
const NO_INTEREST_DAYS = 30;

const VOICEMAIL_MESSAGE = "Hi this is a quick message for the homeowner — your neighborhood was recently in the path of hail and we are offering free roof inspections. You can also visit roofworksoftexas.com to use our free online estimate tool. Just enter your roofing details including your adjuster report findings and instantly see our discounted pricing to compare with your insurance allowance. If you prefer a traditional estimate just fill out the form on our site and we will be in touch. Again that is roofworksoftexas.com — free inspections, free estimates, no pressure. Have a great day.";

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return `+${digits}`;
}

function isBusinessHours(): boolean {
  const ct   = new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' });
  const hour = new Date(ct).getHours();
  return hour >= 9 && hour < 19;
}

function daysSince(date: Date | null): number {
  if (!date) return 9999;
  return (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
}

async function retellCall(toNumber: string, dynamicVars: Record<string, string>) {
  const res = await fetch(`${RETELL_BASE}/v2/create-phone-call`, {
    method:  'POST',
    headers: { 'Authorization': `Bearer ${RETELL_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from_number:                  RETELL_FROM,
      to_number:                    toNumber,
      override_agent_id:            STORM_AGENT_ID,
      retell_llm_dynamic_variables: dynamicVars,
      voicemail_detection:          'machine_detection',
      voicemail_message:            VOICEMAIL_MESSAGE,
    }),
  });
  if (!res.ok) throw new Error(`Retell ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();

    // ── Time-of-day guard ──────────────────────────────────────────────────
    if (!isBusinessHours()) {
      return NextResponse.json({
        error: 'Voice campaigns can only be launched between 9am–7pm CT (TCPA compliance)',
        hours: '9am–7pm CT',
      }, { status: 400 });
    }

    const { prospect_ids, storm_date } = await req.json();

    if (!Array.isArray(prospect_ids) || prospect_ids.length === 0)
      return NextResponse.json({ error: 'prospect_ids required' }, { status: 400 });
    if (prospect_ids.length > 500)
      return NextResponse.json({ error: 'Max 500 prospects per campaign' }, { status: 400 });

    // ── Fetch prospects ────────────────────────────────────────────────────
    const rows = await prisma.storm_prospects.findMany({
      where: {
        id:     { in: prospect_ids },
        phone:  { not: null },
        status: { notIn: ['DNC'] as any },
      },
      select: {
        id: true, name: true, phone: true, city: true,
        hail_size_in: true, status: true,
        call_attempts: true, last_contacted_at: true,
      },
    });

    if (rows.length === 0)
      return NextResponse.json({ error: 'No callable prospects (no phone or all DNC)' }, { status: 400 });

    // ── Load DNC list (phone-level) ────────────────────────────────────────
    const dncPhones = new Set(
      (await prisma.dnc_list.findMany({ select: { phone: true } })).map(d => d.phone)
    );

    const results = {
      dispatched: 0,
      skipped:    0,
      skipped_reasons: { dnc: 0, max_attempts: 0, hard_no: 0, no_interest: 0, invalid_phone: 0 },
      errors:     [] as { id: string; error: string }[],
      call_ids:   [] as { prospect_id: string; call_id: string }[],
    };

    for (const p of rows) {
      const phone = normalizePhone(p.phone!);

      // ── Suppression checks ───────────────────────────────────────────────
      if (phone.length < 12) {
        results.skipped++; results.skipped_reasons.invalid_phone++; continue;
      }
      if (dncPhones.has(phone)) {
        results.skipped++; results.skipped_reasons.dnc++; continue;
      }
      if ((p.call_attempts ?? 0) >= MAX_ATTEMPTS) {
        results.skipped++; results.skipped_reasons.max_attempts++; continue;
      }
      if (p.status === 'HARD_NO' && daysSince(p.last_contacted_at) < HARD_NO_DAYS) {
        results.skipped++; results.skipped_reasons.hard_no++; continue;
      }
      if ((p.status === 'NO_INTEREST' || p.status === 'NO_RESPONSE') && daysSince(p.last_contacted_at) < NO_INTEREST_DAYS) {
        results.skipped++; results.skipped_reasons.no_interest++; continue;
      }

      const firstName = p.name ? p.name.split(' ')[0] : 'there';
      const city      = p.city || 'your area';
      const hailSize  = p.hail_size_in ? `${p.hail_size_in} inch` : 'significant';

      try {
        const call   = await retellCall(phone, { homeowner_name: firstName, city, hail_size: hailSize });
        const callId = call.call_id;

        // Log the call
        await prisma.retell_calls.upsert({
          where:  { call_id: callId },
          create: { prospect_id: p.id, call_id: callId, agent_id: STORM_AGENT_ID, status: 'dispatched' },
          update: {},
        });

        // Increment attempt counter + update status + timestamp
        await prisma.storm_prospects.update({
          where: { id: p.id },
          data:  {
            status:            'CONTACTED' as any,
            call_attempts:     { increment: 1 },
            last_contacted_at: new Date(),
            updated_at:        new Date(),
          },
        });

        results.dispatched++;
        results.call_ids.push({ prospect_id: p.id, call_id: callId });
      } catch (err: any) {
        results.errors.push({ id: p.id, error: err.message });
        results.skipped++;
      }

      await sleep(CALL_DELAY_MS);
    }

    return NextResponse.json({
      success:    true,
      storm_date: storm_date || null,
      total:      rows.length,
      dispatched: results.dispatched,
      skipped:    results.skipped,
      skipped_breakdown: results.skipped_reasons,
      errors:     results.errors,
      call_ids:   results.call_ids,
    });
  } catch (err: any) {
    if (err.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
