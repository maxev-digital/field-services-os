/**
 * POST /api/admin/webhooks/twilio-amd
 * Async AMD callback — plays the same script MP3 as voicemail drop when a machine is detected.
 * Uses `script` param from the AMD callback URL (set at call dispatch time).
 */
import { NextRequest, NextResponse } from 'next/server';

const MACHINE_STATES  = ['machine_end_beep', 'machine_end_silence', 'machine_end_other', 'fax'];
const BASE_URL        = 'https://admin.roofworksoftexas.com';
const DEFAULT_SCRIPT  = 'script-new.mp3';

function safeScriptUrl(scriptParam: string | null): string {
  if (!scriptParam) return `${BASE_URL}/audio/${DEFAULT_SCRIPT}`;
  const safe = scriptParam.replace(/[^a-zA-Z0-9._-]/g, '');
  if (!safe.toLowerCase().endsWith('.mp3')) return `${BASE_URL}/audio/${DEFAULT_SCRIPT}`;
  return `${BASE_URL}/audio/${safe}`;
}

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const script     = searchParams.get('script') || DEFAULT_SCRIPT;
    const scriptUrl  = safeScriptUrl(script);

    const form       = await req.formData();
    const callSid    = (form.get('CallSid') as string | null) || '';
    const answeredBy = (form.get('AnsweredBy') as string | null) || '';

    if (MACHINE_STATES.includes(answeredBy) && callSid) {
      const SID   = process.env.TWILIO_ACCOUNT_SID!;
      const TOKEN = process.env.TWILIO_AUTH_TOKEN!;

      const voicemailTwiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Play>${scriptUrl}</Play><Hangup/></Response>`;

      await fetch(`https://api.twilio.com/2010-04-01/Accounts/${SID}/Calls/${callSid}.json`, {
        method:  'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${SID}:${TOKEN}`).toString('base64'),
          'Content-Type':  'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ Twiml: voicemailTwiml }).toString(),
      });
    }
  } catch (err: any) {
    console.error('[twilio-amd] error:', err.message);
  }

  return NextResponse.json({ ok: true });
}
