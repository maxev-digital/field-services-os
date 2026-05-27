import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';

// GET — fetch schedule for an estimate
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();
    const items = await prisma.payment_schedule_items.findMany({
      where: { estimate_id: params.id },
      orderBy: { sort_order: 'asc' },
    });
    return NextResponse.json({ items });
  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST — replace entire schedule (send full items array)
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();
    const { items } = await req.json();
    if (!Array.isArray(items)) return NextResponse.json({ error: 'items array required' }, { status: 400 });

    // Replace all existing items
    await prisma.payment_schedule_items.deleteMany({ where: { estimate_id: params.id } });

    if (items.length > 0) {
      await prisma.payment_schedule_items.createMany({
        data: items.map((item: any, i: number) => ({
          estimate_id:  params.id,
          sort_order:   i,
          label:        item.label        || '',
          amount_type:  item.amount_type  || 'FIXED',
          amount_value: parseFloat(item.amount_value) || 0,
          due_trigger:  item.due_trigger  || '',
        })),
      });
    }

    const saved = await prisma.payment_schedule_items.findMany({
      where: { estimate_id: params.id },
      orderBy: { sort_order: 'asc' },
    });
    return NextResponse.json({ items: saved });
  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
