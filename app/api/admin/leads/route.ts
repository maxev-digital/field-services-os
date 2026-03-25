import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';

export async function GET(_req: NextRequest) {
  try {
    await requireAdmin();

    // Leads = customers with estimates in DRAFT or SENT status (no converted job yet)
    const estimates = await prisma.estimates.findMany({
      where: { status: { in: ['DRAFT', 'SENT'] }, job_id: null },
      include: { customer: { select: { id: true, name: true, phone: true, email: true } } },
      orderBy: { created_at: 'desc' },
    });

    return NextResponse.json({ leads: estimates, total: estimates.length });
  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
