import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';

export async function GET(_req: NextRequest) {
  try {
    await requireAdmin();

    const claims = await prisma.insurance_claims.findMany({
      include: {
        job: {
          include: { customer: { select: { id: true, name: true, phone: true } } },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    return NextResponse.json({ claims, total: claims.length });
  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    const { job_id, insurer, claim_no, adjuster_name, adjuster_phone, date_filed } = await req.json();
    if (!job_id) return NextResponse.json({ error: 'job_id is required' }, { status: 400 });

    const claim = await prisma.insurance_claims.create({
      data: {
        job_id,
        insurer: insurer || null,
        claim_no: claim_no || null,
        adjuster_name: adjuster_name || null,
        adjuster_phone: adjuster_phone || null,
        date_filed: date_filed ? new Date(date_filed) : null,
      },
    });
    return NextResponse.json({ claim });
  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
