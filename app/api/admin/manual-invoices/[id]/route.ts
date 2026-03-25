import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await params;
    const invoice = await prisma.manual_invoices.findUnique({
      where: { id },
      include: {
        line_items: { orderBy: { sort_order: 'asc' } },
        payments:   { orderBy: { paid_at: 'desc' } },
      },
    });
    if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ invoice });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 401 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await params;
    const body = await req.json();
    const { line_items, ...fields } = body;

    // If line_items provided, replace them all and recalculate amount_due
    if (line_items !== undefined) {
      await prisma.manual_invoice_items.deleteMany({ where: { invoice_id: id } });

      const amount_due = (line_items as any[]).reduce(
        (s, li) => s + (parseFloat(li.amount) || 0), 0
      );

      await prisma.manual_invoice_items.createMany({
        data: (line_items as any[]).map((li, i) => ({
          invoice_id:  id,
          description: li.description,
          qty:         parseFloat(li.qty)        || 1,
          unit:        li.unit                   || null,
          unit_price:  parseFloat(li.unit_price) || 0,
          amount:      parseFloat(li.amount)     || 0,
          sort_order:  i,
        })),
      });

      fields.amount_due = amount_due;
    }

    // Recalculate status from payments
    const existing = await prisma.manual_invoices.findUnique({
      where: { id },
      include: { payments: true },
    });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const totalPaid = existing.payments.reduce((s, p) => s + p.amount, 0);
    const newAmountDue = fields.amount_due ?? existing.amount_due;
    const status = totalPaid >= newAmountDue && newAmountDue > 0 ? 'PAID'
                 : totalPaid > 0                                  ? 'PARTIAL'
                 :                                                  'UNPAID';

    const updateData: any = {
      amount_paid: totalPaid,
      status,
      ...('customer_name'    in fields && { customer_name:    fields.customer_name }),
      ...('customer_phone'   in fields && { customer_phone:   fields.customer_phone }),
      ...('customer_email'   in fields && { customer_email:   fields.customer_email }),
      ...('customer_address' in fields && { customer_address: fields.customer_address }),
      ...('property_address' in fields && { property_address: fields.property_address }),
      ...('insurer'          in fields && { insurer:          fields.insurer }),
      ...('claim_no'         in fields && { claim_no:         fields.claim_no }),
      ...('notes'            in fields && { notes:            fields.notes }),
      ...('payment_terms'    in fields && { payment_terms:    fields.payment_terms }),
      ...('issued_at'        in fields && { issued_at:        new Date(fields.issued_at) }),
      ...('due_at'           in fields && { due_at:           fields.due_at ? new Date(fields.due_at) : null }),
      ...('amount_due'       in fields && { amount_due:       parseFloat(fields.amount_due) }),
    };

    const invoice = await prisma.manual_invoices.update({
      where: { id },
      data: updateData,
      include: {
        line_items: { orderBy: { sort_order: 'asc' } },
        payments:   { orderBy: { paid_at: 'desc' } },
      },
    });

    return NextResponse.json({ invoice });
  } catch (err: any) {
    console.error('[manual-invoices PATCH]', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await params;
    await prisma.manual_invoices.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
