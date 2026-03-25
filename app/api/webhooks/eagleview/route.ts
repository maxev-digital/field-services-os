/**
 * EagleView Webhook Receivers
 *
 * EagleView calls these endpoints (note: URL must END with these paths):
 *   GET  /api/webhooks/eagleview/OrderStatusUpdate
 *   POST /api/webhooks/eagleview/FileDelivery
 *   GET  /api/webhooks/eagleview/NeedToId
 *
 * Register in EagleView developer portal as:
 *   https://admin.roofworksoftexas.com/api/webhooks/eagleview/OrderStatusUpdate
 *   https://admin.roofworksoftexas.com/api/webhooks/eagleview/FileDelivery
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { evGetReport } from '@/lib/eagleview';

// EV StatusId reference (partial)
// 2  = Processing, 8 = Complete, 9 = Failed, 14 = NPA (needs address ID)
const COMPLETE_STATUS_IDS = [8, 16];
const FAILED_STATUS_IDS   = [9, 13];

export async function GET(req: NextRequest) {
  const url  = new URL(req.url);
  const path = url.pathname;

  // ── OrderStatusUpdate ──────────────────────────────────────────────────
  if (path.endsWith('/OrderStatusUpdate')) {
    const reportId = parseInt(url.searchParams.get('ReportId') ?? '0');
    const statusId = parseInt(url.searchParams.get('StatusId') ?? '0');
    const refId    = url.searchParams.get('RefId') ?? '';

    console.log(`[EV Webhook] OrderStatusUpdate reportId=${reportId} statusId=${statusId} refId=${refId}`);

    if (reportId) {
      try {
        const record = await prisma.ev_reports.findFirst({
          where: { OR: [{ ev_report_id: reportId }, { ref_id: refId }] },
        });

        if (record) {
          let newStatus = record.status;

          if (COMPLETE_STATUS_IDS.includes(statusId)) {
            // Fetch full measurements now that it's complete
            const measurements = await evGetReport(reportId);
            await prisma.ev_reports.update({
              where: { id: record.id },
              data: {
                status:       'complete',
                ev_report_id: reportId,
                measurements: measurements as any,
                pdf_url:      measurements.pdfUrl ?? undefined,
              },
            });
          } else if (FAILED_STATUS_IDS.includes(statusId)) {
            await prisma.ev_reports.update({
              where: { id: record.id },
              data:  { status: 'failed', ev_report_id: reportId },
            });
          } else {
            await prisma.ev_reports.update({
              where: { id: record.id },
              data:  { status: 'processing', ev_report_id: reportId },
            });
          }
        }
      } catch (err: any) {
        console.error('[EV Webhook] OrderStatusUpdate error:', err.message);
      }
    }

    return new NextResponse('OK', { status: 200 });
  }

  // ── NeedToId — address disambiguation needed ───────────────────────────
  if (path.endsWith('/NeedToId')) {
    const reportId = parseInt(url.searchParams.get('ReportId') ?? '0');
    const refId    = url.searchParams.get('RefId') ?? '';
    const verifyId = url.searchParams.get('VerifyId') ?? '';

    console.log(`[EV Webhook] NeedToId reportId=${reportId} verifyId=${verifyId}`);

    if (reportId) {
      await prisma.ev_reports.updateMany({
        where: { OR: [{ ev_report_id: reportId }, { ref_id: refId }] },
        data:  { status: 'needs_id' },
      });
    }

    return new NextResponse('OK', { status: 200 });
  }

  return new NextResponse('Not Found', { status: 404 });
}

export async function POST(req: NextRequest) {
  const url  = new URL(req.url);
  const path = url.pathname;

  // ── FileDelivery — report files are ready ─────────────────────────────
  if (path.endsWith('/FileDelivery')) {
    const reportId = parseInt(url.searchParams.get('ReportId') ?? '0');
    const refId    = url.searchParams.get('RefId') ?? '';

    console.log(`[EV Webhook] FileDelivery reportId=${reportId} refId=${refId}`);

    // We already fetch measurements via OrderStatusUpdate; this is belt-and-suspenders.
    // Just ensure status is 'complete'.
    if (reportId) {
      try {
        const record = await prisma.ev_reports.findFirst({
          where: { OR: [{ ev_report_id: reportId }, { ref_id: refId }] },
        });

        if (record && record.status !== 'complete') {
          const measurements = await evGetReport(reportId);
          await prisma.ev_reports.update({
            where: { id: record.id },
            data: {
              status:       'complete',
              measurements: measurements as any,
              pdf_url:      measurements.pdfUrl ?? undefined,
            },
          });
        }
      } catch (err: any) {
        console.error('[EV Webhook] FileDelivery error:', err.message);
      }
    }

    return new NextResponse('OK', { status: 200 });
  }

  return new NextResponse('Not Found', { status: 404 });
}
