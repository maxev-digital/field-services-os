'use strict';
/**
 * Daily Campaign Report — runs at 8am CT via PM2 cron
 * Sends yesterday's campaign summary to Telegram
 */
const https  = require('https');
const fs     = require('fs');
const { Client } = require('pg');

const ENV_PATH = '/var/www/roof-works-admin/.env';
const DB_URL   = 'postgresql://roofworks:roofworks_secure_2026@localhost:5440/roofworks';

function loadEnv(p) {
  const e = {};
  try { fs.readFileSync(p,'utf8').split('\n').forEach(l => { const m=l.match(/^([^#=]+)=(.*)/); if(m) e[m[1].trim()]=m[2].trim().replace(/^["']|["']$/g,''); }); } catch{}
  return e;
}

function post(url, body) {
  return new Promise((res, rej) => {
    const u = new URL(url);
    const d = JSON.stringify(body);
    const req = https.request({ hostname: u.hostname, path: u.pathname, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) }
    }, r => { let s=''; r.on('data',c=>s+=c); r.on('end',()=>res(JSON.parse(s))); });
    req.on('error', rej); req.write(d); req.end();
  });
}

function pct(a, b) {
  if (!b) return '0%';
  return (a / b * 100).toFixed(1) + '%';
}

async function main() {
  const env = loadEnv(ENV_PATH);
  const BOT = env.TELEGRAM_BOT_TOKEN;
  const CID = env.TELEGRAM_CHAT_ID;
  if (!BOT || !CID) { console.error('Missing Telegram credentials'); process.exit(1); }

  const db = new Client({ connectionString: DB_URL });
  await db.connect();

  // Yesterday's date range in CT (UTC-5 / UTC-6)
  const now = new Date();
  const yest = new Date(now);
  yest.setDate(yest.getDate() - 1);
  const yestStr = yest.toISOString().slice(0, 10);
  const start = `${yestStr} 00:00:00-05`;
  const end   = `${yestStr} 23:59:59-05`;

  // ── IVR Calls ─────────────────────────────────────────────────────────
  const ivrTotal = await db.query(
    `SELECT COUNT(*) FROM ivr_calls WHERE created_at >= $1 AND created_at <= $2`, [start, end]);
  const ivrByStatus = await db.query(
    `SELECT status, COUNT(*) as cnt FROM ivr_calls WHERE created_at >= $1 AND created_at <= $2 GROUP BY status ORDER BY cnt DESC`, [start, end]);
  const ivrVariants = await db.query(
    `SELECT script_variant, COUNT(*) as cnt,
      SUM(CASE WHEN status='interested' THEN 1 ELSE 0 END) as leads
     FROM ivr_calls WHERE created_at >= $1 AND created_at <= $2 AND script_variant IS NOT NULL
     GROUP BY script_variant ORDER BY script_variant`, [start, end]);

  const totalCalls = parseInt(ivrTotal.rows[0].count);
  const statusMap = {};
  ivrByStatus.rows.forEach(r => statusMap[r.status] = parseInt(r.cnt));
  const interested = statusMap['interested'] || 0;
  const voicemail  = statusMap['voicemail']  || 0;
  const dnc        = statusMap['dnc']        || 0;
  const noInput    = statusMap['no_input']   || 0;

  // ── SMS ───────────────────────────────────────────────────────────────
  const smsOut = await db.query(
    `SELECT COUNT(*) FROM sms_log WHERE created_at >= $1 AND created_at <= $2`, [start, end]);
  const smsIn = await db.query(
    `SELECT COUNT(*) FROM sms_replies WHERE created_at >= $1 AND created_at <= $2`, [start, end]);

  // ── Enrichment ────────────────────────────────────────────────────────
  const enriched = await db.query(
    `SELECT COUNT(*) FROM storm_prospects WHERE phone IS NOT NULL AND updated_at >= $1 AND updated_at <= $2`, [start, end]);
  const newProspects = await db.query(
    `SELECT COUNT(*) FROM storm_prospects WHERE created_at >= $1 AND created_at <= $2`, [start, end]);

  // ── Estimates / Form Fills ─────────────────────────────────────────────
  const estCount = await db.query(
    `SELECT COUNT(*) FROM estimates WHERE created_at >= $1 AND created_at <= $2`, [start, end]);
  const estTotal = await db.query(
    `SELECT COALESCE(SUM(our_total),0) as total FROM estimates WHERE created_at >= $1 AND created_at <= $2`, [start, end]);

  // ── DNC adds ──────────────────────────────────────────────────────────
  const dncAdds = await db.query(
    `SELECT COUNT(*) FROM dnc_list WHERE created_at >= $1 AND created_at <= $2`, [start, end]);

  await db.end();

  // ── Format variant breakdown ──────────────────────────────────────────
  let variantLines = '';
  if (ivrVariants.rows.length) {
    variantLines = '\n*A/B Variants:*\n' + ivrVariants.rows.map(r =>
      `  Script ${r.script_variant}: ${r.cnt} calls, ${r.leads} leads (${pct(r.leads, r.cnt)})`
    ).join('\n');
  }

  // ── Display date ──────────────────────────────────────────────────────
  const displayDate = yest.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'America/Chicago' });
  const estDollars = parseFloat(estTotal.rows[0].total).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

  const msg =
`*Roof Works — Daily Campaign Report*
_${displayDate}_

*IVR Calls*
Total Dialed: *${totalCalls}*
Leads (pressed 1 or 2): *${interested}* (${pct(interested, totalCalls)})
Voicemail: *${voicemail}*
No Input: *${noInput}*
DNC (pressed 3): *${dnc}*${variantLines}

*SMS*
Outbound Sent: *${parseInt(smsOut.rows[0].count)}*
Inbound Replies: *${parseInt(smsIn.rows[0].count)}*

*Prospects*
New Records Added: *${parseInt(newProspects.rows[0].count)}*
Enriched (got phone): *${parseInt(enriched.rows[0].count)}*
DNC Adds: *${parseInt(dncAdds.rows[0].count)}*

*Form Fills / Estimates*
New Estimates: *${parseInt(estCount.rows[0].count)}*
Estimate Value: *${estDollars}*

https://admin.roofworksoftexas.com/admin/prospects`;

  await post(`https://api.telegram.org/bot${BOT}/sendMessage`, {
    chat_id: CID, text: msg, parse_mode: 'Markdown',
  });

  console.log(`[campaign-daily] Report sent for ${yestStr}`);
}

main().catch(err => {
  console.error('[campaign-daily] Error:', err.message);
  process.exit(1);
});
