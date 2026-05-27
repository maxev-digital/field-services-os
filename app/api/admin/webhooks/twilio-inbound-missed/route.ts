/**
 * POST /api/admin/webhooks/twilio-inbound-missed
 * Called when owner doesn't pick up — plays voicemail prompt + records.
 */
import { NextRequest, NextResponse } from 'next/server'
import { telegramNotify } from '@/lib/telegram-notify'

const BASE_URL = 'https://admin.roofworksoftexas.com'

export async function POST(req: NextRequest) {
  const form       = await req.formData()
  const dialStatus = (form.get('DialCallStatus') as string) || ''
  const from       = (req.nextUrl.searchParams.get('from')) || ''
  const sid        = (req.nextUrl.searchParams.get('sid'))  || ''

  // If owner picked up, nothing to do
  if (dialStatus === 'completed' || dialStatus === 'answered') {
    return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`, {
      headers: { 'Content-Type': 'text/xml' },
    })
  }

  // Owner didn't answer — prompt voicemail
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Hi, you've reached Roof Works of Texas. We're unable to take your call right now. Please leave your name and number after the beep and we'll call you right back.</Say>
  <Record maxLength="60" timeout="5" playBeep="true"
    action="${BASE_URL}/api/admin/webhooks/twilio-inbound-recording?from=${encodeURIComponent(from)}" />
  <Say voice="alice">We didn't receive a recording. Please call us back at your convenience. Goodbye.</Say>
</Response>`

  telegramNotify(
    `📞 *Missed Inbound Call*\n\n📱 ${from}\n\n_Voicemail prompt played — waiting for recording..._`
  ).catch(() => {})

  return new NextResponse(twiml, {
    headers: { 'Content-Type': 'text/xml' },
  })
}
