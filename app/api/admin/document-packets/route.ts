// app/api/admin/document-packets/route.ts
// GET: List all packets (optionally filtered by doc_type)
// POST: Create new packet (JSON with base64 file_data)

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try { await requireAdmin(); } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); }

  const url = new URL(req.url);
  const docType = url.searchParams.get('doc_type');

  const where: Record<string, unknown> = {};
  if (docType) where.doc_type = docType;

  const packets = await prisma.document_packets.findMany({
    where,
    orderBy: [{ doc_type: 'asc' }, { sort_order: 'asc' }, { name: 'asc' }],
  });

  // Strip file_data from list response (too large)
  const result = packets.map(({ file_data, ...rest }) => rest);

  return NextResponse.json({ packets: result });
}

export async function POST(req: NextRequest) {
  try { await requireAdmin(); } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); }

  try {
    const body = await req.json();
    const { name, doc_type, category, filename, display_name, file_data, size_bytes, is_default, sort_order } = body;

    if (!name?.trim() || !doc_type?.trim() || !filename?.trim() || !display_name?.trim()) {
      return NextResponse.json({ error: 'name, doc_type, filename, and display_name are required' }, { status: 400 });
    }

    if (!['pre_project', 'post_project'].includes(doc_type)) {
      return NextResponse.json({ error: 'doc_type must be pre_project or post_project' }, { status: 400 });
    }

    const packet = await prisma.document_packets.create({
      data: {
        name: name.trim(),
        doc_type,
        category: category || 'general',
        filename: filename.trim(),
        display_name: display_name.trim(),
        file_data: file_data || null,
        size_bytes: size_bytes || 0,
        is_default: is_default ?? false,
        sort_order: sort_order ?? 0,
      },
    });

    // Return without file_data
    const { file_data: _, ...result } = packet;
    return NextResponse.json({ packet: result }, { status: 201 });
  } catch (e: any) {
    console.error('[document-packets POST]', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
