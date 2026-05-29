import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();

    const report = await prisma.inspection_reports.findUnique({
      where: { id: params.id },
      include: {
        items: { orderBy: { sort_order: 'asc' } },
        photos: { orderBy: { created_at: 'asc' } },
        customer: { select: { id: true, name: true, phone: true } },
      },
    });

    if (!report) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json({ report });
  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();

    const body = await req.json();
    const allowed = ['address', 'inspector', 'inspection_date', 'weather', 'notes', 'status', 'customer_id'];
    const data: any = {};
    for (const key of allowed) {
      if (body[key] !== undefined) {
        if (key === 'inspection_date') {
          data[key] = body[key] ? new Date(body[key]) : null;
        } else {
          data[key] = body[key];
        }
      }
    }

    const report = await prisma.inspection_reports.update({
      where: { id: params.id },
      data,
    });

    return NextResponse.json({ report });
  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();

    await prisma.inspection_reports.delete({ where: { id: params.id } });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
