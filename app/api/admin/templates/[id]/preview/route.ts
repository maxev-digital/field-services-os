import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import prisma from '@/lib/prisma'
import { wrapInBrandedEmail } from '@/lib/email/brandedWrapper'

function substituteVars(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`)
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try { await requireAdmin() } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const tmpl = await prisma.outreach_templates.findUnique({ where: { id: params.id } })
  if (!tmpl) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const vars: Record<string, string> = body.variables || {}

  const renderedBody = substituteVars(tmpl.body, vars)
  const renderedSubject = substituteVars(tmpl.subject, vars)
  const html = wrapInBrandedEmail(renderedBody, { preheader: renderedSubject })

  return NextResponse.json({ html, subject: renderedSubject })
}
