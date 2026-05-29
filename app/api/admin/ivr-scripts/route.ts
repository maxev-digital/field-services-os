/**
 * GET  /api/admin/ivr-scripts  — list all active IVR scripts
 * POST /api/admin/ivr-scripts  — upload new MP3 script
 *   multipart form: name (string) + file (MP3 blob)
 *   saves to /public/audio/ — served by nginx, no rebuild needed
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

const AUDIO_DIR = join(process.cwd(), 'public', 'audio');

export async function GET() {
  try { await requireAdmin(); } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const scripts = await prisma.$queryRaw<{ id: string; name: string; filename: string; sort_order: number; created_at: Date }[]>`
    SELECT id, name, filename, sort_order, created_at
    FROM ivr_scripts
    WHERE active = true
    ORDER BY sort_order ASC, created_at ASC
  `;

  return NextResponse.json({ scripts });
}

export async function POST(req: NextRequest) {
  try { await requireAdmin(); } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const name = (form.get('name') as string | null)?.trim();
  const file = form.get('file') as File | null;

  if (!name) return NextResponse.json({ error: 'Script name required' }, { status: 400 });
  if (!file)  return NextResponse.json({ error: 'MP3 file required' }, { status: 400 });
  if (!file.name.toLowerCase().endsWith('.mp3')) {
    return NextResponse.json({ error: 'Only .mp3 files are supported' }, { status: 400 });
  }

  // Sanitize filename: lowercase, only safe chars, keep .mp3
  const base    = file.name.replace(/\.mp3$/i, '').replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
  const filename = `${base}-${Date.now()}.mp3`;
  const filePath = join(AUDIO_DIR, filename);

  // Ensure audio dir exists
  if (!existsSync(AUDIO_DIR)) {
    await mkdir(AUDIO_DIR, { recursive: true });
  }

  // Write file to disk
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(filePath, buffer);

  // Get next sort order
  const maxRes = await prisma.$queryRaw<[{ max: number | null }]>`
    SELECT MAX(sort_order) AS max FROM ivr_scripts
  `;
  const nextSort = (maxRes[0]?.max ?? 0) + 1;

  await prisma.$executeRaw`
    INSERT INTO ivr_scripts (id, name, filename, sort_order, active, created_at)
    VALUES (gen_random_uuid()::text, ${name}, ${filename}, ${nextSort}, true, NOW())
  `;

  const [created] = await prisma.$queryRaw<{ id: string; name: string; filename: string }[]>`
    SELECT id, name, filename FROM ivr_scripts WHERE filename = ${filename}
  `;

  return NextResponse.json({ success: true, script: created });
}
