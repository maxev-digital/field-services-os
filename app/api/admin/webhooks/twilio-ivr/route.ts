/**
 * POST /api/admin/webhooks/twilio-ivr
 * Handles keypress callbacks and status callbacks from Twilio IVR calls.
 *
 * ?action=keypress  -- digit pressed
 *   1 = speak to rep now (live connect to owner)
 *   2 = schedule visit in 24-48 hours
 *   3 = remove from list (DNC)
 * ?action=status    -- call status (no-answer, busy, failed, completed)
 */
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { notifyIvrPress1, notifyIvrPress2, notifyIvrDNC, telegramNotify } from '@/lib/telegram-notify';

const CALENDLY_BOOKING_URL = process.env.CALENDLY_BOOKING_URL || 'https://calendly.com/roofworksoftexas/30min';

function twiml(xml: string) {
  return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?>${xml}`, {
    headers: { 'Content-Type': 'text/xml' },
  });
}

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
    method:  'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ from, to: [to], body }),
    signal:  AbortSignal.timeout(10000),
  }).catch(() => {});
}

async function findProspect(prospectId: string | null, callSid: string) {
  if (prospectId) {
    return prisma.storm_prospects.findUnique({
      where:  { id: prospectId },
      select: { id: true, name: true, phone: true, address: true, city: true, notes: true, status: true },
    });
  }
  const call = await prisma.$queryRaw<{ prospect_id: string }[]>`
    SELECT prospect_id FROM ivr_calls WHERE call_sid = ${callSid} LIMIT 1
  `.catch(() => []);
  if (!call.length) return null;
  return prisma.storm_prospects.findUnique({
    where:  { id: call[0].prospect_id },
    select: { id: true, name: true, phone: true, address: true, city: true, notes: true, status: true },
  });
}

export async function POST(req: NextRequest) {
  try {
    const action     = req.nextUrl.searchParams.get('action') || 'keypress';
    const prospectId = req.nextUrl.searchParams.get('prospect_id');
    const variant    = req.nextUrl.searchParams.get('variant') || 'A';
    const nameParam  = req.nextUrl.searchParams.get('name') || 'there';

    const formData   = await req.formData();
    const digit      = (formData.get('Digits') as string | null) || '';
    const callSid    = (formData.get('CallSid') as string | null) || '';
    const callStatus = (formData.get('CallStatus') as string | null) || '';
    const toNumber   = (formData.get('To') as string | null) || '';

    // ── STATUS CALLBACK ──────────────────────────────────────────────────────
    if (action === 'status') {
      const answeredBy        = (formData.get('AnsweredBy') as string | null) || '';
      const isMachine         = ['machine_start', 'machine_end_beep', 'machine_end_silence', 'machine_end_other', 'fax'].includes(answeredBy);
      const terminalNoContact = ['no-answer', 'busy', 'failed', 'canceled'].includes(callStatus);

      if ((isMachine || terminalNoContact) && prospectId) {
        const PROTECTED = ['PENDING_CONFIRMATION', 'INTERESTED', 'CONVERTED', 'DNC'];
        await prisma.storm_prospects.updateMany({
          where: { id: prospectId, status: { notIn: PROTECTED as any } },
          data:  { status: 'VOICEMAIL' as any, updated_at: new Date() },
        }).catch(() => {});
        await prisma.$executeRaw`
          UPDATE ivr_calls SET status = 'voicemail', updated_at = NOW()
          WHERE call_sid = ${callSid}
        `.catch(() => {});
      }
      return NextResponse.json({ ok: true });
    }

    // ── KEYPRESS HANDLER ─────────────────────────────────────────────────────
    const prospect  = await findProspect(prospectId, callSid);
    const firstName = prospect?.name ? prospect.name.split(' ')[0] : nameParam;
    const phone     = prospect?.phone ? normalizePhone(prospect.phone) : normalizePhone(toNumber);
    const address   = prospect?.address || '';
    const city      = prospect?.city || '';
    const fullName  = prospect?.name || 'Unknown';
    const time      = new Date().toLocaleString('en-US', { timeZone: 'America/Chicago', dateStyle: 'short', timeStyle: 'short' });

    const isTest = prospectId === 'test';

    // ── PRESS 1: Lead — wants a rep ─────────────────────────────────────────
    if (digit === '1') {
      if (isTest) {
        notifyIvrPress1('🧪 TEST CALL', normalizePhone(toNumber), '— test fire, script confirmed working —', '').catch(() => {});
      } else if (prospect) {
        const PROTECTED = ['PENDING_CONFIRMATION', 'CONVERTED', 'DNC'];
        prisma.storm_prospects.updateMany({
          where: { id: prospect.id, status: { notIn: PROTECTED as any } },
          data:  { status: 'PENDING_CONFIRMATION' as any },
        }).catch(() => {});
        prisma.$executeRaw`
          UPDATE ivr_calls SET status = 'interested', digit_pressed = '1', updated_at = NOW()
          WHERE call_sid = ${callSid}
        `.catch(() => {});
        notifyIvrPress1(fullName, phone, address, city).catch(() => {});
      }
      return twiml('<Response><Hangup/></Response>');
    }

    // ── PRESS 2: Lead — wants visit in 24-48 hours ──────────────────────────
    if (digit === '2') {
      if (isTest) {
        notifyIvrPress2('🧪 TEST CALL', normalizePhone(toNumber), '— test fire, press 2 flow working —').catch(() => {});
      } else if (prospect) {
        const PROTECTED = ['PENDING_CONFIRMATION', 'CONVERTED', 'DNC'];
        prisma.storm_prospects.updateMany({
          where: { id: prospect.id, status: { notIn: PROTECTED as any } },
          data:  { status: 'PENDING_CONFIRMATION' as any },
        }).catch(() => {});
        prisma.$executeRaw`
          UPDATE ivr_calls SET status = 'visit_requested', digit_pressed = '2', updated_at = NOW()
          WHERE call_sid = ${callSid}
        `.catch(() => {});
        notifyIvrPress2(fullName, phone, address + ', ' + city).catch(() => {});
      }
      return twiml('<Response><Hangup/></Response>');
    }

    // ── PRESS 3: Remove from list (DNC) ───────────────────────────────────────
    if (digit === '3') {
      // Return TwiML instantly — all side-effects are fire-and-forget
      if (isTest) {
        telegramNotify('🧪 *TEST IVR — Press 3* received — DNC flow confirmed working').catch(() => {});
        return twiml('<Response><Hangup/></Response>');
      } else if (prospect) {
        prisma.storm_prospects.updateMany({
          where: { id: prospect.id },
          data:  { status: 'DNC' as any, updated_at: new Date() },
        }).catch(() => {});
        if (phone.length >= 12) {
          prisma.dnc_list.upsert({
            where:  { phone },
            create: { id: `dnc_${Date.now()}`, phone, reason: 'IVR opt-out (pressed 3)', source: 'ivr_optout' },
            update: { reason: 'IVR opt-out (pressed 3)', source: 'ivr_optout' },
          }).catch(() => {});
        }
        prisma.$executeRaw`
          UPDATE ivr_calls SET status = 'dnc', digit_pressed = '3', script_variant = ${variant}, updated_at = NOW()
          WHERE call_sid = ${callSid}
        `.catch(() => {});
        notifyIvrDNC(fullName, phone).catch(() => {});
      }
      return twiml('<Response><Hangup/></Response>');
    }

    // ── NO INPUT / TIMEOUT ────────────────────────────────────────────────────
    if (prospect) {
      const PROTECTED = ['PENDING_CONFIRMATION', 'INTERESTED', 'CONVERTED', 'DNC'];
      await prisma.storm_prospects.updateMany({
        where: { id: prospect.id, status: { notIn: PROTECTED as any } },
        data:  { status: 'VOICEMAIL' as any, updated_at: new Date() },
      }).catch(() => {});
      await prisma.$executeRaw`
        UPDATE ivr_calls SET status = 'no_input', script_variant = ${variant}, updated_at = NOW()
        WHERE call_sid = ${callSid}
      `.catch(() => {});
    }

    return twiml('<Response><Hangup/></Response>');

  } catch (err: any) {
    console.error('[twilio-ivr webhook] error:', err.message);
    return twiml('<Response><Hangup/></Response>');
  }
}
