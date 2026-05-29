/**
 * POST /api/admin/storm/enrich
 * Batch-enriches storm prospects with phone + email via BatchData skip-trace API.
 * Replaces the manual CSV upload → BatchSkipTracing workflow.
 *
 * Env: BATCHDATA_API_KEY
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';

const API_KEY = process.env.BATCHDATA_API_KEY ?? '';
const BD_URL  = 'https://api.batchdata.com/api/v1/property/skip-trace';

function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

export async function POST(req: NextRequest) {
  try { await requireAdmin(); } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { prospect_ids } = await req.json();

  if (!Array.isArray(prospect_ids) || prospect_ids.length === 0) {
    return NextResponse.json({ error: 'prospect_ids required' }, { status: 400 });
  }
  if (prospect_ids.length > 200) {
    return NextResponse.json({ error: 'Max 200 per batch' }, { status: 400 });
  }
  if (!API_KEY) {
    return NextResponse.json({
      error: 'BATCHDATA_API_KEY not configured in .env.local',
      setup: 'Sign up at batchdata.com → API Keys → copy key → add to .env.local',
    }, { status: 503 });
  }

  // Fetch prospects that need enrichment (no phone OR no email)
  const prospects = await prisma.storm_prospects.findMany({
    where: {
      id: { in: prospect_ids },
      OR: [
        { phone: null },
        { email: null },
      ],
    },
    select: { id: true, name: true, address: true, city: true, zip: true },
  });

  if (prospects.length === 0) {
    return NextResponse.json({ message: 'All prospects already enriched', enriched: 0 });
  }

  // Build BatchData request
  const requests = prospects.map(p => ({
    address: {
      street: p.address?.split(',')[0]?.trim() ?? p.address ?? '',
      city:   p.city ?? 'Dallas',
      state:  'TX',
      zip:    p.zip ?? '',
    },
    metaData: { internalId: p.id },
  }));

  const bdRes = await fetch(BD_URL, {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({ requests }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!bdRes.ok) {
    const err = await bdRes.text();
    return NextResponse.json({ error: `BatchData API ${bdRes.status}: ${err}` }, { status: 502 });
  }

  const data = await bdRes.json();
  const results = data?.results ?? data?.data ?? [];

  let enriched = 0;
  let skipped  = 0;

  for (const result of results) {
    const prospectId = result?.metaData?.internalId ?? result?.input?.metaData?.internalId;
    if (!prospectId) { skipped++; continue; }

    // Extract best phone (prefer mobile)
    const phones: any[] = result?.person?.phones ?? result?.phones ?? [];
    const mobile = phones.find((p: any) => p.type === 'mobile' || p.phoneType === 'Mobile');
    const rawPhone = mobile?.phone ?? mobile?.number ?? phones[0]?.phone ?? phones[0]?.number ?? null;
    const phone = rawPhone ? normalizePhone(String(rawPhone)) : null;

    // Extract best email
    const emails: any[] = result?.person?.emails ?? result?.emails ?? [];
    const email = emails[0]?.email ?? emails[0]?.address ?? null;

    if (!phone && !email) { skipped++; continue; }

    const update: any = {};
    if (phone) update.phone = phone;
    if (email) update.email = email;
    update.updated_at = new Date();

    await prisma.storm_prospects.update({
      where: { id: prospectId },
      data:  update,
    });
    enriched++;
  }

  return NextResponse.json({
    success:   true,
    requested: prospects.length,
    enriched,
    skipped,
    cost_estimate: `~$${(prospects.length * 0.15).toFixed(2)} (at $0.15/record)`,
  });
}

/**
 * GET /api/admin/storm/enrich?storm_date=YYYY-MM-DD
 * Preview: how many prospects in a storm event need enrichment
 */
export async function GET(req: NextRequest) {
  try { await requireAdmin(); } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const storm_date = req.nextUrl.searchParams.get('storm_date');
  const where: any = { OR: [{ phone: null }, { email: null }] };
  if (storm_date) where.storm_date = storm_date;

  const [total, needsEnrichment] = await Promise.all([
    prisma.storm_prospects.count({ where: storm_date ? { storm_date } : {} }),
    prisma.storm_prospects.count({ where }),
  ]);

  return NextResponse.json({
    total,
    needs_enrichment: needsEnrichment,
    estimated_cost:   `~$${(needsEnrichment * 0.15).toFixed(2)}`,
    api_configured:   !!API_KEY,
  });
}
