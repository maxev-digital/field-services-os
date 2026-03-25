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

function buildAlertsEmail(sections: AlertSection[]): string {
  const severityColors = {
    critical: { bg: '#7f1d1d', border: '#ef4444', text: '#fca5a5', badge: '#ef4444' },
    warning:  { bg: '#78350f', border: '#f59e0b', text: '#fde68a', badge: '#f59e0b' },
    info:     { bg: '#1e1e2e', border: '#3b82f6', text: '#93c5fd', badge: '#3b82f6' },
  }

  const totalAlerts = sections.reduce((s, sec) => s + sec.items.length, 0)

  const sectionHtml = sections.map(sec => {
    const c = severityColors[sec.severity]
    return `
      <div style="margin:16px 0;">
        <p style="font-size:15px;font-weight:700;color:#f1f1f1;margin:0 0 10px;">
          <span style="display:inline-block;width:10px;height:10px;background:${c.badge};border-radius:50%;margin-right:8px;"></span>
          ${sec.title} (${sec.items.length})
        </p>
        ${sec.items.map(item => `
          <div style="background:${c.bg};border-left:3px solid ${c.border};border-radius:4px;padding:10px 14px;margin:6px 0;">
            <p style="margin:0;color:${c.text};font-size:13px;">${item}</p>
          </div>
        `).join('')}
      </div>
    `
  }).join('')

  return `
<!DOCTYPE html>
<html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#0f0f1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f1a;">
<tr><td align="center" style="padding:24px 12px;">
<table width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;">

  <!-- Header -->
  <tr><td style="background:#dc2626;padding:20px 28px;border-radius:12px 12px 0 0;">
    <p style="margin:0;font-size:20px;font-weight:700;color:#fff;">Roof Works of Texas</p>
    <p style="margin:4px 0 0;font-size:13px;color:#fecaca;">Alert Digest &middot; ${totalAlerts} item(s) need attention</p>
  </td></tr>

  <!-- Body -->
  <tr><td style="background:#12121f;padding:28px;border-radius:0 0 12px 12px;">

    <p style="color:#9ca3af;font-size:14px;margin:0 0 20px;">
      The following items require your attention:
    </p>

    ${sectionHtml}

    <p style="color:#6b7280;font-size:11px;margin:32px 0 0;text-align:center;">
      Automated alert from ${brand.name} Admin &middot; ${new Date().toLocaleDateString('en-US', { timeZone: 'America/Chicago', month: 'long', day: 'numeric', year: 'numeric' })}
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
