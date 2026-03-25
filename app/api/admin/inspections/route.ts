import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';
import { INSPECTION_SECTIONS } from '@/lib/inspection-sections';

export async function GET(_req: NextRequest) {
  try {
    await requireAdmin();

    const reports = await prisma.inspection_reports.findMany({
      orderBy: { created_at: 'desc' },
      include: {
        customer: { select: { id: true, name: true } },
        _count: { select: { items: { where: { damaged: true } } } },
      },
    });

    return NextResponse.json({ reports });
  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();

    const body = await req.json();
    const { address, job_id, customer_id, inspector, inspection_date, weather } = body;

    if (!address) return NextResponse.json({ error: 'address is required' }, { status: 400 });

    const report = await prisma.inspection_reports.create({
      data: {
        address,
        job_id: job_id || null,
        customer_id: customer_id || null,
        inspector: inspector || null,
        inspection_date: inspection_date ? new Date(inspection_date) : null,
        weather: weather || null,
      },
    });

    const itemsData = INSPECTION_SECTIONS.map((section, idx) => ({
      report_id: report.id,
      section: section.key,
      damaged: false,
      data: {},
      sort_order: idx,
    }));

    await prisma.inspection_items.createMany({ data: itemsData });

    return NextResponse.json({ report }, { status: 201 });
  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
