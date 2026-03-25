#!/usr/bin/env node
/**
 * Storm Hail Alert System
 * Checks NOAA SPC for DFW-area hail events and emails info@roofworksoftexas.com.
 * Run via PM2 cron every 30 minutes.
 *
 * PM2 setup (run once on VPS):
 *   pm2 start /var/www/roof-works-admin/scripts/storm-alert.js \
 *     --name storm-alert --cron "0,30 * * * *" --no-autorestart
 *   pm2 save
 */

'use strict';
require('dotenv').config({ path: '/var/www/roof-works-admin/.env' });

const nodemailer = require('nodemailer');
const fs         = require('fs');

const ALERT_LOG    = '/tmp/storm_alerts.json';
const ALERT_EMAIL  = process.env.OUTREACH_MAILBOX_1_EMAIL || 'info@roofworksoftexas.com';
const SMTP_USER    = process.env.OUTREACH_MAILBOX_1_EMAIL;
const SMTP_PASS    = process.env.OUTREACH_MAILBOX_1_PASS;
const ADMIN_URL    = 'https://admin.roofworksoftexas.com/admin/storm';

// Generous DFW bounding box
const LAT_MIN = 31.5, LAT_MAX = 34.5;
const LON_MIN = -99.5, LON_MAX = -94.0;

const DFW_COUNTIES = [
  'Dallas','Collin','Denton','Tarrant','Rockwall',
  'Kaufman','Johnson','Ellis','Parker','Wise'
];

function ctDate() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - 360); // UTC-6
  const yy = String(d.getFullYear()).slice(2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}${mm}${dd}`;
}

function hailLabel(sizeHundredths) {
  const i = sizeHundredths / 100;
  if (i >= 3.0) return 'CATASTROPHIC';
  if (i >= 2.0) return 'MAJOR';
  if (i >= 1.5) return 'SIGNIFICANT';
  if (i >= 1.0) return 'DAMAGING';
  return 'MODERATE';
}

function hailColor(sizeHundredths) {
  const i = sizeHundredths / 100;
  if (i >= 3.0) return '#7c3aed';
  if (i >= 2.0) return '#dc2626';
  if (i >= 1.5) return '#ea580c';
  if (i >= 1.0) return '#d97706';
  return '#16a34a';
}

async function fetchDfwHail(date) {
  const url = `https://www.spc.noaa.gov/climo/reports/${date}_rpts_filtered_hail.csv`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'RoofWorksAdmin/1.0' },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) return [];
  const text = await res.text();
  const lines = text.replace(/\r/g, '').trim().split('\n');
  if (lines.length < 2) return [];
  return lines.slice(1).flatMap(line => {
    const c = line.split(',');
    if (c.length < 7) return [];
    const lat  = parseFloat(c[5]);
    const lon  = parseFloat(c[6]);
    const size = parseInt(c[1], 10);
    if (isNaN(lat) || isNaN(lon) || isNaN(size)) return [];
    if (lat < LAT_MIN || lat > LAT_MAX || lon < LON_MIN || lon > LON_MAX) return [];
    return [{ time: c[0]?.trim(), size, sizeIn: (size / 100).toFixed(2), location: c[2]?.trim(), county: c[3]?.trim(), state: c[4]?.trim(), lat, lon }];
  });
}

function loadLog() {
  try { return JSON.parse(fs.readFileSync(ALERT_LOG, 'utf8')); } catch { return {}; }
}
function saveLog(log) {
  fs.writeFileSync(ALERT_LOG, JSON.stringify(log, null, 2));
}

function buildEmail(events, date) {
  const byCounty = {};
  for (const e of events) {
    if (!byCounty[e.county]) byCounty[e.county] = { events: [], maxSize: 0, isDfw: DFW_COUNTIES.includes(e.county) };
    byCounty[e.county].events.push(e);
    if (e.size > byCounty[e.county].maxSize) byCounty[e.county].maxSize = e.size;
  }

  const sorted = Object.entries(byCounty).sort((a, b) => b[1].maxSize - a[1].maxSize);
  const maxHail = Math.max(...events.map(e => e.size));
  const dfwCount = sorted.filter(([, d]) => d.isDfw).length;

  const rows = sorted.map(([county, d]) => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #1f2937;font-weight:${d.isDfw ? 'bold' : 'normal'};color:${d.isDfw ? '#fbbf24' : '#e5e7eb'}">
        ${d.isDfw ? '⚠ ' : ''}${county}, ${d.events[0].state}
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #1f2937;font-weight:bold;color:${hailColor(d.maxSize)}">
        ${(d.maxSize / 100).toFixed(2)}" — ${hailLabel(d.maxSize)}
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #1f2937;color:#9ca3af;text-align:center">
        ${d.events.length}
      </td>
    </tr>`).join('');

  const dateFormatted = `20${date.slice(0,2)}-${date.slice(2,4)}-${date.slice(4,6)}`;

  const html = `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<div style="max-width:600px;margin:0 auto;padding:24px">

  <!-- Header -->
  <div style="background:#111827;border:1px solid #374151;border-radius:12px;padding:24px;margin-bottom:16px">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
      <span style="font-size:28px">⛈️</span>
      <div>
        <h1 style="margin:0;color:#fbbf24;font-size:20px">DFW Hail Alert</h1>
        <p style="margin:4px 0 0;color:#6b7280;font-size:13px">${dateFormatted} · NOAA SPC Observer Reports</p>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">
      <div style="background:#1f2937;border-radius:8px;padding:12px;text-align:center">
        <div style="font-size:24px;font-weight:bold;color:#f97316">${(maxHail/100).toFixed(2)}"</div>
        <div style="font-size:11px;color:#6b7280;margin-top:2px">Largest Hail</div>
      </div>
      <div style="background:#1f2937;border-radius:8px;padding:12px;text-align:center">
        <div style="font-size:24px;font-weight:bold;color:#60a5fa">${events.length}</div>
        <div style="font-size:11px;color:#6b7280;margin-top:2px">Total Reports</div>
      </div>
      <div style="background:${dfwCount > 0 ? '#7f1d1d' : '#1f2937'};border-radius:8px;padding:12px;text-align:center">
        <div style="font-size:24px;font-weight:bold;color:${dfwCount > 0 ? '#fca5a5' : '#9ca3af'}">${dfwCount}</div>
        <div style="font-size:11px;color:#6b7280;margin-top:2px">Core DFW Counties</div>
      </div>
    </div>
  </div>

  <!-- County table -->
  <div style="background:#111827;border:1px solid #374151;border-radius:12px;overflow:hidden;margin-bottom:16px">
    <div style="padding:12px 16px;border-bottom:1px solid #1f2937;background:#0f172a">
      <span style="color:#9ca3af;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em">Affected Counties</span>
    </div>
    <table style="width:100%;border-collapse:collapse">
      <thead>
        <tr style="background:#0f172a">
          <th style="padding:8px 12px;text-align:left;color:#6b7280;font-size:11px;font-weight:600;text-transform:uppercase">County</th>
          <th style="padding:8px 12px;text-align:left;color:#6b7280;font-size:11px;font-weight:600;text-transform:uppercase">Max Hail</th>
          <th style="padding:8px 12px;text-align:center;color:#6b7280;font-size:11px;font-weight:600;text-transform:uppercase">Reports</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>

  <!-- CTA -->
  <div style="text-align:center;margin-bottom:16px">
    <a href="${ADMIN_URL}" style="display:inline-block;background:#ca8a04;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px">
      Open Storm Dashboard →
    </a>
  </div>

  <p style="color:#374151;font-size:11px;text-align:center;margin:0">
    Roof Works of Texas · Automated Storm Alert · Data: NOAA SPC<br>
    <a href="${ADMIN_URL}" style="color:#4b5563">Manage alerts in admin panel</a>
  </p>
</div>
</body>
</html>`;

  const maxCounty = sorted[0][0];
  const subject = dfwCount > 0
    ? `⚠️ DFW Hail Alert: ${(maxHail/100).toFixed(2)}" in ${dfwCount} core county${dfwCount > 1 ? 'ies' : ''} — ${dateFormatted}`
    : `🌩 Nearby Hail: ${(maxHail/100).toFixed(2)}" near ${maxCounty} — ${dateFormatted}`;

  return { html, subject };
}

async function sendAlert(events, date) {
  if (!SMTP_PASS) {
    console.error('[storm-alert] SMTP password not set — add OUTREACH_MAILBOX_1_PASS to .env');
    return false;
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.hostinger.com',
    port: parseInt(process.env.SMTP_PORT || '465'),
    secure: true,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  const { html, subject } = buildEmail(events, date);

  await transporter.sendMail({
    from: `"Roof Works Storm Alert" <${SMTP_USER}>`,
    to: ALERT_EMAIL,
    subject,
    html,
  });

  return true;
}

async function main() {
  const date = ctDate();
  console.log(`[storm-alert] ${new Date().toISOString()} — checking SPC for ${date}`);

  let events;
  try {
    events = await fetchDfwHail(date);
  } catch (e) {
    console.error('[storm-alert] Fetch failed:', e.message);
    return;
  }

  console.log(`[storm-alert] ${events.length} DFW-area hail events found`);

  if (events.length === 0) {
    console.log('[storm-alert] No events — done');
    return;
  }

  const log = loadLog();
  const prev = log[date];

  // Only alert if this is new or there are more reports than last time
  if (prev && prev.count >= events.length) {
    console.log(`[storm-alert] Already alerted for ${date} (${prev.count} events) — skipping`);
    return;
  }

  console.log(`[storm-alert] Sending alert email to ${ALERT_EMAIL}...`);
  try {
    const sent = await sendAlert(events, date);
    if (sent) {
      log[date] = { count: events.length, sentAt: new Date().toISOString() };
      saveLog(log);
      console.log(`[storm-alert] ✓ Alert sent for ${events.length} events`);
    }
  } catch (e) {
    console.error('[storm-alert] Email send failed:', e.message);
  }
}

main().catch(e => { console.error('[storm-alert] Fatal:', e.message); process.exit(1); });
