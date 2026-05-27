/**
 * POST /api/admin/webhooks/calendly
 * Receives Calendly webhooks (invitee.created / invitee.canceled).
 * Configure in Calendly: Integrations -> Webhooks -> add URL.
 *
 * On booking: cancels IVR drip, marks prospect APPOINTMENT_SET.
 * On cancel:  reverts to INTERESTED.
 */
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { notifyAppointmentBooked } from '@/lib/telegram-notify';

function normalizePhone(raw: string): string {
  const d = raw.replace(/\D/g, '');
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith('1')) return `+${d}`;
  return `+${d}`;
}

function extractPhone(qa: { question: string; answer: string }[]): string {
  const q = qa.find(x => /phone|mobile|cell|number/i.test(x.question));
  return q?.answer ? normalizePhone(q.answer) : '';
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ ok: true });

    const event   = body.event as string;
    const payload = body.payload || {};
    const name    = payload.name || '';
    const email   = payload.email || '';
    const qa      = payload.questions_and_answers || [];
    const phone   = extractPhone(qa);

    const isBooked   = event === 'invitee.created';
    const isCanceled = event === 'invitee.canceled';
    if (!isBooked && !isCanceled) return NextResponse.json({ ok: true });

    // Find prospect by email or phone
    let prospect: { id: string; name: string | null; phone: string | null } | null = null;
    if (email) {
      prospect = await prisma.storm_prospects.findFirst({
        where:  { email: { equals: email, mode: 'insensitive' } },
        select: { id: true, name: true, phone: true },
      }).catch(() => null);
    }
    if (!prospect && phone) {
      const all = await prisma.storm_prospects.findMany({
        where:  { phone: { not: null } },
        select: { id: true, name: true, phone: true },
      });
      prospect = all.find(p => normalizePhone(p.phone!) === phone) || null;
    }

    if (!prospect) {
      console.log(`[calendly] No prospect match for email=${email} phone=${phone}`);
      return NextResponse.json({ ok: true });
    }

    if (isBooked) {
      await prisma.storm_prospects.update({
        where: { id: prospect.id },
        data:  { status: 'APPOINTMENT_SET' as any, updated_at: new Date() },
      }).catch(() => {});

      // Cancel drip sequence
      await prisma.$executeRaw`
        UPDATE ivr_drip_queue SET cancelled = TRUE
        WHERE prospect_id = ${prospect.id} AND completed = FALSE AND cancelled = FALSE
      `.catch(() => {});

      const eventTime = payload.scheduled_event?.start_time || '';
      notifyAppointmentBooked(
        prospect.name || name,
        prospect.phone || phone,
        `Calendly booking confirmed${eventTime ? ' — ' + new Date(eventTime).toLocaleString('en-US', { timeZone: 'America/Chicago', dateStyle: 'short', timeStyle: 'short' }) + ' CT' : ''}`
      ).catch(() => {});

      console.log(`[calendly] Booked: ${prospect.id} (${prospect.name || name})`);
    }

    if (isCanceled) {
      await prisma.storm_prospects.updateMany({
        where: { id: prospect.id, status: { in: ['APPOINTMENT_SET' as any] } },
        data:  { status: 'INTERESTED' as any, updated_at: new Date() },
      }).catch(() => {});
      console.log(`[calendly] Canceled: ${prospect.id}`);
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[calendly webhook] error:', err.message);
    return NextResponse.json({ ok: true });
  }
}
