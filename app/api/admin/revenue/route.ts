import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';

export async function GET(_req: NextRequest) {
  try {
    await requireAdmin();

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    // Estimates revenue (our_total from approved/invoiced/paid)
    const [allTime, thisMonth, thisYear, byStatus, recentPaid] = await Promise.all([
      prisma.estimates.aggregate({
        where: { status: { in: ['APPROVED', 'INVOICED', 'PAID'] } },
        _sum: { our_total: true, insurance_total: true, savings: true },
        _count: true,
      }),
      prisma.estimates.aggregate({
        where: { status: { in: ['APPROVED', 'INVOICED', 'PAID'] }, created_at: { gte: startOfMonth } },
        _sum: { our_total: true },
        _count: true,
      }),
      prisma.estimates.aggregate({
        where: { status: { in: ['APPROVED', 'INVOICED', 'PAID'] }, created_at: { gte: startOfYear } },
        _sum: { our_total: true },
        _count: true,
      }),
      prisma.estimates.groupBy({
        by: ['status'],
        _sum: { our_total: true, insurance_total: true },
        _count: { status: true },
      }),
      prisma.estimates.findMany({
        where: { status: { in: ['APPROVED', 'INVOICED', 'PAID'] } },
        include: { customer: { select: { id: true, name: true } } },
        orderBy: { updated_at: 'desc' },
        take: 10,
      }),
    ]);

    // Pipeline value (DRAFT + SENT)
    const pipeline = await prisma.estimates.aggregate({
      where: { status: { in: ['DRAFT', 'SENT'] } },
      _sum: { our_total: true },
      _count: true,
    });

    return NextResponse.json({
      allTime: {
        revenue: allTime._sum.our_total || 0,
        insurance: allTime._sum.insurance_total || 0,
        savings: allTime._sum.savings || 0,
        count: allTime._count,
      },
      thisMonth: { revenue: thisMonth._sum.our_total || 0, count: thisMonth._count },
      thisYear: { revenue: thisYear._sum.our_total || 0, count: thisYear._count },
      pipeline: { value: pipeline._sum.our_total || 0, count: pipeline._count },
      byStatus: byStatus.map(s => ({
        status: s.status,
        our_total: s._sum.our_total || 0,
        ins_total: s._sum.insurance_total || 0,
        count: s._count.status,
      })),
      recentPaid,
    });
  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
