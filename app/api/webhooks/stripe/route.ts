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

    const invoice = await prisma.invoices.findUnique({
      where:   { id },
      include: {
        estimate: {
          include: { customer: true },
        },
      },
    });

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    const balance = invoice.amount_due - invoice.amount_paid;
    if (balance <= 0) {
      return NextResponse.json({ error: 'Invoice is already paid' }, { status: 400 });
    }

    const customer = invoice.estimate?.customer;
    const address  = invoice.estimate?.address ?? '';

    const session = await createInvoiceCheckout({
      invoiceId:     id,
      invoiceNo:     invoice.invoice_no,
      amountCents:   Math.round(balance * 100),
      customerName:  customer?.name ?? '',
      customerEmail: customer?.email ?? null,
      description:   `Roofing services — ${address}`,
      successUrl:    `${ADMIN_URL}/admin/estimates/${invoice.estimate_id}?payment=success`,
      cancelUrl:     `${ADMIN_URL}/admin/estimates/${invoice.estimate_id}?payment=cancelled`,
    });

    // Store session on invoice so we can track/reuse
    await prisma.invoices.update({
      where: { id },
      data: {
        stripe_session_id:   session.id,
        stripe_checkout_url: session.url,
      },
    });

    return NextResponse.json({ url: session.url, sessionId: session.id });
  } catch (err: any) {
    console.error('[Stripe] payment-link error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// GET — return existing checkout URL if still valid
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await params;

    const invoice = await prisma.invoices.findUnique({ where: { id } });
    if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json({
      url:       invoice.stripe_checkout_url,
      sessionId: invoice.stripe_session_id,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 401 });
  }
}
