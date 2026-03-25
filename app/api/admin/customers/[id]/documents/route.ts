import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import prisma from '@/lib/prisma'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try { await requireAdmin() } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const docs = await prisma.customer_documents.findMany({
    where: { customer_id: params.id },
    orderBy: { uploaded_at: 'desc' },
  })
  return NextResponse.json({ documents: docs })
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try { await requireAdmin() } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const displayName = (formData.get('display_name') as string) || ''
    const docType = (formData.get('doc_type') as string) || 'other'

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    const uploadDir = path.join(process.cwd(), 'uploads', 'customers', params.id)
    await mkdir(uploadDir, { recursive: true })

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const filename = `${Date.now()}-${safeName}`
    const filePath = path.join(uploadDir, filename)
    await writeFile(filePath, buffer)

    const doc = await prisma.customer_documents.create({
      data: {
        customer_id: params.id,
        display_name: displayName || file.name,
        filename: file.name,
        doc_type: docType,
        file_path: `customers/${params.id}/${filename}`,
        size_bytes: file.size,
      },
    })

    // Log activity
    await prisma.customer_activity.create({
      data: {
        customer_id: params.id,
        type: 'DOCUMENT_UPLOADED',
        note: `Uploaded: ${displayName || file.name}`,
        created_by: 'Admin',
      },
    })

    return NextResponse.json({ document: doc }, { status: 201 })
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
