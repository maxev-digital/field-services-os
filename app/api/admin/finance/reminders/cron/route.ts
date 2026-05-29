import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { sendEmail } from '@/lib/mailer';
import { brand } from '@/lib/brand';

const THRESHOLDS = [7, 14, 30];
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

function fmtCurrency(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

function buildReminderEmail(opts: {
  customerName: string; invoiceNo: string; amountDue: number;
  dueDate: string; daysOverdue: number; paymentUrl?: string; tier: number;
}): string {
  const urgency = opts.tier >= 30 ? 'Final Notice' : opts.tier >= 14 ? 'Second Reminder' : 'Payment Reminder';
  const hc = opts.tier >= 30 ? '#991b1b' : '#dc2626';
  const body = opts.tier <= 7
    ? 'This is a friendly reminder that the following invoice is now past due.'
    : opts.tier <= 14
    ? 'We have not received payment for the invoice below, which is now <strong>14 days overdue</strong>. Please arrange payment at your earliest convenience.'
    : 'This is a final notice. Your invoice is <strong>30 days overdue</strong>. Please contact us immediately to resolve this balance.';
  const payBtn = opts.paymentUrl
    ? '<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;"><tr><td align="center"><a href="' + opts.paymentUrl + '" style="display:inline-block;background:#dc2626;color:#fff;font-size:15px;font-weight:600;padding:14px 32px;border-radius:6px;text-decoration:none;">Pay Now Online</a></td></tr></table>'
    : '';
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f9fafb;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 12px;">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
  <tr><td style="background:${hc};padding:24px 28px;border-radius:8px 8px 0 0;">
    <p style="font-size:20px;font-weight:700;color:#fff;margin:0;">${brand.name}</p>
    <p style="font-size:13px;color:#fecaca;margin:4px 0 0;">${urgency} &mdash; Invoice #${opts.invoiceNo}</p>
  </td></tr>
  <tr><td style="background:#fff;padding:32px 28px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
    <p style="font-size:15px;color:#1f2937;margin:0 0 16px;">Dear ${opts.customerName},</p>
    <p style="font-size:14px;color:#4b5563;margin:0 0 24px;">${body}</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;margin:0 0 24px;"><tr><td style="padding:20px 24px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="font-size:13px;color:#6b7280;padding-bottom:8px;">Invoice #</td><td style="font-size:13px;font-weight:600;color:#1f2937;text-align:right;padding-bottom:8px;">${opts.invoiceNo}</td></tr>
        <tr><td style="font-size:13px;color:#6b7280;padding-bottom:8px;">Amount Due</td><td style="font-size:18px;font-weight:700;color:#dc2626;text-align:right;padding-bottom:8px;">${fmtCurrency(opts.amountDue)}</td></tr>
        <tr><td style="font-size:13px;color:#6b7280;padding-bottom:8px;">Due Date</td><td style="font-size:13px;color:#1f2937;text-align:right;padding-bottom:8px;">${opts.dueDate}</td></tr>
        <tr><td style="font-size:13px;color:#6b7280;">Overdue</td><td style="font-size:13px;font-weight:600;color:#dc2626;text-align:right;">${opts.daysOverdue} days</td></tr>
      </table>
    </td></tr></table>
    ${payBtn}
    <p style="font-size:13px;color:#6b7280;margin:0 0 4px;">Questions? <strong style="color:#1f2937;">${brand.phone}</strong> | <strong style="color:#1f2937;">${brand.email}</strong></p>
    <p style="font-size:11px;color:#9ca3af;margin:20px 0 0;">If you have already sent payment, please disregard this notice. Thank you for your business.</p>
  </td></tr>
</table></td></tr></table></body></html>`;
}

function effectiveDue(dueAt: Date | null, issuedAt: Date): Date {
  return dueAt ?? new Date(issuedAt.getTime() + 30 * 86400000);
}
function calcDaysOverdue(effDue: Date, now: Date): number {
  return Math.floor((now.getTime() - effDue.getTime()) / 86400000);
}
async function getApplicableThreshold(invoiceId: string, invoiceType: string, overdueDays: number): Promise<number | null> {
  const rows = await prisma.invoice_reminders.findMany({ where: { invoice_id: invoiceId, invoice_type: invoiceType }, select: { threshold: true } });
  const sent = new Set(rows.map((r: { threshold: number }) => r.threshold));
  let best: number | null = null;
  for (const t of THRESHOLDS) { if (overdueDays >= t && !sent.has(t)) best = t; }
  return best;
}

export async function GET(req: NextRequest) {
  const secret = new URL(req.url).searchParams.get('secret');
  if (secret !== process.env.CRON_SECRET) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const now = new Date();
  let sent = 0, skipped = 0, errors = 0;
  const log: string[] = [];

  const sysInvoices = await prisma.invoices.findMany({
    where: { status: { in: ['UNPAID', 'PARTIAL'] } },
    select: { id: true, invoice_no: true, amount_due: true, amount_paid: true, due_at: true, issued_at: true, stripe_checkout_url: true,
      estimate: { select: { customer: { select: { name: true, email: true } } } } },
  });
  for (const inv of sysInvoices) {
    const email = inv.estimate?.customer?.email;
    if (!email) { skipped++; continue; }
    const effDue = effectiveDue(inv.due_at, inv.issued_at);
    const days = calcDaysOverdue(effDue, now);
    if (days <= 0) { skipped++; continue; }
    const threshold = await getApplicableThreshold(inv.id, 'system', days);
    if (!threshold) { skipped++; continue; }
    const owed = Math.max(0, inv.amount_due - inv.amount_paid);
    const urgency = threshold >= 30 ? 'Final Notice' : threshold >= 14 ? 'Second Reminder' : 'Payment Reminder';
    const result = await sendEmail({
      to: email, toName: inv.estimate?.customer?.name,
      subject: `${urgency} — Invoice #${inv.invoice_no} — ${fmtCurrency(owed)} Due`,
      html: buildReminderEmail({ customerName: inv.estimate?.customer?.name || 'Valued Customer', invoiceNo: inv.invoice_no,
        amountDue: owed, dueDate: effDue.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
        daysOverdue: days, paymentUrl: inv.stripe_checkout_url || undefined, tier: threshold }),
    });
    if (result.success) {
      await prisma.invoice_reminders.create({ data: { invoice_id: inv.id, invoice_type: 'system', threshold, sent_to: email } });
      sent++; log.push(`SENT ${inv.invoice_no} -> ${email} (${threshold}d)`);
    } else { errors++; log.push(`ERROR ${inv.invoice_no}: ${result.error}`); }
  }

  const manInvoices = await prisma.manual_invoices.findMany({
    where: { status: { in: ['UNPAID', 'PARTIAL'] }, customer_email: { not: null } },
    select: { id: true, invoice_no: true, customer_name: true, customer_email: true, amount_due: true, amount_paid: true, due_at: true, issued_at: true },
  });
  for (const inv of manInvoices) {
    const email = inv.customer_email!;
    const effDue = effectiveDue(inv.due_at, inv.issued_at);
    const days = calcDaysOverdue(effDue, now);
    if (days <= 0) { skipped++; continue; }
    const threshold = await getApplicableThreshold(inv.id, 'manual', days);
    if (!threshold) { skipped++; continue; }
    const owed = Math.max(0, inv.amount_due - inv.amount_paid);
    const urgency = threshold >= 30 ? 'Final Notice' : threshold >= 14 ? 'Second Reminder' : 'Payment Reminder';
    const result = await sendEmail({
      to: email, toName: inv.customer_name,
      subject: `${urgency} — Invoice #${inv.invoice_no} — ${fmtCurrency(owed)} Due`,
      html: buildReminderEmail({ customerName: inv.customer_name, invoiceNo: inv.invoice_no, amountDue: owed,
        dueDate: effDue.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
        daysOverdue: days, tier: threshold }),
    });
    if (result.success) {
      await prisma.invoice_reminders.create({ data: { invoice_id: inv.id, invoice_type: 'manual', threshold, sent_to: email } });
      sent++; log.push(`SENT manual ${inv.invoice_no} -> ${email} (${threshold}d)`);
    } else { errors++; log.push(`ERROR manual ${inv.invoice_no}: ${result.error}`); }
  }
  return NextResponse.json({ ok: true, sent, skipped, errors, log });
}
