import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import prisma from '@/lib/prisma'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try { await requireAdmin() } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const template = await prisma.outreach_templates.findUnique({ where: { id: params.id } })
  if (!template) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(template)
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try { await requireAdmin() } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const body = await req.json()
  const { subject, emailBody, variables, variant, category, is_active } = body

  const data: Record<string, unknown> = {}
  if (subject !== undefined) data.subject = subject
  if (emailBody !== undefined) data.body = emailBody
  if (variables !== undefined) data.variables = variables
  if (variant !== undefined) data.variant = variant
  if (category !== undefined) data.category = category
  if (is_active !== undefined) data.is_active = is_active

  const template = await prisma.outreach_templates.update({ where: { id: params.id }, data })
  return NextResponse.json(template)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try { await requireAdmin() } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  await prisma.outreach_templates.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}
