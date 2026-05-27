/**
 * POST /api/admin/webhooks/twilio-inbound-recording
 * Called after voicemail is recorded — sends Telegram with recording URL.
 */
import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { telegramNotify } from '@/lib/telegram-notify'

export async function POST(req: NextRequest) {
  const form         = await req.formData()
  const recordingUrl = (form.get('RecordingUrl') as string) || ''
  const duration     = (form.get('RecordingDuration') as string) || '0'
  const from         = (req.nextUrl.searchParams.get('from')) || ''

  if (!recordingUrl || parseInt(duration) < 2) {
    return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
      headers: { 'Content-Type': 'text/xml' },
    })
  }

  // Look up prospect
  const digits = from.replace(/\D/g, '').slice(-10)
  const prospect = await prisma.storm_prospects.findFirst({
    where: {
      OR: [
        { phone:  { contains: digits } },
        { phone2: { contains: digits } },
      ]
    },
    select: { id: true, name: true, city: true }
  }).catch(() => null)

  const label = prospect
    ? `*${prospect.name}* — ${prospect.city}`
    : `Unknown (${from})`

  telegramNotify(
    `🎙 *Voicemail Left — Roof Works*\n\n${label}\n📱 ${from}\n⏱ ${duration}s\n\n[▶️ Listen](${recordingUrl}.mp3)`
  ).catch(() => {})

  // Append note to prospect
  if (prospect) {
    await prisma.storm_prospects.update({
      where: { id: prospect.id },
      data: {
        status: 'PENDING_CONFIRMATION' as any,
        updated_at: new Date(),
      }
    }).catch(() => {})
  }

  return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
    headers: { 'Content-Type': 'text/xml' },
  })
}
