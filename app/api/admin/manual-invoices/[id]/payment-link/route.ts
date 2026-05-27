/**
 * POST /api/admin/manual-invoices/[id]/payment-link
 * Creates a Stripe Checkout session for a manual invoice.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';
import { createInvoiceCheckout } from '@/lib/stripe';

const ADMIN_URL = process.env.NEXT_PUBLIC_ADMIN_URL ?? 'https://admin.roofworksoftexas.com';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await params;

    const invoice = await prisma.manual_invoices.findUnique({ where: { id } });
    if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });

    const balance = (invoice.amount_due as number) - (invoice.amount_paid as number);
    if (balance <= 0) return NextResponse.json({ error: 'Invoice is already paid' }, { status: 400 });

    const session = await createInvoiceCheckout({
      invoiceId:     id,
      invoiceNo:     invoice.invoice_no as string,
      amountCents:   Math.round(balance * 100),
      customerName:  (invoice.customer_name as string) ?? '',
      customerEmail: (invoice.customer_email as string | null) ?? null,
      description:   `Roofing services — ${invoice.property_address ?? invoice.customer_address ?? ''}`,
      successUrl:    ADMIN_URL + '/admin/manual-invoices/' + id + '?payment=success',
      cancelUrl:     ADMIN_URL + '/admin/manual-invoices/' + id + '?payment=cancelled',
    });

    return NextResponse.json({ url: session.url, sessionId: session.id });
  } catch (err: any) {
    console.error('[Stripe manual-invoice]', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
