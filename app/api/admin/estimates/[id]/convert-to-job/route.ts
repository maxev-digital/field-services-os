import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();

    const estimate = await prisma.estimates.findUnique({
      where: { id: params.id },
      include: { customer: true },
    });
    if (!estimate) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (estimate.job_id) return NextResponse.json({ error: 'Already converted to job', job_id: estimate.job_id }, { status: 400 });

    const job = await prisma.jobs.create({
      data: {
        customer_id: estimate.customer_id,
        estimate_id: estimate.id,
        address:     estimate.address,
        insurer:     estimate.insurer || null,
        claim_no:    estimate.claim_no || null,
        status:      'ESTIMATE_SENT',
      },
    });

    await prisma.estimates.update({
      where: { id: params.id },
      data: { job_id: job.id, status: 'APPROVED' },
    });

    return NextResponse.json({ job });
  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
