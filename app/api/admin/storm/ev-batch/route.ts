/**
 * POST /api/admin/storm/ev-batch
 * Orders EagleView Premium reports for a batch of storm prospects.
 * Filters: storm_date, has_phone, has_email, max_count, prospect_ids[]
 *
 * GET  /api/admin/storm/ev-batch?storm_date=YYYY-MM-DD
 * Returns batch order status for a storm date.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';
import { evPlaceOrder } from '@/lib/eagleview';
import { randomUUID } from 'crypto';

function cleanCity(raw: string): string {
  // "MESQUITE (DALLAS CO)" -> "MESQUITE"
  return (raw || '').replace(/\s*\(.*\)\s*/, '').trim();
}

function parseAddress(addr: string, city: string, zip: string) {
  const street = addr?.trim() ?? '';
  const cleanedCity = cleanCity(city || 'Dallas');
  return { street, city: cleanedCity, state: 'TX', zip: zip?.trim() ?? '' };
}

export async function POST(req: NextRequest) {
  try { await requireAdmin(); } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { storm_date, filter = 'has_phone', max_count = 50, prospect_ids } = body;

  let prospects: any[];

  if (Array.isArray(prospect_ids) && prospect_ids.length > 0) {
    prospects = await prisma.$queryRaw`
      SELECT id, name, address, city, zip
      FROM storm_prospects
      WHERE id = ANY(${prospect_ids})
        AND address IS NOT NULL`;
  } else {
    const where: any = { address: { not: null } };
    if (storm_date) where.storm_date = storm_date;
    if (filter === 'has_phone') where.phone = { not: null };
    if (filter === 'has_email') where.email = { not: null };
    if (filter === 'has_contact') where.OR = [{ phone: { not: null } }, { email: { not: null } }];

    prospects = await prisma.storm_prospects.findMany({
      where,
      select: { id: true, name: true, address: true, city: true, zip: true },
      take: Math.min(max_count, 200),
    });
  }

  if (prospects.length === 0) {
    return NextResponse.json({ error: 'No matching prospects found' }, { status: 400 });
  }

  // Skip any that already have an ev_report
  const existingReports = await prisma.ev_reports.findMany({
    where: { ref_id: { in: prospects.map(p => p.id) } },
    select: { ref_id: true },
  });
  const alreadyOrdered = new Set(existingReports.map(r => r.ref_id));
  const toOrder = prospects.filter(p => !alreadyOrdered.has(p.id));

  if (toOrder.length === 0) {
    return NextResponse.json({ message: 'All prospects already have EV reports', skipped: prospects.length });
  }

  const results = { ordered: 0, failed: 0, skipped: alreadyOrdered.size, errors: [] as string[] };

  for (const p of toOrder) {
    try {
      const addr = parseAddress(p.address, p.city, p.zip);
      const refId = randomUUID();

      const result = await evPlaceOrder(addr, 1, refId);

      await prisma.ev_reports.create({
        data: {
          id:          randomUUID(),
          ref_id:      refId,
          estimate_id: null,
          product_id:  1,
          product_name: 'Premium - Residential',
          address:     p.address + ', ' + cleanCity(p.city || '') + ' TX ' + (p.zip || ''),
          ev_order_id: result.orderId ?? null,
          status:      'ordered',
          updated_at:  new Date(),
        },
      });

      // Tag prospect with ev_ordered note
      await prisma.$executeRaw`
        UPDATE storm_prospects
        SET notes = COALESCE(notes || E'\n', '') || ${'[EV ordered ' + new Date().toISOString().split('T')[0] + ' orderId=' + result.orderId + ']'},
            updated_at = NOW()
        WHERE id = ${p.id}`;

      results.ordered++;
    } catch (e: any) {
      results.failed++;
      results.errors.push(p.address + ': ' + e.message);
      console.error('[EV batch] Failed for', p.address, e.message);
    }
    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 300));
  }

  return NextResponse.json({
    success: true,
    storm_date,
    ...results,
    cost_estimate: '$' + (results.ordered * 30) + '–$' + (results.ordered * 75),
  });
}

export async function GET(req: NextRequest) {
  try { await requireAdmin(); } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const storm_date = req.nextUrl.searchParams.get('storm_date');

  if (req.nextUrl.searchParams.get('dates') === 'true') {
    const dates = await prisma.$queryRaw`
      SELECT storm_date, COUNT(*)::int AS count
      FROM storm_prospects
      WHERE storm_date IS NOT NULL
      GROUP BY storm_date
      ORDER BY storm_date DESC
    `;
    return NextResponse.json({ dates });
  }

  // Count prospects eligible for EV
  const [total, hasPhone, hasEmail, evOrdered, evCompleted] = await Promise.all([
    prisma.storm_prospects.count({ where: storm_date ? { storm_date } : {} }),
    prisma.storm_prospects.count({ where: { ...(storm_date ? { storm_date } : {}), phone: { not: null } } }),
    prisma.storm_prospects.count({ where: { ...(storm_date ? { storm_date } : {}), email: { not: null } } }),
    prisma.ev_reports.count({ where: { status: 'ordered' } }),
    prisma.ev_reports.count({ where: { status: 'completed' } }),
  ]);

  const recentOrders = await prisma.ev_reports.findMany({
    orderBy: { created_at: 'desc' },
    take: 50,
    select: { id: true, address: true, status: true, ev_order_id: true, created_at: true, pdf_url: true },
  });

  return NextResponse.json({
    storm_date,
    prospects: { total, has_phone: hasPhone, has_email: hasEmail },
    ev_reports: { ordered: evOrdered, completed: evCompleted },
    recent_orders: recentOrders,
  });
}
