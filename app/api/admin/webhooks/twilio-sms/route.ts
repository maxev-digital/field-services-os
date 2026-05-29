/**
 * POST /api/admin/webhooks/twilio-sms
 * Receives inbound SMS replies from Twilio.
 * Matches sender to a prospect, saves reply, emails admin.
 */
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { sendEmail } from '@/lib/mailer';

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return `+${digits}`;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const from  = (formData.get('From')  as string | null) || '';
    const body  = (formData.get('Body')  as string | null) || '';

    if (!from) {
      return new NextResponse('<Response/>', { headers: { 'Content-Type': 'text/xml' } });
    }

    const normalFrom = normalizePhone(from);

    // Match to prospect by phone
    const allWithPhone = await prisma.storm_prospects.findMany({
      where:  { phone: { not: null } },
      select: { id: true, name: true, phone: true },
    });

    let prospect = allWithPhone.find(p => {
      const n = normalizePhone(p.phone!);
      return n === normalFrom;
    }) || null;

    // Save reply
    await prisma.$executeRaw`
      INSERT INTO sms_replies (prospect_id, from_number, body)
      VALUES (${prospect?.id ?? null}, ${normalFrom}, ${body})
    `;

    // Update prospect status if matched and they replied something positive
    if (prospect) {
      const positiveReply = /yes|sure|okay|ok|interested|schedule|inspect|please|when|how|sound/i.test(body);
      if (positiveReply) {
        await prisma.storm_prospects.update({
          where: { id: prospect.id },
          data:  { status: 'INTERESTED', updated_at: new Date() },
        });
      }
    }

    // Email admin notification
    const displayName = prospect?.name || normalFrom;
    await sendEmail({
      to:      'info@roofworksoftexas.com',
      subject: `💬 SMS Reply from ${displayName}`,
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;">
          <h2 style="color:#1a2e4a;border-bottom:2px solid #9b1c1c;padding-bottom:8px;">
            New SMS Reply
          </h2>
          <table style="width:100%;border-collapse:collapse;margin-top:16px;">
            <tr>
              <td style="padding:8px 12px;background:#f5f7fa;font-weight:600;width:130px;">From</td>
              <td style="padding:8px 12px;">${displayName}</td>
            </tr>
            <tr>
              <td style="padding:8px 12px;background:#f5f7fa;font-weight:600;">Phone</td>
              <td style="padding:8px 12px;">${normalFrom}</td>
            </tr>
            ${prospect ? `
            <tr>
              <td style="padding:8px 12px;background:#f5f7fa;font-weight:600;">Prospect ID</td>
              <td style="padding:8px 12px;">${prospect.id}</td>
            </tr>` : ''}
            <tr>
              <td style="padding:8px 12px;background:#f5f7fa;font-weight:600;">Message</td>
              <td style="padding:8px 12px;font-size:16px;color:#1a2e4a;"><strong>${body}</strong></td>
            </tr>
          </table>
          <div style="margin-top:20px;padding:12px;background:#fef3c7;border-left:4px solid #f59e0b;border-radius:4px;">
            Log in to the <a href="https://admin.roofworksoftexas.com/admin/prospects" style="color:#1a2e4a;font-weight:600;">admin panel</a> to follow up.
          </div>
        </div>
      `,
    });

    // Always return empty TwiML — no auto-reply
    return new NextResponse('<Response/>', {
      headers: { 'Content-Type': 'text/xml' },
    });
  } catch (err: any) {
    console.error('Twilio webhook error:', err);
    // Still return 200 so Twilio doesn't retry
    return new NextResponse('<Response/>', {
      headers: { 'Content-Type': 'text/xml' },
    });
  }
}
