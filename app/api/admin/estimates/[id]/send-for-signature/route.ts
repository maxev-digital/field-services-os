/**
 * POST /api/admin/estimates/[id]/send-for-signature
 * Generates a secure signing token and emails the customer a signing link.
 * Native e-sign — no third-party service required.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { sendEmail } from '@/lib/notify-email';
import prisma from '@/lib/prisma';
import crypto from 'crypto';

const BASE_URL    = process.env.NEXT_PUBLIC_BASE_URL || 'https://admin.roofworksoftexas.com';
const SIGN_SECRET = process.env.SIGN_SECRET || 'rw-sign-secret-2026';

function generateToken(estimateId: string): string {
  const payload = `${estimateId}:${Date.now()}`;
  const sig     = crypto.createHmac('sha256', SIGN_SECRET).update(payload).digest('hex').slice(0, 16);
  return Buffer.from(`${payload}:${sig}`).toString('base64url');
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try { await requireAdmin(); } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const estimate = await prisma.estimates.findUnique({
    where:   { id: params.id },
    include: { customer: true, line_items: true },
  });

  if (!estimate) return NextResponse.json({ error: 'Estimate not found' }, { status: 404 });

  const customer = estimate.customer;
  if (!customer?.email) {
    return NextResponse.json({ error: 'Customer has no email address on file' }, { status: 400 });
  }

  const token    = generateToken(params.id);
  const signUrl  = `${BASE_URL}/sign/${token}?est=${params.id}`;
  const expireAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

  // Store token on estimate (uses sign_token + sign_expires_at columns — add via migration below)
  await prisma.$executeRaw`
    UPDATE estimates
    SET sign_token      = ${token},
        sign_expires_at = ${expireAt},
        sign_status     = 'pending',
        updated_at      = NOW()
    WHERE id = ${params.id}
  `;

  const fmt = (n: number) => '$' + (n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  await sendEmail({
    to:      customer.email,
    subject: `Please review and sign your estimate — Roof Works of Texas`,
    html: `
<div style="font-family:Arial,sans-serif;max-width:580px;margin:0 auto;">
  <div style="background:#1a3a5c;padding:20px 24px;">
    <h1 style="margin:0;color:#fff;font-size:20px;">Your Estimate is Ready to Sign</h1>
    <p style="margin:6px 0 0;color:#93c5fd;font-size:13px;">Roof Works of Texas</p>
  </div>
  <div style="background:#fff;padding:24px;border:1px solid #e5e7eb;">
    <p style="font-size:15px;color:#374151;">Hi ${customer.name || 'there'},</p>
    <p style="font-size:15px;color:#374151;">Your roofing estimate for <strong>${estimate.address}</strong> is ready for your review and signature.</p>
    <table style="width:100%;border-collapse:collapse;margin:20px 0;background:#f9fafb;border-radius:8px;overflow:hidden;">
      <tr>
        <td style="padding:12px 16px;font-size:13px;color:#6b7280;border-bottom:1px solid #e5e7eb;">Property</td>
        <td style="padding:12px 16px;font-size:14px;font-weight:600;border-bottom:1px solid #e5e7eb;">${estimate.address}</td>
      </tr>
      ${estimate.insurer ? `<tr><td style="padding:12px 16px;font-size:13px;color:#6b7280;border-bottom:1px solid #e5e7eb;">Insurance</td><td style="padding:12px 16px;font-size:14px;border-bottom:1px solid #e5e7eb;">${estimate.insurer}${estimate.claim_no ? ' · #' + estimate.claim_no : ''}</td></tr>` : ''}
      <tr>
        <td style="padding:12px 16px;font-size:13px;color:#6b7280;">Estimate Total</td>
        <td style="padding:12px 16px;font-size:18px;font-weight:bold;color:#16a34a;">${fmt(estimate.our_total)}</td>
      </tr>
    </table>
    <div style="text-align:center;margin:28px 0;">
      <a href="${signUrl}" style="background:#dc2626;color:#fff;padding:14px 36px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:16px;display:inline-block;">Review & Sign Estimate →</a>
    </div>
    <p style="font-size:12px;color:#9ca3af;text-align:center;">Link valid for 30 days · Secure · No account required</p>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;"/>
    <p style="font-size:13px;color:#6b7280;">Questions? Call or text us at <a href="tel:+12147953905" style="color:#1a3a5c;">(214) 795-3905</a></p>
  </div>
  <div style="padding:12px 24px;background:#f9fafb;border:1px solid #e5e7eb;border-top:none;">
    <p style="margin:0;font-size:11px;color:#9ca3af;">Roof Works of Texas · Licensed & Insured · roofworksoftexas.com</p>
  </div>
</div>`,
  });

  // Update estimate status to SENT if not already further along
  const advance = ['DRAFT', 'SENT'].includes(estimate.status as string);
  if (advance) {
    await prisma.estimates.update({
      where: { id: params.id },
      data:  { status: 'SENT' as any, sent_at: new Date(), updated_at: new Date() },
    });
  }

  return NextResponse.json({ ok: true, sign_url: signUrl, sent_to: customer.email });
}
