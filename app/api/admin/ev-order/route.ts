/**
 * POST /api/admin/ev-order
 * Place a single EagleView order from any context (prospect, customer, or estimate).
 * Body: { address, city, state?, zip?, productId, prospectId?, customerId?, estimateId? }
 *
 * GET  /api/admin/ev-order?prospectId=X  |  ?customerId=X  |  ?address=X
 * Returns existing ev_report for this entity if one exists.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';
import { evPlaceOrder } from '@/lib/eagleview';
import { randomUUID } from 'crypto';

const PRODUCTS: Record<number, string> = {
  110: 'Bid Perfect',
  1:   'Premium - Residential',
  106: 'Roof',
};

function cleanCity(raw: string): string {
  return (raw || '').replace(/\s*\(.*?\)\s*/g, '').trim() || 'Dallas';
}

export async function GET(req: NextRequest) {
  try { await requireAdmin(); } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const prospectId = searchParams.get('prospectId');
  const customerId = searchParams.get('customerId');
  const address    = searchParams.get('address');

  const where: any = {};
  if (prospectId) where.prospect_id = prospectId;
  else if (customerId) where.customer_id = customerId;
  else if (address) where.address = { contains: address.split(',')[0].trim(), mode: 'insensitive' };
  else return NextResponse.json({ report: null });

  const report = await prisma.ev_reports.findFirst({
    where,
    orderBy: { created_at: 'desc' },
  });

  return NextResponse.json({ report });
}

export async function POST(req: NextRequest) {
  try { await requireAdmin(); } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { address, city, state = 'TX', zip = '', productId, prospectId, customerId, estimateId } = await req.json();

  if (!address) return NextResponse.json({ error: 'address required' }, { status: 400 });
  if (!productId) return NextResponse.json({ error: 'productId required' }, { status: 400 });
  if (!PRODUCTS[productId]) return NextResponse.json({ error: 'Invalid productId' }, { status: 400 });

  const cleanedCity = cleanCity(city || 'Dallas');
  const refId = randomUUID();

  try {
    const result = await evPlaceOrder(
      { street: address.trim(), city: cleanedCity, state, zip: zip.trim() },
      productId,
      refId,
    );

    const report = await prisma.$queryRaw<any[]>`
      INSERT INTO ev_reports
        (id, ref_id, estimate_id, prospect_id, customer_id, product_id, product_name,
         address, ev_order_id, status, updated_at)
      VALUES (
        ${randomUUID()}, ${refId},
        ${estimateId ?? null}, ${prospectId ?? null}, ${customerId ?? null},
        ${productId}, ${PRODUCTS[productId]},
        ${address + ', ' + cleanedCity + ' ' + state + ' ' + zip},
        ${result.orderId ?? null},
        'ordered',
        NOW()
      )
      RETURNING *`;

    return NextResponse.json({ ok: true, report: report[0], orderId: result.orderId });
  } catch (e: any) {
    console.error('[EV order]', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
