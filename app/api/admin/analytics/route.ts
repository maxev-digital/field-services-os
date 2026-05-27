import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';

export async function GET(_req: NextRequest) {
  try {
    await requireAdmin();

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    const [
      totalEstimates, recentEstimates,
      totalJobs, activeJobs, completedJobs,
      totalCustomers, recentCustomers,
      totalClaims, approvedClaims,
      recentEstimateData,
    ] = await Promise.all([
      prisma.estimates.count(),
      prisma.estimates.count({ where: { created_at: { gte: thirtyDaysAgo } } }),
      prisma.jobs.count(),
      prisma.jobs.count({ where: { status: { in: ['SCHEDULED', 'IN_PROGRESS', 'INSURANCE_APPROVED'] } } }),
      prisma.jobs.count({ where: { status: 'COMPLETE' } }),
      prisma.customers.count(),
      prisma.customers.count({ where: { created_at: { gte: thirtyDaysAgo } } }),
      prisma.insurance_claims.count(),
      prisma.insurance_claims.count({ where: { status: 'APPROVED' } }),
      // Last 90 days of estimates for chart
      prisma.estimates.findMany({
        where: { created_at: { gte: ninetyDaysAgo } },
        select: { created_at: true, our_total: true, insurance_total: true, status: true },
        orderBy: { created_at: 'asc' },
      }),
    ]);

    // Group by week for chart
    const weekMap = new Map<string, { week: string; count: number; our_total: number; ins_total: number }>();
    for (const e of recentEstimateData) {
      const d = new Date(e.created_at);
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(d.setDate(diff));
      const key = monday.toISOString().slice(0, 10);
      if (!weekMap.has(key)) weekMap.set(key, { week: key, count: 0, our_total: 0, ins_total: 0 });
      const w = weekMap.get(key)!;
      w.count++;
      w.our_total += e.our_total;
      w.ins_total += e.insurance_total;
    }
    const weeklyChart = Array.from(weekMap.values()).sort((a, b) => a.week.localeCompare(b.week));

    // Job status breakdown
    const jobStatusCounts = await prisma.jobs.groupBy({
      by: ['status'],
      _count: { status: true },
    });

    return NextResponse.json({
      estimates: { total: totalEstimates, last30d: recentEstimates },
      jobs: { total: totalJobs, active: activeJobs, completed: completedJobs },
      customers: { total: totalCustomers, last30d: recentCustomers },
      claims: { total: totalClaims, approved: approvedClaims },
      weeklyChart,
      jobStatusBreakdown: jobStatusCounts.map(j => ({ status: j.status, count: j._count.status })),
    });
  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
