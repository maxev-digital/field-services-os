import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';

const DFW_COUNTIES = ['Dallas','Collin','Denton','Tarrant','Rockwall','Kaufman','Johnson','Ellis','Parker','Wise'];

export async function GET() {
  try {
    await requireAdmin();

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    // Get distinct storm dates with aggregate stats
    const rows = await prisma.storm_prospects.groupBy({
      by: ['storm_date'],
      where: {
        storm_date: { not: null, gte: sixMonthsAgo.toISOString().slice(0, 10) },
      },
      _count: { id: true },
      _max: { hail_size_in: true },
      orderBy: { storm_date: 'desc' },
    });

    // For each storm date get top counties
    const history = await Promise.all(
      rows
        .filter(r => r.storm_date)
        .map(async r => {
          const countyRows = await prisma.storm_prospects.groupBy({
            by: ['county'],
            where: { storm_date: r.storm_date!, county: { not: null } },
            _count: { id: true },
            orderBy: { _count: { id: 'desc' } },
            take: 3,
          });

          const topCounties = countyRows.map(c => c.county!).filter(Boolean);
          const dfwCount = await prisma.storm_prospects.count({
            where: {
              storm_date: r.storm_date!,
              county: { in: DFW_COUNTIES },
            },
          });

          return {
            storm_date: r.storm_date!,
            total: r._count.id,
            dfw_count: dfwCount,
            max_hail: r._max.hail_size_in,
            top_counties: topCounties,
          };
        })
    );

    return NextResponse.json({ history });
  } catch (err: any) {
    if (err.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
