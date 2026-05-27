import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';

async function recalcEstimate(tx: any, estimateId: string) {
  const [items, est] = await Promise.all([
    tx.estimate_line_items.findMany({ where: { estimate_id: estimateId } }),
    tx.estimates.findUnique({ where: { id: estimateId }, select: { discount_pct: true } }),
  ]);
  const insurance_total = items.reduce((s: number, i: any) => s + (i.ins_amt ?? 0), 0);
  const raw_our         = items.reduce((s: number, i: any) => s + (i.our_amt ?? 0), 0);
  const discount_pct    = (est as any)?.discount_pct ?? 0;
  const our_total       = raw_our * (1 - discount_pct / 100);
  const savings         = insurance_total - our_total;
  const savings_pct     = insurance_total > 0 ? (savings / insurance_total) * 100 : 0;
  await tx.estimates.update({
    where: { id: estimateId },
    data: { insurance_total, our_total, savings, savings_pct },
  });
}

// POST — add a catalog item to this estimate
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();
    const { line_item_id, qty } = await req.json();
    if (!line_item_id) return NextResponse.json({ error: 'line_item_id required' }, { status: 400 });

    const master = await prisma.line_item_master.findUnique({ where: { id: line_item_id } });
    if (!master) return NextResponse.json({ error: 'Item not found' }, { status: 404 });

    const parsedQty = parseFloat(qty) || 1;
    const ins_amt   = parsedQty * master.xactimate;
    const our_amt   = parsedQty * master.ours;

    await prisma.$transaction(async (tx) => {
      await tx.estimate_line_items.create({
        data: {
          estimate_id:       params.id,
          line_item_id:      master.id,
          label:             master.label,
          category:          master.category,
          unit:              master.unit,
          qty:               parsedQty,
          xactimate_per_unit: master.xactimate,
          our_per_unit:      master.ours,
          ins_amt,
          our_amt,
          delta: ins_amt - our_amt,
        },
      });
      await recalcEstimate(tx, params.id);
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH — update qty / unit pricing on an existing line item
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(req.url);
    const item_id = searchParams.get('item_id');
    if (!item_id) return NextResponse.json({ error: 'item_id required' }, { status: 400 });

    const body = await req.json();

    await prisma.$transaction(async (tx) => {
      const item = await tx.estimate_line_items.findUnique({ where: { id: item_id } });
      if (!item) throw new Error('Item not found');

      const qty                = body.qty !== undefined                ? (parseFloat(body.qty) || item.qty)                                   : item.qty;
      const xactimate_per_unit = body.xactimate_per_unit !== undefined ? (parseFloat(body.xactimate_per_unit) || item.xactimate_per_unit)       : item.xactimate_per_unit;
      const our_per_unit       = body.our_per_unit !== undefined       ? (parseFloat(body.our_per_unit) || item.our_per_unit)                   : item.our_per_unit;

      const ins_amt = qty * xactimate_per_unit;
      const our_amt = qty * our_per_unit;

      await tx.estimate_line_items.update({
        where: { id: item_id },
        data: { qty, xactimate_per_unit, our_per_unit, ins_amt, our_amt, delta: ins_amt - our_amt },
      });
      await recalcEstimate(tx, params.id);
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE — remove a line item by id (?item_id=...)
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(req.url);
    const item_id = searchParams.get('item_id');
    if (!item_id) return NextResponse.json({ error: 'item_id required' }, { status: 400 });

    await prisma.$transaction(async (tx) => {
      await tx.estimate_line_items.delete({ where: { id: item_id } });
      await recalcEstimate(tx, params.id);
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
