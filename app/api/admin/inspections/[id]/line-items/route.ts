import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();
    const items = await (prisma as any).inspection_line_items.findMany({
      where: { report_id: params.id },
      orderBy: { created_at: 'asc' },
    });
    return NextResponse.json({ items });
  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();
    const { line_item_id, qty } = await req.json();
    if (!line_item_id) return NextResponse.json({ error: 'line_item_id required' }, { status: 400 });

    const master = await prisma.line_item_master.findUnique({ where: { id: line_item_id } });
    if (!master) return NextResponse.json({ error: 'Item not found' }, { status: 404 });

    const item = await (prisma as any).inspection_line_items.create({
      data: {
        report_id: params.id,
        line_item_id,
        label: master.label,
        category: master.category,
        unit: master.unit,
        qty: parseFloat(qty) || 0,
        xactimate: master.xactimate,
        ours: master.ours,
      },
    });
    return NextResponse.json({ item });
  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();
    const { item_id, qty } = await req.json();
    const item = await (prisma as any).inspection_line_items.update({
      where: { id: item_id },
      data: { qty: parseFloat(qty) || 0, updated_at: new Date() },
    });
    return NextResponse.json({ item });
  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(req.url);
    const item_id = searchParams.get('item_id');
    if (!item_id) return NextResponse.json({ error: 'item_id required' }, { status: 400 });
    await (prisma as any).inspection_line_items.delete({ where: { id: item_id } });
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
