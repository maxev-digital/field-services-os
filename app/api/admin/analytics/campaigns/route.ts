import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import prisma from '@/lib/prisma'

export async function GET() {
  try { await requireAdmin() } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const now   = new Date()
  const d30   = new Date(now.getTime() - 30 * 86400000)
  const d7    = new Date(now.getTime() -  7 * 86400000)

  const [
    emailAll,
    email30d,
    emailByTemplate,
    emailDaily,
    ivrAll,
    ivr30d,
    ivrByDigit,
    prospectStatuses,
    prospectTotal,
  ] = await Promise.all([
    // Total email sent / failed
    prisma.outreach_history.groupBy({
      by: ['status'],
      _count: { id: true },
    }),

    // Emails last 30d
    prisma.outreach_history.groupBy({
      by: ['status'],
      where: { sent_at: { gte: d30 } },
      _count: { id: true },
    }),

    // Email performance by template
    prisma.$queryRaw<{ template: string; sent: bigint; failed: bigint }[]>`
      SELECT
        COALESCE(t.variant, h.template_id) AS template,
        COUNT(*) FILTER (WHERE h.status = 'sent')   AS sent,
        COUNT(*) FILTER (WHERE h.status = 'failed') AS failed
      FROM outreach_history h
      LEFT JOIN outreach_templates t ON t.id = h.template_id
      GROUP BY COALESCE(t.variant, h.template_id)
      ORDER BY sent DESC
      LIMIT 20
    `,

    // Daily email volume last 30d
    prisma.$queryRaw<{ day: string; sent: bigint; failed: bigint }[]>`
      SELECT
        TO_CHAR(sent_at AT TIME ZONE 'America/Chicago', 'MM/DD') AS day,
        COUNT(*) FILTER (WHERE status = 'sent')   AS sent,
        COUNT(*) FILTER (WHERE status = 'failed') AS failed
      FROM outreach_history
      WHERE sent_at >= ${d30}
      GROUP BY day
      ORDER BY MIN(sent_at)
    `,

    // IVR all time
    prisma.$queryRaw<{ status: string; cnt: bigint }[]>`
      SELECT status, COUNT(*) AS cnt FROM ivr_calls GROUP BY status
    `,

    // IVR last 30d dispatched
    prisma.$queryRaw<{ cnt: bigint }[]>`
      SELECT COUNT(*) AS cnt FROM ivr_calls WHERE created_at >= ${d30}
    `,

    // IVR digit pressed breakdown
    prisma.$queryRaw<{ digit: string | null; cnt: bigint }[]>`
      SELECT digit_pressed, COUNT(*) AS cnt FROM ivr_calls
      WHERE digit_pressed IS NOT NULL
      GROUP BY digit_pressed
    `,

    // Prospect status breakdown
    prisma.storm_prospects.groupBy({
      by: ['status'],
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    }),

    // Total prospects
    prisma.storm_prospects.count(),
  ])

  // Normalise email totals
  const emailSentAll  = emailAll.find(r => r.status === 'sent')?._count.id  ?? 0
  const emailFailAll  = emailAll.find(r => r.status === 'failed')?._count.id ?? 0
  const emailSent30   = email30d.find(r => r.status === 'sent')?._count.id  ?? 0
  const emailFail30   = email30d.find(r => r.status === 'failed')?._count.id ?? 0

  // IVR totals
  const ivrDispatched = ivrAll.reduce((s, r) => s + Number(r.cnt), 0)
  const ivrDisp30     = Number(ivr30d[0]?.cnt ?? 0)
  const press1 = Number(ivrByDigit.find(r => r.digit === '1')?.cnt ?? 0)
  const press2 = Number(ivrByDigit.find(r => r.digit === '2')?.cnt ?? 0)
  const press3 = Number(ivrByDigit.find(r => r.digit === '3')?.cnt ?? 0)

  // Prospect funnel
  const statusMap: Record<string, number> = {}
  for (const r of prospectStatuses) statusMap[r.status ?? 'NEW'] = r._count.id

  const contacted   = (statusMap['CONTACTED']       ?? 0)
  const interested  = (statusMap['INTERESTED']      ?? 0) + (statusMap['PRESS_1'] ?? 0)
  const appt        = (statusMap['APPOINTMENT_SET'] ?? 0) + (statusMap['BOOKED']  ?? 0)
  const converted   = (statusMap['CONVERTED']       ?? 0)
  const dnc         = (statusMap['DNC']             ?? 0) + (statusMap['HARD_NO'] ?? 0)

  return NextResponse.json({
    email: {
      total_sent:    emailSentAll,
      total_failed:  emailFailAll,
      last30d_sent:  emailSent30,
      last30d_failed: emailFail30,
      by_template:   emailByTemplate.map(r => ({
        template: r.template,
        sent:     Number(r.sent),
        failed:   Number(r.failed),
      })),
      daily_30d: emailDaily.map(r => ({
        day:    r.day,
        sent:   Number(r.sent),
        failed: Number(r.failed),
      })),
    },
    ivr: {
      total_dispatched: ivrDispatched,
      last30d_dispatched: ivrDisp30,
      press1,
      press2,
      press3,
      response_rate: ivrDispatched > 0 ? +((press1 + press2) / ivrDispatched * 100).toFixed(1) : 0,
    },
    prospects: {
      total:      prospectTotal,
      contacted,
      interested,
      appt,
      converted,
      dnc,
      by_status:  prospectStatuses.map(r => ({ status: r.status ?? 'NEW', count: r._count.id })),
    },
  })
}
