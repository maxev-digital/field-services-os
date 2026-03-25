import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';

export async function GET(_req: NextRequest) {
  try {
    await requireAdmin();
    const invoices = await prisma.manual_invoices.findMany({
      orderBy: { created_at: 'desc' },
      include: {
        line_items: { orderBy: { sort_order: 'asc' } },
        payments:   { orderBy: { paid_at: 'desc' } },
      },
    });
    return NextResponse.json({ invoices });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    const body = await req.json();

    // Generate invoice number: RWM-YYYY-XXXX
    const year  = new Date().getFullYear();
    const count = await prisma.manual_invoices.count();
    const invoice_no = `RWM-${year}-${String(count + 1).padStart(4, '0')}`;

    const due_at = new Date();
    due_at.setDate(due_at.getDate() + 30);

    const { line_items = [], ...fields } = body;

    const amount_due = line_items.reduce(
      (s: number, li: any) => s + (parseFloat(li.amount) || 0), 0
    );

    const invoice = await prisma.manual_invoices.create({
      data: {
        invoice_no,
        due_at,
        amount_due,
        customer_name:    fields.customer_name    ?? '',
        customer_phone:   fields.customer_phone   ?? null,
        customer_email:   fields.customer_email   ?? null,
        customer_address: fields.customer_address ?? null,
        property_address: fields.property_address ?? null,
        insurer:          fields.insurer          ?? null,
        claim_no:         fields.claim_no         ?? null,
        notes:            fields.notes            ?? null,
        payment_terms:    fields.payment_terms    ?? null,
        issued_at:        fields.issued_at ? new Date(fields.issued_at) : new Date(),
        line_items: {
          create: line_items.map((li: any, i: number) => ({
            description: li.description,
            qty:         parseFloat(li.qty)        || 1,
            unit:        li.unit                   || null,
            unit_price:  parseFloat(li.unit_price) || 0,
            amount:      parseFloat(li.amount)     || 0,
            sort_order:  i,
          })),
        },
      },
      include: {
        line_items: { orderBy: { sort_order: 'asc' } },
        payments:   true,
      },
    });

    return NextResponse.json({ invoice });
  } catch (err: any) {
    console.error('[manual-invoices POST]', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
