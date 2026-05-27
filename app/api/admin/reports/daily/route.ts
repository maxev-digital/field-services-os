import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { sendEmail } from '@/lib/mailer'
import { brand } from '@/lib/brand'

const ADMIN_EMAIL = process.env.ADMIN_NOTIFY_EMAIL || 'info@roofworksoftexas.com'

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt$(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Chicago' })
}

function startOfDayCT(): Date {
  const now = new Date()
  const ct = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }))
  ct.setHours(0, 0, 0, 0)
  // Convert back to UTC
  const offset = now.getTime() - ct.getTime() + (ct.getTimezoneOffset() * 60000)
  const utcMidnight = new Date(ct.getTime() - ct.getTimezoneOffset() * 60000)
  // Simple approach: construct today midnight CT in UTC
  const year = ct.getFullYear()
  const month = ct.getMonth()
  const day = ct.getDate()
  // CT is UTC-6 (CST) or UTC-5 (CDT)
  const jan = new Date(year, 0, 1).getTimezoneOffset()
  const jul = new Date(year, 6, 1).getTimezoneOffset()
  const isDST = ct.getTimezoneOffset() < Math.max(jan, jul)
  const ctOffsetHours = isDST ? 5 : 6
  return new Date(Date.UTC(year, month, day, ctOffsetHours, 0, 0))
}

function startOfMonthCT(): Date {
  const now = new Date()
  const ct = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }))
  const year = ct.getFullYear()
  const month = ct.getMonth()
  const jan = new Date(year, 0, 1).getTimezoneOffset()
  const jul = new Date(year, 6, 1).getTimezoneOffset()
  const isDST = ct.getTimezoneOffset() < Math.max(jan, jul)
  const ctOffsetHours = isDST ? 5 : 6
  return new Date(Date.UTC(year, month, 1, ctOffsetHours, 0, 0))
}

// ── Light-themed report email builder ────────────────────────────────────────

function buildDailyEmail(data: any): string {
  let html = `
<!DOCTYPE html>
<html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;">
<tr><td align="center" style="padding:24px 12px;">
<table width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;">

  <!-- Header -->
  <tr><td style="background:#dc2626;padding:20px 28px;">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="font-size:20px;font-weight:700;color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">Roof Works of Texas</td>
    </tr><tr>
      <td style="font-size:13px;color:#fecaca;padding-top:4px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">Daily Activity Report</td>
    </tr></table>
  </td></tr>

  <!-- Body -->
  <tr><td style="background:#ffffff;padding:28px;border:1px solid #e5e7eb;border-top:none;">

    <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="color:#6b7280;font-size:14px;padding-bottom:20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">Good morning! Here's your daily summary for <strong style="color:#1f2937;">${data.dateStr}</strong>.</td></tr></table>

    <!-- Metric Cards -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px;">
      <tr>
        <td width="50%" style="padding:0 4px 8px 0;">
          <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="background:#f3f4f6;padding:16px;text-align:center;border:1px solid #e5e7eb;">
            <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="font-size:28px;font-weight:700;color:#dc2626;text-align:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">${data.newLeadsCount}</td></tr>
            <tr><td style="font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;padding-top:4px;text-align:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">New Leads</td></tr></table>
          </td></tr></table>
        </td>
        <td width="50%" style="padding:0 0 8px 4px;">
          <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="background:#f3f4f6;padding:16px;text-align:center;border:1px solid #e5e7eb;">
            <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="font-size:28px;font-weight:700;color:#dc2626;text-align:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">${fmt$(data.revenueMTD)}</td></tr>
            <tr><td style="font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;padding-top:4px;text-align:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">Revenue MTD</td></tr></table>
          </td></tr></table>
        </td>
      </tr>
      <tr>
        <td width="50%" style="padding:0 4px 8px 0;">
          <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="background:#f3f4f6;padding:16px;text-align:center;border:1px solid #e5e7eb;">
            <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="font-size:28px;font-weight:700;color:#dc2626;text-align:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">${data.paymentsToday.count}</td></tr>
            <tr><td style="font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;padding-top:4px;text-align:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">Payments Today (${fmt$(data.paymentsToday.total)})</td></tr></table>
          </td></tr></table>
        </td>
        <td width="50%" style="padding:0 0 8px 4px;">
          <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="background:#f3f4f6;padding:16px;text-align:center;border:1px solid #e5e7eb;">
            <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="font-size:28px;font-weight:700;color:#dc2626;text-align:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">${data.outreach.sentToday}</td></tr>
            <tr><td style="font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;padding-top:4px;text-align:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">Outreach Emails Sent</td></tr></table>
          </td></tr></table>
        </td>
      </tr>
    </table>

    <!-- New Leads -->
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="font-size:16px;font-weight:700;color:#1f2937;padding:28px 0 8px;border-bottom:2px solid #dc2626;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">New Leads Today</td></tr></table>
    ${data.newLeads.length > 0 ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:12px 0 24px;border-collapse:collapse;">
      <tr><th style="background:#f9fafb;padding:10px 14px;text-align:left;font-size:13px;color:#374151;border-bottom:1px solid #e5e7eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">Name</th><th style="background:#f9fafb;padding:10px 14px;text-align:left;font-size:13px;color:#374151;border-bottom:1px solid #e5e7eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">Phone</th><th style="background:#f9fafb;padding:10px 14px;text-align:left;font-size:13px;color:#374151;border-bottom:1px solid #e5e7eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">Address</th></tr>
      ${data.newLeads.map((c: any) => `<tr><td style="padding:9px 14px;font-size:13px;color:#374151;border-bottom:1px solid #e5e7eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">${c.name}</td><td style="padding:9px 14px;font-size:13px;color:#374151;border-bottom:1px solid #e5e7eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">${c.phone || '-'}</td><td style="padding:9px 14px;font-size:13px;color:#374151;border-bottom:1px solid #e5e7eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">${c.address || '-'}</td></tr>`).join('')}
    </table>` : '<table width="100%" cellpadding="0" cellspacing="0"><tr><td style="color:#6b7280;font-style:italic;font-size:13px;padding:12px 0 24px;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif;">No new leads today.</td></tr></table>'}

    <!-- Estimates -->
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="font-size:16px;font-weight:700;color:#1f2937;padding:28px 0 8px;border-bottom:2px solid #dc2626;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">Estimates</td></tr></table>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:12px 0 24px;border-collapse:collapse;">
      <tr><th style="background:#f9fafb;padding:10px 14px;text-align:left;font-size:13px;color:#374151;border-bottom:1px solid #e5e7eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">Metric</th><th style="background:#f9fafb;padding:10px 14px;text-align:left;font-size:13px;color:#374151;border-bottom:1px solid #e5e7eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">Value</th></tr>
      <tr><td style="padding:9px 14px;font-size:13px;color:#374151;border-bottom:1px solid #e5e7eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">New Estimates Today</td><td style="padding:9px 14px;font-size:13px;color:#374151;border-bottom:1px solid #e5e7eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">${data.estimates.newToday}</td></tr>
      <tr><td style="padding:9px 14px;font-size:13px;color:#374151;border-bottom:1px solid #e5e7eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">New Estimate Value</td><td style="padding:9px 14px;font-size:13px;color:#374151;border-bottom:1px solid #e5e7eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">${fmt$(data.estimates.newValue)}</td></tr>
      <tr><td style="padding:9px 14px;font-size:13px;color:#374151;border-bottom:1px solid #e5e7eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">Awaiting Approval</td><td style="padding:9px 14px;font-size:13px;color:#374151;border-bottom:1px solid #e5e7eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">${data.estimates.awaitingApproval}</td></tr>
    </table>

    <!-- Jobs Status Changes -->
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="font-size:16px;font-weight:700;color:#1f2937;padding:28px 0 8px;border-bottom:2px solid #dc2626;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">Jobs Status Changes</td></tr></table>
    ${data.jobChanges.length > 0 ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:12px 0 24px;border-collapse:collapse;">
      <tr><th style="background:#f9fafb;padding:10px 14px;text-align:left;font-size:13px;color:#374151;border-bottom:1px solid #e5e7eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">Address</th><th style="background:#f9fafb;padding:10px 14px;text-align:left;font-size:13px;color:#374151;border-bottom:1px solid #e5e7eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">Status</th><th style="background:#f9fafb;padding:10px 14px;text-align:left;font-size:13px;color:#374151;border-bottom:1px solid #e5e7eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">Customer</th></tr>
      ${data.jobChanges.map((j: any) => `<tr><td style="padding:9px 14px;font-size:13px;color:#374151;border-bottom:1px solid #e5e7eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">${j.address}</td><td style="padding:9px 14px;font-size:13px;color:#dc2626;font-weight:600;border-bottom:1px solid #e5e7eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">${j.status}</td><td style="padding:9px 14px;font-size:13px;color:#374151;border-bottom:1px solid #e5e7eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">${j.customerName}</td></tr>`).join('')}
    </table>` : '<table width="100%" cellpadding="0" cellspacing="0"><tr><td style="color:#6b7280;font-style:italic;font-size:13px;padding:12px 0 24px;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif;">No status changes today.</td></tr></table>'}

    <!-- Payments -->
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="font-size:16px;font-weight:700;color:#1f2937;padding:28px 0 8px;border-bottom:2px solid #dc2626;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">Payments Received</td></tr></table>
    ${data.paymentsList.length > 0 ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:12px 0 24px;border-collapse:collapse;">
      <tr><th style="background:#f9fafb;padding:10px 14px;text-align:left;font-size:13px;color:#374151;border-bottom:1px solid #e5e7eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">Invoice</th><th style="background:#f9fafb;padding:10px 14px;text-align:left;font-size:13px;color:#374151;border-bottom:1px solid #e5e7eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">Amount</th><th style="background:#f9fafb;padding:10px 14px;text-align:left;font-size:13px;color:#374151;border-bottom:1px solid #e5e7eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">Method</th></tr>
      ${data.paymentsList.map((p: any) => `<tr><td style="padding:9px 14px;font-size:13px;color:#374151;border-bottom:1px solid #e5e7eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">${p.invoiceNo}</td><td style="padding:9px 14px;font-size:13px;color:#374151;border-bottom:1px solid #e5e7eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">${fmt$(p.amount)}</td><td style="padding:9px 14px;font-size:13px;color:#374151;border-bottom:1px solid #e5e7eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">${p.method}</td></tr>`).join('')}
    </table>` : '<table width="100%" cellpadding="0" cellspacing="0"><tr><td style="color:#6b7280;font-style:italic;font-size:13px;padding:12px 0 24px;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif;">No payments today.</td></tr></table>'}

    <!-- Outreach Stats -->
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="font-size:16px;font-weight:700;color:#1f2937;padding:28px 0 8px;border-bottom:2px solid #dc2626;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">Outreach Stats</td></tr></table>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:12px 0 24px;border-collapse:collapse;">
      <tr><th style="background:#f9fafb;padding:10px 14px;text-align:left;font-size:13px;color:#374151;border-bottom:1px solid #e5e7eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">Metric</th><th style="background:#f9fafb;padding:10px 14px;text-align:left;font-size:13px;color:#374151;border-bottom:1px solid #e5e7eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">Value</th></tr>
      <tr><td style="padding:9px 14px;font-size:13px;color:#374151;border-bottom:1px solid #e5e7eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">Emails Sent Today</td><td style="padding:9px 14px;font-size:13px;color:#374151;border-bottom:1px solid #e5e7eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">${data.outreach.sentToday}</td></tr>
      <tr><td style="padding:9px 14px;font-size:13px;color:#374151;border-bottom:1px solid #e5e7eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">Prospects Converted (All Time)</td><td style="padding:9px 14px;font-size:13px;color:#374151;border-bottom:1px solid #e5e7eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">${data.outreach.converted}</td></tr>
    </table>

    <!-- Upcoming -->
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="font-size:16px;font-weight:700;color:#1f2937;padding:28px 0 8px;border-bottom:2px solid #dc2626;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">Upcoming (Next 7 Days)</td></tr></table>
    ${data.upcoming.scheduledJobs.length > 0 ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:12px 0 24px;border-collapse:collapse;">
      <tr><th style="background:#f9fafb;padding:10px 14px;text-align:left;font-size:13px;color:#374151;border-bottom:1px solid #e5e7eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">Date</th><th style="background:#f9fafb;padding:10px 14px;text-align:left;font-size:13px;color:#374151;border-bottom:1px solid #e5e7eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">Address</th><th style="background:#f9fafb;padding:10px 14px;text-align:left;font-size:13px;color:#374151;border-bottom:1px solid #e5e7eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">Status</th></tr>
      ${data.upcoming.scheduledJobs.map((j: any) => `<tr><td style="padding:9px 14px;font-size:13px;color:#374151;border-bottom:1px solid #e5e7eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">${j.date}</td><td style="padding:9px 14px;font-size:13px;color:#374151;border-bottom:1px solid #e5e7eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">${j.address}</td><td style="padding:9px 14px;font-size:13px;color:#374151;border-bottom:1px solid #e5e7eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">${j.status}</td></tr>`).join('')}
    </table>` : '<table width="100%" cellpadding="0" cellspacing="0"><tr><td style="color:#6b7280;font-style:italic;font-size:13px;padding:12px 0 24px;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif;">No jobs scheduled in the next 7 days.</td></tr></table>'}

    ${data.upcoming.overdueInvoices > 0 ? `
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="background:#fef2f2;border:1px solid #fecaca;padding:14px 18px;margin:8px 0;">
      <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="color:#991b1b;font-size:13px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;"><strong>Overdue Invoices:</strong> ${data.upcoming.overdueInvoices} invoice(s) past due</td></tr></table>
    </td></tr></table>` : ''}

    <!-- Alerts -->
    ${data.alerts.length > 0 ? `
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="font-size:16px;font-weight:700;color:#1f2937;padding:28px 0 8px;border-bottom:2px solid #dc2626;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">Alerts</td></tr></table>
    ${data.alerts.map((a: string) => `<table width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0;"><tr><td style="background:#fef2f2;border:1px solid #fecaca;padding:14px 18px;"><table width="100%" cellpadding="0" cellspacing="0"><tr><td style="color:#991b1b;font-size:13px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">${a}</td></tr></table></td></tr></table>`).join('')}
    ` : ''}

    <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="color:#9ca3af;font-size:11px;padding-top:32px;text-align:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
      Automated report from ${brand.name} Admin &middot; ${data.dateStr}
    </td></tr></table>

  </td></tr>
</table>
</td></tr></table>
</body></html>`

  return html
}

// ── GET handler ──────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const secret = new URL(req.url).searchParams.get('secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const todayStart = startOfDayCT()
    const tomorrow = new Date(todayStart.getTime() + 86400000)
    const monthStart = startOfMonthCT()
    const now = new Date()
    const in7Days = new Date(now.getTime() + 7 * 86400000)
    const in30Days = new Date(now.getTime() + 30 * 86400000)
    const dateStr = fmtDate(now)

    // ── Queries (parallel) ───────────────────────────────────────────────────

    const [
      newLeads,
      newEstimates,
      awaitingApproval,
      jobChanges,
      paymentsToday,
      manualPaymentsToday,
      revenueMTD,
      manualRevenueMTD,
      outreachSentToday,
      convertedProspects,
      scheduledJobs,
      overdueInvoices,
      overdueManualInvoices,
      expiringInsurance,
      recurringDue,
    ] = await Promise.all([
      // New leads
      prisma.customers.findMany({
        where: { created_at: { gte: todayStart, lt: tomorrow } },
        select: { name: true, phone: true, address: true },
      }),
      // New estimates
      prisma.estimates.findMany({
        where: { created_at: { gte: todayStart, lt: tomorrow } },
        select: { our_total: true },
      }),
      // Awaiting approval
      prisma.estimates.count({ where: { status: 'SENT' } }),
      // Jobs updated today
      prisma.jobs.findMany({
        where: { updated_at: { gte: todayStart, lt: tomorrow } },
        select: { address: true, status: true, customer: { select: { name: true } } },
      }),
      // Payments today (estimate invoices)
      prisma.payments.findMany({
        where: { paid_at: { gte: todayStart, lt: tomorrow } },
        select: { amount: true, method: true, invoice: { select: { invoice_no: true } } },
      }),
      // Manual payments today
      prisma.manual_payments.findMany({
        where: { paid_at: { gte: todayStart, lt: tomorrow } },
        select: { amount: true, method: true, invoice: { select: { invoice_no: true } } },
      }),
      // Revenue MTD (estimate invoices)
      prisma.payments.aggregate({
        where: { paid_at: { gte: monthStart } },
        _sum: { amount: true },
      }),
      // Revenue MTD (manual invoices)
      prisma.manual_payments.aggregate({
        where: { paid_at: { gte: monthStart } },
        _sum: { amount: true },
      }),
      // Outreach sent today
      prisma.outreach_history.count({
        where: { sent_at: { gte: todayStart, lt: tomorrow }, status: 'sent' },
      }),
      // Converted prospects
      prisma.storm_prospects.count({ where: { status: 'CONVERTED' } }),
      // Scheduled jobs next 7 days
      prisma.jobs.findMany({
        where: { scheduled_date: { gte: now, lte: in7Days } },
        select: { scheduled_date: true, address: true, status: true },
        orderBy: { scheduled_date: 'asc' },
      }),
      // Overdue invoices
      prisma.invoices.count({
        where: { status: { in: ['UNPAID', 'PARTIAL'] }, due_at: { lt: now } },
      }),
      // Overdue manual invoices
      prisma.manual_invoices.count({
        where: { status: { in: ['UNPAID', 'PARTIAL'] }, due_at: { lt: now } },
      }),
      // Sub insurance expiring in 30 days
      prisma.subcontractors.findMany({
        where: { insurance_exp: { lte: in30Days, gte: now }, status: 'active' },
        select: { name: true, company: true, insurance_exp: true },
      }),
      // Recurring expenses due soon
      prisma.recurring_expenses.findMany({
        where: { next_due: { lte: in7Days }, is_active: true },
        select: { description: true, amount: true, next_due: true },
      }),
    ])

    // ── Assemble data ────────────────────────────────────────────────────────

    const allPaymentsToday = [
      ...paymentsToday.map(p => ({ invoiceNo: p.invoice.invoice_no, amount: p.amount, method: p.method })),
      ...manualPaymentsToday.map(p => ({ invoiceNo: p.invoice.invoice_no, amount: p.amount, method: p.method })),
    ]
    const totalPaymentsToday = allPaymentsToday.reduce((s, p) => s + p.amount, 0)
    const totalRevenueMTD = (revenueMTD._sum.amount || 0) + (manualRevenueMTD._sum.amount || 0)

    const alerts: string[] = []
    if (expiringInsurance.length > 0) {
      alerts.push(`Subcontractor insurance expiring within 30 days: ${expiringInsurance.map(s => s.name || s.company).join(', ')}`)
    }
    if (recurringDue.length > 0) {
      alerts.push(`Recurring expenses due this week: ${recurringDue.map(r => `${r.description} (${fmt$(r.amount)})`).join(', ')}`)
    }

    const data = {
      dateStr,
      newLeadsCount: newLeads.length,
      newLeads,
      estimates: {
        newToday: newEstimates.length,
        newValue: newEstimates.reduce((s, e) => s + e.our_total, 0),
        awaitingApproval,
      },
      jobChanges: jobChanges.map(j => ({
        address: j.address,
        status: j.status.replace(/_/g, ' '),
        customerName: j.customer.name,
      })),
      paymentsToday: { count: allPaymentsToday.length, total: totalPaymentsToday },
      paymentsList: allPaymentsToday,
      revenueMTD: totalRevenueMTD,
      outreach: { sentToday: outreachSentToday, converted: convertedProspects },
      upcoming: {
        scheduledJobs: scheduledJobs.map(j => ({
          date: j.scheduled_date ? new Date(j.scheduled_date).toLocaleDateString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric' }) : '-',
          address: j.address,
          status: j.status.replace(/_/g, ' '),
        })),
        overdueInvoices: overdueInvoices + overdueManualInvoices,
      },
      alerts,
    }

    const html = buildDailyEmail(data)

    const result = await sendEmail({
      to: ADMIN_EMAIL,
      subject: `Daily Report - ${dateStr}`,
      html,
      text: `Daily Report for ${dateStr}. New leads: ${data.newLeadsCount}. Revenue MTD: ${fmt$(data.revenueMTD)}. Payments today: ${data.paymentsToday.count} (${fmt$(data.paymentsToday.total)}).`,
    })

    return NextResponse.json({
      ok: true,
      emailSent: result.success,
      messageId: result.messageId,
      summary: {
        newLeads: data.newLeadsCount,
        newEstimates: data.estimates.newToday,
        paymentsToday: data.paymentsToday.count,
        revenueMTD: data.revenueMTD,
        outreachSent: data.outreach.sentToday,
        alerts: data.alerts.length,
      },
    })
  } catch (error: any) {
    console.error('[DailyReport]', error)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
}