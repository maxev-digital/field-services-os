// app/api/admin/document-packets/[id]/route.ts
// GET: Single packet (includes file_data for download)
// PATCH: Update metadata
// DELETE: Remove packet

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try { await requireAdmin(); } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); }

  const packet = await prisma.document_packets.findUnique({ where: { id: params.id } });
  if (!packet) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ packet });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try { await requireAdmin(); } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); }

  try {
    const body = await req.json();
    const allowed: Record<string, unknown> = {};

    if (body.name !== undefined) allowed.name = body.name;
    if (body.display_name !== undefined) allowed.display_name = body.display_name;
    if (body.category !== undefined) allowed.category = body.category;
    if (body.is_default !== undefined) allowed.is_default = body.is_default;
    if (body.active !== undefined) allowed.active = body.active;
    if (body.sort_order !== undefined) allowed.sort_order = body.sort_order;
    if (body.file_data !== undefined) allowed.file_data = body.file_data;
    if (body.filename !== undefined) allowed.filename = body.filename;
    if (body.size_bytes !== undefined) allowed.size_bytes = body.size_bytes;

    allowed.updated_at = new Date();

    const packet = await prisma.document_packets.update({
      where: { id: params.id },
      data: allowed,
    });

    const { file_data, ...result } = packet;
    return NextResponse.json({ packet: result });
  } catch (e: any) {
    console.error('[document-packets PATCH]', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try { await requireAdmin(); } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); }

  try {
    await prisma.document_packets.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('[document-packets DELETE]', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
