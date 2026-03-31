import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';

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
    const allowed = ['status', 'insurer', 'claim_no', 'adj_date', 'sent_at', 'approved_at'];
    const data: any = {};
    for (const key of allowed) {
      if (body[key] !== undefined) data[key] = body[key];
    }
    if (body.status === 'SENT' && !data.sent_at) data.sent_at = new Date();
    if (body.status === 'APPROVED' && !data.approved_at) data.approved_at = new Date();

    const estimate = await prisma.estimates.update({ where: { id: params.id }, data });

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
