import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(req.url);
    const job_id = searchParams.get('job_id');

    const where: any = {};
    if (job_id) where.job_id = job_id;

    const photos = await prisma.job_photos.findMany({
      where,
      include: {
        job: { include: { customer: { select: { id: true, name: true } } } },
      },
      orderBy: { created_at: 'desc' },
      take: 200,
    });

    return NextResponse.json({ photos, total: photos.length });
  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    const { job_id, url, type, caption } = await req.json();
    if (!job_id || !url) return NextResponse.json({ error: 'job_id and url required' }, { status: 400 });

    const photo = await prisma.job_photos.create({
      data: { job_id, url, type: type || 'general', caption: caption || null },
    });
    return NextResponse.json({ photo });
  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
