import Stripe from 'stripe';

// Lazy singleton — avoids build-time throw when env var is absent
let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY is not set');
    }
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2025-02-24.acacia',
    });
  }
  return _stripe;
}

export default getStripe;

/**
 * Create a Stripe Checkout session for an invoice.
 * Enables both ACH Direct Debit (us_bank_account) and card.
 * ACH is shown first since it's far cheaper at these transaction sizes.
 */
export async function createInvoiceCheckout(opts: {
  invoiceId:     string;
  invoiceNo:     string;
  amountCents:   number;
  customerName:  string;
  customerEmail: string | null;
  description:   string;
  successUrl:    string;
  cancelUrl:     string;
}) {
  const session = await getStripe().checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['us_bank_account', 'card'],
    payment_method_options: {
      us_bank_account: {
        financial_connections: {
          permissions: ['payment_method'],
        },
      },
    },
    line_items: [
      {
        price_data: {
          currency:     'usd',
          unit_amount:  opts.amountCents,
          product_data: {
            name:        `Invoice ${opts.invoiceNo}`,
            description: opts.description,
          },
        },
        quantity: 1,
      },
    ],
    customer_email:   opts.customerEmail ?? undefined,
    metadata: {
      invoiceId: opts.invoiceId,
      invoiceNo: opts.invoiceNo,
    },
    payment_intent_data: {
      description: `Invoice ${opts.invoiceNo} — ${opts.description}`,
      metadata: {
        invoiceId: opts.invoiceId,
        invoiceNo: opts.invoiceNo,
      },
    },
    success_url: opts.successUrl,
    cancel_url:  opts.cancelUrl,
  });

  return session;
}
