import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';

export async function GET() {
  try {
    await requireAdmin();

    const now       = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      newLeads,
      activeJobs,
      pendingEstimates,
      openClaims,
      completedJobsThisMonth,
      invoicedThisMonth,
      reviewRequestsSent,
      totalLeads,
      convertedLeads,
    ] = await Promise.all([
      prisma.customers.count({ where: { created_at: { gte: monthStart } } }),
      prisma.jobs.count({ where: { status: { in: ['SCHEDULED', 'IN_PROGRESS'] } } }),
      prisma.estimates.count({ where: { status: { in: ['DRAFT', 'SENT'] } } }),
      prisma.insurance_claims.count({ where: { status: { notIn: ['CLOSED'] } } }),
      prisma.jobs.count({ where: { status: 'COMPLETE', completed_date: { gte: monthStart } } }),
      prisma.invoices.findMany({ where: { issued_at: { gte: monthStart } }, select: { amount_due: true } }),
      prisma.review_requests.count(),
      prisma.customers.count(),
      prisma.jobs.count({ where: { status: { notIn: ['LEAD'] } } }),
    ]);

    const revenueThisMonth = invoicedThisMonth.reduce((sum, inv) => sum + inv.amount_due, 0);
    const conversionRate = totalLeads > 0 ? Math.round((convertedLeads / totalLeads) * 100) : 0;

    return NextResponse.json({
      newLeads,
      activeJobs,
      pendingEstimates,
      openClaims,
      revenueThisMonth,
      jobsCompleteThisMonth: completedJobsThisMonth,
      reviewRequestsSent,
      conversionRate,
    });
  } catch (error: any) {
    if (error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
