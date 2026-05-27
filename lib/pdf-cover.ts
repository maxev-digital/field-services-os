import path from 'path';

const LOGO_PATH  = path.join(process.cwd(), 'public', 'images', 'main_logo_navy_red.png');
const COVER_PATH = path.join(process.cwd(), 'public', 'images', 'cover_page.png');

const RED  = '#9b1c1c';
const NAVY = '#1a2e4a';

function drawPageBorder(doc: any) {
  doc.save();
  doc.rect(4, 4, 604, 784).strokeColor('#1a2e4a').lineWidth(1.5).stroke();
  doc.rect(9, 9, 594, 774).strokeColor('#9b1c1c').lineWidth(0.75).stroke();
  doc.restore();
}


// Logo is 1376×768 — at LOGO_H=66, width ≈ 118
const LOGO_H = 66;
const LOGO_W = Math.round(LOGO_H * (4600 / 4495)); // ≈ 118

/**
 * Draws a branded cover page on the *current* PDFKit page.
 * Call `doc.addPage()` after this to begin the main content.
 */
export function drawCoverPage(
  doc: any,
  docType: string,
  customerName?: string,
  address?: string,
) {
  // LETTER = 612 × 792 pt
  const PW   = 612;
  const PH   = 792;
  const HDR  = 100;
  const BOT  = 115;
  const IMG_Y = HDR + 3;
  const IMG_H = PH - HDR - BOT - 3;

  // ── Header ─────────────────────────────────────────────────────────────
  // White background for the full header area
  doc.rect(0, 0, PW, HDR).fill('#ffffff');

  // Logo — top left, no separator line
  try { doc.image(LOGO_PATH, 12, 17, { height: LOGO_H }); } catch (_) {}

  // Company name + doc type to the right of the logo
  const TX = LOGO_W + 26;
  doc.font('Helvetica-Bold').fontSize(20).fillColor(NAVY)
    .text('ROOF WORKS OF TEXAS', TX, 20, { width: PW - TX - 20 });
  doc.font('Helvetica-Bold').fontSize(12).fillColor(RED)
    .text(docType, TX, 50, { width: PW - TX - 20 });

  // Single clean navy bottom border on header
  doc.rect(0, HDR, PW, 3).fill(NAVY);
  doc.rect(0, HDR + 3, PW, 1).fill(RED);

  // ── Cover image (fit preserves aspect ratio — no stretching) ───────────
  try {
    doc.image(COVER_PATH, 0, IMG_Y, { fit: [PW, IMG_H] });
  } catch (_) {
    doc.rect(0, IMG_Y, PW, IMG_H).fill('#eef2f7');
    doc.font('Helvetica-Bold').fontSize(36).fillColor('#c3d0e8')
      .text('ROOF WORKS\nOF TEXAS', 0, IMG_Y + IMG_H / 2 - 48, { width: PW, align: 'center' });
  }

  // ── Bottom strip ───────────────────────────────────────────────────────
  const BY = PH - BOT;
  doc.rect(0, BY, PW, BOT).fill(NAVY);
  doc.rect(0, BY, PW, 2).fill(RED);

  // Left: company info
  doc.font('Helvetica-Bold').fontSize(11).fillColor('#ffffff')
    .text('ROOF WORKS OF TEXAS', 30, BY + 16);
  doc.font('Helvetica').fontSize(8.5).fillColor('#fecaca')
    .text('Roofing Contractor  ·  DFW & North Texas', 30, BY + 34)
    .text('(214) 795-3905  ·  info@roofworksoftexas.com  ·  roofworksoftexas.com', 30, BY + 50);

  // Right: customer / address
  if (customerName) {
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#ffffff')
      .text(customerName, 30, BY + 16, { width: PW - 60, align: 'right' });
  }
  if (address) {
    doc.font('Helvetica').fontSize(8.5).fillColor('#fecaca')
      .text(address, 30, BY + 34, { width: PW - 60, align: 'right' });
  }

}
