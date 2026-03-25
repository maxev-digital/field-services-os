import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(req.url);
    const status   = searchParams.get('status');
    const search   = searchParams.get('search');
    const page     = parseInt(searchParams.get('page') || '1');
    const limit    = 50;
    const skip     = (page - 1) * limit;

    const where: any = {};
    if (status && status !== 'ALL') where.status = status;
    if (search) {
      where.OR = [
        { address:              { contains: search, mode: 'insensitive' } },
        { claim_no:             { contains: search, mode: 'insensitive' } },
        { insurer:              { contains: search, mode: 'insensitive' } },
        { customer: { name:     { contains: search, mode: 'insensitive' } } },
        { customer: { phone:    { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [estimates, total] = await Promise.all([
      prisma.estimates.findMany({
        where,
        include: { customer: { select: { id: true, name: true, phone: true, email: true } } },
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
      prisma.estimates.count({ where }),
    ]);

    return NextResponse.json({ estimates, total, page, pages: Math.ceil(total / limit) });
  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
