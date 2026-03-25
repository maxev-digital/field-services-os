import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/mailer'
import { wrapInBrandedEmail } from '@/lib/brandedWrapper'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth

  const customer = await prisma.customer.findUnique({ where: { id: params.id } })
  if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
  if (!customer.email) return NextResponse.json({ error: 'Customer has no email address' }, { status: 400 })

  const body = await req.json()
  const { subject, body: emailBody, from_mailbox } = body

  if (!subject || !emailBody) {
    return NextResponse.json({ error: 'subject and body are required' }, { status: 400 })
  }

  // Convert plain-text newlines to <br> for HTML body
  const htmlBody = emailBody.replace(/\n/g, '<br />')

  const html = wrapInBrandedEmail(
    `<p style="margin:0 0 12px;font-size:15px;color:#374151;">${htmlBody}</p>`,
    { preheader: subject }
  )

  const result = await sendEmail({
    to: customer.email,
    toName: customer.name,
    subject,
    html,
    mailboxIndex: from_mailbox !== undefined ? from_mailbox - 1 : 0,
  })

  if (!result.success) {
    return NextResponse.json({ error: result.error || 'Failed to send email' }, { status: 500 })
  }

  return NextResponse.json({ success: true, to: customer.email })
}
