/**
 * POST /api/admin/prospects/skip-trace
 * BatchData property skip-trace — phones + emails stored per prospect.
 *
 * Actual BatchData response shape (verified May 2026):
 *   data.results.persons = array (one entry per request, in order)
 *   each person: { meta: { matched }, phoneNumbers: [...], emails: [...], name, dnc, litigator, death }
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';

const BATCHDATA_API_KEY = process.env.BATCH_SKIP_TRACE_API_KEY!;
const BATCHDATA_URL     = 'https://api.batchdata.com/api/v1/property/skip-trace';
const BATCH_SIZE        = 100;

function formatPhone(raw: string): string {
  const d = String(raw).replace(/\D/g, '');
  return d.length === 10 ? `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}` : d;
}

export async function POST(req: NextRequest) {
  try { await requireAdmin(); } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { prospect_ids } = await req.json();
  if (!Array.isArray(prospect_ids) || !prospect_ids.length) {
    return NextResponse.json({ error: 'prospect_ids required' }, { status: 400 });
  }
  if (prospect_ids.length > 500) {
    return NextResponse.json({ error: 'Max 500 prospects per skip trace run' }, { status: 400 });
  }

  const prospects = await prisma.storm_prospects.findMany({
    where: { id: { in: prospect_ids }, phone: null },
    select: { id: true, name: true, address: true, city: true, zip: true },
  });

  if (!prospects.length) {
    return NextResponse.json({ message: 'All selected prospects already have phone numbers', found: 0, updated: 0 });
  }

  let found   = 0;
  let updated = 0;
  const errors: string[] = [];

  for (let i = 0; i < prospects.length; i += BATCH_SIZE) {
    const batch = prospects.slice(i, i + BATCH_SIZE);

    const requests = batch.map(p => ({
      propertyAddress: {
        street: p.address || '',
        city:   p.city    || 'Fort Worth',
        state:  'TX',
        zip:    (p.zip || '').slice(0, 5),
      },
    }));

    // data.results.persons = array indexed by request order
    let persons: any[] = [];
    try {
      const res = await fetch(BATCHDATA_URL, {
        method:  'POST',
        headers: { 'Authorization': `Bearer ${BATCHDATA_API_KEY}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ requests }),
        signal:  AbortSignal.timeout(30000),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = data?.status?.message || data?.message || `HTTP ${res.status}`;
        errors.push(`BatchData error: ${msg}`);
        if (res.status === 403) {
          return NextResponse.json({ error: `BatchData: ${msg}`, found, updated, total_sent: prospects.length }, { status: 402 });
        }
        continue;
      }
      // Actual response: data.results.persons = array, one entry per request
      persons = Array.isArray(data?.results?.persons) ? data.results.persons : [];
    } catch (e: any) {
      errors.push(`Batch ${i}-${i + batch.length}: ${e.message}`);
      continue;
    }

    for (let j = 0; j < batch.length; j++) {
      const prospect = batch[j];
      const person   = persons[j];
      if (!person?.meta?.matched) continue;

      // Skip deceased or litigators — mark DNC and move on
      if (person.death?.deceased) {
        await prisma.$executeRaw`UPDATE storm_prospects SET status = 'DNC'::"ProspectStatus", updated_at = NOW() WHERE id = ${prospect.id}`;
        continue;
      }
      if (person.litigator) {
        await prisma.$executeRaw`UPDATE storm_prospects SET status = 'DNC'::"ProspectStatus", litigator = true, updated_at = NOW() WHERE id = ${prospect.id}`;
        continue;
      }

      // ── Phones ────────────────────────────────────────────────────────────
      const rawPhones: any[] = person.phoneNumbers || [];
      const sorted = [
        ...rawPhones.filter((p: any) => p.type === 'Mobile' && p.number),
        ...rawPhones.filter((p: any) => p.type !== 'Mobile' && p.number),
      ];
      const phone  = sorted[0]?.number ? formatPhone(sorted[0].number) : null;
      const phone2 = sorted[1]?.number ? formatPhone(sorted[1].number) : null;
      if (!phone) continue;

      // ── Emails ────────────────────────────────────────────────────────────
      const emailList: string[] = [];
      for (const e of (person.emails || [])) {
        const addr = typeof e === 'string' ? e : (e.email || '');
        const clean = addr.toLowerCase().trim();
        if (clean && clean.includes('@') && !emailList.includes(clean)) emailList.push(clean);
        if (emailList.length >= 3) break;
      }
      const [email, email2, email3] = emailList;

      // ── Name ──────────────────────────────────────────────────────────────
      const fullName = [person.name?.first, person.name?.last].filter(Boolean).join(' ');

      // ── DNC at person level ────────────────────────────────────────────────
      const isDnc = person.dnc?.tcpa === true;

      // ── Update prospect ────────────────────────────────────────────────────
      try {
        await prisma.$executeRaw`
          UPDATE storm_prospects SET
            phone      = ${phone},
            phone2     = COALESCE(${phone2 ?? null}, phone2),
            email      = COALESCE(${email  ?? null}, email),
            email2     = COALESCE(${email2 ?? null}, email2),
            email3     = COALESCE(${email3 ?? null}, email3),
            name       = CASE WHEN name IS NULL OR name = '' THEN ${fullName || null} ELSE name END,
            status     = CASE WHEN ${isDnc} THEN 'DNC'::"ProspectStatus" ELSE status END,
            updated_at = NOW()
          WHERE id = ${prospect.id}
        `;
        found++;
        updated++;
      } catch {}
    }
  }

  // Cost tracking
  const totalCostCents = prospects.length * 12;
  try {
    await prisma.$executeRaw`
      INSERT INTO campaign_costs (id, date, category, description, amount_cents, quantity, unit_cost_cents, auto_tracked, metadata, created_at)
      VALUES (
        gen_random_uuid()::text, NOW()::date, 'skip_trace',
        ${'Skip trace — ' + prospects.length + ' records, ' + found + ' found'},
        ${totalCostCents}, ${prospects.length}, 12, true,
        ${JSON.stringify({ total_sent: prospects.length, found, updated, errors: errors.length })}::jsonb,
        NOW()
      )
    `;
  } catch (e) { console.warn('[skip-trace] cost log failed:', e); }

  return NextResponse.json({
    success:           true,
    total_sent:        prospects.length,
    found,
    updated,
    already_had_phone: prospect_ids.length - prospects.length,
    cost_logged:       `$${(totalCostCents / 100).toFixed(2)} (${prospects.length} × $0.12)`,
    errors:            errors.length ? errors : undefined,
  });
}
