import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';
import { sendReviewRequestSMS } from '@/lib/sms';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();
    const job = await prisma.jobs.findUnique({
      where: { id: params.id },
      include: {
        customer: true,
        claim: true,
        photos: { orderBy: { created_at: 'desc' } },
        review_request: true,
      },
    });
    if (!job) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ job });
  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();
    const body = await req.json();
    const { status, notes, crew_name, scheduled_date, completed_date, material, shingle_color, supplier, squares } = body;

    // Fetch current job to detect status transition
    const before = await prisma.jobs.findUnique({
      where: { id: params.id },
      include: { customer: true, review_request: true },
    });

    const data: any = {};
    if (status !== undefined) data.status = status;
    if (notes !== undefined) data.notes = notes;
    if (crew_name !== undefined) data.crew_name = crew_name;
    if (scheduled_date !== undefined) data.scheduled_date = scheduled_date ? new Date(scheduled_date) : null;
    if (completed_date !== undefined) data.completed_date = completed_date ? new Date(completed_date) : null;
    if (material !== undefined) data.material = material;
    if (shingle_color !== undefined) data.shingle_color = shingle_color;
    if (supplier !== undefined) data.supplier = supplier;
    if (squares !== undefined) data.squares = squares ? parseFloat(squares) : null;

    const job = await prisma.jobs.update({ where: { id: params.id }, data });

    // ── Auto review request on COMPLETE transition ────────────────────────────
    if (before && status === 'COMPLETE' && before.status !== 'COMPLETE' && !before.review_request) {
      // Create review_request record (fire-and-forget)
      prisma.review_requests.create({
        data: { job_id: params.id, sent_via: 'SMS' },
      }).catch(err => console.error('[job/patch] review_request create failed:', err));

      // Send Twilio SMS (fire-and-forget)
      sendReviewRequestSMS({
        customerName:  before.customer.name,
        customerPhone: before.customer.phone,
        address:       before.address,
      }).catch(err => console.error('[job/patch] review SMS failed:', err));
    }

    return NextResponse.json({ job });
  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
