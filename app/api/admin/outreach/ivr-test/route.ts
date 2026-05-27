/**
 * POST /api/admin/outreach/ivr-test
 * Fires a single test IVR call to a given phone number.
 * No prospect record needed — used by admins to audition scripts.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { telegramNotify } from '@/lib/telegram-notify';

const TWILIO_SID   = process.env.TWILIO_ACCOUNT_SID!;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN!;
const TWILIO_FROM  = process.env.TWILIO_FROM_NUMBER!;
const BASE_URL     = 'https://admin.roofworksoftexas.com';
const DEFAULT_SCRIPT = 'script-new.mp3';

function normalizePhone(raw: string): string {
  const d = raw.replace(/\D/g, '');
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith('1')) return `+${d}`;
  return `+${d}`;
}

function safeScript(s: string | null): string {
  if (!s) return DEFAULT_SCRIPT;
  const safe = s.replace(/[^a-zA-Z0-9._-]/g, '');
  return safe.toLowerCase().endsWith('.mp3') ? safe : DEFAULT_SCRIPT;
}

export async function POST(req: NextRequest) {
  try { await requireAdmin(); } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { phone, script_filename } = await req.json();
  if (!phone) return NextResponse.json({ error: 'phone required' }, { status: 400 });

  const to        = normalizePhone(phone);
  const scriptFile = safeScript(script_filename);
  const twimlUrl  = `${BASE_URL}/api/admin/webhooks/twilio-twiml?prospect_id=test&script=${encodeURIComponent(scriptFile)}`;

  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Calls.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To:   to,
          From: TWILIO_FROM,
          Url:  twimlUrl,
        }).toString(),
      }
    );

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: `Twilio: ${err}` }, { status: 500 });
    }

    const call = await res.json();
    telegramNotify(`🧪 *IVR Test Call Dispatched*\n\n📞 To: ${to}\n🎙 Script: \`${scriptFile}\`\n\nPress 1 or 2 to test the response flow.`).catch(() => {});
    return NextResponse.json({ success: true, call_sid: call.sid, to, script: scriptFile });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
