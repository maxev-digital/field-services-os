import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();
    const { label, unit, xactimate, ours, category, sort_order, active } = await req.json();

    const data: any = {};
    if (label !== undefined) data.label = label;
    if (unit !== undefined) data.unit = unit;
    if (xactimate !== undefined) data.xactimate = parseFloat(xactimate);
    if (ours !== undefined) data.ours = parseFloat(ours);
    if (category !== undefined) data.category = category;
    if (sort_order !== undefined) data.sort_order = parseInt(sort_order);
    if (active !== undefined) data.active = active;

    const item = await prisma.line_item_master.update({ where: { id: params.id }, data });
    return NextResponse.json({ item });
  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();
    await prisma.line_item_master.update({ where: { id: params.id }, data: { active: false } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
