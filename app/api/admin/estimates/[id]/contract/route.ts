import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';
import path from 'path';
// @ts-ignore
import PDFDocument from 'pdfkit';
import { drawCoverPage } from '@/lib/pdf-cover';

const RED        = '#9b1c1c';
const NAVY       = '#1a2e4a';
const NAVY_LIGHT = '#eef2f7';
const BLACK      = '#1f2937';
const GRAY       = '#6b7280';
const LGRAY      = '#9ca3af';
const RULE       = '#e2e8f0';
const STRIPE     = '#f8fafc';

const LOGO_PATH  = path.join(process.cwd(), 'public', 'images', 'main_logo_navy_red.png');
// Logo is 1376×768 — at height 66px, width ≈ 118px
const LOGO_H     = 66;
const LOGO_W     = Math.round(LOGO_H * (4600 / 4495));  // ≈ 118

function fmt(n: number) {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDate(d: Date | string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();

    const estimate = await prisma.estimates.findUnique({
      where: { id: params.id },
      include: {
        customer:         true,
        line_items:       { orderBy: { category: 'asc' } },
        change_orders:    { orderBy: { created_at: 'desc' }, take: 1 },
        payment_schedule: { orderBy: { sort_order: 'asc' } },
        signature:        true,
      },
    });

    if (!estimate) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const cust     = estimate.customer;
    const latestCO = estimate.change_orders[0];
    const ourTotal = latestCO ? latestCO.new_our_total : estimate.our_total;
    const insTotal = latestCO ? latestCO.new_ins_total : estimate.insurance_total;
    const savings  = insTotal - ourTotal;
    const docDate  = fmtDate(new Date());
    const docRef   = `RWT-${estimate.id.slice(-8).toUpperCase()}`;

    const groups = new Map<string, typeof estimate.line_items>();
    for (const li of estimate.line_items) {
      if (!groups.has(li.category)) groups.set(li.category, []);
      groups.get(li.category)!.push(li);
    }

    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ margin: 50, size: 'LETTER', autoFirstPage: true });
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

      const L = 50;
      const R = 562;
      const W = R - L;
      let y   = 0;
      let pg  = 1;

      // ── Page 1 header: logo + red bar ───────────────────────────────────
      function drawPageOneHeader() {
        // Full red bar
        doc.rect(0, 0, 700, 90).fill(RED);

        // Logo — left side of red bar
        try {
          doc.image(LOGO_PATH, 8, 12, { height: LOGO_H });
        } catch (_) {
          // Fallback: initials box
          doc.rect(8, 12, LOGO_H, LOGO_H).fill('#7f1d1d');
          doc.font('Helvetica-Bold').fontSize(22).fillColor('#fff').text('RWT', 14, 28);
        }

        // Company text — right of logo
        const TX = LOGO_W + 18;
        doc.font('Helvetica-Bold').fontSize(16).fillColor('#fff').text('ROOF WORKS OF TEXAS', TX, 20);
        doc.font('Helvetica').fontSize(8).fillColor('#fecaca')
          .text('Roofing Contractor  ·  DFW & North Texas', TX, 42)
          .text('(214) 795-3905  ·  info@roofworksoftexas.com  ·  roofworksoftexas.com', TX, 55);

        // Right block — contract label + meta
        const RX = 420;
        const RW = R - RX + 14;
        doc.rect(RX, 0, 700 - RX, 90).fill('#7f1d1d');  // slightly darker band
        doc.font('Helvetica-Bold').fontSize(13).fillColor('#fff')
          .text('ROOFING CONTRACT', RX + 6, 14, { width: RW, align: 'right' });
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#fecaca')
          .text(docDate,        RX + 6, 35, { width: RW, align: 'right' })
          .text(`Ref: ${docRef}`, RX + 6, 48, { width: RW, align: 'right' });
        // Black bottom border accent on header
        doc.rect(0, 88, 700, 2).fill(NAVY);

        y = 108;
      }

      // ── Continuation header (pages 2+) ──────────────────────────────────
      function drawContinuationHeader() {
        doc.rect(0, 0, 700, 44).fill(NAVY);
        try { doc.image(LOGO_PATH, 6, 4, { height: 36 }); } catch (_) { /* skip */ }
        const TX2 = Math.round(36 * (4600 / 4495)) + 14;
        doc.font('Helvetica-Bold').fontSize(10).fillColor('#fff').text('ROOF WORKS OF TEXAS', TX2, 10);
        doc.font('Helvetica').fontSize(7.5).fillColor('#fca5a5')
          .text('ROOFING CONTRACT', TX2, 25);
        doc.font('Helvetica').fontSize(7.5).fillColor('#fca5a5')
          .text(`${docRef}  ·  ${cust.name}  ·  Page ${pg}`, R - 200, 18, { width: 214, align: 'right' });
        doc.rect(0, 43, 700, 1).fill(RED);
        y = 60;
      }

      // ── Footer ───────────────────────────────────────────────────────────
      function drawFooter() {
        doc.rect(L - 4, 716, W + 8, 0.5).fill(RULE);
        doc.font('Helvetica').fontSize(7).fillColor(LGRAY)
          .text(
            `Roof Works of Texas  ·  (214) 795-3905  ·  info@roofworksoftexas.com  ·  roofworksoftexas.com  ·  Page ${pg}`,
            L, 722, { width: W, align: 'center' }
          );
      }

      // ── Watermark (faint logo centered on page body) ─────────────────────
      function drawWatermark() {
        doc.save();
        doc.fillOpacity(0.06);
        try {
          // Logo is 1376×768 — at width 320, height ≈ 178. Center on LETTER page.
          doc.image(LOGO_PATH, 146, 307, { width: 320 });
        } catch (_) { /* skip if logo unavailable */ }
        doc.restore();
      }

      // ── Section label bar ────────────────────────────────────────────────
      function sectionBar(title: string) {
        if (y > 655) { newPage(); }
        y += 4;
        doc.rect(L - 4, y, W + 8, 18).fill(NAVY);
        doc.rect(L - 4, y + 18, W + 8, 0.5).fill(RED);  // red underline accent
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#fff')
          .text(title, L + 4, y + 5, { characterSpacing: 0.8 });
        y += 24;
      }

      // ── New page ─────────────────────────────────────────────────────────
      function newPage() {
        drawFooter();
        doc.addPage();
        pg++;
        drawWatermark();
        drawContinuationHeader();
      }

      // ═════════════════════════════════════════════════════════════════════
      // COVER PAGE
      // ═════════════════════════════════════════════════════════════════════
      drawCoverPage(doc, 'ROOFING CONTRACT', cust.name, estimate.address || undefined);
      doc.addPage();
      pg++;

      // ═════════════════════════════════════════════════════════════════════
      // PAGE 1
      // ═════════════════════════════════════════════════════════════════════
      drawPageOneHeader();

      // ── Parties ──────────────────────────────────────────────────────────
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(LGRAY)
        .text('CONTRACTOR', L, y, { characterSpacing: 0.6 });
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(LGRAY)
        .text('HOMEOWNER / CUSTOMER', 320, y, { characterSpacing: 0.6 });
      y += 12;

      doc.font('Helvetica-Bold').fontSize(10).fillColor(BLACK).text('Roof Works of Texas', L, y);
      doc.font('Helvetica').fontSize(8.5).fillColor(BLACK)
        .text('Insured Texas Roofing Contractor', L, y + 13, { width: 240 })
        .text('(214) 795-3905', L, y + 26)
        .text('info@roofworksoftexas.com', L, y + 39);

      doc.font('Helvetica-Bold').fontSize(10).fillColor(BLACK).text(cust.name, 320, y);
      doc.font('Helvetica').fontSize(8.5).fillColor(BLACK);
      let cy = y + 13;
      doc.text(cust.phone, 320, cy); cy += 13;
      if (cust.email)   { doc.text(cust.email, 320, cy);   cy += 13; }
      if (cust.address) { doc.text(cust.address, 320, cy, { width: 242 }); }

      y += 62;
      doc.rect(L - 4, y, W + 8, 0.5).fill(RULE);
      y += 10;

      // ── Project Details ───────────────────────────────────────────────────
      sectionBar('PROJECT DETAILS');

      const projRows: [string, string][] = [['Property Address', estimate.address]];
      if (estimate.insurer)  projRows.push(['Insurance Company', estimate.insurer]);
      if (estimate.claim_no) projRows.push(['Claim Number', estimate.claim_no]);
      if (estimate.adj_date) projRows.push(['Date of Loss', estimate.adj_date]);
      projRows.push(['Contract Date', docDate], ['Contract Ref', docRef]);

      projRows.forEach(([label, val], i) => {
        const ry = y + i * 14;
        if (i % 2 === 0) doc.rect(L - 4, ry, W + 8, 14).fill(STRIPE);
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor(GRAY).text(label, L + 2, ry + 2, { width: 158 });
        doc.font('Helvetica').fontSize(8.5).fillColor(BLACK).text(val, L + 165, ry + 2, { width: W - 165 });
      });
      y += projRows.length * 14 + 10;

      // ── Scope of Work & Pricing ───────────────────────────────────────────
      sectionBar('SCOPE OF WORK & PRICING');

      const COL = { item: L, qty: 306, unit: 354, ins: 392, ours: 464, sav: 562 };

      doc.rect(L - 4, y, W + 8, 16).fill('#f1f5f9');
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(GRAY);
      doc.text('DESCRIPTION', COL.item + 2, y + 4, { width: 254 });
      doc.text('QTY',     COL.qty,  y + 4, { width: 44, align: 'right' });
      doc.text('UNIT',    COL.unit, y + 4, { width: 34, align: 'right' });
      doc.text('INS.',    COL.ins,  y + 4, { width: 66, align: 'right' });
      doc.text('OURS',    COL.ours, y + 4, { width: 66, align: 'right' });
      doc.text('SAVINGS', COL.sav - 64, y + 4, { width: 64, align: 'right' });
      y += 20;

      let alt = false;
      Array.from(groups.entries()).forEach(([cat, items]) => {
        if (y > 655) { newPage(); }
        // Category header — navy light
        doc.rect(L - 4, y, W + 8, 14).fill(NAVY_LIGHT);
        doc.rect(L - 4, y, 3, 14).fill(NAVY);  // left accent bar
        doc.font('Helvetica-Bold').fontSize(7.5).fillColor(NAVY)
          .text(cat.toUpperCase(), COL.item + 6, y + 3);
        y += 14;

        items.forEach(li => {
          if (y > 665) { newPage(); }
          if (alt) doc.rect(L - 4, y, W + 8, 13).fill(STRIPE);
          alt = !alt;
          doc.font('Helvetica').fontSize(8).fillColor(BLACK)
            .text(li.label, COL.item + 2, y + 1, { width: 254 });
          doc.text(li.qty % 1 === 0 ? String(li.qty) : li.qty.toFixed(2), COL.qty, y + 1, { width: 44, align: 'right' });
          doc.text(li.unit, COL.unit, y + 1, { width: 34, align: 'right' });
          doc.fillColor(LGRAY).text(fmt(li.ins_amt), COL.ins,      y + 1, { width: 66, align: 'right' });
          doc.fillColor(BLACK).text(fmt(li.our_amt), COL.ours,     y + 1, { width: 66, align: 'right' });
          doc.fillColor('#16a34a').text(fmt(li.delta), COL.sav - 64, y + 1, { width: 64, align: 'right' });
          y += 13;
        });
        y += 2;
      });

      // Totals
      y += 6;
      doc.rect(L - 4, y, W + 8, 0.5).fill('#cbd5e1');
      y += 8;
      const tots: [string, string, string, boolean][] = [
        ['Insurance Allowance',                  fmt(insTotal), LGRAY,     false],
        ['Contract Price (Roof Works of Texas)', fmt(ourTotal), BLACK,     true ],
        [`Savings (${insTotal > 0 ? ((savings/insTotal)*100).toFixed(1) : 0}% below allowance)`, fmt(savings), '#16a34a', false],
      ];
      tots.forEach(([label, val, color, bold]) => {
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9)
          .fillColor(GRAY).text(label, 298, y, { width: 170, align: 'right' });
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9)
          .fillColor(color).text(val, 476, y, { width: 86, align: 'right' });
        y += 15;
      });

      // Contract price box — navy
      y += 4;
      if (y > 675) { newPage(); }
      doc.rect(306, y, 256, 30).fill(NAVY);
      doc.rect(306, y + 28, 256, 2).fill(RED);  // red underline on box
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#fff')
        .text('CONTRACT PRICE', 314, y + 9)
        .text(fmt(ourTotal), 314, y + 9, { width: 240, align: 'right' });
      y += 44;

      // ── Payment Schedule ──────────────────────────────────────────────────
      if (estimate.payment_schedule.length > 0) {
        if (y > 620) { newPage(); }
        sectionBar('PAYMENT SCHEDULE');

        doc.rect(L - 4, y, W + 8, 16).fill('#f1f5f9');
        doc.font('Helvetica-Bold').fontSize(7.5).fillColor(GRAY);
        doc.text('PAYMENT',   L + 2,    y + 4, { width: 158 });
        doc.text('DUE WHEN',  L + 165,  y + 4, { width: 200 });
        doc.text('AMOUNT',    L + 370,  y + 4, { width: W - 370, align: 'right' });
        y += 20;

        estimate.payment_schedule.forEach((item, i) => {
          if (y > 665) { newPage(); }
          if (i % 2 === 0) doc.rect(L - 4, y, W + 8, 16).fill(STRIPE);
          const amt = item.amount_type === 'PERCENT'
            ? `${fmt((item.amount_value / 100) * ourTotal)}  (${item.amount_value}%)`
            : fmt(item.amount_value);
          doc.font('Helvetica-Bold').fontSize(8.5).fillColor(NAVY).text(item.label, L + 2, y + 3, { width: 158 });
          doc.font('Helvetica').fontSize(8.5).fillColor(GRAY).text(item.due_trigger, L + 165, y + 3, { width: 200 });
          doc.font('Helvetica-Bold').fontSize(8.5).fillColor(BLACK).text(amt, L + 370, y + 3, { width: W - 370, align: 'right' });
          y += 16;
        });
        y += 6;
      }

      // ═════════════════════════════════════════════════════════════════════
      // TERMS & CONDITIONS PAGE
      // ═════════════════════════════════════════════════════════════════════
      newPage();

      // T&C title block
      doc.rect(L - 4, y, W + 8, 28).fill(NAVY);
      doc.rect(L - 4, y + 26, W + 8, 2).fill(RED);
      doc.font('Helvetica-Bold').fontSize(13).fillColor('#fff')
        .text('TERMS & CONDITIONS', L + 4, y + 7, { width: W });
      y += 38;
      doc.font('Helvetica').fontSize(8.5).fillColor(GRAY)
        .text(
          `This agreement is entered into between Roof Works of Texas ("Contractor") and ${cust.name} ("Customer") for the property located at ${estimate.address}.`,
          L, y, { width: W }
        );
      y = doc.y + 14;

      const terms: [string, string][] = [
        ['1. Scope of Work',
          'Contractor agrees to perform the roofing work described in the Scope of Work section of this contract. All work shall be performed in a workmanlike manner consistent with industry standards and applicable Texas building codes. Work shall commence within a reasonable time after material availability and weather conditions permit.'],
        ['2. Materials',
          'All materials shall be new and of the grade specified in the Scope of Work. Contractor reserves the right to substitute materials of equal or greater quality with prior homeowner approval. Contractor is not responsible for color variations between shingle lots from different manufacturing runs.'],
        ['3. Insurance Assignment & Cooperation',
          'Homeowner authorizes Contractor to communicate directly with the insurance company regarding this claim. Homeowner agrees to endorse and deliver all insurance proceeds checks payable to Contractor promptly upon receipt. Homeowner shall not negotiate a settlement with the insurer for less than the Contract Price without prior written consent from Contractor.'],
        ['4. Supplements',
          'If upon inspection hidden or additional damage is discovered that was not included in the original insurance scope, Contractor will submit a supplement to the insurance company. Homeowner agrees to cooperate fully with the supplement process, including signing any required authorizations. All supplemental work shall be authorized in writing prior to commencement.'],
        ['5. Payment Terms',
          'Payment shall be made according to the Payment Schedule set forth in this contract. Time is of the essence with respect to all payments. In the event of default, Contractor reserves the right to file a materialman\'s and mechanic\'s lien on the property pursuant to the Texas Property Code. Customer is responsible for all collection costs including reasonable attorney fees and court costs.'],
        ['6. Workmanship Warranty',
          'Contractor provides a LIMITED LIFETIME WORKMANSHIP WARRANTY on all labor performed under this contract. Manufacturer warranties on materials are passed through to the homeowner as provided by the manufacturer. Warranty is void if payment is not received in full, if unauthorized modifications are made, or if damage results from Acts of God, fire, or structural movement beyond Contractor\'s scope.'],
        ['7. Cancellation',
          'This contract may be cancelled without penalty within three (3) business days of signing pursuant to the Texas Home Solicitation Act. After three (3) business days, cancellation by the Customer shall entitle Contractor to recover actual costs incurred, plus a restocking fee of up to 15% of the contract value for materials already ordered.'],
        ['8. Permits & Inspections',
          'Contractor will obtain all required building permits unless otherwise noted. Permit fees are included in the contract price if listed as a line item. Customer agrees to provide reasonable access to the property for all required municipal inspections.'],
        ['9. Liability',
          'Contractor maintains general liability insurance and workers\' compensation coverage for all employees. Contractor is not liable for pre-existing structural deficiencies, mold, rot, or latent damage discovered upon tear-off. Customer agrees to notify occupants and remove vehicles from driveways prior to commencement of work each day.'],
        ['10. Dispute Resolution',
          'Any dispute arising from this contract shall first be subject to good-faith mediation between the parties. If mediation fails, the dispute shall be resolved by binding arbitration in Dallas County, Texas under the rules of the American Arbitration Association. Texas law governs this agreement. The prevailing party shall be entitled to recover reasonable attorney fees and costs.'],
      ];

      terms.forEach(([title, text]) => {
        if (y > 645) { newPage(); }
        const startY = y;
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor(NAVY).text(title, L + 10, y);
        y = doc.y + 2;
        doc.font('Helvetica').fontSize(8).fillColor(BLACK).text(text, L + 10, y, { width: W - 10 });
        y = doc.y + 10;
        // Left navy accent bar spanning the section
        doc.rect(L - 4, startY, 4, y - startY - 10).fill(NAVY_LIGHT);
        doc.rect(L - 4, startY, 1.5, y - startY - 10).fill(NAVY);
      });

      // ═════════════════════════════════════════════════════════════════════
      // SIGNATURE BLOCK
      // ═════════════════════════════════════════════════════════════════════
      if (y > 470) { newPage(); }
      else { y += 14; doc.rect(L - 4, y, W + 8, 0.5).fill(RULE); y += 14; }

      // Agreement banner — navy
      doc.rect(L - 4, y, W + 8, 30).fill(NAVY);
      doc.rect(L - 4, y + 28, W + 8, 2).fill(RED);
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#fff')
        .text('AGREEMENT & AUTHORIZATION', L + 4, y + 9, { width: W });
      y += 40;
      doc.font('Helvetica').fontSize(8.5).fillColor(GRAY)
        .text('By signing below, both parties agree to all terms and conditions stated in this contract.', L, y, { width: W, align: 'center' });
      y += 22;

      const sigW = (W - 16) / 2;
      const sigBoxH = 68;
      const totalSigH = sigBoxH + 42;

      // ── Homeowner box ────────────────────────────────────────────────────
      doc.rect(L - 4, y, sigW + 4, totalSigH).strokeColor(RULE).lineWidth(0.75).stroke();
      doc.rect(L - 4, y, 3, totalSigH).fill(NAVY);  // left accent
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(NAVY)
        .text('HOMEOWNER / CUSTOMER', L + 6, y + 7, { characterSpacing: 0.4 });

      if (estimate.signature) {
        try {
          const b64 = estimate.signature.signature_data.replace(/^data:image\/png;base64,/, '');
          const buf = Buffer.from(b64, 'base64');
          doc.image(buf, L + 6, y + 20, { width: sigW - 14, height: sigBoxH - 18 });
        } catch (_) {
          doc.rect(L + 6, y + 20, sigW - 14, sigBoxH - 18).fill('#f8fafc');
        }
        doc.rect(L + 6, y + sigBoxH + 4, sigW - 14, 0.5).fill('#cbd5e1');
        doc.font('Helvetica-Bold').fontSize(9).fillColor(BLACK)
          .text(estimate.signature.signer_name, L + 6, y + sigBoxH + 9);
        doc.font('Helvetica').fontSize(7.5).fillColor(LGRAY)
          .text(fmtDate(estimate.signature.signed_at), L + 6, y + sigBoxH + 23);
      } else {
        doc.rect(L + 6, y + 20, sigW - 14, sigBoxH - 18).fill('#fafafa').strokeColor('#e2e8f0').lineWidth(0.5).stroke();
        doc.font('Helvetica').fontSize(8).fillColor(LGRAY)
          .text('x  _________________________________', L + 10, y + 50);
        doc.rect(L + 6, y + sigBoxH + 4, sigW - 14, 0.5).fill('#cbd5e1');
        doc.font('Helvetica').fontSize(8).fillColor(LGRAY)
          .text('Print Name: _______________________', L + 6, y + sigBoxH + 10)
          .text('Date: ______________________________', L + 6, y + sigBoxH + 24);
      }

      // ── Contractor box ───────────────────────────────────────────────────
      const RX = L + sigW + 20;
      doc.rect(RX - 4, y, sigW + 4, totalSigH).strokeColor(RULE).lineWidth(0.75).stroke();
      doc.rect(RX - 4, y, 3, totalSigH).fill(NAVY);
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(NAVY)
        .text('ROOF WORKS OF TEXAS (CONTRACTOR)', RX + 2, y + 7, { characterSpacing: 0.4 });
      doc.rect(RX + 2, y + 20, sigW - 10, sigBoxH - 18).fill('#fafafa').strokeColor('#e2e8f0').lineWidth(0.5).stroke();
      doc.font('Helvetica').fontSize(8).fillColor(LGRAY)
        .text('x  _________________________________', RX + 6, y + 50);
      doc.rect(RX + 2, y + sigBoxH + 4, sigW - 10, 0.5).fill('#cbd5e1');
      doc.font('Helvetica').fontSize(8).fillColor(LGRAY)
        .text('Print Name: _______________________', RX + 2, y + sigBoxH + 10)
        .text('Date: ______________________________', RX + 2, y + sigBoxH + 24);

      y += totalSigH + 20;

      if (y < 690) {
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor(RED)
          .text('Thank you for choosing Roof Works of Texas!', L, y, { width: W, align: 'center' });
      }

      drawFooter();
      doc.end();
    });

    const pdfBuffer = Buffer.concat(chunks);
    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `inline; filename="contract-${docRef}.pdf"`,
        'Content-Length':      String(pdfBuffer.length),
        'Cache-Control':       'no-store',
      },
    });

  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error('[contract/pdf]', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
