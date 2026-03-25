import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();

    const { searchParams } = new URL(req.url);
    const section = searchParams.get('section');

    const photos = await prisma.inspection_photos.findMany({
      where: {
        report_id: params.id,
        ...(section ? { section } : {}),
      },
      orderBy: { created_at: 'asc' },
    });

    return NextResponse.json({ photos });
  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();

    const body = await req.json();
    const { section, photo_data, caption } = body;

    if (!section || !photo_data) {
      return NextResponse.json({ error: 'section and photo_data are required' }, { status: 400 });
    }

    const photo = await prisma.inspection_photos.create({
      data: {
        report_id: params.id,
        section,
        photo_data,
        caption: caption || null,
      },
    });

    return NextResponse.json({ photo }, { status: 201 });
  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
