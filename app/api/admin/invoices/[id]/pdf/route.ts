import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';
// @ts-ignore
import PDFDocument from 'pdfkit';

const RED   = '#dc2626';
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

    await new Promise<void>((resolve) => {
      doc.on('end', resolve);

      const L = 50;   // left margin
      const R = 562;  // right margin
      const W = R - L;

      // ── Header bar ─────────────────────────────────────────────────────────
      doc.rect(L - 50, 0, 700, 90).fill(RED);

      doc.fillColor('#fff')
        .font('Helvetica-Bold').fontSize(22)
        .text('ROOF WORKS OF TEXAS', L, 22);

      doc.font('Helvetica').fontSize(9).fillColor('#fecaca')
        .text('Roofing Contractor · DFW & North Texas', L, 48)
        .text('(214) 795-3905  ·  info@roofworksoftexas.com  ·  roofworksoftexas.com', L, 60);

      // INVOICE label top-right
      doc.font('Helvetica-Bold').fontSize(28).fillColor('#fff')
        .text('INVOICE', 400, 22, { width: 162, align: 'right' });

      doc.font('Helvetica').fontSize(9).fillColor('#fecaca')
        .text(invoice.invoice_no, 400, 55, { width: 162, align: 'right' });

      // ── Invoice meta ────────────────────────────────────────────────────────
      let y = 110;

      // Two-column: Bill To (left) / Invoice details (right)
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

      // Property / project info
      if (est.address || est.insurer || est.claim_no) {
        doc.rect(L - 4, y, W + 8, 1).fill('#e5e7eb');
        y += 10;

        doc.font('Helvetica-Bold').fontSize(9).fillColor(GRAY).text('PROJECT', L, y);
        y += 13;

        doc.font('Helvetica-Bold').fontSize(9).fillColor(BLACK).text('Property: ', L, y, { continued: true });
        doc.font('Helvetica').text(est.address || '—');

        if (est.insurer) {
          y += 13;
          doc.font('Helvetica-Bold').fontSize(9).fillColor(BLACK).text('Insurer: ', L, y, { continued: true });
          doc.font('Helvetica').text(est.insurer + (est.claim_no ? `  ·  Claim #${est.claim_no}` : ''));
        }

        y += 10;
        doc.rect(L - 4, y, W + 8, 1).fill('#e5e7eb');
        y += 14;
      }

      // ── Line Items ──────────────────────────────────────────────────────────
      // Table header
      const COL = { item: L, qty: 330, unit: 380, ins: 420, ours: 490, delta: 562 };

      doc.rect(L - 4, y, W + 8, 18).fill('#f3f4f6');
      doc.font('Helvetica-Bold').fontSize(8).fillColor(GRAY);
      doc.text('ITEM DESCRIPTION',           COL.item,  y + 5);
      doc.text('QTY',  COL.qty,  y + 5, { width: 45,  align: 'right' });
      doc.text('UNIT', COL.unit, y + 5, { width: 35,  align: 'right' });
      doc.text('INS.',  COL.ins,  y + 5, { width: 65,  align: 'right' });
      doc.text('OURS', COL.ours, y + 5, { width: 65,  align: 'right' });
      doc.text('DELTA', COL.delta - 65, y + 5, { width: 65, align: 'right' });

      y += 22;

      Array.from(groups.entries()).forEach(([cat, items]) => {
        // Category header
        doc.font('Helvetica-Bold').fontSize(8).fillColor(RED)
          .text(cat.toUpperCase(), COL.item, y);
        y += 12;

        items.forEach(li => {
          // Page break check
          if (y > 680) {
            doc.addPage();
            y = 50;
          }

          doc.font('Helvetica').fontSize(8).fillColor(BLACK)
            .text(li.label, COL.item, y, { width: 280 });
          doc.text(li.qty % 1 === 0 ? String(li.qty) : li.qty.toFixed(2),
            COL.qty,  y, { width: 45,  align: 'right' });
          doc.text(li.unit,          COL.unit, y, { width: 35,  align: 'right' });
          doc.fillColor(GRAY)
            .text(fmt(li.ins_amt),   COL.ins,  y, { width: 65,  align: 'right' });
          doc.fillColor(BLACK)
            .text(fmt(li.our_amt),   COL.ours, y, { width: 65,  align: 'right' });
          doc.fillColor('#16a34a')
            .text(fmt(li.delta),     COL.delta - 65, y, { width: 65, align: 'right' });

          y += 14;

          // Light divider
          doc.rect(COL.item - 4, y - 2, W + 8, 0.5).fill('#f3f4f6');
        });

        y += 4;
      });

      // ── Totals ──────────────────────────────────────────────────────────────
      y += 8;
      doc.rect(L - 4, y, W + 8, 1).fill('#d1d5db');
      y += 8;

      const totRow = (label: string, val: string, bold = false, color = BLACK) => {
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9)
          .fillColor(GRAY).text(label, 350, y, { width: 130, align: 'right' })
          .fillColor(color).font(bold ? 'Helvetica-Bold' : 'Helvetica')
          .text(val, 490, y, { width: 72, align: 'right' });
        y += 16;
      };

      totRow('Insurance Estimate', fmt(est.insurance_total));
      totRow('Roof Works Price',   fmt(est.our_total), true);
      totRow(`Customer Savings (${est.savings_pct.toFixed(1)}%)`, fmt(est.savings), false, '#16a34a');

      // Amount Due box
      y += 4;
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
          `Roof Works of Texas  ·  (214) 795-3905  ·  info@roofworksoftexas.com  ·  roofworksoftexas.com`,
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
