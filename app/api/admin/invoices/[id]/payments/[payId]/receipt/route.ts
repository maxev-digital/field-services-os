import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';
import path from 'path';
// @ts-ignore
import PDFDocument from 'pdfkit';
import { drawCoverPage } from '@/lib/pdf-cover';

const RED   = '#9b1c1c';
const GRAY  = '#6b7280';
const BLACK = '#1f2937';
const LOGO_PATH = path.join(process.cwd(), 'public', 'images', 'main_logo_navy_red.png');
const LOGO_H    = 66;
const LOGO_W    = Math.round(LOGO_H * (4600 / 4495));

function fmt(n: number) {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDate(d: Date | string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export async function GET(_req: NextRequest, { params }: { params: { id: string; payId: string } }) {
  try {
    await requireAdmin();

    const payment = await prisma.payments.findUnique({
      where: { id: params.payId },
      include: {
        invoice: {
          include: {
            payments: { orderBy: { paid_at: 'asc' } },
            estimate: { include: { customer: true } },
          },
        },
      },
    });

    if (!payment || payment.invoice_id !== params.id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const invoice  = payment.invoice;
    const estimate = invoice.estimate;
    const customer = estimate.customer;
    const allPaid  = invoice.payments.reduce((s, p) => s + p.amount, 0);
    const balance  = invoice.amount_due - allPaid;

    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ margin: 50, size: 'LETTER' });
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('pageAdded', () => {
        doc.save();
        doc.moveTo(4, 95).lineTo(4, 788).lineTo(608, 788).lineTo(608, 95)
          .strokeColor('#1a2e4a').lineWidth(1.5).stroke();
        doc.moveTo(9, 95).lineTo(9, 783).lineTo(603, 783).lineTo(603, 95)
          .strokeColor('#9b1c1c').lineWidth(0.75).stroke();
        doc.restore();
      });


    await new Promise<void>((resolve) => {
      doc.on('end', resolve);

      // ── Cover page ───────────────────────────────────────────────────────
      drawCoverPage(doc, 'PAYMENT RECEIPT', customer.name, estimate.address || undefined);
      doc.addPage();

      const L = 50;
      const R = 562;
      const W = R - L;

      // ── Header ──────────────────────────────────────────────────────────
      doc.rect(0, 0, 700, 90).fill(RED);
      try { doc.image(LOGO_PATH, 8, 12, { height: LOGO_H }); } catch (_) { /* skip */ }
      const TX = LOGO_W + 18;
      doc.fillColor('#fff').font('Helvetica-Bold').fontSize(16).text('ROOF WORKS OF TEXAS', TX, 20);
      doc.font('Helvetica').fontSize(8).fillColor('#fecaca')
        .text('Roofing Contractor · DFW & North Texas', TX, 42)
        .text('(214) 795-3905  ·  info@roofworksoftexas.com  ·  roofworksoftexas.com', TX, 55);
      doc.rect(0, 88, 700, 2).fill('#1a2e4a');
      const RX = 420;
      doc.rect(RX, 0, 700 - RX, 90).fill('#7f1d1d');
      doc.font('Helvetica-Bold').fontSize(22).fillColor('#fff')
        .text('RECEIPT', RX + 4, 20, { width: R - RX + 14, align: 'right' });
      doc.font('Helvetica').fontSize(8.5).fillColor('#fecaca')
        .text(fmtDate(payment.paid_at), RX + 4, 52, { width: R - RX + 14, align: 'right' });

      // ── Receipt details ──────────────────────────────────────────────────
      let y = 112;

      doc.font('Helvetica-Bold').fontSize(9).fillColor(GRAY).text('RECEIVED FROM', L, y);
      doc.font('Helvetica-Bold').fontSize(9).fillColor(GRAY).text('RECEIPT DETAILS', 370, y);
      y += 14;

      doc.font('Helvetica-Bold').fontSize(10).fillColor(BLACK).text(customer.name, L, y);
      doc.font('Helvetica').fontSize(9).fillColor(BLACK);
      if (customer.address) doc.text(customer.address, L, y + 14, { width: 200 });
      doc.text(customer.phone, L, y + 26);
      if (customer.email) doc.text(customer.email, L, y + 38);

      const details: [string, string][] = [
        ['Receipt #',    payment.id.slice(-8).toUpperCase()],
        ['Invoice #',    invoice.invoice_no],
        ['Date',         fmtDate(payment.paid_at)],
        ['Method',       payment.method.replace('_', ' ')],
      ];
      if (payment.reference_no) details.push(['Reference #', payment.reference_no]);

      details.forEach(([label, val], i) => {
        doc.font('Helvetica-Bold').fontSize(9).fillColor(GRAY).text(label, 370, y + i * 14);
        doc.font('Helvetica').fontSize(9).fillColor(BLACK).text(val, 460, y + i * 14, { width: 102, align: 'right' });
      });

      y += 70;
      doc.rect(L - 4, y, W + 8, 1).fill('#e5e7eb');
      y += 16;

      // ── Property ────────────────────────────────────────────────────────
      doc.font('Helvetica-Bold').fontSize(9).fillColor(GRAY).text('PROPERTY', L, y);
      y += 13;
      doc.font('Helvetica').fontSize(9).fillColor(BLACK).text(estimate.address, L, y);
      if (estimate.insurer) {
        y += 13;
        doc.font('Helvetica').fontSize(9).fillColor(BLACK)
          .text(`${estimate.insurer}${estimate.claim_no ? ` · Claim #${estimate.claim_no}` : ''}`, L, y);
      }
      y += 20;
      doc.rect(L - 4, y, W + 8, 1).fill('#e5e7eb');
      y += 16;

      // ── Payment amount box ────────────────────────────────────────────────
      doc.rect(L - 4, y, W + 8, 50).fill('#f9fafb');
      doc.font('Helvetica-Bold').fontSize(13).fillColor(BLACK)
        .text('PAYMENT RECEIVED', L + 8, y + 8);
      doc.font('Helvetica-Bold').fontSize(22).fillColor(RED)
        .text(fmt(payment.amount), L + 8, y + 22);
      if (payment.notes) {
        doc.font('Helvetica').fontSize(9).fillColor(GRAY)
          .text(payment.notes, 350, y + 16, { width: 200, align: 'right' });
      }
      y += 66;

      // ── Running balance ──────────────────────────────────────────────────
      doc.font('Helvetica-Bold').fontSize(9).fillColor(GRAY).text('ACCOUNT SUMMARY', L, y);
      y += 13;

      const rows: [string, number, string][] = [
        ['Invoice Total',    invoice.amount_due, BLACK],
        ['Total Paid',       allPaid,            '#16a34a'],
        ['Remaining Balance',balance,             balance > 0 ? RED : '#16a34a'],
      ];

      rows.forEach(([label, val, color]) => {
        doc.font('Helvetica').fontSize(9).fillColor(GRAY).text(label, L, y, { width: 200 });
        doc.font('Helvetica-Bold').fontSize(9).fillColor(color)
          .text(fmt(val), L, y, { width: W, align: 'right' });
        y += 16;
      });

      // ── Payment history ──────────────────────────────────────────────────
      if (invoice.payments.length > 1) {
        y += 8;
        doc.rect(L - 4, y, W + 8, 1).fill('#e5e7eb');
        y += 12;
        doc.font('Helvetica-Bold').fontSize(8).fillColor(GRAY).text('PAYMENT HISTORY', L, y);
        y += 12;
        invoice.payments.forEach((p, i) => {
          const isCurrent = p.id === payment.id;
          doc.font(isCurrent ? 'Helvetica-Bold' : 'Helvetica').fontSize(8)
            .fillColor(isCurrent ? BLACK : GRAY)
            .text(`${fmtDate(p.paid_at)} · ${p.method.replace('_', ' ')}${p.reference_no ? ` · Ref: ${p.reference_no}` : ''}`, L, y, { width: 340 });
          doc.font(isCurrent ? 'Helvetica-Bold' : 'Helvetica').fontSize(8)
            .fillColor(isCurrent ? '#16a34a' : GRAY)
            .text(fmt(p.amount), L, y, { width: W, align: 'right' });
          y += 13;
        });
      }

      // ── Footer ───────────────────────────────────────────────────────────
      doc.font('Helvetica-Bold').fontSize(9).fillColor(RED)
        .text('Thank you for choosing Roof Works of Texas!', L, y + 20, { width: W, align: 'center' });
      doc.font('Helvetica').fontSize(7).fillColor(GRAY)
        .text('Roof Works of Texas  ·  (214) 795-3905  ·  info@roofworksoftexas.com  ·  roofworksoftexas.com', L, 730, { width: W, align: 'center' });

      doc.end();
    });

    const pdfBuffer = Buffer.concat(chunks);
    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `inline; filename="receipt-${payment.id.slice(-8)}.pdf"`,
        'Content-Length':      String(pdfBuffer.length),
        'Cache-Control':       'no-store',
      },
    });

  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error('[receipt/pdf]', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
