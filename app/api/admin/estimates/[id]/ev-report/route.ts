import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/admin-auth';
import { evPlaceOrder, evGetReport } from '@/lib/eagleview';
import { randomUUID } from 'crypto';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await params;

    const report = await prisma.ev_reports.findFirst({
      where:   { estimate_id: id },
      orderBy: { created_at: 'desc' },
    });

    return NextResponse.json({ report });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 401 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await params;
    const body = await req.json();
    const { productId, productName } = body;

    if (!productId) {
      return NextResponse.json({ error: 'productId required' }, { status: 400 });
    }

    const estimate = await prisma.estimates.findUnique({
      where:   { id },
      include: { customer: true },
    });
    if (!estimate) {
      return NextResponse.json({ error: 'Estimate not found' }, { status: 404 });
    }

    const parts = estimate.address.split(',').map((s: string) => s.trim());
    const street = parts[0] ?? estimate.address;
    const city   = parts[1] ?? '';
    const stZip  = parts[2] ?? '';
    const [state, zip] = stZip.split(' ').filter(Boolean);

    const refId = randomUUID();

    const evRecord = await prisma.ev_reports.create({
      data: {
        estimate_id:  id,
        ref_id:       refId,
        product_id:   productId,
        product_name: productName ?? null,
        address:      estimate.address,
        status:       'pending',
      },
    });

    let orderResult;
    try {
      orderResult = await evPlaceOrder(
        { street, city, state: state ?? 'TX', zip: zip ?? '' },
        productId,
        refId,
        { claimNo: estimate.claim_no ?? undefined, insuredName: estimate.customer.name }
      );
    } catch (err: any) {
      await prisma.ev_reports.update({
        where: { id: evRecord.id },
        data:  { status: 'failed' },
      });
      console.error('[EV] PlaceOrder error:', err.message);
      return NextResponse.json({ error: err.message }, { status: 502 });
    }

    const reportId = orderResult.reportIds[0];

    await prisma.ev_reports.update({
      where: { id: evRecord.id },
      data: {
        ev_order_id:  orderResult.orderId,
        ev_report_id: reportId,
        status:       'processing',
      },
    });

    return NextResponse.json({ success: true, evReportId: reportId, refId });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 401 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await params;

    const report = await prisma.ev_reports.findFirst({
      where:   { estimate_id: id },
      orderBy: { created_at: 'desc' },
    });

    if (!report?.ev_report_id) {
      return NextResponse.json({ error: 'No EV report found' }, { status: 404 });
    }

    const measurements = await evGetReport(report.ev_report_id);
    const isComplete = measurements.status.toLowerCase().includes('complet');

    await prisma.ev_reports.update({
      where: { id: report.id },
      data: {
        status:       isComplete ? 'complete' : 'processing',
        measurements: measurements as any,
        pdf_url:      measurements.pdfUrl ?? undefined,
      },
    });

    return NextResponse.json({ success: true, measurements });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 401 });
  }
}
