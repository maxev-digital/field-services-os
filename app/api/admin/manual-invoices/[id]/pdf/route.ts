import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import nodePath from 'path';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';
import path from 'path';
// @ts-ignore
import PDFDocument from 'pdfkit';

const LOGO_PATH = path.join(process.cwd(), 'public', 'images', 'main_logo_navy_red.png');
const LOGO_H    = 66;
const LOGO_W    = Math.round(LOGO_H * (4600 / 4495)); // ≈ 118

const NAVY = '#1a2e4a';
const RED  = '#9b1c1c';
const GRAY = '#6b7280';
const BLK  = '#1f2937';

function fmt(n: number) {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function dFmt(d: Date | string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}


function getPaymentSettings(): { zellePhone: string; cashAppHandle: string; checkPayableTo: string } {
  try {
    const file = nodePath.join(process.cwd(), 'data', 'admin-settings.json');
    const s = JSON.parse(fs.readFileSync(file, 'utf8'));
    return {
      zellePhone:    s.zellePhone    || '',
      cashAppHandle: s.cashAppHandle || '',
      checkPayableTo: s.checkPayableTo || 'Roof Works of Texas',
    };
  } catch {
    return { zellePhone: '', cashAppHandle: '', checkPayableTo: 'Roof Works of Texas' };
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await params;

    const invoice = await prisma.manual_invoices.findUnique({
      where: { id },
      include: {
        line_items: { orderBy: { sort_order: 'asc' } },
        payments:   { orderBy: { paid_at: 'desc' } },
      },
    });

    if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 });

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


    await new Promise<void>(resolve => {
      doc.on('end', resolve);

      const L = 50;
      const R = 562;
      const W = R - L;

      // ── Header ─────────────────────────────────────────────────────────
      // White background
      doc.rect(0, 0, 612, 92).fill('#ffffff');

      // Logo — top left
      try { doc.image(LOGO_PATH, 8, 13, { height: LOGO_H }); } catch (_) {}

      // Company name + contact — right of logo
      const TX = LOGO_W + 18;
      doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(16)
        .text('ROOF WORKS OF TEXAS', TX, 18);
      doc.font('Helvetica').fontSize(8).fillColor(GRAY)
        .text('Roofing Contractor · DFW & North Texas', TX, 40)
        .text('(214) 795-3905  ·  info@roofworksoftexas.com  ·  roofworksoftexas.com', TX, 52);

      // Navy bottom border + red accent
      doc.rect(0, 90, 612, 3).fill(NAVY);
      doc.rect(0, 93, 612, 2).fill(RED);

      // Right panel — navy, "INVOICE" label
      const RX = 420;
      doc.rect(RX, 0, 612 - RX, 90).fill(NAVY);
      doc.font('Helvetica-Bold').fontSize(22).fillColor('#ffffff')
        .text('INVOICE', RX + 4, 18, { width: 612 - RX - 8, align: 'right' });
      doc.font('Helvetica').fontSize(8.5).fillColor('#fca5a5')
        .text(invoice.invoice_no, RX + 4, 50, { width: 612 - RX - 8, align: 'right' });

      // ── Watermark logo centered on page ─────────────────────────────────
      try {
        const wmH = 220;
        const wmW = Math.round(wmH * (4600 / 4495));
        const wmX = (612 - wmW) / 2;
        const wmY = (792 - wmH) / 2;
        doc.save();
        doc.opacity(0.04);
        doc.image(LOGO_PATH, wmX, wmY, { height: wmH });
        doc.restore();
      } catch (_) {}

      // ── Bill To / Invoice Details ────────────────────────────────────────
      let y = 112;

      doc.font('Helvetica-Bold').fontSize(9).fillColor(GRAY).text('BILL TO', L, y);
      doc.font('Helvetica-Bold').fontSize(9).fillColor(GRAY).text('INVOICE DETAILS', 360, y);
      y += 14;

      // Bill To
      doc.font('Helvetica-Bold').fontSize(10).fillColor(BLK).text(invoice.customer_name, L, y);
      doc.font('Helvetica').fontSize(9).fillColor(BLK);
      if (invoice.customer_address) doc.text(invoice.customer_address, L, y + 14, { width: 210 });
      if (invoice.customer_phone)   doc.text(invoice.customer_phone,   L, y + 26);
      if (invoice.customer_email)   doc.text(invoice.customer_email,   L, y + 38);

      // Invoice details right column
      const balance = invoice.amount_due - invoice.amount_paid;
      const details: [string, string][] = [
        ['Invoice #',  invoice.invoice_no],
        ['Date',       dFmt(invoice.issued_at)],
        ['Due Date',   dFmt(invoice.due_at)],
        ['Amount Due', fmt(balance > 0 ? balance : invoice.amount_due)],
      ];
      details.forEach(([label, val], i) => {
        doc.font('Helvetica-Bold').fontSize(9).fillColor(GRAY).text(label, 360, y + i * 14);
        doc.font('Helvetica').fontSize(9).fillColor(BLK)
          .text(val, 460, y + i * 14, { width: 102, align: 'right' });
      });

      y += 70;

      // ── Project / Property info ──────────────────────────────────────────
      if (invoice.property_address || invoice.insurer || invoice.claim_no) {
        doc.rect(L - 4, y, W + 8, 1).fill('#d1d5db');
        y += 10;
        doc.font('Helvetica-Bold').fontSize(9).fillColor(NAVY).text('PROJECT', L, y);
        y += 13;
        if (invoice.property_address) {
          doc.font('Helvetica-Bold').fontSize(9).fillColor(GRAY).text('Property: ', L, y, { continued: true });
          doc.font('Helvetica').fillColor(BLK).text(invoice.property_address);
          y += 13;
        }
        if (invoice.insurer) {
          doc.font('Helvetica-Bold').fontSize(9).fillColor(GRAY).text('Insurer: ', L, y, { continued: true });
          doc.font('Helvetica').fillColor(BLK)
            .text(invoice.insurer + (invoice.claim_no ? `  ·  Claim #${invoice.claim_no}` : ''));
          y += 13;
        }
        doc.rect(L - 4, y, W + 8, 1).fill('#d1d5db');
        y += 14;
      }

      // ── Line Items Table ─────────────────────────────────────────────────
      const COL = { desc: L, qty: 340, unit: 385, price: 430, amt: R };

      // Header row — navy bg
      doc.rect(L - 4, y, W + 8, 20).fill(NAVY);
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#ffffff');
      doc.text('DESCRIPTION',  COL.desc,  y + 6);
      doc.text('QTY',          COL.qty,   y + 6, { width: 40,  align: 'right' });
      doc.text('UNIT',         COL.unit,  y + 6, { width: 40,  align: 'right' });
      doc.text('UNIT PRICE',   COL.price, y + 6, { width: 70,  align: 'right' });
      doc.text('AMOUNT',       COL.amt - 70, y + 6, { width: 70, align: 'right' });
      y += 24;

      invoice.line_items.forEach((li, i) => {
        if (y > 680) { doc.addPage(); y = 50; }

        // Alternating row tint
        if (i % 2 === 1) doc.rect(L - 4, y - 2, W + 8, 18).fill('#f8fafc');

        doc.font('Helvetica').fontSize(9).fillColor(BLK)
          .text(li.description, COL.desc, y, { width: 280 });
        doc.fillColor(GRAY)
          .text(li.qty % 1 === 0 ? String(li.qty) : li.qty.toFixed(2), COL.qty, y, { width: 40, align: 'right' });
        doc.text(li.unit ?? '', COL.unit, y, { width: 40, align: 'right' });
        doc.fillColor(BLK)
          .text(fmt(li.unit_price), COL.price, y, { width: 70, align: 'right' });
        doc.font('Helvetica-Bold')
          .text(fmt(li.amount), COL.amt - 70, y, { width: 70, align: 'right' });

        y += 16;
        doc.rect(L - 4, y - 2, W + 8, 0.5).fill('#e5e7eb');
      });

      // ── Totals ───────────────────────────────────────────────────────────
      y += 10;
      doc.rect(L - 4, y, W + 8, 1).fill('#d1d5db');
      y += 10;

      const totRow = (label: string, val: string, bold = false, color = BLK) => {
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9)
          .fillColor(GRAY).text(label, 350, y, { width: 140, align: 'right' })
          .fillColor(color).text(val, 490, y, { width: 72, align: 'right' });
        y += 16;
      };

      if (invoice.amount_paid > 0) {
        totRow('Subtotal',    fmt(invoice.amount_due));
        totRow('Amount Paid', fmt(invoice.amount_paid), false, '#16a34a');
      }

      // Amount Due box — navy
      y += 4;
      const boxAmt   = invoice.amount_paid > 0 ? balance : invoice.amount_due;
      const boxLabel = invoice.amount_paid > 0 ? 'BALANCE DUE' : 'AMOUNT DUE';

      doc.rect(350, y, 212, 32).fill(NAVY);
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#ffffff')
        .text(boxLabel, 356, y + 10)
        .text(fmt(boxAmt), 356, y + 10, { width: 200, align: 'right' });
      y += 44;

      // ── Payment Terms & Notes ────────────────────────────────────────────
      if (y > 660) { doc.addPage(); y = 50; }

      if (invoice.payment_terms) {
        y += 6;
        doc.font('Helvetica-Bold').fontSize(8).fillColor(NAVY).text('PAYMENT TERMS', L, y);
        y += 12;
        doc.font('Helvetica').fontSize(8).fillColor(BLK).text(invoice.payment_terms, L, y, { width: W });
        y += 18;
      }

      if (invoice.notes) {
        doc.font('Helvetica-Bold').fontSize(8).fillColor(NAVY).text('NOTES', L, y);
        y += 12;
        doc.font('Helvetica').fontSize(8).fillColor(BLK).text(invoice.notes, L, y, { width: W });
        y += 18;
      }

      // Payment history
      if (invoice.payments.length > 0) {
        if (y > 640) { doc.addPage(); y = 50; }
        doc.font('Helvetica-Bold').fontSize(8).fillColor(NAVY).text('PAYMENT HISTORY', L, y);
        y += 12;
        for (const p of invoice.payments) {
          doc.font('Helvetica').fontSize(8).fillColor(BLK)
            .text(`${dFmt(p.paid_at)}  ·  ${p.method}${p.reference_no ? ' #' + p.reference_no : ''}`, L, y, { continued: true, width: 350 });
          doc.fillColor('#16a34a').font('Helvetica-Bold')
            .text(`  ${fmt(p.amount)}`);
          y += 12;
        }
        y += 6;
      }

      // ── How to Pay ──────────────────────────────────────────────────────────
      const pmtSettings = getPaymentSettings();
      const pmtMethods: string[] = [];
      if (pmtSettings.zellePhone)    pmtMethods.push(`Zelle: ${pmtSettings.zellePhone}`);
      if (pmtSettings.cashAppHandle) pmtMethods.push(`CashApp: ${pmtSettings.cashAppHandle}`);
      if (pmtSettings.checkPayableTo) pmtMethods.push(`Check payable to: ${pmtSettings.checkPayableTo}`);

      if (pmtMethods.length > 0 && y < 700) {
        y += 6;
        doc.font('Helvetica-Bold').fontSize(8).fillColor(NAVY).text('HOW TO PAY', L, y);
        y += 12;
        doc.font('Helvetica').fontSize(8).fillColor(BLK).text(pmtMethods.join('  ·  '), L, y, { width: W });
        y += 14;
      }

      // ── Navy footer strip ────────────────────────────────────────────────────────────────────────
      const FY = 730;
      doc.rect(0, FY, 612, 62).fill(NAVY);
      doc.rect(0, FY, 612, 2).fill(RED);

      // Thank you message
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#ffffff')
        .text('Thank you for choosing Roof Works of Texas!', 0, FY + 10, { width: 612, align: 'center' });
      doc.font('Helvetica').fontSize(7.5).fillColor('#fca5a5')
        .text(
          '(214) 795-3905  ·  info@roofworksoftexas.com  ·  roofworksoftexas.com',
          0, FY + 28, { width: 612, align: 'center' }
        );

      doc.end();
    });

    const pdf = Buffer.concat(chunks);
    return new NextResponse(pdf, {
      status: 200,
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `inline; filename="${invoice.invoice_no}.pdf"`,
        'Content-Length':      String(pdf.length),
        'Cache-Control':       'no-store',
      },
    });

  } catch (err: any) {
    if (err.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error('[manual-invoice/pdf]', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
