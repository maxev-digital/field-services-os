#!/usr/bin/env node
// Retell Call Cost Auto-Sync
// Pulls completed calls from Retell API and logs costs to campaign_costs.
// Links each call back to its storm campaign via retell_calls → storm_prospects.
// PM2: pm2 start retell-sync.js --name retell-sync --cron "0 */6 * * *" --no-autorestart
'use strict';
require('dotenv').config({ path: '/var/www/roof-works-admin/.env' });
require('dotenv').config({ path: '/var/www/roof-works-admin/.env.local' });

const { Pool } = require('pg');

const db          = new Pool({ connectionString: process.env.DATABASE_URL });
const RETELL_KEY  = process.env.RETELL_API_KEY;

async function main() {
  const now = new Date().toISOString();
  console.log(`[retell-sync] ${now} — starting sync`);

  if (!RETELL_KEY) {
    console.log('[retell-sync] RETELL_API_KEY not set — skipping');
    return;
  }

  // Fetch up to 1000 recent calls from Retell
  const res = await fetch('https://api.retellai.com/v2/list-calls', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RETELL_KEY}` },
    body:    JSON.stringify({ limit: 1000 }),
    signal:  AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    console.error('[retell-sync] Retell API error:', res.status, await res.text());
    process.exit(1);
  }

  const calls = await res.json();
  console.log(`[retell-sync] Fetched ${calls.length} calls from Retell`);

  // Get already-tracked call IDs to avoid duplicates
  const tracked = await db.query(
    `SELECT metadata->>'call_id' AS cid FROM campaign_costs WHERE category = 'retell_calls' AND metadata IS NOT NULL`
  );
  const trackedIds = new Set(tracked.rows.map(r => r.cid).filter(Boolean));
  console.log(`[retell-sync] Already tracked: ${trackedIds.size} calls`);

  let synced = 0;
  let skipped = 0;

  for (const call of calls) {
    if (!call.call_id || trackedIds.has(call.call_id)) { skipped++; continue; }

    const costCents = Math.round(call.call_cost?.combined_cost ?? 0);
    // Skip calls with no cost and no duration (error/abandoned before connect)
    if (costCents === 0 && !call.duration_ms) { skipped++; continue; }

    const callDate = call.start_timestamp
      ? new Date(call.start_timestamp).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);

    // Resolve storm campaign via retell_calls → storm_prospects
    let campaignId = null;
    try {
      const rc = await db.query(
        'SELECT prospect_id FROM retell_calls WHERE call_id = $1 LIMIT 1',
        [call.call_id]
      );
      if (rc.rows[0]?.prospect_id) {
        const sp = await db.query(
          'SELECT storm_date FROM storm_prospects WHERE id = $1 LIMIT 1',
          [rc.rows[0].prospect_id]
        );
        campaignId = sp.rows[0]?.storm_date || null;
      }
    } catch { /* call not in retell_calls yet — campaignId stays null */ }

    const metadata = JSON.stringify({
      call_id:     call.call_id,
      duration_ms: call.duration_ms        ?? 0,
      to_number:   call.to_number          ?? call.from_number ?? '',
      status:      call.call_status        ?? call.status      ?? 'unknown',
      direction:   call.direction          ?? 'outbound',
      agent_id:    call.agent_id           ?? '',
      product_costs: call.call_cost?.product_costs ?? [],
    });

    const desc = `Retell AI Call${call.to_number ? ` to ${call.to_number}` : ''}`;

    await db.query(`
      INSERT INTO campaign_costs
        (id, date, category, description, amount_cents, quantity, unit_cost_cents, campaign_id, auto_tracked, metadata, created_at)
      VALUES
        (gen_random_uuid()::text, $1::date, 'retell_calls', $2, $3, 1, $3, $4, true, $5::jsonb, NOW())
    `, [callDate, desc, costCents, campaignId, metadata]);

    synced++;
  }

  console.log(`[retell-sync] Done — synced ${synced} new records, skipped ${skipped}`);
}

main()
  .catch(e => {
    console.error('[retell-sync] Fatal:', e.message);
    process.exit(1);
  })
  .finally(() => db.end().catch(() => {}));
