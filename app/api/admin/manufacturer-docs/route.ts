import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';
import fs from 'fs';
import path from 'path';

// GET — list all manufacturer docs
export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const docs = await prisma.manufacturer_docs.findMany({
    orderBy: [{ manufacturer: 'asc' }, { name: 'asc' }],
  });

  return NextResponse.json({ docs });
}

// POST — upload new doc (multipart)
export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  const manufacturer = formData.get('manufacturer') as string;
  const name = formData.get('name') as string;
  const description = (formData.get('description') as string) || null;

  if (!file || !manufacturer?.trim() || !name?.trim()) {
    return NextResponse.json({ error: 'file, manufacturer and name are required' }, { status: 400 });
  }

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const filename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const filepath = path.join(process.cwd(), 'public', 'docs', 'manufacturers', filename);

  // Ensure directory exists
  fs.mkdirSync(path.dirname(filepath), { recursive: true });
  fs.writeFileSync(filepath, buffer);

  const doc = await prisma.manufacturer_docs.create({
    data: {
      manufacturer: manufacturer.trim(),
      name: name.trim(),
      filename,
      description,
      size_bytes: buffer.length,
    },
  });

  return NextResponse.json({ doc }, { status: 201 });
}
