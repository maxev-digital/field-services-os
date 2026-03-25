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

// ── Dark-themed report email builder ─────────────────────────────────────────

function buildDailyEmail(data: any): string {
  const s = `
    <style>
      .rw-table { width:100%; border-collapse:collapse; margin:12px 0 24px; }
      .rw-table th { background:#1e1e2e; color:#f1f1f1; padding:10px 14px; text-align:left; font-size:13px; border-bottom:2px solid #dc2626; }
      .rw-table td { padding:9px 14px; font-size:13px; color:#d1d1d1; border-bottom:1px solid #2a2a3e; }
      .rw-table tr:nth-child(even) td { background:#16162a; }
      .metric-card { display:inline-block; width:48%; vertical-align:top; background:#1e1e2e; border-radius:8px; padding:16px; margin:6px 1%; }
      .metric-val { font-size:28px; font-weight:700; color:#dc2626; margin:0; }
      .metric-label { font-size:12px; color:#9ca3af; margin:4px 0 0; text-transform:uppercase; letter-spacing:0.5px; }
      .section-title { font-size:16px; font-weight:700; color:#f1f1f1; margin:28px 0 8px; padding-bottom:6px; border-bottom:2px solid #dc2626; }
      .alert-box { background:#7f1d1d; border:1px solid #dc2626; border-radius:8px; padding:14px 18px; margin:8px 0; }
      .alert-box p { margin:4px 0; color:#fca5a5; font-size:13px; }
      .no-data { color:#6b7280; font-style:italic; font-size:13px; }
    </style>
  `

  let html = `
<!DOCTYPE html>
<html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#0f0f1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
${s}
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f1a;">
<tr><td align="center" style="padding:24px 12px;">
<table width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;">

  <!-- Header -->
  <tr><td style="background:#dc2626;padding:20px 28px;border-radius:12px 12px 0 0;">
    <p style="margin:0;font-size:20px;font-weight:700;color:#fff;">Roof Works of Texas</p>
    <p style="margin:4px 0 0;font-size:13px;color:#fecaca;">Daily Activity Report</p>
  </td></tr>

  <!-- Body -->
  <tr><td style="background:#12121f;padding:28px;border-radius:0 0 12px 12px;">

    <p style="color:#9ca3af;font-size:14px;margin:0 0 20px;">Good morning! Here's your daily summary for <strong style="color:#f1f1f1;">${data.dateStr}</strong>.</p>

    <!-- Metric Cards -->
    <div style="text-align:center;">
      <div class="metric-card">
        <p class="metric-val">${data.newLeadsCount}</p>
        <p class="metric-label">New Leads</p>
      </div>
      <div class="metric-card">
        <p class="metric-val">${fmt$(data.revenueMTD)}</p>
        <p class="metric-label">Revenue MTD</p>
      </div>
    </div>
    <div style="text-align:center;margin-bottom:12px;">
      <div class="metric-card">
        <p class="metric-val">${data.paymentsToday.count}</p>
        <p class="metric-label">Payments Today (${fmt$(data.paymentsToday.total)})</p>
      </div>
      <div class="metric-card">
        <p class="metric-val">${data.outreach.sentToday}</p>
        <p class="metric-label">Outreach Emails Sent</p>
      </div>
    </div>

    <!-- New Leads -->
    <p class="section-title">New Leads Today</p>
    ${data.newLeads.length > 0 ? `
    <table class="rw-table">
      <tr><th>Name</th><th>Phone</th><th>Address</th></tr>
      ${data.newLeads.map((c: any) => `<tr><td>${c.name}</td><td>${c.phone || '-'}</td><td>${c.address || '-'}</td></tr>`).join('')}
    </table>` : '<p class="no-data">No new leads today.</p>'}

    <!-- Estimates -->
    <p class="section-title">Estimates</p>
    <table class="rw-table">
      <tr><th>Metric</th><th>Value</th></tr>
      <tr><td>New Estimates Today</td><td>${data.estimates.newToday}</td></tr>
      <tr><td>New Estimate Value</td><td>${fmt$(data.estimates.newValue)}</td></tr>
      <tr><td>Awaiting Approval</td><td>${data.estimates.awaitingApproval}</td></tr>
    </table>

    <!-- Jobs Status Changes -->
    <p class="section-title">Jobs Status Changes</p>
    ${data.jobChanges.length > 0 ? `
    <table class="rw-table">
      <tr><th>Address</th><th>Status</th><th>Customer</th></tr>
      ${data.jobChanges.map((j: any) => `<tr><td>${j.address}</td><td style="color:#dc2626;font-weight:600;">${j.status}</td><td>${j.customerName}</td></tr>`).join('')}
    </table>` : '<p class="no-data">No status changes today.</p>'}

    <!-- Payments -->
    <p class="section-title">Payments Received</p>
    ${data.paymentsList.length > 0 ? `
    <table class="rw-table">
      <tr><th>Invoice</th><th>Amount</th><th>Method</th></tr>
      ${data.paymentsList.map((p: any) => `<tr><td>${p.invoiceNo}</td><td>${fmt$(p.amount)}</td><td>${p.method}</td></tr>`).join('')}
    </table>` : '<p class="no-data">No payments today.</p>'}

    <!-- Outreach Stats -->
    <p class="section-title">Outreach Stats</p>
    <table class="rw-table">
      <tr><th>Metric</th><th>Value</th></tr>
      <tr><td>Emails Sent Today</td><td>${data.outreach.sentToday}</td></tr>
      <tr><td>Prospects Converted (All Time)</td><td>${data.outreach.converted}</td></tr>
    </table>

    <!-- Upcoming -->
    <p class="section-title">Upcoming (Next 7 Days)</p>
    ${data.upcoming.scheduledJobs.length > 0 ? `
    <table class="rw-table">
      <tr><th>Date</th><th>Address</th><th>Status</th></tr>
      ${data.upcoming.scheduledJobs.map((j: any) => `<tr><td>${j.date}</td><td>${j.address}</td><td>${j.status}</td></tr>`).join('')}
    </table>` : '<p class="no-data">No jobs scheduled in the next 7 days.</p>'}

    ${data.upcoming.overdueInvoices > 0 ? `
    <div class="alert-box">
      <p><strong>Overdue Invoices:</strong> ${data.upcoming.overdueInvoices} invoice(s) past due</p>
    </div>` : ''}

    <!-- Alerts -->
    ${data.alerts.length > 0 ? `
    <p class="section-title">Alerts</p>
    ${data.alerts.map((a: string) => `<div class="alert-box"><p>${a}</p></div>`).join('')}
    ` : ''}

    <p style="color:#6b7280;font-size:11px;margin:32px 0 0;text-align:center;">
      Automated report from ${brand.name} Admin &middot; ${data.dateStr}
    </p>

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
