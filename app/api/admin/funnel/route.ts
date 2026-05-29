import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const range = req.nextUrl.searchParams.get('range') || '30d';
  const days  = range === '7d' ? 7 : range === '90d' ? 90 : 30;
  const since = new Date(Date.now() - days * 86400_000);

  const [
    totalDialed,
    totalLeads,
    totalAppointments,
    totalEstimates,
    totalSigned,
    totalPaid,
    recentLeads,
    stageBreakdown,
  ] = await Promise.all([
    prisma.$queryRaw<{cnt: bigint}[]>`
      SELECT COUNT(*)::int as cnt FROM ivr_calls
      WHERE created_at >= ${since}
    `,
    prisma.$queryRaw<{cnt: bigint}[]>`
      SELECT COUNT(*)::int as cnt FROM ivr_calls
      WHERE status = 'interested' AND created_at >= ${since}
    `,
    prisma.storm_prospects.count({
      where: { status: 'APPOINTMENT_SET' as any, updated_at: { gte: since } },
    }),
    prisma.estimates.count({
      where: { status: { not: 'DRAFT' as any }, created_at: { gte: since } },
    }),
    prisma.estimates.count({
      where: { approved_at: { not: null, gte: since } },
    }),
    prisma.jobs.count({
      where: { status: 'PAID' as any, updated_at: { gte: since } },
    }),
    // Recent leads from IVR
    prisma.$queryRaw<{name:string,phone:string,status:string,created_at:Date}[]>`
      SELECT sp.name, sp.phone, sp.status, ic.created_at
      FROM ivr_calls ic
      JOIN storm_prospects sp ON sp.id = ic.prospect_id
      WHERE ic.status = 'interested' AND ic.created_at >= ${since}
      ORDER BY ic.created_at DESC
      LIMIT 10
    `,
    // Week-by-week dialed vs leads for spark chart
    prisma.$queryRaw<{week:string, dialed:bigint, leads:bigint}[]>`
      SELECT
        date_trunc('week', created_at)::date::text as week,
        COUNT(*)::int as dialed,
        SUM(CASE WHEN status='interested' THEN 1 ELSE 0 END)::int as leads
      FROM ivr_calls
      WHERE created_at >= ${since}
      GROUP BY 1 ORDER BY 1
    `,
  ]);

  const dialed       = Number((totalDialed[0] as any)?.cnt || 0);
  const leads        = Number((totalLeads[0] as any)?.cnt || 0);
  const appointments = Number(totalAppointments);
  const estimates    = Number(totalEstimates);
  const signed       = Number(totalSigned);
  const paid         = Number(totalPaid);

  function rate(a: number, b: number) {
    return b > 0 ? parseFloat(((a / b) * 100).toFixed(1)) : 0;
  }

  return NextResponse.json({
    range,
    funnel: [
      { label: 'Calls Dialed',        value: dialed,       rate: null,                     color: '#6b7280' },
      { label: 'Leads (Pressed 1/2)', value: leads,        rate: rate(leads, dialed),      color: '#3b82f6' },
      { label: 'Appointments',        value: appointments, rate: rate(appointments, leads), color: '#8b5cf6' },
      { label: 'Estimates Sent',      value: estimates,    rate: rate(estimates, appointments || leads), color: '#f59e0b' },
      { label: 'Signed',             value: signed,       rate: rate(signed, estimates),  color: '#10b981' },
      { label: 'Jobs Paid',          value: paid,         rate: rate(paid, signed || estimates), color: '#059669' },
    ],
    recentLeads,
    weeklyChart: stageBreakdown,
  });
}
