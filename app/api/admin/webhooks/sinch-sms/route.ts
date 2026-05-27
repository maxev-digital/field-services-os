/**
 * POST /api/admin/webhooks/sinch-sms
 * Receives inbound SMS replies from Sinch.
 * Handles STOP/opt-out keywords → adds phone to dnc_list + marks all matching prospects DNC.
 * Handles positive replies → upgrades prospect to INTERESTED.
 *
 * Configure in Sinch dashboard:
 *   SMS → APIs → your service plan → Callback URL:
 *   https://admin.roofworksoftexas.com/api/admin/webhooks/sinch-sms
 */
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { sendEmail } from '@/lib/notify-email';
import { notifySmsReply } from '@/lib/telegram-notify';

const NOTIFY_EMAIL    = process.env.OUTREACH_MAILBOX_1_EMAIL || 'info@roofworksoftexas.com';

// TCPA-required opt-out keywords
const OPT_OUT_KEYWORDS = /^(stop|stopall|unsubscribe|cancel|quit|end|remove|optout|opt out|opt-out|no more|take me off|remove me)$/i;
const OPT_IN_KEYWORDS  = /^(start|yes|unstop|subscribe)$/i;

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return `+${digits}`;
}

async function sendSms(to: string, body: string) {
  const planId = process.env.SINCH_SERVICE_PLAN_ID;
  const token  = process.env.SINCH_API_TOKEN;
  const from   = process.env.SINCH_FROM_NUMBER;
  if (!planId || !token || !from) return;
  await fetch(`https://us.sms.api.sinch.com/xms/v1/${planId}/batches`, {
    method:  "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body:    JSON.stringify({ from, to: [to], body }),
    signal:  AbortSignal.timeout(10000),
  }).catch(() => {});
}

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json().catch(() => null);
    if (!payload) return NextResponse.json({ ok: true });

    const from = normalizePhone((payload.from || payload.sender || '').toString());
    const body = (payload.body || payload.message || payload.text || '').toString().trim();

    if (!from) return NextResponse.json({ ok: true });

    // ── Match prospect by phone ────────────────────────────────────────────
    const prospects = await prisma.storm_prospects.findMany({
      where:  { phone: { not: null } },
      select: { id: true, name: true, phone: true, status: true },
    });
    const prospect = prospects.find(p => normalizePhone(p.phone!) === from) || null;

    // ── OPT-OUT handler ───────────────────────────────────────────────────
    const bodyTrimmed = body.trim();
    if (OPT_OUT_KEYWORDS.test(bodyTrimmed)) {
      // Add to dnc_list
      await prisma.dnc_list.upsert({
        where:  { phone: from },
        create: { id: `dnc_${Date.now()}`, phone: from, reason: "SMS STOP keyword", source: "sms_stop" },
        update: { reason: 'SMS STOP keyword', source: 'sms_stop' },
      }).catch(() => {});

      // Mark ALL prospects with this phone as DNC
      await prisma.storm_prospects.updateMany({
        where: { phone: { in: [from, from.replace('+1', ''), from.slice(2)] } },
        data:  { status: 'DNC' as any, updated_at: new Date() },
      }).catch(() => {});

      // TCPA-required confirmation reply
      await sendSms(from,
        'You have been unsubscribed from Roof Works of Texas messages. Reply START to re-subscribe. Msg&Data rates may apply.'
      ).catch(() => {});

      console.log(`[sinch-sms] OPT-OUT: ${from}`);
      return NextResponse.json({ ok: true });
    }

    // ── OPT-IN handler (re-subscribe) ────────────────────────────────────
    if (OPT_IN_KEYWORDS.test(bodyTrimmed)) {
      await prisma.dnc_list.deleteMany({ where: { phone: from } }).catch(() => {});
      await sendSms(from,
        'You have been re-subscribed to Roof Works of Texas messages. Reply STOP to unsubscribe at any time.'
      ).catch(() => {});
      return NextResponse.json({ ok: true });
    }

    // ── Save reply to sms_replies ─────────────────────────────────────────
    await prisma.$executeRaw`
      INSERT INTO sms_replies (prospect_id, from_number, body)
      VALUES (${prospect?.id ?? null}, ${from}, ${body})
    `.catch(() => {});

    // ── Positive reply → upgrade status ──────────────────────────────────
    if (prospect && prospect.status !== 'DNC' && prospect.status !== 'INTERESTED' && prospect.status !== 'CONVERTED') {
      const positive = /yes|sure|okay|ok|interested|schedule|inspect|please|when|how|sounds|book|free/i.test(body);
      if (positive) {
        await prisma.storm_prospects.update({
          where: { id: prospect.id },
          data:  { status: 'INTERESTED' as any, updated_at: new Date() },
        });
      }
    }

    // ── Email admin ───────────────────────────────────────────────────────
    const displayName = prospect?.name || from;
    const time = new Date().toLocaleString('en-US', { timeZone: 'America/Chicago', dateStyle: 'short', timeStyle: 'short' });

    await sendEmail({
      to:      NOTIFY_EMAIL,
      subject: `💬 SMS Reply — ${displayName}: "${body.slice(0, 60)}"`,
      html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;">
        <div style="background:#1a3a5c;padding:16px 20px;">
          <h2 style="margin:0;color:#fff;font-size:18px;">New SMS Reply</h2>
          <p style="margin:4px 0 0;color:#93c5fd;font-size:13px;">${time} CT</p>
        </div>
        <div style="background:#fff;padding:20px;border:1px solid #e5e7eb;">
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="padding:8px 12px;background:#f9fafb;font-weight:600;color:#374151;font-size:13px;width:100px;">From</td>
                <td style="padding:8px 12px;font-weight:bold;">${displayName}</td></tr>
            <tr><td style="padding:8px 12px;background:#f9fafb;font-weight:600;color:#374151;font-size:13px;">Phone</td>
                <td style="padding:8px 12px;"><a href="tel:${from}" style="color:#1a3a5c;">${from}</a></td></tr>
            <tr><td style="padding:8px 12px;background:#f9fafb;font-weight:600;color:#374151;font-size:13px;">Message</td>
                <td style="padding:8px 12px;font-size:16px;color:#111827;"><strong>${body}</strong></td></tr>
          </table>
          <div style="margin-top:16px;padding:12px;background:#fef3c7;border-left:4px solid #f59e0b;">
            <a href="https://admin.roofworksoftexas.com/admin/sms" style="color:#1a2e4a;font-weight:600;">
              View in SMS Inbox →
            </a>
          </div>
        </div>
      </div>`,
    });

    notifySmsReply(displayName, from, body).catch(() => {});

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[sinch-sms webhook] error:', err.message);
    return NextResponse.json({ ok: true }); // always 200 so Sinch doesn't retry
  }
}
