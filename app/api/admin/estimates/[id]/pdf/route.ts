import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';
import path from 'path';
// @ts-ignore
import PDFDocument from 'pdfkit';
import { drawCoverPage } from '@/lib/pdf-cover';

const LOGO_PATH = path.join(process.cwd(), 'public', 'images', 'logo.png');
const LOGO_H    = 66;
const LOGO_W    = Math.round(LOGO_H * (1376 / 768)); // ≈ 118

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

    const estimate = await prisma.estimates.findUnique({
      where: { id: params.id },
      include: {
        customer:    true,
        line_items:  { orderBy: { category: 'asc' } },
        change_orders: { orderBy: { created_at: 'desc' }, take: 1 },
      },
    });

    if (!estimate) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const cust = estimate.customer;

    // Use latest change order totals if they exist
    const latestCO   = estimate.change_orders[0];
    const ourTotal   = latestCO ? latestCO.new_our_total   : estimate.our_total;
    const insTotal   = latestCO ? latestCO.new_ins_total   : estimate.insurance_total;
    const savings    = insTotal - ourTotal;
    const savingsPct = insTotal > 0 ? (savings / insTotal) * 100 : 0;

    // Group line items by category
    const groups = new Map<string, typeof estimate.line_items>();
    for (const li of estimate.line_items) {
      if (!groups.has(li.category)) groups.set(li.category, []);
      groups.get(li.category)!.push(li);
    }

    // ── Build PDF ────────────────────────────────────────────────────────────
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ margin: 50, size: 'LETTER' });

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));

    await new Promise<void>((resolve) => {
      doc.on('end', resolve);

      // ── Cover page ───────────────────────────────────────────────────────
      drawCoverPage(doc, 'ESTIMATE', cust.name, estimate.address || undefined);
      doc.addPage();

      const L = 50;
      const R = 562;
      const W = R - L;

      // ── Header bar ──────────────────────────────────────────────────────
      doc.rect(0, 0, 700, 90).fill(RED);

      // Logo
      try { doc.image(LOGO_PATH, 8, 12, { height: LOGO_H }); } catch (_) { /* skip */ }

      // Company text — right of logo
      const TX = LOGO_W + 18;
      doc.fillColor('#fff').font('Helvetica-Bold').fontSize(16).text('ROOF WORKS OF TEXAS', TX, 20);
      doc.font('Helvetica').fontSize(8).fillColor('#fecaca')
        .text('Roofing Contractor · DFW & North Texas', TX, 42)
        .text('(214) 795-3905  ·  info@roofworksoftexas.com  ·  roofworksoftexas.com', TX, 55);

      // Navy bottom accent
      doc.rect(0, 88, 700, 2).fill('#1e3a5f');

      // Right — ESTIMATE label
      const RX = 420;
      doc.rect(RX, 0, 700 - RX, 90).fill('#b91c1c');
      doc.font('Helvetica-Bold').fontSize(22).fillColor('#fff')
        .text('ESTIMATE', RX + 4, 20, { width: R - RX + 14, align: 'right' });
      doc.font('Helvetica').fontSize(8.5).fillColor('#fecaca')
        .text(new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }), RX + 4, 52, { width: R - RX + 14, align: 'right' });

      // ── Customer / Project meta ──────────────────────────────────────────
      let y = 110;

      doc.font('Helvetica-Bold').fontSize(9).fillColor(GRAY).text('PREPARED FOR', L, y);
      doc.font('Helvetica-Bold').fontSize(9).fillColor(GRAY).text('PROJECT DETAILS', 370, y);
      y += 14;

      doc.font('Helvetica-Bold').fontSize(10).fillColor(BLACK).text(cust.name, L, y);
      doc.font('Helvetica').fontSize(9).fillColor(DARK);
      if (cust.address) doc.text(cust.address, L, y + 14, { width: 200 });
      doc.text(cust.phone, L, y + 26);
      if (cust.email) doc.text(cust.email, L, y + 38);

      const dFmt = (d: Date | string | null) =>
        d ? new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—';

      const details: [string, string][] = [
        ['Property',    estimate.address || '—'],
        ['Date',        dFmt(estimate.created_at)],
        ['Status',      estimate.status],
      ];
      if (estimate.insurer)  details.push(['Insurer', estimate.insurer]);
      if (estimate.claim_no) details.push(['Claim #', estimate.claim_no]);
      if (estimate.adj_date) details.push(['Adj. Date', estimate.adj_date]);

      details.forEach(([label, val], i) => {
        doc.font('Helvetica-Bold').fontSize(9).fillColor(GRAY).text(label, 370, y + i * 16);
        doc.font('Helvetica').fontSize(9).fillColor(BLACK).text(val, 460, y + i * 16, { width: 102, align: 'right' });
      });

      y += Math.max(64, details.length * 16 + 12);

      doc.rect(L - 4, y, W + 8, 1).fill('#e5e7eb');
      y += 14;

      // ── Line Items table ─────────────────────────────────────────────────
      const COL = { item: L, qty: 285, unit: 330, ins: 367, ours: 432, delta: 497 };

      doc.rect(L - 4, y, W + 8, 18).fill('#f3f4f6');
      doc.font('Helvetica-Bold').fontSize(8).fillColor(GRAY);
      doc.text('ITEM DESCRIPTION',         COL.item, y + 5);
      doc.text('QTY',  COL.qty,  y + 5, { width: 45,  align: 'right' });
      doc.text('UNIT', COL.unit, y + 5, { width: 35,  align: 'right' });
      doc.text('INS.',  COL.ins,  y + 5, { width: 65,  align: 'right' });
      doc.text('OURS', COL.ours, y + 5, { width: 65,  align: 'right' });
      doc.text('SAVINGS', COL.delta, y + 5, { width: 65, align: 'right' });
      y += 22;

      Array.from(groups.entries()).forEach(([cat, items]) => {
        doc.font('Helvetica-Bold').fontSize(8).fillColor(RED)
          .text(cat.toUpperCase(), COL.item, y);
        y += 12;

        items.forEach(li => {
          if (y > 680) { doc.addPage(); y = 50; }

          doc.font('Helvetica').fontSize(8).fillColor(BLACK)
            .text(li.label, COL.item, y, { width: 260 });
          doc.text(li.qty % 1 === 0 ? String(li.qty) : li.qty.toFixed(2),
            COL.qty,  y, { width: 45,  align: 'right' });
          doc.text(li.unit,          COL.unit, y, { width: 35,  align: 'right' });
          doc.fillColor(GRAY)
            .text(fmt(li.ins_amt),   COL.ins,  y, { width: 65,  align: 'right' });
          doc.fillColor(BLACK)
            .text(fmt(li.our_amt),   COL.ours, y, { width: 65,  align: 'right' });
          doc.fillColor('#16a34a')
            .text(fmt(li.delta),     COL.delta, y, { width: 65, align: 'right' });
          y += 14;

          doc.rect(COL.item - 4, y - 2, W + 8, 0.5).fill('#f3f4f6');
        });
        y += 4;
      });

      // ── Totals ───────────────────────────────────────────────────────────
      y += 8;
      doc.rect(L - 4, y, W + 8, 1).fill('#d1d5db');
      y += 8;

      const totRow = (label: string, val: string, bold = false, color = BLACK) => {
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9)
          .fillColor(GRAY).text(label, 330, y, { width: 150, align: 'right' })
          .fillColor(color).font(bold ? 'Helvetica-Bold' : 'Helvetica')
          .text(val, 490, y, { width: 72, align: 'right' });
        y += 16;
      };

      totRow('Insurance Allowance',        fmt(insTotal));
      totRow('Roof Works Price',           fmt(ourTotal), true);
      totRow(`Your Savings (${savingsPct.toFixed(1)}% below allowance)`, fmt(savings), false, '#16a34a');

      // Summary box
      y += 4;
      if (y > 680) { doc.addPage(); y = 50; }
      doc.rect(350, y, 212, 30).fill(RED);
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#fff')
        .text('ROOF WORKS PRICE', 356, y + 9)
        .text(fmt(ourTotal), 356, y + 9, { width: 200, align: 'right' });
      y += 50;

      // ── Disclaimer ───────────────────────────────────────────────────────
      if (y > 680) { doc.addPage(); y = 50; }
      doc.font('Helvetica').fontSize(8).fillColor(GRAY)
        .text('This estimate is based on the quantities provided and is subject to on-site inspection. Final pricing may vary. All prices include labor and materials. Valid for 30 days.', L, y, { width: W });

      y += 28;
      doc.font('Helvetica-Bold').fontSize(9).fillColor(RED)
        .text('Thank you for choosing Roof Works of Texas!', L, y, { width: W, align: 'center' });

      // ── Footer ───────────────────────────────────────────────────────────
      doc.font('Helvetica').fontSize(7).fillColor(GRAY)
        .text('Roof Works of Texas  ·  (214) 795-3905  ·  info@roofworksoftexas.com  ·  roofworksoftexas.com', L, 730, { width: W, align: 'center' });

      doc.end();
    });

    const pdfBuffer = Buffer.concat(chunks);
    const filename  = `estimate-${estimate.id.slice(-8)}.pdf`;

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Content-Length':      String(pdfBuffer.length),
        'Cache-Control':       'no-store',
      },
    });

  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error('[estimate/pdf]', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
