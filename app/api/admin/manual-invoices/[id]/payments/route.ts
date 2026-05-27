import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await params;
    const body = await req.json();

    const invoice = await prisma.manual_invoices.findUnique({ where: { id } });
    if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    await prisma.manual_payments.create({
      data: {
        invoice_id:  id,
        amount:      parseFloat(body.amount),
        method:      body.method      ?? 'CHECK',
        reference_no: body.reference_no ?? null,
        notes:       body.notes        ?? null,
        paid_at:     body.paid_at ? new Date(body.paid_at) : new Date(),
      },
    });

    // Recalculate totals
    const allPayments = await prisma.manual_payments.findMany({ where: { invoice_id: id } });
    const totalPaid   = allPayments.reduce((s, p) => s + p.amount, 0);
    const status      = totalPaid >= invoice.amount_due && invoice.amount_due > 0 ? 'PAID'
                      : totalPaid > 0 ? 'PARTIAL' : 'UNPAID';

    const updated = await prisma.manual_invoices.update({
      where: { id },
      data: {
        amount_paid: totalPaid,
        status:      status as any,
        paid_at:     status === 'PAID' ? new Date() : null,
      },
      include: {
        line_items: { orderBy: { sort_order: 'asc' } },
        payments:   { orderBy: { paid_at: 'desc' } },
      },
    });

    return NextResponse.json({ invoice: updated });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
