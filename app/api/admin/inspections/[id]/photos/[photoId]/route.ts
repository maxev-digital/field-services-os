import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; photoId: string } }
) {
  try {
    await requireAdmin();

    const photo = await prisma.inspection_photos.findUnique({
      where: { id: params.photoId },
    });

    if (!photo) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (photo.report_id !== params.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await prisma.inspection_photos.delete({ where: { id: params.photoId } });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
