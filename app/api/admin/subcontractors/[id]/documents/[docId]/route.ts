// app/api/admin/subcontractors/[id]/documents/[docId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; docId: string } }
) {
  try {
    await requireAdmin();

    const document = await prisma.subcontractor_documents.findFirst({
      where: {
        id: params.docId,
        subcontractor_id: params.id,
      },
    });

    if (!document) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(document);
  } catch (error: any) {
    if (error.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; docId: string } }
) {
  try {
    await requireAdmin();

    const document = await prisma.subcontractor_documents.findFirst({
      where: {
        id: params.docId,
        subcontractor_id: params.id,
      },
    });

    if (!document) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      );
    }

    await prisma.subcontractor_documents.delete({
      where: { id: params.docId },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
