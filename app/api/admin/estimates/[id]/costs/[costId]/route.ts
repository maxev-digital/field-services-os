import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; costId: string }> }
) {
  try {
    await requireAdmin();
    const { costId } = await params;
    const body = await req.json();

    const cost = await prisma.job_costs.update({
      where: { id: costId },
      data: {
        ...(body.category    != null && { category:    body.category }),
        ...(body.description != null && { description: body.description }),
        ...(body.amount      != null && { amount:      parseFloat(body.amount) }),
      },
    });

    return NextResponse.json({ cost });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; costId: string }> }
) {
  try {
    await requireAdmin();
    const { costId } = await params;
    await prisma.job_costs.delete({ where: { id: costId } });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
