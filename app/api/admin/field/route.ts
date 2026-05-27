import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const today     = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow  = new Date(today.getTime() + 86400_000);

  const [todayJobs, activeJobs] = await Promise.all([
    prisma.jobs.findMany({
      where: {
        scheduled_date: { gte: today, lt: tomorrow },
        status: { in: ['SCHEDULED', 'IN_PROGRESS'] as any[] },
      },
      include: {
        customer: { select: { name: true, phone: true, email: true } },
      },
      orderBy: { scheduled_date: 'asc' },
    }),
    prisma.jobs.findMany({
      where: { status: 'IN_PROGRESS' as any },
      include: { customer: { select: { name: true, phone: true } } },
      orderBy: { updated_at: 'desc' },
      take: 10,
    }),
  ]);

  return NextResponse.json({ todayJobs, activeJobs });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { jobId, status } = await req.json();
  const allowed = ['SCHEDULED', 'IN_PROGRESS', 'COMPLETE', 'INVOICED'];
  if (!jobId || !allowed.includes(status)) {
    return NextResponse.json({ error: 'Invalid' }, { status: 400 });
  }

  const data: any = { status, updated_at: new Date() };
  if (status === 'IN_PROGRESS') data.scheduled_date = new Date();
  if (status === 'COMPLETE')   data.completed_date  = new Date();

  await prisma.jobs.update({ where: { id: jobId }, data });
  return NextResponse.json({ ok: true });
}
