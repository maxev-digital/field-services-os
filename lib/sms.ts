/**
 * Twilio SMS helper — sends text messages for review requests and alerts.
 * Silently skips if TWILIO_* env vars are not configured.
 */

const ACCOUNT_SID  = process.env.TWILIO_ACCOUNT_SID  || '';
const AUTH_TOKEN   = process.env.TWILIO_AUTH_TOKEN    || '';
const FROM_NUMBER  = process.env.TWILIO_FROM_NUMBER   || '';

function isConfigured() {
  return !!(ACCOUNT_SID && AUTH_TOKEN && FROM_NUMBER);
}

export async function sendSMS(to: string, body: string): Promise<boolean> {
  if (!isConfigured()) {
    console.warn('[sms] Twilio not configured — skipping SMS to', to);
    return false;
  }

  // Strip all non-digits, then ensure +1 prefix for US numbers
  const cleaned = to.replace(/\D/g, '');
  const e164 = cleaned.startsWith('1') ? `+${cleaned}` : `+1${cleaned}`;

  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Messages.json`;
    const creds = Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString('base64');

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${creds}`,
        'Content-Type':  'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: e164, From: FROM_NUMBER, Body: body }).toString(),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error('[sms] Twilio error:', err);
      return false;
    }

    return true;
  } catch (err) {
    console.error('[sms] Unexpected error:', err);
    return false;
  }
}

/**
 * Send a Google review request SMS to a customer.
 * Returns true if sent (or gracefully false if not configured).
 */
export async function sendReviewRequestSMS(opts: {
  customerName:  string;
  customerPhone: string;
  address:       string;
  reviewUrl?:    string;
}): Promise<boolean> {
  const reviewUrl = opts.reviewUrl || process.env.GOOGLE_REVIEW_URL || '';
  if (!reviewUrl) {
    console.warn('[sms] GOOGLE_REVIEW_URL not set — skipping review SMS');
    return false;
  }

  const first = opts.customerName.split(' ')[0];
  const body = `Hi ${first}, your roof replacement at ${opts.address} is complete! We'd love a quick Google review — it takes less than 1 minute and means the world to us. ${reviewUrl} — Roof Works of Texas (214) 795-3905`;

  return sendSMS(opts.customerPhone, body);
}
