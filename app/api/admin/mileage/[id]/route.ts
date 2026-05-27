// app/api/admin/mileage/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAdmin();

    const entry = await prisma.mileage_log.findUnique({
      where: { id: params.id },
    });

    if (!entry) {
      return NextResponse.json(
        { error: 'Mileage entry not found' },
        { status: 404 }
      );
    }

    await prisma.mileage_log.delete({
      where: { id: params.id },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
