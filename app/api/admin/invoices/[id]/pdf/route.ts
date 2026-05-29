import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';
import path from 'path';
// @ts-ignore
import PDFDocument from 'pdfkit';

const LOGO_PATH = path.join(process.cwd(), 'public', 'images', 'main_logo_navy_red.png');
const LOGO_H    = 66;
const LOGO_W    = Math.round(LOGO_H * (4600 / 4495)); // ≈ 67

const RED   = '#9b1c1c';
const DARK  = '#111827';
const GRAY  = '#6b7280';
const BLACK = '#1f2937';

function fmt(n: number) {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();

    const invoice = await prisma.invoices.findUnique({
      where: { id: params.id },
      include: {
        estimate: {
          include: {
            customer: true,
            line_items: { orderBy: { category: 'asc' } },
          },
        },
      },
    });

    if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const est = invoice.estimate;
    const cust = est.customer;

    // Group line items by category
    const groups = new Map<string, typeof est.line_items>();
    for (const li of est.line_items) {
      if (!groups.has(li.category)) groups.set(li.category, []);
      groups.get(li.category)!.push(li);
    }

    // ── Build PDF ────────────────────────────────────────────────────────────
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

      const L = 50;   // left margin
      const R = 562;  // right margin
      const W = R - L;

      // ── Header bar ─────────────────────────────────────────────────────────
      doc.rect(0, 0, 700, 90).fill(RED);
      doc.rect(0, 88, 700, 2).fill('#1a2e4a');

      // Logo
      try { doc.image(LOGO_PATH, 8, 12, { height: LOGO_H }); } catch (_) {}

      // Company text right of logo
      const TX = LOGO_W + 18;
      doc.fillColor('#fff').font('Helvetica-Bold').fontSize(16)
        .text('ROOF WORKS OF TEXAS', TX, 20);
      doc.font('Helvetica').fontSize(8).fillColor('#fecaca')
        .text('Roofing Contractor · DFW & North Texas', TX, 42)
        .text('(214) 795-3905  ·  info@roofworksoftexas.com  ·  roofworksoftexas.com', TX, 55);

      // INVOICE label top-right — darker band
      const RX = 420;
      doc.rect(RX, 0, 700 - RX, 90).fill('#7f1d1d');
      doc.font('Helvetica-Bold').fontSize(28).fillColor('#fff')
        .text('INVOICE', RX + 4, 22, { width: R - RX + 14, align: 'right' });

      doc.font('Helvetica').fontSize(9).fillColor('#fecaca')
        .text(invoice.invoice_no, RX + 4, 55, { width: R - RX + 14, align: 'right' });

      // ── Invoice meta ────────────────────────────────────────────────────────
      let y = 110;

      doc.font('Helvetica-Bold').fontSize(9).fillColor(GRAY).text('BILL TO', L, y);
      doc.font('Helvetica-Bold').fontSize(9).fillColor(GRAY).text('INVOICE DETAILS', 370, y);

      y += 14;

      // Bill To column
      doc.font('Helvetica-Bold').fontSize(10).fillColor(BLACK).text(cust.name, L, y);
      doc.font('Helvetica').fontSize(9).fillColor(DARK);
      if (cust.address) doc.text(cust.address, L, y + 14, { width: 200 });
      doc.text(cust.phone, L, y + 26);
      if (cust.email) doc.text(cust.email, L, y + 38);

      // Invoice details column
      const dFmt = (d: Date | string | null) =>
        d ? new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—';

      const details = [
        ['Invoice #',  invoice.invoice_no],
        ['Date',       dFmt(invoice.issued_at)],
        ['Due Date',   dFmt(invoice.due_at)],
        ['Amount Due', fmt(invoice.amount_due)],
      ];

      details.forEach(([label, val], i) => {
        doc.font('Helvetica-Bold').fontSize(9).fillColor(GRAY).text(label, 370, y + i * 14);
        doc.font('Helvetica').fontSize(9).fillColor(BLACK).text(val, 460, y + i * 14, { width: 102, align: 'right' });
      });

      y += 70;

      // Property info
      if (est.address) {
        doc.rect(L - 4, y, W + 8, 1).fill('#e5e7eb');
        y += 10;

        doc.font('Helvetica-Bold').fontSize(9).fillColor(GRAY).text('PROJECT', L, y);
        y += 13;

        doc.font('Helvetica-Bold').fontSize(9).fillColor(BLACK).text('Property: ', L, y, { continued: true });
        doc.font('Helvetica').text(est.address || '—');

        y += 10;
        doc.rect(L - 4, y, W + 8, 1).fill('#e5e7eb');
        y += 14;
      }

      // ── Line Items ──────────────────────────────────────────────────────────
      // Columns: Item Description | Qty | Unit | Total
      const COL = { item: L, qty: 360, unit: 420, total: 490 };
      const COL_W = { qty: 50, unit: 60, total: 72 };

      doc.rect(L - 4, y, W + 8, 18).fill('#f3f4f6');
      doc.font('Helvetica-Bold').fontSize(8).fillColor(GRAY);
      doc.text('ITEM DESCRIPTION',                    COL.item,  y + 5);
      doc.text('QTY',   COL.qty,   y + 5, { width: COL_W.qty,   align: 'right' });
      doc.text('UNIT',  COL.unit,  y + 5, { width: COL_W.unit,  align: 'right' });
      doc.text('TOTAL', COL.total, y + 5, { width: COL_W.total, align: 'right' });

      y += 22;

      Array.from(groups.entries()).forEach(([cat, items]) => {
        // Category header
        doc.font('Helvetica-Bold').fontSize(8).fillColor(RED)
          .text(cat.toUpperCase(), COL.item, y);
        y += 12;

        items.forEach((li: any) => {
          if (y > 680) { doc.addPage(); y = 50; }

          doc.font('Helvetica').fontSize(8).fillColor(BLACK)
            .text(li.label, COL.item, y, { width: 300 });
          doc.text(
            li.qty % 1 === 0 ? String(li.qty) : li.qty.toFixed(2),
            COL.qty, y, { width: COL_W.qty, align: 'right' }
          );
          doc.text(li.unit,         COL.unit,  y, { width: COL_W.unit,  align: 'right' });
          doc.text(fmt(li.our_amt), COL.total, y, { width: COL_W.total, align: 'right' });

          y += 14;
          doc.rect(COL.item - 4, y - 2, W + 8, 0.5).fill('#f3f4f6');
        });

        y += 4;
      });

      // ── Total ──────────────────────────────────────────────────────────────
      y += 8;
      doc.rect(L - 4, y, W + 8, 1).fill('#d1d5db');
      y += 12;

      // Amount Due box
      doc.rect(350, y, 212, 30).fill(RED);
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#fff')
        .text('AMOUNT DUE', 356, y + 9)
        .text(fmt(invoice.amount_due), 356, y + 9, { width: 200, align: 'right' });
      y += 42;

      // ── Payment terms ────────────────────────────────────────────────────────
      if (y > 680) { doc.addPage(); y = 50; }

      y += 8;
      doc.font('Helvetica-Bold').fontSize(8).fillColor(GRAY).text('PAYMENT TERMS', L, y);
      y += 12;
      doc.font('Helvetica').fontSize(8).fillColor(BLACK)
        .text('Payment is due within 30 days of invoice date. We accept check, cash, Zelle, and credit card.', L, y, { width: W });

      y += 24;
      doc.font('Helvetica-Bold').fontSize(9).fillColor(RED)
        .text('Thank you for choosing Roof Works of Texas!', L, y, { width: W, align: 'center' });

      // ── Footer ────────────────────────────────────────────────────────────────
      doc.font('Helvetica').fontSize(7).fillColor(GRAY)
        .text(
          'Roof Works of Texas  ·  (214) 795-3905  ·  info@roofworksoftexas.com  ·  roofworksoftexas.com',
          L, 730, { width: W, align: 'center' }
        );

      doc.end();
    });

    const pdfBuffer = Buffer.concat(chunks);

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `inline; filename="${invoice.invoice_no}.pdf"`,
        'Content-Length':      String(pdfBuffer.length),
        'Cache-Control':       'no-store',
      },
    });

  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error('[invoice/pdf]', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
