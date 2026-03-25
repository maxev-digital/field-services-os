import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();
    const { note, items } = await req.json();

    if (!items?.length) {
      return NextResponse.json({ error: 'At least one line item change required' }, { status: 400 });
    }

    // Get current estimate to recalculate totals
    const estimate = await prisma.estimates.findUnique({
      where: { id: params.id },
      include: { line_items: true },
    });
    if (!estimate) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Build updated line item map
    const currentMap = new Map(estimate.line_items.map(li => [li.line_item_id, li]));
    for (const change of items) {
      if (change.qty_after === 0) {
        currentMap.delete(change.line_item_id);
      } else {
        const existing = currentMap.get(change.line_item_id);
        if (existing) {
          currentMap.set(change.line_item_id, {
            ...existing,
            qty: change.qty_after,
            our_amt: change.qty_after * existing.our_per_unit,
            ins_amt: change.qty_after * existing.xactimate_per_unit,
            delta:   (change.qty_after * existing.xactimate_per_unit) - (change.qty_after * existing.our_per_unit),
          });
        }
      }
    }

    const updatedItems = Array.from(currentMap.values());
    const new_our_total = updatedItems.reduce((s, i) => s + i.our_amt, 0);
    const new_ins_total = updatedItems.reduce((s, i) => s + i.ins_amt, 0);

    // Create change order + update estimate totals
    const [changeOrder] = await prisma.$transaction([
      prisma.change_orders.create({
        data: {
          estimate_id:   params.id,
          note:          note || null,
          new_our_total,
          new_ins_total,
          items: {
            create: items.map((item: any) => ({
              line_item_id:  item.line_item_id,
              label:         item.label,
              unit:          item.unit,
              qty_before:    item.qty_before,
              qty_after:     item.qty_after,
              our_per_unit:  item.our_per_unit,
              our_amt_before: item.qty_before * item.our_per_unit,
              our_amt_after:  item.qty_after  * item.our_per_unit,
            })),
          },
        },
        include: { items: true },
      }),
      prisma.estimates.update({
        where: { id: params.id },
        data: {
          our_total:       new_our_total,
          insurance_total: new_ins_total,
          savings:         new_ins_total - new_our_total,
          savings_pct:     new_ins_total > 0 ? ((new_ins_total - new_our_total) / new_ins_total) * 100 : 0,
        },
      }),
    ]);

    return NextResponse.json({ changeOrder });
  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
