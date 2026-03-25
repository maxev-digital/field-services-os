import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search');

    const where: any = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { address: { contains: search, mode: 'insensitive' } },
      ];
    }

    const customers = await prisma.customers.findMany({
      where,
      include: {
        _count: { select: { estimates: true, jobs: true } },
      },
      orderBy: { created_at: 'desc' },
    });

    return NextResponse.json({ customers, total: customers.length });
  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    const { name, phone, email, address, notes } = await req.json();
    if (!name || !phone) return NextResponse.json({ error: 'name and phone are required' }, { status: 400 });

    const customer = await prisma.customers.create({
      data: { name, phone, email: email || null, address: address || null, notes: notes || null },
    });
    return NextResponse.json({ customer });
  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
