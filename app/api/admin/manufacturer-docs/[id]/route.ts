import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';
import fs from 'fs';
import path from 'path';

// PATCH — toggle active or update name/description
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();

  const doc = await prisma.manufacturer_docs.update({
    where: { id },
    data: {
      ...(body.active !== undefined && { active: body.active }),
      ...(body.name !== undefined && { name: body.name }),
      ...(body.description !== undefined && { description: body.description }),
    },
  });

  return NextResponse.json({ doc });
}

// DELETE — remove DB record + file
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  const doc = await prisma.manufacturer_docs.findUnique({ where: { id } });
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Delete file from filesystem
  const filepath = path.join(process.cwd(), 'public', 'docs', 'manufacturers', doc.filename);
  try {
    fs.unlinkSync(filepath);
  } catch {
    // File may not exist — continue
  }

  await prisma.manufacturer_docs.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
