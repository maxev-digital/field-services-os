import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();
    const payments = await prisma.payments.findMany({
      where: { invoice_id: params.id },
      orderBy: { paid_at: 'asc' },
    });
    return NextResponse.json({ payments });
  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();
    const { amount, method, reference_no, notes, paid_at } = await req.json();
    if (!amount || parseFloat(amount) <= 0) {
      return NextResponse.json({ error: 'Valid amount required' }, { status: 400 });
    }

    const invoice = await prisma.invoices.findUnique({ where: { id: params.id } });
    if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });

    const payment = await prisma.payments.create({
      data: {
        invoice_id:   params.id,
        amount:       parseFloat(amount),
        method:       method       || 'CHECK',
        reference_no: reference_no || null,
        notes:        notes        || null,
        paid_at:      paid_at ? new Date(paid_at) : new Date(),
      },
    });

    // Recalculate amount_paid on invoice
    const allPayments = await prisma.payments.findMany({ where: { invoice_id: params.id } });
    const totalPaid   = allPayments.reduce((s, p) => s + p.amount, 0);
    const newStatus   = totalPaid >= invoice.amount_due ? 'PAID'
                      : totalPaid > 0                   ? 'PARTIAL'
                      :                                   'UNPAID';

    await prisma.invoices.update({
      where: { id: params.id },
      data: {
        amount_paid: totalPaid,
        status:      newStatus as any,
        paid_at:     newStatus === 'PAID' ? new Date() : null,
      },
    });

    return NextResponse.json({ payment });
  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
