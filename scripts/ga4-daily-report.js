/**
 * GA4 Daily Report — runs at 8am CT via PM2 cron
 * Sends yesterday's analytics summary to Telegram
 * Uses Node built-ins only (no extra packages)
 */
'use strict';
const fs      = require('fs');
const crypto  = require('crypto');
const https   = require('https');
const path    = require('path');

const SA_PATH  = '/var/www/roof-works-admin/credentials/ga4-service-account.json';
const ENV_PATH = '/var/www/roof-works-admin/.env';
const GA4_PROPERTY = '528553629';

// ── Load .env ──────────────────────────────────────────────────────────────
function loadEnv(filePath) {
  const env = {};
  try {
    fs.readFileSync(filePath, 'utf8').split('\n').forEach(line => {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    });
  } catch {}
  return env;
}

// ── HTTP helper ────────────────────────────────────────────────────────────
function post(url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = typeof body === 'string' ? body : JSON.stringify(body);
    const req = https.request({
      hostname: u.hostname, path: u.pathname + u.search,
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), ...headers }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(JSON.parse(d)));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// ── JWT + access token ─────────────────────────────────────────────────────
function b64url(s) {
  return Buffer.from(s).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
}

async function getAccessToken(sa) {
  const now  = Math.floor(Date.now() / 1000);
  const header  = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({
    iss: sa.client_email, scope: 'https://www.googleapis.com/auth/analytics.readonly',
    aud: 'https://oauth2.googleapis.com/token', exp: now + 3600, iat: now,
  }));
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(`${header}.${payload}`);
  const sig = sign.sign(sa.private_key, 'base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
  const jwt = `${header}.${payload}.${sig}`;

  const params = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: jwt,
  });
  const res = await post('https://oauth2.googleapis.com/token', params.toString(), {
    'Content-Type': 'application/x-www-form-urlencoded',
  });
  if (!res.access_token) throw new Error('Token error: ' + JSON.stringify(res));
  return res.access_token;
}

// ── GA4 query ──────────────────────────────────────────────────────────────
async function queryGA4(token, dateRange, dimensions, metrics) {
  return post(
    `https://analyticsdata.googleapis.com/v1beta/properties/${GA4_PROPERTY}:runReport`,
    { dateRanges: [dateRange], dimensions, metrics, limit: 10 },
    { Authorization: `Bearer ${token}` }
  );
}

// ── Format duration ────────────────────────────────────────────────────────
function fmtDuration(secs) {
  const s = Math.round(Number(secs));
  if (s < 60) return `${s}s`;
  return `${Math.floor(s/60)}m ${s%60}s`;
}

// ── Telegram send ──────────────────────────────────────────────────────────
async function sendTelegram(botToken, chatId, text) {
  await post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    chat_id: chatId, text, parse_mode: 'Markdown',
  });
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  const env = loadEnv(ENV_PATH);
  const sa  = JSON.parse(fs.readFileSync(SA_PATH, 'utf8'));
  const BOT = env.TELEGRAM_BOT_TOKEN;
  const CID = env.TELEGRAM_CHAT_ID;
  if (!BOT || !CID) { console.error('Missing Telegram env vars'); process.exit(1); }

  const token = await getAccessToken(sa);

  // Yesterday in CT (UTC-5/UTC-6)
  const now = new Date();
  now.setHours(now.getHours() - 6); // approximate CT
  const yest = new Date(now);
  yest.setDate(yest.getDate() - 1);
  const dateStr = yest.toISOString().slice(0, 10);
  const dateRange = { startDate: dateStr, endDate: dateStr };

  // Core metrics
  const core = await queryGA4(token, dateRange, [], [
    { name: 'sessions' },
    { name: 'totalUsers' },
    { name: 'newUsers' },
    { name: 'screenPageViews' },
    { name: 'averageSessionDuration' },
    { name: 'conversions' },
    { name: 'bounceRate' },
  ]);

  const r = core.rows?.[0]?.metricValues || [];
  const sessions  = r[0]?.value || '0';
  const users     = r[1]?.value || '0';
  const newUsers  = r[2]?.value || '0';
  const pageviews = r[3]?.value || '0';
  const avgDur    = fmtDuration(r[4]?.value || 0);
  const convs     = r[5]?.value || '0';
  const bounce    = r[6]?.value ? (Number(r[6].value) * 100).toFixed(0) + '%' : 'N/A';

  // Top pages
  const pages = await queryGA4(token, dateRange,
    [{ name: 'pagePath' }], [{ name: 'screenPageViews' }]);
  const topPages = (pages.rows || []).slice(0, 5)
    .map(row => `  ${row.dimensionValues[0].value} (${row.metricValues[0].value})`)
    .join('\n') || '  No data';

  // Traffic sources
  const sources = await queryGA4(token, dateRange,
    [{ name: 'sessionDefaultChannelGroup' }], [{ name: 'sessions' }]);
  const topSources = (sources.rows || []).slice(0, 5)
    .map(row => `  ${row.dimensionValues[0].value}: ${row.metricValues[0].value}`)
    .join('\n') || '  No data';

  // Format date nicely
  const displayDate = yest.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

  const msg = `*Roof Works — Daily GA4 Report*
_${displayDate}_

*Traffic*
Sessions: *${sessions}*
Users: *${users}* (${newUsers} new)
Pageviews: *${pageviews}*
Avg Session: *${avgDur}*
Bounce Rate: *${bounce}*
Conversions: *${convs}*

*Top Pages*
${topPages}

*Traffic Sources*
${topSources}

[Open GA4](https://analytics.google.com/analytics/web/#/p${GA4_PROPERTY}/reports/home)`;

  await sendTelegram(BOT, CID, msg);
  console.log(`[ga4-daily] Report sent for ${dateStr}`);
}

main().catch(err => {
  console.error('[ga4-daily] Error:', err.message);
  process.exit(1);
});
