import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { sendEmail } from '@/lib/mailer'
import { brand } from '@/lib/brand'

const ADMIN_EMAIL = process.env.ADMIN_NOTIFY_EMAIL || 'info@roofworksoftexas.com'

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt$(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
}

function fmtPct(n: number): string {
  return `${n.toFixed(1)}%`
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Chicago' })
}

function getWeekBoundsCT(): { start: Date; end: Date } {
  const now = new Date()
  const ct = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }))
  const year = ct.getFullYear()
  const month = ct.getMonth()
  const day = ct.getDate()
  const dow = ct.getDay() // 0=Sun
  // Go back to previous Monday
  const mondayOffset = dow === 0 ? 6 : dow - 1
  const monDate = day - mondayOffset
  const jan = new Date(year, 0, 1).getTimezoneOffset()
  const jul = new Date(year, 6, 1).getTimezoneOffset()
  const isDST = ct.getTimezoneOffset() < Math.max(jan, jul)
  const ctOffsetHours = isDST ? 5 : 6
  // Last Monday midnight CT
  const monday = new Date(ct)
  monday.setDate(monDate - 7) // last week Monday
  monday.setHours(0, 0, 0, 0)
  const start = new Date(monday.getTime() + ctOffsetHours * 3600000 + monday.getTimezoneOffset() * 60000)
  // Last Sunday 23:59:59 CT
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 7)
  const end = new Date(sunday.getTime() + ctOffsetHours * 3600000 + sunday.getTimezoneOffset() * 60000)
  return { start, end }
}

// ── Email builder ────────────────────────────────────────────────────────────

function buildWeeklyEmail(data: any): string {
  const s = `
    <style>
      .rw-table { width:100%; border-collapse:collapse; margin:12px 0 24px; }
      .rw-table th { background:#1e1e2e; color:#f1f1f1; padding:10px 14px; text-align:left; font-size:13px; border-bottom:2px solid #dc2626; }
      .rw-table td { padding:9px 14px; font-size:13px; color:#d1d1d1; border-bottom:1px solid #2a2a3e; }
      .rw-table tr:nth-child(even) td { background:#16162a; }
      .metric-card { display:inline-block; width:31%; vertical-align:top; background:#1e1e2e; border-radius:8px; padding:16px; margin:6px 1%; text-align:center; }
      .metric-val { font-size:24px; font-weight:700; color:#dc2626; margin:0; }
      .metric-label { font-size:11px; color:#9ca3af; margin:4px 0 0; text-transform:uppercase; letter-spacing:0.5px; }
      .section-title { font-size:16px; font-weight:700; color:#f1f1f1; margin:28px 0 8px; padding-bottom:6px; border-bottom:2px solid #dc2626; }
      .alert-box { background:#7f1d1d; border:1px solid #dc2626; border-radius:8px; padding:14px 18px; margin:8px 0; }
      .alert-box p { margin:4px 0; color:#fca5a5; font-size:13px; }
      .green { color:#22c55e !important; }
      .no-data { color:#6b7280; font-style:italic; font-size:13px; }
      .cash-row td:last-child { font-weight:700; }
    </style>
  `

  return `
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
    <p style="margin:4px 0 0;font-size:13px;color:#fecaca;">Weekly Report &middot; ${data.weekLabel}</p>
  </td></tr>

  <!-- Body -->
  <tr><td style="background:#12121f;padding:28px;border-radius:0 0 12px 12px;">

    <!-- P&L Summary Cards -->
    <p class="section-title">P&L Summary</p>
    <div style="text-align:center;">
      <div class="metric-card">
        <p class="metric-val green">${fmt$(data.pnl.revenue)}</p>
        <p class="metric-label">Revenue</p>
      </div>
      <div class="metric-card">
        <p class="metric-val" style="color:#f59e0b;">${fmt$(data.pnl.totalExpenses)}</p>
        <p class="metric-label">Total Expenses</p>
      </div>
      <div class="metric-card">
        <p class="metric-val" style="color:${data.pnl.netProfit >= 0 ? '#22c55e' : '#ef4444'};">${fmt$(data.pnl.netProfit)}</p>
        <p class="metric-label">Net Profit (${fmtPct(data.pnl.margin)})</p>
      </div>
    </div>
    <table class="rw-table">
      <tr><th>Category</th><th style="text-align:right;">Amount</th></tr>
      <tr><td>Revenue Collected</td><td style="text-align:right;color:#22c55e;">${fmt$(data.pnl.revenue)}</td></tr>
      <tr><td>Job Costs</td><td style="text-align:right;">${fmt$(data.pnl.jobCosts)}</td></tr>
      <tr><td>Business Expenses</td><td style="text-align:right;">${fmt$(data.pnl.businessExpenses)}</td></tr>
      <tr style="font-weight:700;"><td>Net Profit</td><td style="text-align:right;color:${data.pnl.netProfit >= 0 ? '#22c55e' : '#ef4444'};">${fmt$(data.pnl.netProfit)}</td></tr>
    </table>

    <!-- Pipeline -->
    <p class="section-title">Estimate Pipeline</p>
    <table class="rw-table">
      <tr><th>Status</th><th style="text-align:right;">Count</th><th style="text-align:right;">Value</th></tr>
      ${data.pipeline.map((p: any) => `<tr><td>${p.status}</td><td style="text-align:right;">${p.count}</td><td style="text-align:right;">${fmt$(p.value)}</td></tr>`).join('')}
      <tr style="font-weight:700;"><td>Total Pipeline</td><td style="text-align:right;">${data.pipeline.reduce((s: number, p: any) => s + p.count, 0)}</td><td style="text-align:right;">${fmt$(data.pipelineTotal)}</td></tr>
    </table>

    <!-- Jobs Completed -->
    <p class="section-title">Jobs Completed This Week</p>
    ${data.completedJobs.length > 0 ? `
    <table class="rw-table">
      <tr><th>Address</th><th>Customer</th><th style="text-align:right;">Amount</th></tr>
      ${data.completedJobs.map((j: any) => `<tr><td>${j.address}</td><td>${j.customer}</td><td style="text-align:right;">${fmt$(j.amount)}</td></tr>`).join('')}
    </table>` : '<p class="no-data">No jobs completed this week.</p>'}

    <!-- Top Expense Categories -->
    <p class="section-title">Top Expense Categories</p>
    ${data.expensesByCategory.length > 0 ? `
    <table class="rw-table">
      <tr><th>Category</th><th style="text-align:right;">Amount</th></tr>
      ${data.expensesByCategory.map((e: any) => `<tr><td style="text-transform:capitalize;">${e.category.replace(/_/g, ' ')}</td><td style="text-align:right;">${fmt$(e.total)}</td></tr>`).join('')}
    </table>` : '<p class="no-data">No expenses recorded this week.</p>'}

    <!-- Outreach Performance -->
    <p class="section-title">Outreach Performance</p>
    <table class="rw-table">
      <tr><th>Metric</th><th style="text-align:right;">Value</th></tr>
      <tr><td>Emails Sent</td><td style="text-align:right;">${data.outreach.sent}</td></tr>
      <tr><td>New Prospects Converted</td><td style="text-align:right;">${data.outreach.newConverted}</td></tr>
    </table>

    <!-- Subcontractor Payments -->
    <p class="section-title">Subcontractor Payments</p>
    ${data.subPayments.length > 0 ? `
    <table class="rw-table">
      <tr><th>Subcontractor</th><th style="text-align:right;">Amount</th><th>1099 Status</th></tr>
      ${data.subPayments.map((s: any) => `<tr><td>${s.name}</td><td style="text-align:right;">${fmt$(s.weekTotal)}</td><td style="color:${s.needs1099 ? '#ef4444' : '#22c55e'};">${s.needs1099 ? 'Needs Attention (' + fmt$(s.yearTotal) + ' YTD)' : 'OK'}</td></tr>`).join('')}
    </table>` : '<p class="no-data">No sub payments this week.</p>'}

    <!-- Cash Flow -->
    <p class="section-title">Cash Flow</p>
    <table class="rw-table cash-row">
      <tr><th>Direction</th><th style="text-align:right;">Amount</th></tr>
      <tr><td style="color:#22c55e;">Money In</td><td style="text-align:right;color:#22c55e;">${fmt$(data.cashFlow.moneyIn)}</td></tr>
      <tr><td style="color:#ef4444;">Money Out</td><td style="text-align:right;color:#ef4444;">${fmt$(data.cashFlow.moneyOut)}</td></tr>
      <tr style="font-weight:700;"><td>Net</td><td style="text-align:right;color:${data.cashFlow.net >= 0 ? '#22c55e' : '#ef4444'};">${fmt$(data.cashFlow.net)}</td></tr>
    </table>

    <!-- Action Items -->
    ${data.actionItems.length > 0 ? `
    <p class="section-title">Action Items</p>
    ${data.actionItems.map((a: string) => `<div class="alert-box"><p>${a}</p></div>`).join('')}
    ` : ''}

    <p style="color:#6b7280;font-size:11px;margin:32px 0 0;text-align:center;">
      Automated weekly report from ${brand.name} Admin
    </p>

  </td></tr>
</table>
</td></tr></table>
</body></html>`
}

// ── GET handler ──────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const secret = new URL(req.url).searchParams.get('secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const { start: weekStart, end: weekEnd } = getWeekBoundsCT()
    const now = new Date()
    const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1))
    const weekLabel = `${fmtDate(weekStart)} – ${fmtDate(new Date(weekEnd.getTime() - 1))}`

    // ── Queries ──────────────────────────────────────────────────────────────

    const [
      paymentsWeek,
      manualPaymentsWeek,
      jobCostsWeek,
      expensesWeek,
      estimatesByStatus,
      completedJobs,
      outreachSentWeek,
      newConvertedWeek,
      subExpensesWeek,
      subExpensesYear,
      overdueInvoices,
      overdueManualInvoices,
      expiringInsurance,
      stalePendingEstimates,
      subsNoW9,
    ] = await Promise.all([
      // Revenue: payments this week
      prisma.payments.aggregate({
        where: { paid_at: { gte: weekStart, lt: weekEnd } },
        _sum: { amount: true },
      }),
      prisma.manual_payments.aggregate({
        where: { paid_at: { gte: weekStart, lt: weekEnd } },
        _sum: { amount: true },
      }),
      // Job costs this week
      prisma.job_costs.aggregate({
        where: { created_at: { gte: weekStart, lt: weekEnd } },
        _sum: { amount: true },
      }),
      // Business expenses this week
      prisma.expenses.findMany({
        where: { date: { gte: weekStart, lt: weekEnd } },
        select: { category: true, amount: true },
      }),
      // Pipeline: estimates by status
      prisma.estimates.groupBy({
        by: ['status'],
        where: { status: { in: ['DRAFT', 'SENT', 'APPROVED'] } },
        _count: true,
        _sum: { our_total: true },
      }),
      // Completed jobs this week
      prisma.jobs.findMany({
        where: { completed_date: { gte: weekStart, lt: weekEnd } },
        select: {
          address: true,
          customer: { select: { name: true } },
          estimate_id: true,
        },
      }),
      // Outreach sent
      prisma.outreach_history.count({
        where: { sent_at: { gte: weekStart, lt: weekEnd }, status: 'sent' },
      }),
      // New converted prospects this week
      prisma.storm_prospects.count({
        where: { status: 'CONVERTED', updated_at: { gte: weekStart, lt: weekEnd } },
      }),
      // Sub expenses this week
      prisma.expenses.findMany({
        where: { date: { gte: weekStart, lt: weekEnd }, subcontractor_id: { not: null } },
        select: { subcontractor_id: true, amount: true, subcontractor: { select: { name: true, company: true, tax_id: true } } },
      }),
      // Sub expenses YTD
      prisma.expenses.findMany({
        where: { date: { gte: yearStart }, subcontractor_id: { not: null } },
        select: { subcontractor_id: true, amount: true },
      }),
      // Overdue invoices
      prisma.invoices.findMany({
        where: { status: { in: ['UNPAID', 'PARTIAL'] }, due_at: { lt: now } },
        select: { invoice_no: true, amount_due: true, amount_paid: true, due_at: true, estimate: { select: { customer: { select: { name: true } } } } },
      }),
      prisma.manual_invoices.findMany({
        where: { status: { in: ['UNPAID', 'PARTIAL'] }, due_at: { lt: now } },
        select: { invoice_no: true, amount_due: true, amount_paid: true, due_at: true, customer_name: true },
      }),
      // Expiring insurance
      prisma.subcontractors.findMany({
        where: { insurance_exp: { lte: new Date(now.getTime() + 30 * 86400000), gte: now }, status: 'active' },
        select: { name: true, insurance_exp: true },
      }),
      // Stale pending estimates (>7 days)
      prisma.estimates.count({
        where: { status: 'SENT', sent_at: { lt: new Date(now.getTime() - 7 * 86400000) } },
      }),
      // Subs with no W-9 paid > $600
      prisma.subcontractors.findMany({
        where: { tax_id: null, total_paid: { gt: 600 } },
        select: { name: true, total_paid: true },
      }),
    ])

    // ── Assemble data ────────────────────────────────────────────────────────

    const revenue = (paymentsWeek._sum.amount || 0) + (manualPaymentsWeek._sum.amount || 0)
    const jobCosts = jobCostsWeek._sum.amount || 0
    const businessExpenses = expensesWeek.reduce((s, e) => s + e.amount, 0)
    const totalExpenses = jobCosts + businessExpenses
    const netProfit = revenue - totalExpenses
    const margin = revenue > 0 ? (netProfit / revenue) * 100 : 0

    // Expense categories
    const catMap: Record<string, number> = {}
    for (const e of expensesWeek) {
      catMap[e.category] = (catMap[e.category] || 0) + e.amount
    }
    const expensesByCategory = Object.entries(catMap)
      .map(([category, total]) => ({ category, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8)

    // Pipeline
    const pipeline = estimatesByStatus.map(g => ({
      status: g.status,
      count: g._count,
      value: g._sum.our_total || 0,
    }))
    const pipelineTotal = pipeline.reduce((s, p) => s + p.value, 0)

    // Completed jobs with amounts
    const completedJobEstimateIds = completedJobs.filter(j => j.estimate_id).map(j => j.estimate_id!)
    const estimateAmounts = completedJobEstimateIds.length > 0
      ? await prisma.estimates.findMany({
          where: { id: { in: completedJobEstimateIds } },
          select: { id: true, our_total: true },
        })
      : []
    const estAmtMap: Record<string, number> = {}
    for (const e of estimateAmounts) estAmtMap[e.id] = e.our_total

    const completedJobsData = completedJobs.map(j => ({
      address: j.address,
      customer: j.customer.name,
      amount: j.estimate_id ? (estAmtMap[j.estimate_id] || 0) : 0,
    }))

    // Sub payments
    const subWeekMap: Record<string, { name: string; weekTotal: number; taxId: string | null }> = {}
    for (const e of subExpensesWeek) {
      if (!e.subcontractor_id) continue
      if (!subWeekMap[e.subcontractor_id]) {
        subWeekMap[e.subcontractor_id] = {
          name: e.subcontractor?.name || e.subcontractor?.company || 'Unknown',
          weekTotal: 0,
          taxId: e.subcontractor?.tax_id || null,
        }
      }
      subWeekMap[e.subcontractor_id].weekTotal += e.amount
    }
    const subYearMap: Record<string, number> = {}
    for (const e of subExpensesYear) {
      if (!e.subcontractor_id) continue
      subYearMap[e.subcontractor_id] = (subYearMap[e.subcontractor_id] || 0) + e.amount
    }
    const subPayments = Object.entries(subWeekMap).map(([id, s]) => ({
      name: s.name,
      weekTotal: s.weekTotal,
      yearTotal: subYearMap[id] || 0,
      needs1099: !s.taxId && (subYearMap[id] || 0) > 600,
    }))

    // Cash flow
    const moneyIn = revenue
    const moneyOut = totalExpenses
    const cashFlow = { moneyIn, moneyOut, net: moneyIn - moneyOut }

    // Action items
    const actionItems: string[] = []
    const allOverdue = [
      ...overdueInvoices.map(i => ({
        invoiceNo: i.invoice_no,
        customer: i.estimate?.customer?.name || 'Unknown',
        owed: i.amount_due - i.amount_paid,
        daysOverdue: Math.floor((now.getTime() - (i.due_at?.getTime() || now.getTime())) / 86400000),
      })),
      ...overdueManualInvoices.map(i => ({
        invoiceNo: i.invoice_no,
        customer: i.customer_name,
        owed: i.amount_due - i.amount_paid,
        daysOverdue: Math.floor((now.getTime() - (i.due_at?.getTime() || now.getTime())) / 86400000),
      })),
    ]
    if (allOverdue.length > 0) {
      actionItems.push(`${allOverdue.length} overdue invoice(s): ${allOverdue.slice(0, 5).map(i => `${i.invoiceNo} - ${i.customer} (${fmt$(i.owed)}, ${i.daysOverdue}d)`).join('; ')}`)
    }
    if (expiringInsurance.length > 0) {
      actionItems.push(`Sub insurance expiring: ${expiringInsurance.map(s => s.name).join(', ')}`)
    }
    if (stalePendingEstimates > 0) {
      actionItems.push(`${stalePendingEstimates} estimate(s) pending > 7 days without response`)
    }
    if (subsNoW9.length > 0) {
      actionItems.push(`Missing W-9 for subs paid > $600: ${subsNoW9.map(s => `${s.name} (${fmt$(s.total_paid)})`).join(', ')}`)
    }

    const data = {
      weekLabel,
      pnl: { revenue, jobCosts, businessExpenses, totalExpenses, netProfit, margin },
      pipeline,
      pipelineTotal,
      completedJobs: completedJobsData,
      expensesByCategory,
      outreach: { sent: outreachSentWeek, newConverted: newConvertedWeek },
      subPayments,
      cashFlow,
      actionItems,
    }

    const html = buildWeeklyEmail(data)

    const result = await sendEmail({
      to: ADMIN_EMAIL,
      subject: `Weekly Report - ${weekLabel}`,
      html,
      text: `Weekly Report (${weekLabel}). Revenue: ${fmt$(revenue)}. Net Profit: ${fmt$(netProfit)} (${fmtPct(margin)}). Jobs completed: ${completedJobsData.length}. Action items: ${actionItems.length}.`,
    })

    return NextResponse.json({
      ok: true,
      emailSent: result.success,
      messageId: result.messageId,
      summary: {
        weekLabel,
        revenue,
        netProfit,
        margin: Math.round(margin * 10) / 10,
        completedJobs: completedJobsData.length,
        actionItems: actionItems.length,
      },
    })
  } catch (error: any) {
    console.error('[WeeklyReport]', error)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
}
