/**
 * Send push notifications to the owner via Telegram Bot API.
 * Non-blocking — failures are logged but never throw.
 */

export async function telegramNotify(message: string, parseMode: 'Markdown' | 'HTML' = 'Markdown') {
  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
  const CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

  console.log('[telegram-notify] BOT_TOKEN present:', !!BOT_TOKEN, '| CHAT_ID present:', !!CHAT_ID);

  if (!BOT_TOKEN || !CHAT_ID) {
    console.warn('[telegram-notify] Missing credentials — skipping');
    return;
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: message,
        parse_mode: parseMode,
      }),
    });
    const json = await res.json();
    console.log('[telegram-notify] Result:', JSON.stringify(json));
  } catch (err) {
    console.warn('[telegram-notify] Failed:', err);
  }
}

// Pre-formatted notification helpers

export function notifyNewEstimate(name: string, address: string, total: number, phone: string) {
  const msg = `💰 *New Estimate Submitted*\n\n👤 ${name}\n📍 ${address}\n📞 ${phone}\n💵 $${total.toLocaleString()}\n\n[Open Admin](https://admin.roofworksoftexas.com/admin/estimates)`;
  return telegramNotify(msg);
}

export function notifyNewContact(name: string, phone: string, message: string) {
  const msg = `📞 *New Contact Form*\n\n👤 ${name}\n📞 ${phone}\n💬 ${message.slice(0, 200)}\n\n[Open Admin](https://admin.roofworksoftexas.com/admin/customers)`;
  return telegramNotify(msg);
}

export function notifyCallCompleted(prospectName: string, phone: string, duration: number, summary: string, outcome: string) {
  const mins = Math.floor(duration / 60);
  const secs = duration % 60;
  const msg = `📱 *Call Completed*\n\n👤 ${prospectName || phone}\n⏱ ${mins}m ${secs}s\n📊 Outcome: ${outcome}\n\n💬 _${summary.slice(0, 300)}_\n\n[Listen in Call Center](https://admin.roofworksoftexas.com/admin/call-center)`;
  return telegramNotify(msg);
}

// ── IVR Keypress Notifications ───────────────────────────────────────────────

export function notifyIvrPress1(name: string, phone: string, address: string, city: string) {
  const msg = `🔴 *IVR PRESS 1 — Immediate Assistance*\n\n👤 ${name}\n📞 ${phone}\n📍 ${address}, ${city}\n\n⚡ Wants rep NOW — call back immediately\n\n[View Prospects](https://admin.roofworksoftexas.com/admin/prospects)`;
  return telegramNotify(msg);
}

export function notifyIvrPress2(name: string, phone: string, address: string) {
  const msg = `📅 *IVR PRESS 2 — Free Inspection Request*\n\n👤 ${name}\n📞 ${phone}\n📍 ${address || 'N/A'}\n\nWants inspection scheduled in 24-48 hours\n\n[View Prospects](https://admin.roofworksoftexas.com/admin/prospects)`;
  return telegramNotify(msg);
}

export function notifyIvrDNC(name: string, phone: string) {
  const msg = `🚫 *IVR PRESS 3 — DNC Opt-Out*\n\n👤 ${name}\n📞 ${phone}\n\nRemoved from list — do NOT call again`;
  return telegramNotify(msg);
}

// ── Other Notifications ──────────────────────────────────────────────────────

export function notifyAppointmentBooked(name: string, phone: string, summary: string) {
  const msg = `🗓 *Appointment Booked!*\n\n👤 ${name || 'Unknown'}\n📞 ${phone}\n\n💬 _${summary.slice(0, 300)}_\n\n[View in Admin](https://admin.roofworksoftexas.com/admin/call-center)`;
  return telegramNotify(msg);
}

export function notifyInboundCall(from: string) {
  const msg = `📞 *Inbound Call*\n\nFrom: ${from}\nWill Austin (AI) is handling it.`;
  return telegramNotify(msg);
}

export function notifySmsReply(name: string, phone: string, message: string) {
  const msg = `💬 *SMS Reply*\n\nFrom: ${name}\n📞 ${phone}\n\n"${message.slice(0, 200)}"\n\n[View SMS](https://admin.roofworksoftexas.com/admin/sms)`;
  return telegramNotify(msg);
}
