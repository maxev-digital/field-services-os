/**
 * SMS helper — uses Sinch (primary). Twilio kept as fallback if configured.
 */
import fs from 'fs';
import path from 'path';

const SINCH_PLAN_ID  = process.env.SINCH_SERVICE_PLAN_ID || '';
const SINCH_TOKEN    = process.env.SINCH_API_TOKEN        || '';
const SINCH_FROM     = process.env.SINCH_FROM_NUMBER      || '';

const TWILIO_SID     = process.env.TWILIO_ACCOUNT_SID  || '';
const TWILIO_TOKEN   = process.env.TWILIO_AUTH_TOKEN   || '';
const TWILIO_FROM    = process.env.TWILIO_FROM_NUMBER  || '';

function toE164(raw: string): string {
  const d = raw.replace(/\D/g, '');
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith('1')) return `+${d}`;
  return `+${d}`;
}

function getGoogleReviewUrl(): string {
  if (process.env.GOOGLE_REVIEW_URL) return process.env.GOOGLE_REVIEW_URL;
  try {
    const file = path.join(process.cwd(), 'data', 'admin-settings.json');
    const settings = JSON.parse(fs.readFileSync(file, 'utf8'));
    return settings.googleReviewUrl || '';
  } catch {
    return '';
  }
}

async function sendViaSinch(to: string, body: string): Promise<boolean> {
  if (!SINCH_PLAN_ID || !SINCH_TOKEN || !SINCH_FROM) return false;
  try {
    const res = await fetch(
      `https://us.sms.api.sinch.com/xms/v1/${SINCH_PLAN_ID}/batches`,
      {
        method:  'POST',
        headers: {
          'Authorization': `Bearer ${SINCH_TOKEN}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({ from: SINCH_FROM, to: [to], body }),
        signal: AbortSignal.timeout(15000),
      }
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error('[sms:sinch] error:', err);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[sms:sinch] fetch error:', err);
    return false;
  }
}

async function sendViaTwilio(to: string, body: string): Promise<boolean> {
  if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_FROM) return false;
  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`,
      {
        method:  'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64'),
          'Content-Type':  'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ To: to, From: TWILIO_FROM, Body: body }).toString(),
        signal: AbortSignal.timeout(15000),
      }
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error('[sms:twilio] error:', err);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[sms:twilio] fetch error:', err);
    return false;
  }
}

export async function sendSMS(to: string, body: string): Promise<boolean> {
  const e164 = toE164(to);
  // Try Sinch first, fall back to Twilio
  if (await sendViaSinch(e164, body)) return true;
  return sendViaTwilio(e164, body);
}

export async function sendReviewRequestSMS(opts: {
  customerName:  string;
  customerPhone: string;
  address:       string;
  reviewUrl?:    string;
}): Promise<boolean> {
  const reviewUrl = opts.reviewUrl || getGoogleReviewUrl();
  if (!reviewUrl) {
    console.warn('[sms] Google Review URL not set — configure in Settings');
    return false;
  }
  const first = opts.customerName.split(' ')[0];
  const body  = `Hi ${first}, your roof replacement at ${opts.address} is complete! We'd love a quick Google review — it takes less than 1 minute and means the world to us. ${reviewUrl} — Roof Works of Texas (214) 795-3905`;
  return sendSMS(opts.customerPhone, body);
}
