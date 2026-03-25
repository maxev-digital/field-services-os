import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { wrapInBrandedEmail } from '@/lib/email/brandedWrapper'
import nodemailer from 'nodemailer'

function substituteVars(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '')
}

// GET /api/admin/outreach/cron?secret=CRON_SECRET
// Called by external cron daily
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const secret = searchParams.get('secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const startTime = Date.now()
  const config = await prisma.outreach_scheduler_config.findFirst()
  if (!config || config.is_paused) {
    return NextResponse.json({ skipped: true, reason: config ? 'paused' : 'no config' })
  }

  const tmpl = config.template_slug
    ? await prisma.outreach_templates.findUnique({ where: { slug: config.template_slug } })
    : await prisma.outreach_templates.findFirst({ where: { is_active: true } })

  if (!tmpl) return NextResponse.json({ skipped: true, reason: 'no template' })

  const cooldownCutoff = new Date(Date.now() - config.contact_cooldown_days * 86400 * 1000)
  const prospects = await prisma.storm_prospects.findMany({
    where: {
      status: 'NEW',
      email: { not: null },
      OR: [{ last_contacted_at: null }, { last_contacted_at: { lt: cooldownCutoff } }],
    },
    take: config.daily_cap,
  })

  const fromEmail = process.env.OUTREACH_MAILBOX_1_EMAIL!
  const fromPass = process.env.OUTREACH_MAILBOX_1_PASS!
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.hostinger.com',
    port: parseInt(process.env.SMTP_PORT || '465'),
    secure: true,
    auth: { user: fromEmail, pass: fromPass },
  })

  let sent = 0, failed = 0, skipped = 0

  for (const prospect of prospects) {
    if (!prospect.email) { skipped++; continue }
    const vars: Record<string, string> = {
      name: prospect.name || 'Homeowner',
      address: prospect.address,
      city: prospect.city,
      phone: prospect.phone || '',
    }
    const subject = substituteVars(tmpl.subject, vars)
    const html = wrapInBrandedEmail(substituteVars(tmpl.body, vars), { preheader: subject })

    try {
      await transport.sendMail({ from: `Roof Works of Texas <${fromEmail}>`, to: prospect.email!, subject, html })
      await prisma.outreach_history.create({
        data: { prospect_id: prospect.id, template_id: tmpl.id, from_email: fromEmail, subject, status: 'sent' },
      })
      await prisma.storm_prospects.update({
        where: { id: prospect.id },
        data: { status: 'CONTACTED', last_contacted_at: new Date() },
      })
      sent++
    } catch (e: unknown) {
      await prisma.outreach_history.create({
        data: { prospect_id: prospect.id, template_id: tmpl.id, from_email: fromEmail, subject, status: 'failed', error_msg: (e as Error).message },
      })
      failed++
    }
  }

  const duration_ms = Date.now() - startTime
  const run = await prisma.outreach_runs.create({
    data: { sent_count: sent, failed_count: failed, skipped_count: skipped, duration_ms, triggered_by: 'cron' },
  })
  await prisma.outreach_scheduler_config.update({
    where: { id: config.id },
    data: {
      last_run_at: new Date(), last_run_sent: sent, last_run_failed: failed,
      last_run_skipped: skipped, total_sent_alltime: { increment: sent },
    },
  })

  return NextResponse.json({ run_id: run.id, sent, failed, skipped, duration_ms })
}
