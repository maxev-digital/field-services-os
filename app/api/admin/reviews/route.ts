import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';
import { sendReviewRequestSMS } from '@/lib/sms';

export async function GET(_req: NextRequest) {
  try {
    await requireAdmin();

    const reviews = await prisma.review_requests.findMany({
      include: {
        job: {
          include: { customer: { select: { id: true, name: true, phone: true, email: true } } },
        },
      },
      orderBy: { sent_at: 'desc' },
    });

    // Jobs completed but no review sent
    const pending = await prisma.jobs.findMany({
      where: { status: 'COMPLETE', review_request: null },
      include: { customer: { select: { id: true, name: true, phone: true, email: true } } },
      orderBy: { completed_date: 'desc' },
    });

    return NextResponse.json({ reviews, pending, total: reviews.length });
  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    const { job_id, sent_via } = await req.json();
    if (!job_id || !sent_via) return NextResponse.json({ error: 'job_id and sent_via required' }, { status: 400 });

    // Get job + customer for SMS
    const job = await prisma.jobs.findUnique({
      where: { id: job_id },
      include: { customer: true },
    });
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

    const review = await prisma.review_requests.create({
      data: { job_id, sent_via },
    });

    // Actually send the SMS if requested
    if (sent_via === 'SMS') {
      sendReviewRequestSMS({
        customerName:  job.customer.name,
        customerPhone: job.customer.phone,
        address:       job.address,
      }).catch(err => console.error('[reviews/post] SMS failed:', err));
    }

    return NextResponse.json({ review, smsSent: sent_via === 'SMS' });
  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
