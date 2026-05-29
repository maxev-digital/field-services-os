import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';
import { sendEmail } from '@/lib/mailer';
import { brand } from '@/lib/brand';

function fmtCurrency(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

function buildReminderHtml(customerName: string, invoiceNo: string, owed: number, paymentUrl?: string): string {
  const payBtn = paymentUrl
    ? '<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;"><tr><td align="center"><a href="' + paymentUrl + '" style="display:inline-block;background:#dc2626;color:#fff;font-size:15px;font-weight:600;padding:14px 32px;border-radius:6px;text-decoration:none;">Pay Now Online</a></td></tr></table>'
    : '';
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f9fafb;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 12px;">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
  <tr><td style="background:#dc2626;padding:24px 28px;border-radius:8px 8px 0 0;">
    <p style="font-size:20px;font-weight:700;color:#fff;margin:0;">${brand.name}</p>
    <p style="font-size:13px;color:#fecaca;margin:4px 0 0;">Payment Reminder &mdash; Invoice #${invoiceNo}</p>
  </td></tr>
  <tr><td style="background:#fff;padding:32px 28px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
    <p style="font-size:15px;color:#1f2937;margin:0 0 16px;">Dear ${customerName},</p>
    <p style="font-size:14px;color:#4b5563;margin:0 0 24px;">This is a friendly reminder that Invoice #${invoiceNo} for <strong style="color:#dc2626;">${fmtCurrency(owed)}</strong> is outstanding.</p>
    ${payBtn}
    <p style="font-size:13px;color:#6b7280;margin:0;">Questions? <strong style="color:#1f2937;">${brand.phone}</strong> | <strong style="color:#1f2937;">${brand.email}</strong></p>
  </td></tr>
</table></td></tr></table></body></html>`;
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    const { invoice_id, invoice_type } = await req.json();
    if (!invoice_id || !invoice_type) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    let email: string | null = null, name = 'Valued Customer', invoiceNo = '', owed = 0, paymentUrl: string | undefined;
    if (invoice_type === 'system') {
      const inv = await prisma.invoices.findUnique({
        where: { id: invoice_id },
        select: { invoice_no: true, amount_due: true, amount_paid: true, stripe_checkout_url: true,
          estimate: { select: { customer: { select: { name: true, email: true } } } } },
      });
      if (!inv) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      email = inv.estimate?.customer?.email ?? null;
      name = inv.estimate?.customer?.name ?? 'Valued Customer';
      invoiceNo = inv.invoice_no; owed = Math.max(0, inv.amount_due - inv.amount_paid);
      paymentUrl = inv.stripe_checkout_url ?? undefined;
    } else {
      const inv = await prisma.manual_invoices.findUnique({
        where: { id: invoice_id },
        select: { invoice_no: true, customer_name: true, customer_email: true, amount_due: true, amount_paid: true },
      });
      if (!inv) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      email = inv.customer_email; name = inv.customer_name;
      invoiceNo = inv.invoice_no; owed = Math.max(0, inv.amount_due - inv.amount_paid);
    }
    if (!email) return NextResponse.json({ error: 'No email on file for this customer' }, { status: 400 });
    const result = await sendEmail({
      to: email, toName: name,
      subject: `Payment Reminder — Invoice #${invoiceNo} — ${fmtCurrency(owed)} Due`,
      html: buildReminderHtml(name, invoiceNo, owed, paymentUrl),
    });
    if (!result.success) return NextResponse.json({ error: result.error }, { status: 500 });
    await prisma.invoice_reminders.create({ data: { invoice_id, invoice_type, threshold: 0, sent_to: email } });
    return NextResponse.json({ ok: true, sent_to: email });
  } catch (e: any) {
    if (e.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
