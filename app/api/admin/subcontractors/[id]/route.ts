// app/api/admin/subcontractors/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAdmin();

    const subcontractor = await prisma.subcontractors.findUnique({
      where: { id: params.id },
      include: {
        documents: {
          orderBy: { created_at: 'desc' },
        },
        expenses: {
          orderBy: { date: 'desc' },
          take: 20,
        },
      },
    });

    if (!subcontractor) {
      return NextResponse.json(
        { error: 'Subcontractor not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(subcontractor);
  } catch (error: any) {
    if (error.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAdmin();

    const body = await request.json();

    if (body.hourly_rate) body.hourly_rate = parseFloat(body.hourly_rate);
    if (body.total_paid) body.total_paid = parseFloat(body.total_paid);

    const subcontractor = await prisma.subcontractors.update({
      where: { id: params.id },
      data: body,
    });

    return NextResponse.json(subcontractor);
  } catch (error: any) {
    if (error.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAdmin();

    // Cascade delete documents first
    await prisma.subcontractor_documents.deleteMany({
      where: { subcontractor_id: params.id },
    });

    await prisma.subcontractors.delete({
      where: { id: params.id },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
