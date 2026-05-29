/**
 * Drip Sequence Cron — runs nightly at 9:00 AM CT (14:00 UTC)
 *
 * Wave 1 (T+48hr): SMS follow-up to prospects contacted 2 days ago, no response
 * Wave 2 (T+7day): Final email to prospects contacted 7 days ago, still no response
 *
 * PM2: { cron_restart: '0 14 * * *', autorestart: false }
 */

require('dotenv').config({ path: '/var/www/roof-works-admin/.env' });
require('dotenv').config({ path: '/var/www/roof-works-admin/.env.local' });
const { Pool } = require('pg');
const nodemailer = require('nodemailer');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false,
});

const SINCH_SERVICE_PLAN_ID = process.env.SINCH_SERVICE_PLAN_ID;
const SINCH_API_TOKEN       = process.env.SINCH_API_TOKEN;
const SINCH_FROM_NUMBER     = process.env.SINCH_FROM_NUMBER;
const NOTIFY_EMAIL          = process.env.OUTREACH_MAILBOX_1_EMAIL || 'info@roofworksoftexas.com';

const SMTP = {
  host: process.env.SMTP_HOST || 'smtp.hostinger.com',
  port: parseInt(process.env.SMTP_PORT || '465'),
  user: process.env.OUTREACH_MAILBOX_1_EMAIL,
  pass: process.env.OUTREACH_MAILBOX_1_PASS,
  name: process.env.OUTREACH_MAILBOX_1_NAME || 'Roof Works of Texas',
};

function now48hAgo() {
  const d = new Date();
  d.setHours(d.getHours() - 48);
  return d;
}

function now7dAgo() {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d;
}

async function sinchSend(to, body) {
  if (!SINCH_SERVICE_PLAN_ID || !SINCH_API_TOKEN || !SINCH_FROM_NUMBER) return null;
  const url = `https://sms.api.sinch.com/xms/v1/${SINCH_SERVICE_PLAN_ID}/batches`;
  const res = await fetch(url, {
    method:  'POST',
    headers: { 'Authorization': `Bearer ${SINCH_API_TOKEN}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ from: SINCH_FROM_NUMBER, to: [to], body }),
    signal:  AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Sinch ${res.status}: ${err}`);
  }
  return res.json();
}

async function sendEmail({ to, subject, html }) {
  if (!SMTP.user || !SMTP.pass) return;
  const transport = nodemailer.createTransport({
    host: SMTP.host, port: SMTP.port, secure: SMTP.port === 465,
    auth: { user: SMTP.user, pass: SMTP.pass },
  });
  await transport.sendMail({
    from:    `"${SMTP.name}" <${SMTP.user}>`,
    to, subject, html,
  });
}

function normalizePhone(raw) {
  const digits = (raw || '').replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

// ── Wave 1: T+48hr SMS ──────────────────────────────────────────────────────
async function wave1_sms() {
  const cutoff48 = now48hAgo();
  const cutoff96 = new Date(cutoff48); cutoff96.setHours(cutoff96.getHours() - 48); // between 48-96hr ago

  const { rows } = await pool.query(`
    SELECT id, name, phone, address
    FROM storm_prospects
    WHERE status = 'CONTACTED'
      AND phone IS NOT NULL
      AND last_contacted_at >= $1
      AND last_contacted_at < $2
  `, [cutoff96, cutoff48]);

  let sent = 0, failed = 0;
  for (const p of rows) {
    const phone = normalizePhone(p.phone);
    if (!phone) { failed++; continue; }
    const firstName = p.name ? p.name.split(' ')[0] : 'there';

    const body = `Hi ${firstName}, this is Roof Works of Texas following up on the recent hail storm in your area. We're still offering free roof inspections this week. Reply YES to schedule or call us at (214) 795-3905. Reply STOP to opt out.`;

    try {
      await sinchSend(phone, body);
      await pool.query(
        `INSERT INTO sms_log (prospect_id, phone, message, status) VALUES ($1, $2, $3, 'sent')`,
        [p.id, phone, body]
      );
      await pool.query(
        `UPDATE storm_prospects SET last_contacted_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [p.id]
      );
      sent++;
    } catch (e) {
      console.error(`[drip-wave1] SMS failed for ${p.id}:`, e.message);
      failed++;
    }
    await new Promise(r => setTimeout(r, 150));
  }

  return { wave: '1 (T+48hr SMS)', total: rows.length, sent, failed };
}

// ── Wave 2: T+7day email + mark NO_RESPONSE ─────────────────────────────────
async function wave2_email() {
  const cutoff7d  = now7dAgo();
  const cutoff14d = new Date(cutoff7d); cutoff14d.setDate(cutoff14d.getDate() - 7);

  const { rows } = await pool.query(`
    SELECT id, name, email, address, city
    FROM storm_prospects
    WHERE status = 'CONTACTED'
      AND email IS NOT NULL
      AND last_contacted_at >= $1
      AND last_contacted_at < $2
  `, [cutoff14d, cutoff7d]);

  let sent = 0, failed = 0;
  for (const p of rows) {
    const firstName = p.name ? p.name.split(' ')[0] : 'there';
    const location  = p.city || 'your area';

    try {
      await sendEmail({
        to:      p.email,
        subject: `Last chance — free roof inspection for ${location} hail storm`,
        html: `
<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;">
  <div style="background:#1a3a5c;padding:20px 24px;">
    <img src="https://roofworksoftexas.com/images/logo.png" alt="Roof Works of Texas" style="height:40px;" onerror="this.style.display='none'"/>
    <h1 style="margin:12px 0 0;color:#fff;font-size:20px;">One Last Thing, ${firstName}</h1>
  </div>
  <div style="background:#fff;padding:24px;border:1px solid #e5e7eb;">
    <p style="font-size:15px;color:#374151;">We reached out about a free roof inspection after the recent hail storm near <strong>${p.address || location}</strong>. We haven't heard back and wanted to check in one final time.</p>
    <p style="font-size:15px;color:#374151;">Hail damage is often invisible from the ground but can void your manufacturer's warranty and lead to leaks within 12–18 months. A free inspection takes under 20 minutes and we'll show you exactly what we find.</p>
    <div style="text-align:center;margin:28px 0;">
      <a href="https://roofworksoftexas.com/schedule" style="background:#dc2626;color:#fff;padding:14px 32px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:16px;display:inline-block;">Schedule My Free Inspection →</a>
    </div>
    <p style="font-size:13px;color:#6b7280;">Or call/text: <a href="tel:+12147953905" style="color:#1a3a5c;">(214) 795-3905</a></p>
    <p style="font-size:12px;color:#9ca3af;margin-top:24px;">This is our final follow-up. If you're not interested, no worries — we won't contact you again.</p>
  </div>
  <div style="padding:12px 24px;background:#f9fafb;border:1px solid #e5e7eb;border-top:none;">
    <p style="margin:0;font-size:11px;color:#9ca3af;">Roof Works of Texas · 214-795-3905 · <a href="https://roofworksoftexas.com/unsubscribe?email=${encodeURIComponent(p.email)}" style="color:#9ca3af;">Unsubscribe</a></p>
  </div>
</div>`,
      });

      // Mark NO_RESPONSE after 7-day final email
      await pool.query(
        `UPDATE storm_prospects SET status = 'NO_RESPONSE', updated_at = NOW() WHERE id = $1`,
        [p.id]
      );
      sent++;
    } catch (e) {
      console.error(`[drip-wave2] Email failed for ${p.id}:`, e.message);
      failed++;
    }
    await new Promise(r => setTimeout(r, 200));
  }

  return { wave: '2 (T+7d email + NO_RESPONSE)', total: rows.length, sent, failed };
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('[drip-sequences] Starting at', new Date().toISOString());
  const results = [];
  try {
    results.push(await wave1_sms());
    results.push(await wave2_email());
    console.log('[drip-sequences] Results:', JSON.stringify(results, null, 2));

    // Summary email to admin
    const lines = results.map(r =>
      `${r.wave}: ${r.sent}/${r.total} sent, ${r.failed} failed`
    ).join('\n');
    if (results.some(r => r.sent > 0)) {
      await sendEmail({
        to:      NOTIFY_EMAIL,
        subject: `Drip Sequences Run — ${results.reduce((a,r)=>a+r.sent,0)} messages sent`,
        html:    `<pre style="font-family:monospace;font-size:13px;">${lines}</pre>`,
      });
    }
  } catch (e) {
    console.error('[drip-sequences] Fatal error:', e);
  } finally {
    await pool.end();
  }
}

main();
