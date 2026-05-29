#!/usr/bin/env node
/**
 * Inspection Reminder System
 * Runs nightly at 8pm CT via PM2 cron.
 * Finds prospects with status=INTERESTED who have an inspection scheduled tomorrow.
 * Sends a reminder call via Retell AI + email to owner.
 *
 * PM2 setup (run once):
 *   pm2 start /var/www/roof-works-admin/scripts/inspection-reminder.js \
 *     --name inspection-reminder --cron "0 20 * * *" --no-autorestart
 *   pm2 save
 *
 * "Inspection tomorrow" is inferred from notes field containing a date
 * matching tomorrow's date (set when booking via AI call).
 */
'use strict';
require('dotenv').config({ path: '/var/www/roof-works-admin/.env' });
require('dotenv').config({ path: '/var/www/roof-works-admin/.env.local' });

const { Client } = require('pg');
const nodemailer  = require('nodemailer');
const https       = require('https');

const RETELL_KEY      = process.env.RETELL_API_KEY;
const REMINDER_AGENT  = process.env.REMINDER_AGENT_ID || process.env.STORM_AGENT_ID || 'agent_fa054c925359221f1bbd80784a';
const NOTIFY_EMAIL    = process.env.OUTREACH_MAILBOX_1_EMAIL || 'info@roofworksoftexas.com';
const SMTP_HOST       = process.env.SMTP_HOST || 'smtp.hostinger.com';
const SMTP_PORT       = parseInt(process.env.SMTP_PORT || '465');
const SMTP_USER       = process.env.OUTREACH_MAILBOX_1_EMAIL;
const SMTP_PASS       = process.env.OUTREACH_MAILBOX_1_PASS;
const FROM_NUMBER     = process.env.RETELL_FROM_NUMBER || '+12144915254';

const DB_URL = process.env.DATABASE_URL || 'postgresql://roofworks:roofworks_secure_2026@localhost:5440/roofworks';

function tomorrowCT() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - 360); // UTC-6
  d.setDate(d.getDate() + 1);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = d.getFullYear();
  return { iso: `${yyyy}-${mm}-${dd}`, human: `${mm}/${dd}/${yyyy}` };
}

async function getInterestedProspects(client, tomorrow) {
  // Find INTERESTED prospects whose notes mention tomorrow's date
  const result = await client.query(`
    SELECT id, name, phone, address, city, notes
    FROM storm_prospects
    WHERE status = 'INTERESTED'
      AND phone IS NOT NULL
      AND (
        notes ILIKE $1
        OR notes ILIKE $2
      )
  `, [`%${tomorrow.iso}%`, `%${tomorrow.human}%`]);
  return result.rows;
}

async function sendReminderCall(prospect) {
  if (!RETELL_KEY) {
    console.log(`[reminder] No Retell key — skipping call for ${prospect.name}`);
    return { skipped: true };
  }

  const payload = JSON.stringify({
    from_number:        FROM_NUMBER,
    to_number:          prospect.phone,
    override_agent_id:  REMINDER_AGENT,
    retell_llm_dynamic_variables: {
      prospect_name:    prospect.name || 'there',
      prospect_address: prospect.address || '',
      prospect_city:    prospect.city || '',
      call_type:        'reminder',
    },
  });

  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.retellai.com',
      path:     '/v2/create-phone-call',
      method:   'POST',
      headers:  {
        'Authorization':  `Bearer ${RETELL_KEY}`,
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        const parsed = JSON.parse(data || '{}');
        console.log(`[reminder] Call dispatched for ${prospect.name}: ${res.statusCode} ${parsed.call_id || parsed.error || ''}`);
        resolve({ call_id: parsed.call_id, status: res.statusCode });
      });
    });
    req.on('error', e => { console.error('[reminder] Call error:', e.message); resolve({ error: e.message }); });
    req.write(payload);
    req.end();
  });
}

async function sendSummaryEmail(prospects, tomorrow) {
  if (!SMTP_PASS || prospects.length === 0) return;

  const transport = nodemailer.createTransport({
    host: SMTP_HOST, port: SMTP_PORT, secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  const rows = prospects.map(p => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;">${p.name || 'Unknown'}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;">${p.phone}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;">${p.address}, ${p.city}</td>
    </tr>`).join('');

  await transport.sendMail({
    from:    `"Roof Works Admin" <${SMTP_USER}>`,
    to:      NOTIFY_EMAIL,
    subject: `📅 ${prospects.length} Inspection Reminder${prospects.length > 1 ? 's' : ''} Sent — ${tomorrow.human}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:600px;padding:24px;">
      <h2 style="color:#1a3a5c;margin:0 0 16px;">Inspection Reminders Dispatched</h2>
      <p style="color:#4b5563;margin:0 0 16px;">AI reminder calls sent for <strong>${prospects.length}</strong> inspection${prospects.length > 1 ? 's' : ''} scheduled tomorrow (${tomorrow.human}).</p>
      <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <thead style="background:#f9fafb;">
          <tr>
            <th style="padding:10px 12px;text-align:left;font-size:12px;color:#6b7280;text-transform:uppercase;">Name</th>
            <th style="padding:10px 12px;text-align:left;font-size:12px;color:#6b7280;text-transform:uppercase;">Phone</th>
            <th style="padding:10px 12px;text-align:left;font-size:12px;color:#6b7280;text-transform:uppercase;">Address</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="margin:16px 0 0;font-size:12px;color:#9ca3af;">Roof Works of Texas · Automated Reminder System</p>
    </div>`,
  });
}

async function main() {
  const tomorrow = tomorrowCT();
  console.log(`[reminder] ${new Date().toISOString()} — checking for inspections on ${tomorrow.iso}`);

  const client = new Client({ connectionString: DB_URL });
  try {
    await client.connect();
    const prospects = await getInterestedProspects(client, tomorrow);
    console.log(`[reminder] ${prospects.length} inspection${prospects.length === 1 ? '' : 's'} found for ${tomorrow.human}`);

    if (prospects.length === 0) {
      console.log('[reminder] Nothing to do — exiting');
      return;
    }

    for (const p of prospects) {
      await sendReminderCall(p);
      await new Promise(r => setTimeout(r, 1500)); // brief pause between calls
    }

    await sendSummaryEmail(prospects, tomorrow);
    console.log(`[reminder] Done — ${prospects.length} reminder${prospects.length > 1 ? 's' : ''} sent`);
  } catch (e) {
    console.error('[reminder] Fatal:', e.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
