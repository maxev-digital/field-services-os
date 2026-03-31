/**
 * POST /api/admin/webhooks/retell
 * Receives post-call events from Retell AI.
 * Updates prospect status based on call outcome.
 */
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { sendEmail } from '@/lib/notify-email';
import { notifyCallCompleted, notifyAppointmentBooked, notifyInboundCall } from '@/lib/telegram-notify';
import { prospectToJob } from '@/lib/pipeline';

const NOTIFY_EMAIL = 'info@roofworksoftexas.com';

// Map Retell call outcome to prospect status
function mapStatus(callAnalysis: any, disconnectReason: string): string | null {
  if (!callAnalysis) return 'NO_RESPONSE';

  const transcript = (callAnalysis.transcript || '').toLowerCase();
  const summary    = (callAnalysis.call_summary || '').toLowerCase();

  if (
    transcript.includes('pencil you in') ||
    transcript.includes('see you then') ||
    transcript.includes('confirmed') ||
    summary.includes('appointment') ||
    summary.includes('inspection booked') ||
    summary.includes('scheduled')
  ) {
    return 'INTERESTED';
  }

  if (
    transcript.includes('remove my number') ||
    transcript.includes('do not call') ||
    transcript.includes('take me off') ||
    disconnectReason === 'do_not_call'
  ) {
    return 'DNC';
  }

  if (
    summary.includes('not interested') ||
    summary.includes('already have') ||
    disconnectReason === 'declined'
  ) {
    return 'NO_RESPONSE';
  }

  if (disconnectReason === 'agent_hangup' || disconnectReason === 'user_hangup') {
    return 'CONTACTED';
  }

  if (
    disconnectReason === 'voicemail_reached' ||
    disconnectReason === 'no_answer' ||
    disconnectReason === 'line_busy'
  ) {
    return 'NO_RESPONSE';
  }

  return 'CONTACTED';
}

export async function POST(req: NextRequest) {
  try {
    const body  = await req.text();
    const event = JSON.parse(body);
    const { event: eventType, call } = event;

    // Inbound call started — send immediate email alert
    if (eventType === 'call_started' && call?.direction === 'inbound') {
      const from   = call.from_number || 'Unknown';
      const time   = new Date().toLocaleString('en-US', { timeZone: 'America/Chicago', dateStyle: 'short', timeStyle: 'short' });
      try {
        await sendEmail({
          to:      NOTIFY_EMAIL,
          subject: `📞 Inbound Call — ${from}`,
          html: `<div style="font-family:Arial,sans-serif;max-width:500px;padding:24px;">
            <h2 style="background:#1a3a5c;color:#fff;padding:12px 20px;margin:0 0 16px;">Inbound Call Coming In</h2>
            <p style="font-size:16px;"><strong>From:</strong> ${from}</p>
            <p style="font-size:16px;"><strong>Time:</strong> ${time} CT</p>
            <p style="font-size:14px;color:#666;">Alex (AI agent) is handling the call. You'll get a follow-up email when it ends with the transcript and outcome.</p>
          </div>`,
        });
      } catch {}
      // Telegram: inbound call alert
      notifyInboundCall(from).catch(() => {});
      return NextResponse.json({ received: true });
    }

    if (eventType !== 'call_ended' || !call) {
      return NextResponse.json({ received: true });
    }

    const callId           = call.call_id;
    const disconnectReason = call.disconnect_reason || '';
    const duration         = call.end_timestamp && call.start_timestamp
      ? Math.round((call.end_timestamp - call.start_timestamp) / 1000)
      : 0;
    const callAnalysis = call.call_analysis || null;
    const transcript   = call.transcript || '';
    const newStatus    = mapStatus(callAnalysis, disconnectReason);

    // Find the call record
    const callRecord = await prisma.retell_calls.findUnique({
      where: { call_id: callId },
      select: { prospect_id: true },
    });

    if (!callRecord) {
      console.log(`Retell webhook: unknown call_id ${callId}`);
      return NextResponse.json({ received: true });
    }

    const prospectId = callRecord.prospect_id;

    // Update call record
    await prisma.retell_calls.update({
      where: { call_id: callId },
      data: {
        status:            disconnectReason,
        duration_seconds:  duration,
        transcript:        transcript,
        call_summary:      callAnalysis?.call_summary || null,
        disconnect_reason: disconnectReason,
        updated_at:        new Date(),
      },
    });

    // Update prospect status (don't downgrade INTERESTED or CONVERTED)
    if (newStatus && prospectId) {
      await prisma.storm_prospects.updateMany({
        where: {
          id:     prospectId,
          status: { notIn: ['INTERESTED', 'CONVERTED'] as any },
        },
        data: { status: newStatus as any, updated_at: new Date() },
      });

      // If booked — append note for rep follow-up
      if (newStatus === 'INTERESTED') {
        const note = `[AI CALL ${new Date().toISOString()}] Prospect expressed interest. Duration: ${duration}s. Summary: ${callAnalysis?.call_summary || 'N/A'}`;
        const existing = await prisma.storm_prospects.findUnique({
          where:  { id: prospectId },
          select: { notes: true, name: true, address: true, phone: true },
        });
        await prisma.storm_prospects.update({
          where: { id: prospectId },
          data:  { notes: existing?.notes ? `${existing.notes}\n${note}` : note },
        });

        // ── Admin notification: appointment booked ────────────────────────
        try {
          const prospectName = existing?.name || call.from_number || 'Unknown';
          const prospectAddr = existing?.address || '';
          await prisma.$executeRaw`
            INSERT INTO admin_notifications (id, type, title, message, data)
            VALUES (
              gen_random_uuid()::text,
              'appointment_booked',
              ${'Appointment Booked — ' + prospectName},
              ${'Appointment booked: ' + prospectName + (prospectAddr ? ' at ' + prospectAddr : '') + ' — check transcript for details'},
              ${JSON.stringify({
                prospectId,
                prospectName,
                phone: existing?.phone || call.from_number || null,
                address: prospectAddr,
                duration,
                summary: callAnalysis?.call_summary || null,
              })}::jsonb
            )`;
        } catch (e: any) {
          console.error('[retell] Failed to insert appointment notification:', e.message);
        }

        // ── Hot lead email alert ──────────────────────────────────────────
        try {
          const prospectName = existing?.name || call.from_number || 'Unknown';
          const prospectAddr = existing?.address || '';
          const prospectPhone = existing?.phone || call.from_number || 'Unknown';
          const summary = callAnalysis?.call_summary || 'No summary available';
          const time = new Date().toLocaleString('en-US', { timeZone: 'America/Chicago', dateStyle: 'short', timeStyle: 'short' });
          await sendEmail({
            to: NOTIFY_EMAIL,
            subject: `🔥 HOT LEAD — ${prospectName} is INTERESTED`,
            html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:0;">
              <div style="background:#16a34a;padding:20px 24px;">
                <h1 style="margin:0;color:#fff;font-size:22px;">🔥 Hot Lead — Follow Up Now</h1>
                <p style="margin:6px 0 0;color:#bbf7d0;font-size:14px;">AI call ended — prospect expressed interest in an inspection</p>
              </div>
              <div style="background:#fff;padding:24px;border:1px solid #e5e7eb;">
                <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
                  <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;width:120px;">Name</td><td style="padding:8px 0;font-weight:bold;font-size:15px;">${prospectName}</td></tr>
                  <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;">Phone</td><td style="padding:8px 0;font-weight:bold;font-size:15px;"><a href="tel:${prospectPhone}" style="color:#16a34a;">${prospectPhone}</a></td></tr>
                  <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;">Address</td><td style="padding:8px 0;font-size:14px;">${prospectAddr}</td></tr>
                  <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;">Call Time</td><td style="padding:8px 0;font-size:14px;">${time} CT · ${duration}s</td></tr>
                </table>
                <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:16px;margin-bottom:20px;">
                  <p style="margin:0 0 6px;font-size:12px;font-weight:bold;color:#15803d;text-transform:uppercase;">AI Call Summary</p>
                  <p style="margin:0;font-size:14px;color:#1f2937;">${summary}</p>
                </div>
                <a href="https://admin.roofworksoftexas.com/admin/prospects" style="display:inline-block;background:#16a34a;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:15px;">View Prospect →</a>
              </div>
              <div style="padding:12px 24px;background:#f9fafb;border:1px solid #e5e7eb;border-top:none;">
                <p style="margin:0;font-size:11px;color:#9ca3af;">Roof Works of Texas · Automated Storm Outreach</p>
              </div>
            </div>`,
          });
        } catch (e: any) {
          console.error('[retell] Failed to send hot lead email:', e.message);
        }
      }
    }

    // ── Admin notification: call completed (duration > 10s) ───────────────
    if (duration > 10) {
      try {
        let prospectInfo: any = null;
        if (prospectId) {
          prospectInfo = await prisma.storm_prospects.findUnique({
            where: { id: prospectId },
            select: { name: true, phone: true },
          });
        }
        const callerName = prospectInfo?.name || call.from_number || 'Unknown';
        const summaryText = callAnalysis?.call_summary || 'No summary available';
        await prisma.$executeRaw`
          INSERT INTO admin_notifications (id, type, title, message, data)
          VALUES (
            gen_random_uuid()::text,
            'call_completed',
            ${'Call Completed — ' + callerName},
            ${summaryText.slice(0, 200)},
            ${JSON.stringify({
              prospectId,
              callerName,
              phone: prospectInfo?.phone || call.from_number || null,
              duration,
              status: newStatus,
              disconnectReason,
            })}::jsonb
          )`;
      } catch (e: any) {
        console.error('[retell] Failed to insert call notification:', e.message);
      }
    }

    // ── Auto-convert INTERESTED prospects to customer + job ───────────
    if (newStatus === 'INTERESTED' && prospectId) {
      prospectToJob(prospectId, 'ai_voice_campaign').catch(err =>
        console.error('[retell-webhook] Pipeline conversion failed:', err)
      );
    }
    // Post-call summary email for inbound calls
    if (call.direction === 'inbound') {
      try {
        const from    = call.from_number || 'Unknown';
        const summary = callAnalysis?.call_summary || 'No summary available';
        const outcome = newStatus || 'CONTACTED';
        const time    = new Date().toLocaleString('en-US', { timeZone: 'America/Chicago', dateStyle: 'short', timeStyle: 'short' });
        await sendEmail({
          to:      NOTIFY_EMAIL,
          subject: `Call Summary — ${from} (${outcome})`,
          html: `<div style="font-family:Arial,sans-serif;max-width:500px;padding:24px;">
            <h2 style="background:#1a3a5c;color:#fff;padding:12px 20px;margin:0 0 16px;">Call Ended — ${outcome}</h2>
            <p style="font-size:15px;"><strong>From:</strong> ${from}</p>
            <p style="font-size:15px;"><strong>Time:</strong> ${time} CT &nbsp;|&nbsp; <strong>Duration:</strong> ${duration}s</p>
            <p style="font-size:15px;"><strong>Summary:</strong> ${summary}</p>
            ${transcript ? `<details style="margin-top:16px;"><summary style="cursor:pointer;color:#1a3a5c;font-weight:bold;">Full Transcript</summary><pre style="font-size:12px;white-space:pre-wrap;margin-top:8px;background:#f5f5f5;padding:12px;">${transcript}</pre></details>` : ''}
          </div>`,
        });
      } catch {}
    }

    // Telegram push notifications for calls
    if (duration > 10) {
      const prospectName = callRecord ? (await prisma.storm_prospects.findUnique({ where: { id: prospectId! }, select: { name: true, phone: true } })) : null;
      const pName = prospectName?.name || call.to_number || call.from_number || 'Unknown';
      const pPhone = prospectName?.phone || call.to_number || call.from_number || '';
      const summary = callAnalysis?.call_summary || '';

      if (newStatus === 'INTERESTED') {
        notifyAppointmentBooked(pName, pPhone, summary).catch(() => {});
      } else {
        notifyCallCompleted(pName, pPhone, duration, summary, newStatus || 'CONTACTED').catch(() => {});
      }
    }

    return NextResponse.json({ received: true, prospect_id: prospectId, status: newStatus });
  } catch (err: any) {
    console.error('Retell webhook error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
