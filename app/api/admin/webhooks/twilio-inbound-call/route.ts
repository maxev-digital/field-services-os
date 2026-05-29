/**
 * POST /api/admin/webhooks/twilio-inbound-call
 * Handles inbound calls to the Roof Works Twilio number.
 * 1. Looks up caller in storm_prospects
 * 2. Fires Telegram notification with prospect context
 * 3. Dials owner's cell with a whisper
 * 4. If no answer → records voicemail
 */
import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { telegramNotify } from '@/lib/telegram-notify'

const OWNER_CELL  = '2147953905'
const BASE_URL    = 'https://admin.roofworksoftexas.com'
const TWILIO_SID  = process.env.TWILIO_ACCOUNT_SID!
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN!

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return `+${digits}`
}

const EMPTY_TWIML = `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`

export async function GET() {
  return new NextResponse(EMPTY_TWIML, { headers: { 'Content-Type': 'text/xml' } })
}

export async function POST(req: NextRequest) {
  const form = await req.formData()
  const from    = (form.get('From')    as string) || ''
  const callSid = (form.get('CallSid') as string) || ''

  // Look up in storm_prospects
  const digits = from.replace(/\D/g, '').slice(-10)
  const prospect = await prisma.storm_prospects.findFirst({
    where: {
      OR: [
        { phone:  { contains: digits } },
        { phone2: { contains: digits } },
      ]
    },
    select: { name: true, city: true, address: true, status: true }
  }).catch(() => null)

  const label = prospect
    ? `*${prospect.name}* — ${prospect.city || 'Unknown'}\n📍 ${prospect.address || ''}\nStatus: ${prospect.status}`
    : `Unknown number: ${from}`

  // Fire Telegram immediately
  telegramNotify(
    `📞 *Inbound Call — Roof Works*\n\n${label}\n📱 ${from}\n\n_Ringing your cell now..._`
  ).catch(() => {})

  // TwiML: whisper then dial owner's cell; fallback to voicemail
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial timeout="20" action="${BASE_URL}/api/admin/webhooks/twilio-inbound-missed?from=${encodeURIComponent(from)}&amp;sid=${encodeURIComponent(callSid)}">
    <Number url="${BASE_URL}/api/admin/webhooks/twilio-inbound-whisper">${OWNER_CELL}</Number>
  </Dial>
</Response>`

  return new NextResponse(twiml, {
    headers: { 'Content-Type': 'text/xml' },
  })
}
