import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import prisma from '@/lib/prisma'
import { wrapInBrandedEmail } from '@/lib/email/brandedWrapper'
import nodemailer from 'nodemailer'

function substituteVars(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '')
}

function getTransporter(mailbox: number) {
  const email = process.env[`OUTREACH_MAILBOX_${mailbox}_EMAIL`]
  const pass = process.env[`OUTREACH_MAILBOX_${mailbox}_PASS`]
  if (!email || !pass) throw new Error(`Mailbox ${mailbox} not configured`)
  return {
    transporter: nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.hostinger.com',
      port: parseInt(process.env.SMTP_PORT || '465'),
      secure: true,
      auth: { user: email, pass },
    }),
    fromEmail: email,
  }
}

// POST /api/admin/outreach/send
// body: {
//   prospect_ids: string[],
//   template_id: string,
//   mailbox?: number,
//   custom_subject?: string,   // override template subject (for inline single-send)
//   custom_body?: string,      // override template body HTML (for inline single-send)
// }
export async function POST(req: NextRequest) {
  try { await requireAdmin() } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const body = await req.json()
  const { prospect_ids, template_id, mailbox = 1, custom_subject, custom_body } = body

  if (!prospect_ids?.length || !template_id) {
    return NextResponse.json({ error: 'prospect_ids and template_id required' }, { status: 400 })
  }

  const tmpl = await prisma.outreach_templates.findUnique({ where: { id: template_id } })
  if (!tmpl) return NextResponse.json({ error: 'Template not found' }, { status: 404 })

  let transport: nodemailer.Transporter
  let fromEmail: string
  try {
    const t = getTransporter(mailbox)
    transport = t.transporter
    fromEmail = t.fromEmail
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }

  const prospects = await prisma.storm_prospects.findMany({
    where: { id: { in: prospect_ids } },
  })

  const results: { id: string; status: string; error?: string }[] = []

  for (const prospect of prospects) {
    if (!prospect.email) {
      results.push({ id: prospect.id, status: 'skipped_no_email' })
      continue
    }

    const vars: Record<string, string> = {
      name: prospect.name || 'Homeowner',
      address: prospect.address,
      city: prospect.city,
      phone: prospect.phone || '',
    }

    // Allow custom subject/body override (inline single-send with edited text)
    const subject = custom_subject ?? substituteVars(tmpl.subject, vars)
    const rawBody = custom_body ?? substituteVars(tmpl.body, vars)
    const html = wrapInBrandedEmail(rawBody, { preheader: subject })

    try {
      await transport.sendMail({
        from: `Roof Works of Texas <${fromEmail}>`,
        to: prospect.email,
        subject,
        html,
      })
      await prisma.outreach_history.create({
        data: { prospect_id: prospect.id, template_id: tmpl.id, from_email: fromEmail, subject, status: 'sent' },
      })
      await prisma.storm_prospects.update({
        where: { id: prospect.id },
        data: { status: 'CONTACTED', last_contacted_at: new Date() },
      })
      results.push({ id: prospect.id, status: 'sent' })
    } catch (e: unknown) {
      const errMsg = (e as Error).message
      await prisma.outreach_history.create({
        data: { prospect_id: prospect.id, template_id: tmpl.id, from_email: fromEmail, subject, status: 'failed', error_msg: errMsg },
      })
      results.push({ id: prospect.id, status: 'failed', error: errMsg })
    }
  }

  const sent = results.filter((r) => r.status === 'sent').length
  const failed = results.filter((r) => r.status === 'failed').length
  const skipped = results.filter((r) => r.status === 'skipped_no_email').length

  return NextResponse.json({ sent, failed, skipped, results })
}
