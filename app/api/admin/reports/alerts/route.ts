import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { sendEmail } from '@/lib/mailer'
import { brand } from '@/lib/brand'

const ADMIN_EMAIL = process.env.ADMIN_NOTIFY_EMAIL || 'info@roofworksoftexas.com'

function fmt$(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
}

interface AlertSection {
  title: string
  items: string[]
  severity: 'critical' | 'warning' | 'info'
}

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"

function buildAlertsEmail(sections: AlertSection[]): string {
  const severityStyles = {
    critical: { bg: '#fef2f2', border: '#fecaca', text: '#991b1b', badge: '#dc2626', badgeBg: '#fef2f2' },
    warning:  { bg: '#fffbeb', border: '#fde68a', text: '#92400e', badge: '#d97706', badgeBg: '#fffbeb' },
    info:     { bg: '#eff6ff', border: '#bfdbfe', text: '#1e40af', badge: '#2563eb', badgeBg: '#eff6ff' },
  }

  const totalAlerts = sections.reduce((s, sec) => s + sec.items.length, 0)

  const sectionHtml = sections.map(sec => {
    const c = severityStyles[sec.severity]
    return `
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;">
        <tr><td style="font-size:15px;font-weight:700;color:#1f2937;padding:0 0 10px;font-family:${FONT};">
          ${sec.title} (${sec.items.length})
        </td></tr>
        ${sec.items.map(item => `
          <tr><td style="padding:0 0 6px;">
            <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="background:${c.bg};border-left:3px solid ${c.badge};padding:10px 14px;">
              <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="color:${c.text};font-size:13px;font-family:${FONT};">${item}</td></tr></table>
            </td></tr></table>
          </td></tr>
        `).join('')}
      </table>
    `
  }).join('')

  return `
<!DOCTYPE html>
<html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:${FONT};">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;">
<tr><td align="center" style="padding:24px 12px;">
<table width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;">

  <!-- Header -->
  <tr><td style="background:#dc2626;padding:20px 28px;">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="font-size:20px;font-weight:700;color:#ffffff;font-family:${FONT};">Roof Works of Texas</td>
    </tr><tr>
      <td style="font-size:13px;color:#fecaca;padding-top:4px;font-family:${FONT};">Alert Digest &middot; ${totalAlerts} item(s) need attention</td>
    </tr></table>
  </td></tr>

  <!-- Body -->
  <tr><td style="background:#ffffff;padding:28px;border:1px solid #e5e7eb;border-top:none;">

    <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="color:#6b7280;font-size:14px;padding-bottom:20px;font-family:${FONT};">
      The following items require your attention:
    </td></tr></table>

    ${sectionHtml}

    <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="color:#9ca3af;font-size:11px;padding-top:32px;text-align:center;font-family:${FONT};">
      Automated alert from ${brand.name} Admin &middot; ${new Date().toLocaleDateString('en-US', { timeZone: 'America/Chicago', month: 'long', day: 'numeric', year: 'numeric' })}
    </td></tr></table>

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
    const now = new Date()
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000)
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 86400000)
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 86400000)
    const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1))

    const [
      overdueInvoices,
      overdueManualInvoices,
      expiringInsurance,
      staleEstimates,
      subsNoW9,
    ] = await Promise.all([
      // Invoices overdue > 30 days
      prisma.invoices.findMany({
        where: { status: { in: ['UNPAID', 'PARTIAL'] }, due_at: { lt: thirtyDaysAgo } },
        select: {
          invoice_no: true,
          amount_due: true,
          amount_paid: true,
          due_at: true,
          estimate: { select: { customer: { select: { name: true } } } },
        },
        orderBy: { due_at: 'asc' },
      }),
      prisma.manual_invoices.findMany({
        where: { status: { in: ['UNPAID', 'PARTIAL'] }, due_at: { lt: thirtyDaysAgo } },
        select: {
          invoice_no: true,
          amount_due: true,
          amount_paid: true,
          due_at: true,
          customer_name: true,
        },
        orderBy: { due_at: 'asc' },
      }),
      // Sub insurance expiring in 30 days
      prisma.subcontractors.findMany({
        where: { insurance_exp: { lte: thirtyDaysFromNow, gte: now }, status: 'active' },
        select: { name: true, company: true, insurance_exp: true },
      }),
      // Estimates pending > 14 days without response
      prisma.estimates.findMany({
        where: { status: 'SENT', sent_at: { lt: fourteenDaysAgo } },
        select: {
          id: true,
          our_total: true,
          sent_at: true,
          customer: { select: { name: true } },
          address: true,
        },
        orderBy: { sent_at: 'asc' },
      }),
      // Missing W-9s for subs paid > $600
      prisma.subcontractors.findMany({
        where: {
          OR: [{ tax_id: null }, { tax_id: '' }],
          total_paid: { gt: 600 },
          status: 'active',
        },
        select: { name: true, company: true, total_paid: true },
      }),
    ])

    // ── Build alert sections ─────────────────────────────────────────────────

    const sections: AlertSection[] = []

    // Overdue invoices
    const allOverdue = [
      ...overdueInvoices.map(i => {
        const daysOverdue = Math.floor((now.getTime() - (i.due_at?.getTime() || now.getTime())) / 86400000)
        return {
          text: `<strong>${i.invoice_no}</strong> — ${i.estimate?.customer?.name || 'Unknown'} — ${fmt$(i.amount_due - i.amount_paid)} owed — <strong>${daysOverdue} days overdue</strong>`,
          daysOverdue,
        }
      }),
      ...overdueManualInvoices.map(i => {
        const daysOverdue = Math.floor((now.getTime() - (i.due_at?.getTime() || now.getTime())) / 86400000)
        return {
          text: `<strong>${i.invoice_no}</strong> — ${i.customer_name} — ${fmt$(i.amount_due - i.amount_paid)} owed — <strong>${daysOverdue} days overdue</strong>`,
          daysOverdue,
        }
      }),
    ].sort((a, b) => b.daysOverdue - a.daysOverdue)

    if (allOverdue.length > 0) {
      sections.push({
        title: 'Invoices Overdue > 30 Days',
        items: allOverdue.map(i => i.text),
        severity: 'critical',
      })
    }

    // Expiring insurance
    if (expiringInsurance.length > 0) {
      sections.push({
        title: 'Subcontractor Insurance Expiring Within 30 Days',
        items: expiringInsurance.map(s => {
          const daysLeft = Math.floor(((s.insurance_exp?.getTime() || 0) - now.getTime()) / 86400000)
          return `<strong>${s.name || s.company}</strong> — expires in <strong>${daysLeft} days</strong> (${s.insurance_exp?.toLocaleDateString('en-US', { timeZone: 'America/Chicago' })})`
        }),
        severity: 'warning',
      })
    }

    // Stale estimates
    if (staleEstimates.length > 0) {
      sections.push({
        title: 'Estimates Pending > 14 Days (No Response)',
        items: staleEstimates.map(e => {
          const daysPending = Math.floor((now.getTime() - (e.sent_at?.getTime() || now.getTime())) / 86400000)
          return `<strong>${e.customer?.name || 'Unknown'}</strong> — ${e.address} — ${fmt$(e.our_total)} — sent <strong>${daysPending} days ago</strong>`
        }),
        severity: 'warning',
      })
    }

    // Missing W-9s
    if (subsNoW9.length > 0) {
      sections.push({
        title: 'Missing W-9 (Subs Paid > $600)',
        items: subsNoW9.map(s => `<strong>${s.name || s.company}</strong> — Total paid: ${fmt$(s.total_paid)} — No W-9 / Tax ID on file`),
        severity: 'info',
      })
    }

    // ── NEW: Recurring expenses due in 7 days ─────────────────────────────────
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 86400000)
    const upcomingRecurring = await prisma.recurring_expenses.findMany({
      where: { is_active: true, next_due: { lte: sevenDaysFromNow } },
      orderBy: { next_due: 'asc' },
    })
    if (upcomingRecurring.length > 0) {
      sections.push({
        title: 'Recurring Expenses Due Within 7 Days',
        items: upcomingRecurring.map((r: any) => {
          const daysLeft = Math.max(0, Math.floor((new Date(r.next_due).getTime() - now.getTime()) / 86400000))
          return `<strong>${r.description}</strong> — ${fmt$(r.amount)} — due in <strong>${daysLeft} day(s)</strong> (${r.frequency})`
        }),
        severity: 'warning',
      })
    }

    // ── NEW: Completed jobs missing cost entries (P&L incomplete) ─────────────
    const jobsMissingCosts = await prisma.estimates.findMany({
      where: { status: { in: ['INVOICED', 'PAID'] }, job_costs: { none: {} }, updated_at: { gte: fourteenDaysAgo } },
      select: { id: true, our_total: true, address: true, customer: { select: { name: true } }, status: true },
      orderBy: { updated_at: 'desc' },
      take: 10,
    })
    if (jobsMissingCosts.length > 0) {
      sections.push({
        title: 'Jobs Missing Cost Entries (P&L Incomplete)',
        items: jobsMissingCosts.map((e: any) => `<strong>${e.customer?.name || 'Unknown'}</strong> — ${e.address} — ${fmt$(e.our_total)} — Status: ${e.status}`),
        severity: 'info',
      })
    }

    // ── NEW: Cash flow warning ────────────────────────────────────────────────
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const [monthCashIn, monthExpOut, monthJobCosts, monthRecurringTotal] = await Promise.all([
      prisma.payments.aggregate({ _sum: { amount: true }, where: { paid_at: { gte: thisMonthStart } } }),
      prisma.expenses.aggregate({ _sum: { amount: true }, where: { date: { gte: thisMonthStart } } }),
      prisma.job_costs.aggregate({ _sum: { amount: true }, where: { created_at: { gte: thisMonthStart } } }),
      prisma.recurring_expenses.aggregate({ _sum: { amount: true }, where: { is_active: true, next_due: { lte: thirtyDaysFromNow } } }),
    ])
    const cashIn = (monthCashIn._sum.amount || 0)
    const cashOut = (monthExpOut._sum.amount || 0) + (monthJobCosts._sum.amount || 0)
    const projectedOut = cashOut + (monthRecurringTotal._sum.amount || 0)
    if (cashIn > 0 && projectedOut > cashIn * 1.4) {
      sections.push({
        title: 'Cash Flow Warning',
        items: [`Projected outflows this month (<strong>${fmt$(projectedOut)}</strong>) may exceed cash collected (<strong>${fmt$(cashIn)}</strong>). Review upcoming expenses.`],
        severity: 'warning',
      })
    }

    // ── Only send if there are alerts ────────────────────────────────────────

    if (sections.length === 0) {
      return NextResponse.json({ ok: true, alertsSent: false, reason: 'No alerts' })
    }

    const totalAlerts = sections.reduce((s, sec) => s + sec.items.length, 0)
    const html = buildAlertsEmail(sections)

    const result = await sendEmail({
      to: ADMIN_EMAIL,
      subject: `[Action Required] ${totalAlerts} Alert(s) - Roof Works Admin`,
      html,
      text: sections.map(s => `${s.title}: ${s.items.length} item(s)`).join('\n'),
    })

    return NextResponse.json({
      ok: true,
      alertsSent: true,
      emailSent: result.success,
      messageId: result.messageId,
      summary: {
        totalAlerts,
        sections: sections.map(s => ({ title: s.title, count: s.items.length, severity: s.severity })),
      },
    })
  } catch (error: any) {
    console.error('[AlertReport]', error)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
}