import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';

export async function GET(_req: NextRequest) {
  try {
    await requireAdmin();
    const items = await prisma.line_item_master.findMany({
      orderBy: [{ category: 'asc' }, { sort_order: 'asc' }],
    });
    return NextResponse.json({ items });
  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    const { id, label, unit, xactimate, ours, category, sort_order } = await req.json();
    if (!id || !label || !unit || !category) {
      return NextResponse.json({ error: 'id, label, unit, category are required' }, { status: 400 });
    }

    const item = await prisma.line_item_master.create({
      data: {
        id,
        label,
        unit,
        xactimate: parseFloat(xactimate) || 0,
        ours: parseFloat(ours) || 0,
        category,
        sort_order: parseInt(sort_order) || 0,
      },
    });
    return NextResponse.json({ item });
  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
