import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';
import { randomUUID } from 'crypto';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();
    const notes = await prisma.$queryRaw<{ id: string; body: string; created_at: Date }[]>`
      SELECT id, body, created_at FROM estimate_notes
      WHERE estimate_id = ${params.id}
      ORDER BY created_at DESC
    `;
    return NextResponse.json({ notes });
  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();
    const { body } = await req.json();
    if (!body?.trim()) return NextResponse.json({ error: 'body required' }, { status: 400 });

    const id = randomUUID();
    await prisma.$executeRaw`
      INSERT INTO estimate_notes (id, estimate_id, body, created_at)
      VALUES (${id}, ${params.id}, ${body.trim()}, NOW())
    `;
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(req.url);
    const comment_id = searchParams.get('comment_id');
    if (!comment_id) return NextResponse.json({ error: 'comment_id required' }, { status: 400 });

    await prisma.$executeRaw`
      DELETE FROM estimate_notes WHERE id = ${comment_id} AND estimate_id = ${params.id}
    `;
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
