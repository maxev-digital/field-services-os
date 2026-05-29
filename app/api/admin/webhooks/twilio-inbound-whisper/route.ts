/**
 * POST /api/admin/webhooks/twilio-inbound-whisper
 * Whisper TwiML — plays in YOUR ear before the call bridges.
 */
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Roof Works inbound. Prospect calling back.</Say>
</Response>`

  return new NextResponse(twiml, {
    headers: { 'Content-Type': 'text/xml' },
  })
}
