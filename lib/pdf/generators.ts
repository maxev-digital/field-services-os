import path from 'path';
// @ts-ignore
import PDFDocument from 'pdfkit';

export interface PdfOpts {
  completionDate?: string;
  notes?: string;
  contractorSig?: string;
}

const RED    = '#9b1c1c';
const NAVY   = '#1a2e4a';
const BLACK  = '#1f2937';
const GRAY   = '#6b7280';
const LGRAY  = '#9ca3af';
const RULE   = '#e2e8f0';
const STRIPE = '#f8fafc';

const LOGO_PATH = path.join(process.cwd(), 'public', 'images', 'main_logo_navy_red.png');
const LOGO_H    = 66;
const LOGO_W    = Math.round(LOGO_H * (4600 / 4495));

function fmt(n: number) {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDate(d: Date | string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}
function embedSig(doc: any, sig: string, x: number, y: number) {
  try {
    const buf = Buffer.from(sig.replace(/^data:image\/png;base64,/, ''), 'base64');
    doc.image(buf, x, y - 32, { width: 130, height: 30 });
  } catch (_) {}
}

// ─── PAGE HEADER HELPERS ────────────────────────────────────────────────────

function drawPageOneHeader(doc: any, docDate: string, docRef: string, titleLine1: string, titleLine2: string | null, yRef: { val: number }) {
  doc.rect(0, 0, 700, 90).fill(RED);
  try { doc.image(LOGO_PATH, 8, 12, { height: LOGO_H }); } catch (_) {
    doc.rect(8, 12, LOGO_H, LOGO_H).fill('#7f1d1d');
    doc.font('Helvetica-Bold').fontSize(22).fillColor('#fff').text('RWT', 14, 28);
  }
  const TX = LOGO_W + 18;
  doc.font('Helvetica-Bold').fontSize(16).fillColor('#fff').text('ROOF WORKS OF TEXAS', TX, 20);
  doc.font('Helvetica').fontSize(8).fillColor('#fecaca')
    .text('Roofing Contractor  ·  DFW & North Texas', TX, 42)
    .text('(214) 795-3905  ·  info@roofworksoftexas.com  ·  roofworksoftexas.com', TX, 55);
  const L = 50, R = 562;
  const RX = 420;
  const RW = R - RX + 14;
  doc.rect(RX, 0, 700 - RX, 90).fill('#7f1d1d');
  if (titleLine2) {
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#fff').text(titleLine1, RX + 6, 10, { width: RW, align: 'right' });
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#fff').text(titleLine2, RX + 6, 26, { width: RW, align: 'right' });
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#fecaca')
      .text(docDate, RX + 6, 46, { width: RW, align: 'right' })
      .text(`Ref: ${docRef}`, RX + 6, 59, { width: RW, align: 'right' });
  } else {
    doc.font('Helvetica-Bold').fontSize(13).fillColor('#fff').text(titleLine1, RX + 6, 14, { width: RW, align: 'right' });
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#fecaca')
      .text(docDate, RX + 6, 35, { width: RW, align: 'right' })
      .text(`Ref: ${docRef}`, RX + 6, 48, { width: RW, align: 'right' });
  }
  doc.rect(0, 88, 700, 2).fill(NAVY);
  yRef.val = 108;
}

function drawContHeader(doc: any, docRef: string, custName: string, label: string, pg: number, yRef: { val: number }) {
  const L = 50, R = 562;
  doc.rect(0, 0, 700, 44).fill(NAVY);
  try { doc.image(LOGO_PATH, 6, 4, { height: 36 }); } catch (_) {}
  const TX2 = Math.round(36 * (4600 / 4495)) + 14;
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#fff').text('ROOF WORKS OF TEXAS', TX2, 10);
  doc.font('Helvetica').fontSize(7.5).fillColor('#fca5a5').text(label, TX2, 25);
  doc.font('Helvetica').fontSize(7.5).fillColor('#fca5a5')
    .text(`${docRef}  ·  ${custName}  ·  Page ${pg}`, R - 200, 18, { width: 214, align: 'right' });
  doc.rect(0, 43, 700, 1).fill(RED);
  yRef.val = 60;
}

function drawPageBorder(doc: any) {
  doc.save();
  doc.moveTo(4, 95).lineTo(4, 788).lineTo(608, 788).lineTo(608, 95)
    .strokeColor('#1a2e4a').lineWidth(1.5).stroke();
  doc.moveTo(9, 95).lineTo(9, 783).lineTo(603, 783).lineTo(603, 95)
    .strokeColor('#9b1c1c').lineWidth(0.75).stroke();
  doc.restore();
}

function drawFooter(doc: any, pg: number) {
  const L = 50, R = 562, W = R - L;
  drawPageBorder(doc);
  doc.rect(L - 4, 716, W + 8, 0.5).fill(RULE);
  doc.font('Helvetica').fontSize(7).fillColor(LGRAY)
    .text(`Roof Works of Texas  ·  (214) 795-3905  ·  info@roofworksoftexas.com  ·  roofworksoftexas.com  ·  Page ${pg}`, L, 722, { width: W, align: 'center' });
}

function drawWatermark(doc: any) {
  doc.save();
  doc.fillOpacity(0.06);
  try { doc.image(LOGO_PATH, 146, 307, { width: 320 }); } catch (_) {}
  doc.restore();
}

// ─── LIEN WAIVER ────────────────────────────────────────────────────────────

export async function generateLienWaiver(estimate: any, cust: any, opts: PdfOpts = {}): Promise<Buffer> {
  const docRef  = `RWT-${estimate.id.slice(-8).toUpperCase()}`;
  const docDate = fmtDate(new Date());
  const chunks: Buffer[] = [];
  const doc = new PDFDocument({ margin: 50, size: 'LETTER', autoFirstPage: true });
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));

  await new Promise<void>((resolve) => {
    doc.on('end', resolve);
    const L = 50, R = 562, W = R - L;
    const yRef = { val: 0 };
    let pg = 1;

    const newPage = () => {
      drawFooter(doc, pg);
      doc.addPage(); pg++;
      drawContHeader(doc, docRef, cust.name, 'LIEN WAIVER', pg, yRef);
      drawWatermark(doc);
    };

    const sectionBar = (title: string) => {
      if (yRef.val > 655) newPage();
      yRef.val += 4;
      doc.rect(L - 4, yRef.val, W + 8, 18).fill(NAVY);
      doc.rect(L - 4, yRef.val + 18, W + 8, 0.5).fill(RED);
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#fff').text(title, L + 4, yRef.val + 5);
      yRef.val += 26;
    };

    drawPageOneHeader(doc, docDate, docRef, 'LIEN WAIVER', null, yRef);
    drawWatermark(doc);

    doc.font('Helvetica-Bold').fontSize(9).fillColor(NAVY).text('Customer:', L, yRef.val);
    doc.font('Helvetica').fontSize(9).fillColor(BLACK).text(cust.name, L + 60, yRef.val);
    yRef.val += 14;
    doc.font('Helvetica-Bold').fontSize(9).fillColor(NAVY).text('Property:', L, yRef.val);
    doc.font('Helvetica').fontSize(9).fillColor(BLACK).text(estimate.address, L + 60, yRef.val);
    yRef.val += 14;
    doc.font('Helvetica-Bold').fontSize(9).fillColor(NAVY).text('Ref #:', L, yRef.val);
    doc.font('Helvetica').fontSize(9).fillColor(BLACK).text(docRef, L + 60, yRef.val);
    yRef.val += 22;

    sectionBar('SECTION 1 — JOB COMPLETION CERTIFICATE');
    doc.font('Helvetica').fontSize(9).fillColor(BLACK)
      .text(`I (we), the property owner(s), hereby certify that all work, equipment and materials, covered by the contract dated ${fmtDate(estimate.created_at)} between myself/ourselves and RWCR, LLC has been satisfactorily completed and said work, equipment and materials has been inspected by me (us).`, L, yRef.val, { width: W });
    yRef.val = doc.y + 16;

    doc.rect(L - 4, yRef.val, W + 8, 38).fill('#fef2f2').strokeColor('#fca5a5').lineWidth(0.75).stroke();
    doc.rect(L - 4, yRef.val, 3, 38).fill(RED);
    doc.font('Helvetica-Bold').fontSize(8).fillColor(RED)
      .text('DO NOT SIGN', L + 8, yRef.val + 6, { continued: true })
      .font('Helvetica').fillColor('#991b1b')
      .text(' this certificate until you are satisfied that the work, equipment and/or materials, as specified in the contract, have been satisfactorily completed.', { width: W - 20 });
    yRef.val += 50;

    const halfW = (W - 20) / 2;
    doc.font('Helvetica').fontSize(8).fillColor(LGRAY).text("Property Owner / Owner's Agent", L, yRef.val);
    doc.font('Helvetica').fontSize(8).fillColor(LGRAY).text('Date', L + halfW + 20, yRef.val);
    yRef.val += 10;
    doc.rect(L, yRef.val, halfW, 0.5).fill('#cbd5e1');
    doc.rect(L + halfW + 20, yRef.val, halfW, 0.5).fill('#cbd5e1');
    yRef.val += 20;
    doc.font('Helvetica').fontSize(8).fillColor(LGRAY).text("Property Owner / Owner's Agent (if applicable)", L, yRef.val);
    doc.font('Helvetica').fontSize(8).fillColor(LGRAY).text('Date', L + halfW + 20, yRef.val);
    yRef.val += 10;
    doc.rect(L, yRef.val, halfW, 0.5).fill('#cbd5e1');
    doc.rect(L + halfW + 20, yRef.val, halfW, 0.5).fill('#cbd5e1');
    yRef.val += 30;

    sectionBar('SECTION 2 — CONDITIONAL WAIVER AND RELEASE UPON FINAL PAYMENT');
    doc.font('Helvetica').fontSize(9).fillColor(BLACK)
      .text(`Upon receipt by the undersigned, of a check from ________________________________ in the sum of ${fmt(estimate.our_total)} made payable to RWCR, LLC, and when this check has been properly endorsed and has been paid by the bank upon which it is drawn, this document shall become effective to release any mechanic's lien, stop notice, or bond right the undersigned has on the job of ${cust.name}, the property owner, located at ${estimate.address}, the property address.`, L, yRef.val, { width: W });
    yRef.val = doc.y + 14;
    doc.font('Helvetica').fontSize(9).fillColor(BLACK)
      .text('This release covers the final payment to the undersigned for all labor, services, equipment or materials furnished on the job, except for disputed claims for additional work in the amount of $____________.', L, yRef.val, { width: W });
    yRef.val = doc.y + 22;

    doc.font('Helvetica').fontSize(8).fillColor(LGRAY).text('Date', L, yRef.val);
    yRef.val += 10;
    doc.rect(L, yRef.val, halfW, 0.5).fill('#cbd5e1');
    yRef.val += 20;
    doc.font('Helvetica').fontSize(8).fillColor(LGRAY).text('Contractor Representative — RWCR, LLC / Roof Works of Texas', L, yRef.val);
    yRef.val += 10;
    if (opts.contractorSig) embedSig(doc, opts.contractorSig, L, yRef.val);
    doc.rect(L, yRef.val, W, 0.5).fill('#cbd5e1');
    yRef.val += 14;

    drawFooter(doc, pg);
    doc.end();
  });

  return Buffer.concat(chunks);
}

// ─── POST-CONSTRUCTION CHECKLIST ────────────────────────────────────────────

export async function generateChecklist(estimate: any, cust: any, opts: PdfOpts = {}): Promise<Buffer> {
  const docRef  = `RWT-${estimate.id.slice(-8).toUpperCase()}`;
  const docDate = fmtDate(new Date());
  const chunks: Buffer[] = [];
  const doc = new PDFDocument({ margin: 50, size: 'LETTER', autoFirstPage: true });
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));

  await new Promise<void>((resolve) => {
    doc.on('end', resolve);
    const L = 50, R = 562, W = R - L;
    const yRef = { val: 0 };

    const sectionBar = (title: string) => {
      yRef.val += 4;
      doc.rect(L - 4, yRef.val, W + 8, 18).fill(NAVY);
      doc.rect(L - 4, yRef.val + 18, W + 8, 0.5).fill(RED);
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#fff').text(title, L + 4, yRef.val + 5);
      yRef.val += 26;
    };

    drawPageOneHeader(doc, docDate, docRef, 'POST CONSTRUCTION', 'CHECKLIST', yRef);
    drawWatermark(doc);

    doc.font('Helvetica-Bold').fontSize(9).fillColor(NAVY).text('Customer:', L, yRef.val);
    doc.font('Helvetica').fontSize(9).fillColor(BLACK).text(cust.name, L + 60, yRef.val);
    yRef.val += 14;
    doc.font('Helvetica-Bold').fontSize(9).fillColor(NAVY).text('Address:', L, yRef.val);
    doc.font('Helvetica').fontSize(9).fillColor(BLACK).text(estimate.address, L + 60, yRef.val);
    yRef.val += 14;
    doc.font('Helvetica-Bold').fontSize(9).fillColor(NAVY).text('Date:', L, yRef.val);
    doc.font('Helvetica').fontSize(9).fillColor(BLACK).text(opts.completionDate || docDate, L + 60, yRef.val);
    yRef.val += 22;

    sectionBar('POST CONSTRUCTION CHECKLIST');

    const COL_YES = R - 80;
    const COL_NO  = R - 30;
    const itemW   = COL_YES - L - 8;
    doc.rect(L - 4, yRef.val, W + 8, 18).fill('#eef2f8');
    doc.font('Helvetica-Bold').fontSize(8).fillColor(NAVY)
      .text('INSPECTION ITEM', L + 4, yRef.val + 5, { width: itemW })
      .text('YES', COL_YES, yRef.val + 5, { width: 28, align: 'center' })
      .text('NO', COL_NO, yRef.val + 5, { width: 28, align: 'center' });
    yRef.val += 20;

    const items = [
      'Heating system vents connected at both ends',
      'Hot water heater vent connected at both ends',
      'Vents, risers & turbines painted',
      'Drip edge straight and properly installed',
      'Gutters cleaned out',
      'Yard cleaned and debris removed',
      'Overall appearance of roof is acceptable',
      'Customer provided referral contacts',
    ];

    items.forEach((item, i) => {
      if (i % 2 === 0) doc.rect(L - 4, yRef.val, W + 8, 18).fill(STRIPE);
      doc.font('Helvetica').fontSize(8.5).fillColor(BLACK).text(item, L + 4, yRef.val + 5, { width: itemW });
      doc.rect(COL_YES + 4, yRef.val + 4, 10, 10).strokeColor('#cbd5e1').lineWidth(0.75).stroke();
      doc.rect(COL_NO + 4, yRef.val + 4, 10, 10).strokeColor('#cbd5e1').lineWidth(0.75).stroke();
      yRef.val += 18;
    });

    yRef.val += 14;
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(NAVY).text('COMMENTS:', L, yRef.val);
    yRef.val += 14;
    if (opts.notes) {
      doc.font('Helvetica').fontSize(8.5).fillColor(BLACK).text(opts.notes, L, yRef.val, { width: W });
      yRef.val = doc.y + 8;
    }
    for (let i = 0; i < 4; i++) {
      doc.rect(L, yRef.val, W, 0.5).fill('#e2e8f0');
      yRef.val += 18;
    }
    yRef.val += 16;

    const halfW = (W - 20) / 2;
    doc.font('Helvetica').fontSize(8).fillColor(LGRAY).text('Homeowner Signature', L, yRef.val);
    doc.font('Helvetica').fontSize(8).fillColor(LGRAY).text('Date', L + halfW + 20, yRef.val);
    yRef.val += 10;
    doc.rect(L, yRef.val, halfW, 0.5).fill('#cbd5e1');
    doc.rect(L + halfW + 20, yRef.val, halfW, 0.5).fill('#cbd5e1');
    yRef.val += 14;

    drawFooter(doc, 1);
    doc.end();
  });

  return Buffer.concat(chunks);
}

// ─── CUSTOMER GUIDELINES ────────────────────────────────────────────────────

export async function generateGuidelines(estimate: any, cust: any, opts: PdfOpts = {}): Promise<Buffer> {
  const docRef  = `RWT-${estimate.id.slice(-8).toUpperCase()}`;
  const docDate = fmtDate(new Date());
  const chunks: Buffer[] = [];
  const doc = new PDFDocument({ margin: 50, size: 'LETTER', autoFirstPage: true });
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));

  await new Promise<void>((resolve) => {
    doc.on('end', resolve);
    const L = 50, R = 562, W = R - L;
    const yRef = { val: 0 };
    let pg = 1;

    const newPage = () => {
      drawFooter(doc, pg);
      doc.addPage(); pg++;
      drawContHeader(doc, docRef, cust.name, 'CUSTOMER GUIDELINE SHEET', pg, yRef);
      drawWatermark(doc);
    };
    const sectionBar = (title: string) => {
      if (yRef.val > 655) newPage();
      yRef.val += 4;
      doc.rect(L - 4, yRef.val, W + 8, 18).fill(NAVY);
      doc.rect(L - 4, yRef.val + 18, W + 8, 0.5).fill(RED);
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#fff').text(title, L + 4, yRef.val + 5);
      yRef.val += 26;
    };
    const bulletItem = (text: string) => {
      if (yRef.val > 665) newPage();
      doc.font('Helvetica').fontSize(9).fillColor(BLACK).text('•', L + 4, yRef.val).text(text, L + 18, yRef.val, { width: W - 18 });
      yRef.val = doc.y + 6;
    };
    const numberedItem = (num: number, text: string) => {
      if (yRef.val > 665) newPage();
      doc.font('Helvetica').fontSize(9).fillColor(BLACK).text(`${num}.`, L + 4, yRef.val).text(text, L + 18, yRef.val, { width: W - 18 });
      yRef.val = doc.y + 6;
    };

    drawPageOneHeader(doc, docDate, docRef, 'CUSTOMER', 'GUIDELINE SHEET', yRef);
    drawWatermark(doc);

    doc.font('Helvetica').fontSize(9.5).fillColor(GRAY)
      .text('You will be living in a construction area during the time we are replacing your roof. We understand this can be an inconvenience. Below is a guideline to assist you to make this less of an inconvenience.', L, yRef.val, { width: W });
    yRef.val = doc.y + 18;

    sectionBar('BEFORE CONSTRUCTION');
    bulletItem('Have driveway clear and vehicles out of garage the night before or early in the morning. The truck and material delivery will be in the driveway first thing in the morning.');
    bulletItem('Remove wall hangings and breakable objects from shelves. They may fall due to vibrations caused by hammering.');
    bulletItem('Disarm burglar alarm. The vibrations may activate it.');
    bulletItem('Please do not run your sprinkler system the night before or during scheduled construction times.');
    bulletItem('Move outdoor potted plants indoors.');
    bulletItem('Keep your pet(s) indoors.');
    yRef.val += 6;

    sectionBar('DURING CONSTRUCTION');
    bulletItem('The roofing crew will generally show up before daylight to start work.');
    bulletItem('The roofing crew will need to be provided with a source of electricity and/or water.');
    bulletItem('There will be nails and debris around your house and on your driveway during the installation period. Please be careful walking around the house and do not drive on your driveway until we are finished.');
    bulletItem('Be cautious when entering or leaving your home. Debris and other objects may fall from the roof.');
    yRef.val += 6;

    sectionBar('AFTER CONSTRUCTION');
    bulletItem('Check to make sure all gates are closed before letting pet(s) outside.');
    bulletItem('Watch for overlooked nails.');
    bulletItem('Leave permits up until the city does the final inspection, if applicable.');
    bulletItem('Check furnace and hot water vents to ensure that they are connected at the unit. They may come loose when the new vents are installed.');
    yRef.val += 6;

    sectionBar('PAYMENT OPTIONS');
    numberedItem(1, "Check, Cashier's Check or Money Order.");
    numberedItem(2, 'Make all checks payable to RWCR LLC.');
    yRef.val += 14;

    if (yRef.val > 650) newPage();
    doc.rect(L - 4, yRef.val, W + 8, 0.5).fill(RULE);
    yRef.val += 12;
    doc.rect(L - 4, yRef.val, W + 8, 48).fill('#fffbeb').strokeColor('#fcd34d').lineWidth(0.75).stroke();
    doc.rect(L - 4, yRef.val, 3, 48).fill('#f59e0b');
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#92400e').text('NOTE:', L + 8, yRef.val + 6);
    doc.font('Helvetica').fontSize(8).fillColor('#78350f')
      .text('Although we will do everything possible to make sure your roofing experience goes smoothly, accidents can occur. Please notify us immediately if you experience any problems so we can immediately correct them.', L + 8, yRef.val + 20, { width: W - 16 });
    yRef.val += 60;

    drawFooter(doc, pg);
    doc.end();
  });

  return Buffer.concat(chunks);
}

// ─── CERTIFICATE OF COMPLETION ──────────────────────────────────────────────

export async function generateCertificate(estimate: any, cust: any, opts: PdfOpts = {}): Promise<Buffer> {
  const docRef  = `RWT-${estimate.id.slice(-8).toUpperCase()}`;
  const docDate = fmtDate(new Date());
  const completionDisplay = opts.completionDate ? new Date(opts.completionDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : docDate;

  const groups = new Map<string, any[]>();
  for (const li of (estimate.line_items || [])) {
    if (!groups.has(li.category)) groups.set(li.category, []);
    groups.get(li.category)!.push(li);
  }

  const chunks: Buffer[] = [];
  const doc = new PDFDocument({ margin: 50, size: 'LETTER', autoFirstPage: true });
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));

  await new Promise<void>((resolve) => {
    doc.on('end', resolve);
    const L = 50, R = 562, W = R - L;
    const yRef = { val: 0 };
    let pg = 1;

    const newPage = () => {
      drawFooter(doc, pg);
      doc.addPage(); pg++;
      drawContHeader(doc, docRef, cust.name, 'CERTIFICATE OF COMPLETION', pg, yRef);
      drawWatermark(doc);
    };
    const sectionBar = (title: string) => {
      if (yRef.val > 655) newPage();
      yRef.val += 4;
      doc.rect(L - 4, yRef.val, W + 8, 18).fill(NAVY);
      doc.rect(L - 4, yRef.val + 18, W + 8, 0.5).fill(RED);
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#fff').text(title, L + 4, yRef.val + 5);
      yRef.val += 26;
    };

    drawPageOneHeader(doc, docDate, docRef, 'CERTIFICATE OF', 'COMPLETION', yRef);
    drawWatermark(doc);

    sectionBar('CERTIFICATE OF COMPLETION');
    doc.font('Helvetica').fontSize(9.5).fillColor(GRAY)
      .text('This certifies that Roof Works of Texas (RWCR, LLC) has satisfactorily completed the roofing project described herein in accordance with the terms of the contract and all applicable building codes and industry standards.', L, yRef.val, { width: W });
    yRef.val = doc.y + 18;

    sectionBar('PROJECT DETAILS');
    const details: [string, string][] = [
      ['Property Address',   estimate.address],
      ['Contract Reference', docRef],
      ['Contract Date',      fmtDate(estimate.created_at)],
      ['Completion Date',    completionDisplay],
      ['Contract Amount',    fmt(estimate.our_total)],
      ['Insurance Company',  estimate.insurer || 'N/A'],
    ];
    details.forEach(([label, value], i) => {
      if (i % 2 === 0) doc.rect(L - 4, yRef.val, W + 8, 18).fill(STRIPE);
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(NAVY).text(label, L + 4, yRef.val + 4, { width: W / 2 - 8 });
      doc.font('Helvetica').fontSize(8.5).fillColor(BLACK).text(value, L + W / 2, yRef.val + 4, { width: W / 2 });
      yRef.val += 18;
    });
    yRef.val += 10;

    sectionBar('SCOPE OF WORK COMPLETED');
    if (groups.size > 0) {
      groups.forEach((items, category) => {
        if (yRef.val > 655) newPage();
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor(NAVY).text(category, L + 4, yRef.val);
        yRef.val = doc.y + 4;
        items.forEach((li) => {
          if (yRef.val > 665) newPage();
          doc.font('Helvetica').fontSize(8.5).fillColor(BLACK).text('•  ' + li.label, L + 14, yRef.val, { width: W - 18 });
          yRef.val = doc.y + 3;
        });
        yRef.val += 8;
      });
    } else {
      doc.font('Helvetica').fontSize(9).fillColor(GRAY).text('All roofing work as specified in the original contract has been completed.', L + 4, yRef.val, { width: W });
      yRef.val = doc.y + 10;
    }
    yRef.val += 6;

    if (yRef.val > 580) newPage();
    sectionBar('FINAL ACCEPTANCE');
    doc.font('Helvetica').fontSize(9).fillColor(GRAY)
      .text('By signing below, the property owner acknowledges that all work specified in the roofing contract has been completed to their satisfaction, that the workmanship warranty has been explained, and that final payment is due and payable upon signing.', L, yRef.val, { width: W });
    yRef.val = doc.y + 20;

    if (yRef.val > 610) newPage();
    const sigW = (W - 16) / 2;
    const sigBoxH = 68;
    const totalSigH = sigBoxH + 50;

    doc.rect(L - 4, yRef.val, sigW + 4, totalSigH).strokeColor(RULE).lineWidth(0.75).stroke();
    doc.rect(L - 4, yRef.val, 3, totalSigH).fill(NAVY);
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(NAVY).text('HOMEOWNER / CUSTOMER', L + 6, yRef.val + 7, { characterSpacing: 0.4 });
    doc.rect(L + 6, yRef.val + 20, sigW - 14, sigBoxH - 18).fill('#fafafa').strokeColor('#e2e8f0').lineWidth(0.5).stroke();
    doc.font('Helvetica').fontSize(8).fillColor(LGRAY).text('x  _________________________________', L + 10, yRef.val + 50);
    doc.rect(L + 6, yRef.val + sigBoxH + 4, sigW - 14, 0.5).fill('#cbd5e1');
    doc.font('Helvetica').fontSize(8).fillColor(LGRAY)
      .text('Print Name: _______________________', L + 6, yRef.val + sigBoxH + 10)
      .text('Date: ______________________________', L + 6, yRef.val + sigBoxH + 26);

    const RX2 = L + sigW + 20;
    doc.rect(RX2 - 4, yRef.val, sigW + 4, totalSigH).strokeColor(RULE).lineWidth(0.75).stroke();
    doc.rect(RX2 - 4, yRef.val, 3, totalSigH).fill(NAVY);
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(NAVY).text('ROOF WORKS OF TEXAS (CONTRACTOR)', RX2 + 2, yRef.val + 7, { characterSpacing: 0.4 });
    doc.rect(RX2 + 2, yRef.val + 20, sigW - 10, sigBoxH - 18).fill('#fafafa').strokeColor('#e2e8f0').lineWidth(0.5).stroke();
    if (opts.contractorSig) embedSig(doc, opts.contractorSig, RX2 + 6, yRef.val + 55);
    doc.font('Helvetica').fontSize(8).fillColor(LGRAY).text('x  _________________________________', RX2 + 6, yRef.val + 50);
    doc.rect(RX2 + 2, yRef.val + sigBoxH + 4, sigW - 10, 0.5).fill('#cbd5e1');
    doc.font('Helvetica').fontSize(8).fillColor(LGRAY)
      .text('Print Name: _______________________', RX2 + 2, yRef.val + sigBoxH + 10)
      .text('Date: ______________________________', RX2 + 2, yRef.val + sigBoxH + 26);

    yRef.val += totalSigH + 20;

    if (yRef.val > 620) newPage();
    sectionBar('WARRANTY INFORMATION');
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(NAVY).text('Limited Lifetime Workmanship Warranty', L, yRef.val);
    yRef.val = doc.y + 4;
    doc.font('Helvetica').fontSize(8.5).fillColor(BLACK)
      .text('Roof Works of Texas warrants all labor and workmanship for the life of the property under the original owner. This warranty covers defects in installation workmanship only and does not cover damage caused by Acts of God, fire, structural movement, or unauthorized modifications.', L, yRef.val, { width: W });
    yRef.val = doc.y + 12;
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(NAVY).text('Manufacturer Warranty', L, yRef.val);
    yRef.val = doc.y + 4;
    doc.font('Helvetica').fontSize(8.5).fillColor(BLACK)
      .text("All materials carry the manufacturer's warranty. Warranty documents will be provided upon final payment.", L, yRef.val, { width: W });
    yRef.val = doc.y + 14;
    if (yRef.val < 690) {
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(RED).text('Thank you for choosing Roof Works of Texas!', L, yRef.val, { width: W, align: 'center' });
    }

    drawFooter(doc, pg);
    doc.end();
  });

  return Buffer.concat(chunks);
}
