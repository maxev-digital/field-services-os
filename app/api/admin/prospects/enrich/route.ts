/**
 * POST /api/admin/prospects/enrich
 * Bulk-imports phone/email from skip tracing results back into storm_prospects.
 * 
 * Accepts JSON array of enriched records keyed by rw_id (the prospect ID).
 * Each record can have: phone, email, and optionally name corrections.
 * 
 * Body: { records: [{ rw_id, phone?, email?, name? }] }
 * Returns: { updated, skipped, not_found }
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';

export async function POST(req: NextRequest) {
  try { await requireAdmin(); } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const records: { rw_id: string; phone?: string; email?: string; name?: string }[] = body.records || [];

  if (!records.length) {
    return NextResponse.json({ error: 'records array is required' }, { status: 400 });
  }

  let updated = 0, skipped = 0, not_found = 0;

  for (const rec of records) {
    if (!rec.rw_id) { skipped++; continue; }
    if (!rec.phone && !rec.email && !rec.name) { skipped++; continue; }

    const patch: any = { updated_at: new Date() };
    if (rec.email?.includes('@'))  patch.email = rec.email.trim().toLowerCase();
    if (rec.phone?.replace(/\D/g,'').length >= 10) patch.phone = rec.phone.trim();
    if (rec.name?.trim()) patch.name = rec.name.trim();

    try {
      await prisma.storm_prospects.update({
        where: { id: rec.rw_id },
        data: patch,
      });
      updated++;
    } catch {
      not_found++;
    }
  }

  return NextResponse.json({ updated, skipped, not_found, total: records.length });
}

/**
 * GET /api/admin/prospects/enrich
 * Returns enrichment coverage stats for a storm date (or all).
 */
export async function GET(req: NextRequest) {
  try { await requireAdmin(); } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const stormDate = searchParams.get('storm_date');
  const where: any = stormDate ? { storm_date: stormDate } : {};

  const [total, withEmail, withPhone, withBoth] = await Promise.all([
    prisma.storm_prospects.count({ where }),
    prisma.storm_prospects.count({ where: { ...where, email: { not: null } } }),
    prisma.storm_prospects.count({ where: { ...where, phone: { not: null } } }),
    prisma.storm_prospects.count({ where: { ...where, email: { not: null }, phone: { not: null } } }),
  ]);

  return NextResponse.json({
    total,
    with_email: withEmail,
    with_phone: withPhone,
    with_both: withBoth,
    pct_email: total ? Math.round(withEmail * 100 / total) : 0,
    pct_phone: total ? Math.round(withPhone * 100 / total) : 0,
    needs_enrichment: total - withEmail,
  });
}
