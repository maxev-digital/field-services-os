import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();

    // Load inspection with customer info and line items
    const report = await prisma.inspection_reports.findUnique({
      where: { id: params.id },
      include: {
        line_items: true,
      },
    });
    if (!report) return NextResponse.json({ error: 'Inspection not found' }, { status: 404 });
    if (!report.customer_id) return NextResponse.json({ error: 'Inspection has no linked customer' }, { status: 400 });
    if ((report as any).line_items.length === 0) {
      return NextResponse.json({ error: 'Add at least one line item before creating an estimate' }, { status: 400 });
    }

    // Calculate totals from inspection line items
    const lineItems = (report as any).line_items as Array<{
      id: string; line_item_id: string; label: string; category: string;
      unit: string; qty: number; xactimate: number; ours: number;
    }>;

    let insurance_total = 0;
    let our_total = 0;
    for (const item of lineItems) {
      insurance_total += item.qty * item.xactimate;
      our_total += item.qty * item.ours;
    }
    const savings = insurance_total - our_total;
    const savings_pct = insurance_total > 0 ? (savings / insurance_total) * 100 : 0;

    // Create estimate + line items in a transaction
    const estimate = await prisma.$transaction(async (tx) => {
      const est = await tx.estimates.create({
        data: {
          customer_id: report.customer_id as string,
          address: report.address,
          job_id: report.job_id ?? undefined,
          insurance_total,
          our_total,
          savings,
          savings_pct,
          status: 'DRAFT',
        },
      });

      for (const item of lineItems) {
        const ins_amt = item.qty * item.xactimate;
        const our_amt = item.qty * item.ours;
        await tx.estimate_line_items.create({
          data: {
            estimate_id: est.id,
            line_item_id: item.line_item_id,
            label: item.label,
            category: item.category,
            unit: item.unit,
            qty: item.qty,
            xactimate_per_unit: item.xactimate,
            our_per_unit: item.ours,
            ins_amt,
            our_amt,
            delta: ins_amt - our_amt,
          },
        });
      }

      return est;
    });

    return NextResponse.json({ estimate_id: estimate.id });
  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
