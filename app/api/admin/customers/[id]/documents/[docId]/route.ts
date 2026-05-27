import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import prisma from '@/lib/prisma'
import { readFile, unlink } from 'fs/promises'
import path from 'path'

export async function GET(_req: NextRequest, { params }: { params: { id: string; docId: string } }) {
  try { await requireAdmin() } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const doc = await prisma.customer_documents.findUnique({ where: { id: params.docId } })
  if (!doc || doc.customer_id !== params.id) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const filePath = path.join(process.cwd(), 'uploads', doc.file_path)
  try {
    const buffer = await readFile(filePath)
    return new NextResponse(buffer, {
      headers: {
        'Content-Disposition': `attachment; filename="${doc.filename}"`,
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(buffer.length),
      },
    })
  } catch {
    return NextResponse.json({ error: 'File not found on disk' }, { status: 404 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string; docId: string } }) {
  try { await requireAdmin() } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const doc = await prisma.customer_documents.findUnique({ where: { id: params.docId } })
  if (!doc || doc.customer_id !== params.id) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.customer_documents.delete({ where: { id: params.docId } })

  // Best-effort file deletion
  try {
    await unlink(path.join(process.cwd(), 'uploads', doc.file_path))
  } catch { /* already gone */ }

  return NextResponse.json({ ok: true })
}
