import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; payId: string }> }
) {
  try {
    await requireAdmin();
    const { id, payId } = await params;

    await prisma.manual_payments.delete({ where: { id: payId } });

    // Recalculate
    const invoice     = await prisma.manual_invoices.findUnique({ where: { id } });
    const allPayments = await prisma.manual_payments.findMany({ where: { invoice_id: id } });
    const totalPaid   = allPayments.reduce((s, p) => s + p.amount, 0);
    const status      = invoice && totalPaid >= invoice.amount_due && invoice.amount_due > 0 ? 'PAID'
                      : totalPaid > 0 ? 'PARTIAL' : 'UNPAID';

    const updated = await prisma.manual_invoices.update({
      where: { id },
      data: { amount_paid: totalPaid, status: status as any, paid_at: status === 'PAID' ? new Date() : null },
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
