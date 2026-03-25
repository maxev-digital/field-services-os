// app/api/admin/subcontractors/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const trade = searchParams.get('trade');
    const search = searchParams.get('search');

    const where: any = {};

    if (status) where.status = status;
    if (trade) where.trade = trade;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { company_name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ];
    }

    const subcontractors = await prisma.subcontractors.findMany({
      where,
      include: {
        _count: {
          select: {
            documents: true,
            expenses: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    // Get distinct trades for filter dropdown
    const trades = await prisma.subcontractors.findMany({
      select: { trade: true },
      distinct: ['trade'],
      where: { trade: { not: null } },
      orderBy: { trade: 'asc' },
    });

    const tradeList = trades.map((t) => t.trade).filter(Boolean);

    return NextResponse.json({
      subcontractors,
      tradeList,
    });
  } catch (error: any) {
    if (error.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();

    const body = await request.json();
    const {
      name,
      company_name,
      email,
      phone,
      trade,
      tax_id,
      address,
      hourly_rate,
      status,
      notes,
    } = body;

    const subcontractor = await prisma.subcontractors.create({
      data: {
        name,
        company_name,
        email,
        phone,
        trade,
        tax_id,
        address,
        hourly_rate: hourly_rate ? parseFloat(hourly_rate) : null,
        status: status || 'active',
        total_paid: 0,
        notes,
      },
    });

    return NextResponse.json(subcontractor, { status: 201 });
  } catch (error: any) {
    if (error.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
