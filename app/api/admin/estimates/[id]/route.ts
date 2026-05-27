import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';
import { evPlaceOrder } from '@/lib/eagleview';
import { randomUUID } from 'crypto';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();
    const estimate = await prisma.estimates.findUnique({
      where: { id: params.id },
      include: {
        customer: true,
        line_items: { orderBy: { category: 'asc' } },
        change_orders: { include: { items: true }, orderBy: { created_at: 'desc' } },
        invoice: true,
      },
    });
    if (!estimate) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ estimate });
  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();
    const body = await req.json();
    const allowed = ['status', 'insurer', 'claim_no', 'adj_date', 'sent_at', 'approved_at', 'discount_pct'];
    const data: any = {};
    for (const key of allowed) {
      if (body[key] !== undefined) data[key] = body[key];
    }
    if (body.status === 'SENT' && !data.sent_at) data.sent_at = new Date();
    if (body.status === 'APPROVED' && !data.approved_at) data.approved_at = new Date();

    const estimate = await prisma.estimates.update({ where: { id: params.id }, data });

    if (body.discount_pct !== undefined) {
      const items = await prisma.estimate_line_items.findMany({ where: { estimate_id: params.id } });
      const insurance_total = items.reduce((s: number, i: any) => s + (i.ins_amt ?? 0), 0);
      const raw_our         = items.reduce((s: number, i: any) => s + (i.our_amt ?? 0), 0);
      const disc            = parseFloat(body.discount_pct) || 0;
      const our_total       = raw_our * (1 - disc / 100);
      const savings         = insurance_total - our_total;
      const savings_pct     = insurance_total > 0 ? (savings / insurance_total) * 100 : 0;
      await prisma.estimates.update({ where: { id: params.id }, data: { insurance_total, our_total, savings, savings_pct } });
    }

    // ── Auto-advance linked job when estimate status changes ─────────
    if (body.status) {
      const jobStatusMap: Record<string, string> = {
        'SENT': 'ESTIMATE_SENT',
        'APPROVED': 'INSURANCE_APPROVED',
        'INVOICED': 'INVOICED',
        'PAID': 'PAID',
      };
      const newJobStatus = jobStatusMap[body.status];
      if (newJobStatus) {
        // Find job linked to this estimate (by estimate_id or customer+address)
        const linkedJob = await prisma.jobs.findFirst({
          where: { estimate_id: params.id },
        });
        if (linkedJob) {
          await prisma.jobs.update({
            where: { id: linkedJob.id },
            data: { status: newJobStatus as any },
          }).catch(() => {});
        }
      }
    }
    // ── EagleView auto-trigger when estimate is APPROVED ────────────
    if (body.status === 'APPROVED' && process.env.EV_AUTO_TRIGGER === 'true') {
      const EV_DEFAULT_PRODUCT_ID = parseInt(process.env.EV_DEFAULT_PRODUCT_ID ?? '0', 10);
      if (EV_DEFAULT_PRODUCT_ID > 0) {
        (async () => {
          try {
            const est = await prisma.estimates.findUnique({
              where: { id: params.id },
              select: { address: true, id: true },
            });
            if (!est) return;

            // Skip if already ordered
            const existing = await prisma.ev_reports.findFirst({ where: { estimate_id: params.id } });
            if (existing) return;

            const parts = est.address.split(',').map((s: string) => s.trim());
            const street = parts[0] ?? est.address;
            const city   = parts[1] ?? 'Dallas';
            const stZip  = (parts[2] ?? 'TX').split(' ').filter(Boolean);
            const state  = stZip[0] ?? 'TX';
            const zip    = stZip[1] ?? '';

            const refId = randomUUID();
            const result = await evPlaceOrder({
              refId, productId: EV_DEFAULT_PRODUCT_ID,
              address: { street, city, state, zip, country: 'US' },
            });

            await prisma.ev_reports.create({
              data: {
                estimate_id:  params.id,
                ref_id:       refId,
                product_id:   EV_DEFAULT_PRODUCT_ID,
                product_name: 'Auto-ordered on approval',
                address:      est.address,
                ev_order_id:  result.orderId ?? null,
                status:       'ordered',
                updated_at:   new Date(),
              },
            });
            console.log('[EV auto-trigger] Ordered report for estimate', params.id, 'orderId', result.orderId);
          } catch (e: any) {
            console.error('[EV auto-trigger] Failed:', e.message);
          }
        })();
      }
    }

    return NextResponse.json({ estimate });
  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAdmin();
    const { id } = params;

    // Must delete invoice (and its payments cascade) before estimate
    // because invoices.estimate has no onDelete cascade
    const invoice = await prisma.invoices.findUnique({ where: { estimate_id: id } });
    if (invoice) {
      await prisma.payments.deleteMany({ where: { invoice_id: invoice.id } });
      await prisma.invoices.delete({ where: { id: invoice.id } });
    }

    // Delete estimate — line_items, change_orders, payment_schedule,
    // signature, material_order, job_costs all cascade; ev_reports set null
    await prisma.estimates.delete({ where: { id } });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error('[estimate DELETE]', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
