/**
 * POST /api/admin/outreach/sms
 * Sends a batch SMS to storm prospects via Sinch.
 * Auto-logs cost to campaign_costs after each batch.
 *
 * Env vars required in .env.local:
 *   SINCH_SERVICE_PLAN_ID  — found in Sinch dashboard → SMS → APIs
 *   SINCH_API_TOKEN        — found in Sinch dashboard → SMS → APIs
 *   SINCH_FROM_NUMBER      — your Sinch virtual number, E.164 (e.g. +12145551234)
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';

const SERVICE_PLAN_ID = process.env.SINCH_SERVICE_PLAN_ID!;
const API_TOKEN       = process.env.SINCH_API_TOKEN!;
const FROM_NUMBER     = process.env.SINCH_FROM_NUMBER!;
const SEND_DELAY      = 150; // ms between sends
const SMS_COST_CENTS  = 1;   // $0.0083/msg Sinch US outbound, logged as 1¢ (conservative)

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

async function sinchSend(to: string, body: string): Promise<{ id: string }> {
  const url = `https://sms.api.sinch.com/xms/v1/${SERVICE_PLAN_ID}/batches`;
  const res = await fetch(url, {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${API_TOKEN}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({ from: FROM_NUMBER, to: [to], body }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Sinch ${res.status}: ${err}`);
  }
  return res.json();
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();

    const { prospect_ids, message } = await req.json();

    if (!Array.isArray(prospect_ids) || prospect_ids.length === 0)
      return NextResponse.json({ error: 'prospect_ids required' }, { status: 400 });
    if (!message || message.trim().length === 0)
      return NextResponse.json({ error: 'message required' }, { status: 400 });
    if (prospect_ids.length > 500)
      return NextResponse.json({ error: 'Max 500 prospects per campaign' }, { status: 400 });
    if (!SERVICE_PLAN_ID || !API_TOKEN || !FROM_NUMBER)
      return NextResponse.json({
        error: 'Sinch credentials not configured (SINCH_SERVICE_PLAN_ID, SINCH_API_TOKEN, SINCH_FROM_NUMBER)',
      }, { status: 500 });

    const prospects = await prisma.storm_prospects.findMany({
      where: { id: { in: prospect_ids }, phone: { not: null }, status: { not: 'DNC' } },
      select: { id: true, name: true, phone: true, storm_date: true },
    });

    const results = { sent: 0, failed: 0, errors: [] as { id: string; phone: string; error: string }[] };

    for (const p of prospects) {
      const phone = normalizePhone(p.phone!);
      if (!phone) { results.failed++; continue; }

      const firstName = p.name ? p.name.split(' ')[0] : 'there';
      const body = message.replace(/\{\{name\}\}/gi, firstName);

      try {
        const msg = await sinchSend(phone, body);
        await prisma.$executeRaw`
          INSERT INTO sms_log (prospect_id, phone, message, status, twilio_sid)
          VALUES (${p.id}, ${phone}, ${body}, 'sent', ${msg.id})
        `;
        await prisma.storm_prospects.update({
          where: { id: p.id },
          data:  { status: 'CONTACTED', updated_at: new Date() },
        });
        results.sent++;
      } catch (err: any) {
        results.failed++;
        results.errors.push({ id: p.id, phone, error: err.message });
        await prisma.$executeRaw`
          INSERT INTO sms_log (prospect_id, phone, message, status)
          VALUES (${p.id}, ${phone}, ${body}, 'failed')
        `;
      }

      await sleep(SEND_DELAY);
    }

    // Auto-log SMS cost to campaign_costs
    if (results.sent > 0) {
      const totalCostCents = results.sent * SMS_COST_CENTS;

      // Resolve campaign_id from first prospect's storm_date
      const stormDates = [...new Set(prospects.map(p => p.storm_date).filter(Boolean))];
      const campaignId = stormDates[0] ?? null;

      await prisma.$executeRaw`
        INSERT INTO campaign_costs
          (id, date, category, description, amount_cents, quantity, unit_cost_cents, campaign_id, auto_tracked, metadata, created_at)
        VALUES (
          gen_random_uuid()::text,
          NOW()::date,
          'sms',
          ${'SMS batch — ' + results.sent + ' messages sent'},
          ${totalCostCents},
          ${results.sent},
          ${SMS_COST_CENTS},
          ${campaignId},
          true,
          ${JSON.stringify({
            sent:    results.sent,
            failed:  results.failed,
            preview: message.slice(0, 100),
            storm_dates: stormDates,
          })}::jsonb,
          NOW()
        )
      `.catch(e => console.warn('[sms] Cost log failed:', e.message));
    }

    return NextResponse.json({
      success: true,
      total:   prospects.length,
      ...results,
      cost_logged: results.sent > 0 ? `$${(results.sent * SMS_COST_CENTS / 100).toFixed(2)}` : '$0.00',
    });
  } catch (err: any) {
    if (err.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
