#!/usr/bin/env node
/**
 * IVR batch runner — fires N calls at a time to NEW prospects with phones.
 * Usage: node run-ivr-batch.js [batch_size=50]
 */

const https   = require('https');
const { execSync } = require('child_process');

// Load .env.local
require('fs').readFileSync('/var/www/roof-works-admin/.env.local', 'utf8')
  .split('\n').forEach(line => {
    const eq = line.indexOf('=');
    if (eq > 0) process.env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  });

const BATCH_SIZE = parseInt(process.argv[2] || '50', 10);
const ACCT       = process.env.TWILIO_ACCOUNT_SID;
const TOKEN      = process.env.TWILIO_AUTH_TOKEN;
const FROM       = process.env.TWILIO_FROM_NUMBER || '+19723621301';
const BASE       = 'https://admin.roofworksoftexas.com';

function pg(sql) {
  const out = execSync(
    `echo ${JSON.stringify(sql)} | docker exec -i roofworks-db psql -U roofworks -d roofworks -t -A -F'|'`
  ).toString().trim();
  return out ? out.split('\n').filter(Boolean).map(r => r.split('|')) : [];
}

function twilioCall(to, prospectId) {
  return new Promise((resolve, reject) => {
    const twimlUrl  = `${BASE}/api/admin/webhooks/twilio-twiml?prospect_id=${encodeURIComponent(prospectId)}&variant=A`;
    const statusUrl = `${BASE}/api/admin/webhooks/twilio-ivr?prospect_id=${encodeURIComponent(prospectId)}&action=status&variant=A`;
    const body = new URLSearchParams({
      To:   to,
      From: FROM,
      Url:  twimlUrl,
      StatusCallback:          statusUrl,
      StatusCallbackMethod:    'POST',
      'StatusCallbackEvent[]': 'completed',
    }).toString();

    const req = https.request({
      hostname: 'api.twilio.com',
      path:     `/2010-04-01/Accounts/${ACCT}/Calls.json`,
      method:   'POST',
      headers:  {
        'Content-Type':   'application/x-www-form-urlencoded',
        'Authorization':  'Basic ' + Buffer.from(`${ACCT}:${TOKEN}`).toString('base64'),
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve({}); } });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  const rows = pg(
    `SELECT id, name, phone FROM storm_prospects WHERE status='NEW' AND phone IS NOT NULL AND id != 'test-nash-001' ORDER BY updated_at ASC LIMIT ${BATCH_SIZE}`
  );

  if (!rows.length) { console.log('No callable prospects remaining.'); process.exit(0); }
  console.log(`Firing ${rows.length} calls...\n`);

  let ok = 0, fail = 0;
  for (const [id, name, phone] of rows) {
    const digits = phone.replace(/\D/g, '');
    const e164   = digits.length === 10 ? `+1${digits}` : `+${digits}`;
    // Skip non-CONUS area codes (Puerto Rico 787/939, USVI 340, Guam 671, etc.)
    const areaCode = digits.length >= 10 ? digits.slice(-10, -7) : '';
    const skipCodes = ['787','939','340','671','684','670','268','242','246','441','345','767','473','876','664','721','758','784','869','758'];
    if (skipCodes.includes(areaCode)) {
      console.log(`  SKP ${(name || id).padEnd(30)} ${e164}  non-CONUS`);
      continue;
    }
    try {
      const res = await twilioCall(e164, id);
      if (res.sid) {
        pg(`UPDATE storm_prospects SET status='CONTACTED', call_attempts=call_attempts+1, updated_at=NOW() WHERE id='${id}'`);
        console.log(`  OK  ${(name || id).padEnd(30)} ${e164}  ${res.sid}`);
        ok++;
      } else {
        console.log(`  ERR ${(name || id).padEnd(30)} ${e164}  ${res.message || 'unknown'}`);
        fail++;
      }
    } catch (e) {
      console.log(`  ERR ${(name || id).padEnd(30)} ${e164}  ${e.message}`);
      fail++;
    }
    await new Promise(r => setTimeout(r, 250)); // 4 calls/sec max
  }

  console.log(`\nBatch done: ${ok} queued, ${fail} failed.`);
  const rem = pg(`SELECT COUNT(*) FROM storm_prospects WHERE status='NEW' AND phone IS NOT NULL AND id != 'test-nash-001'`);
  console.log(`Remaining callable: ${rem[0]?.[0] || 0}`);
}

main().catch(e => { console.error(e.message); process.exit(1); });
