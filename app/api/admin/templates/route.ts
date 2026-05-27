import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import prisma from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try { await requireAdmin() } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const { searchParams } = new URL(req.url)
  const category = searchParams.get('category')
  const where = category ? { category } : {}

  const rows = await prisma.outreach_templates.findMany({
    where,
    orderBy: [{ category: 'asc' }, { created_at: 'asc' }],
  })
  // Expose `name` (variant) so the frontend can display a readable label
  const templates = rows.map(t => ({ ...t, name: t.variant }))
  return NextResponse.json({ templates })
}

export async function POST(req: NextRequest) {
  try { await requireAdmin() } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const body = await req.json()
  const { slug, category, variant, subject, emailBody, variables } = body

  if (!slug || !subject || !emailBody) {
    return NextResponse.json({ error: 'slug, subject, and emailBody are required' }, { status: 400 })
  }

  const template = await prisma.outreach_templates.create({
    data: {
      slug,
      category: category || 'roofing_outreach',
      variant: variant || 'v1',
      subject,
      body: emailBody,
      variables: variables || [],
    },
  })
  return NextResponse.json(template, { status: 201 })
}
