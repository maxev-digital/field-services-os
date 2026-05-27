import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();
    const customer = await prisma.customers.findUnique({
      where: { id: params.id },
      include: {
        estimates: { orderBy: { created_at: 'desc' } },
        jobs: { orderBy: { created_at: 'desc' }, include: { claim: true, photos: true } },
        inspection_reports: {
          orderBy: { created_at: 'desc' },
          include: { _count: { select: { items: { where: { damaged: true } } } } },
        },
      },
    });
    if (!customer) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ customer });
  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();
    const { name, phone, email, address, notes } = await req.json();
    const customer = await prisma.customers.update({
      where: { id: params.id },
      data: { name, phone, email: email || null, address: address || null, notes: notes || null },
    });
    return NextResponse.json({ customer });
  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
