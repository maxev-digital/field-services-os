// app/api/admin/subcontractors/[id]/documents/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAdmin();

    const documents = await prisma.subcontractor_documents.findMany({
      where: { subcontractor_id: params.id },
      orderBy: { created_at: 'desc' },
    });

    return NextResponse.json(documents);
  } catch (error: any) {
    if (error.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAdmin();

    const body = await request.json();
    const { file_data, doc_type, display_name, filename, expires_at } = body;

    if (!file_data || !doc_type || !filename) {
      return NextResponse.json(
        { error: 'file_data, doc_type, and filename are required' },
        { status: 400 }
      );
    }

    // Verify subcontractor exists
    const subcontractor = await prisma.subcontractors.findUnique({
      where: { id: params.id },
    });

    if (!subcontractor) {
      return NextResponse.json(
        { error: 'Subcontractor not found' },
        { status: 404 }
      );
    }

    const document = await prisma.subcontractor_documents.create({
      data: {
        subcontractor_id: params.id,
        doc_type,
        display_name: display_name || filename,
        filename,
        file_data,
        expires_at: expires_at ? new Date(expires_at) : null,
      },
    });

    return NextResponse.json(document, { status: 201 });
  } catch (error: any) {
    if (error.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
