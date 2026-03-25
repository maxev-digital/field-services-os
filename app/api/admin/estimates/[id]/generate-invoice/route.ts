import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();

    const estimate = await prisma.estimates.findUnique({
      where: { id: params.id },
      include: {
        customer: true,
        line_items: { orderBy: { category: 'asc' } },
        invoice: true,
      },
    });

    if (!estimate) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (estimate.invoice) {
      return NextResponse.json({ invoice: estimate.invoice });
    }

    // Generate invoice number: RW-YYYY-XXXX
    const year  = new Date().getFullYear();
    const count = await prisma.invoices.count();
    const invoiceNo = `RW-${year}-${String(count + 1).padStart(4, '0')}`;

    // Due 30 days from now
    const dueAt = new Date();
    dueAt.setDate(dueAt.getDate() + 30);

    const invoice = await prisma.invoices.create({
      data: {
        estimate_id: estimate.id,
        invoice_no:  invoiceNo,
        amount_due:  estimate.our_total,
        status:      'UNPAID',
        due_at:      dueAt,
      },
    });

    // Update estimate status to INVOICED
    await prisma.estimates.update({
      where: { id: params.id },
      data:  { status: 'INVOICED' },
    });

    return NextResponse.json({ invoice });
  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
