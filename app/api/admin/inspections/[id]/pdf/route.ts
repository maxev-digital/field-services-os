import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';
import path from 'path';
// @ts-ignore
import PDFDocument from 'pdfkit';
import { INSPECTION_SECTIONS } from '@/lib/inspection-sections';
import { drawCoverPage } from '@/lib/pdf-cover';

const LOGO_PATH = path.join(process.cwd(), 'public', 'images', 'logo.png');
const LOGO_H = 66;
const LOGO_W = Math.round(LOGO_H * (1376 / 768));

const RED        = '#dc2626';
const NAVY       = '#1e3a5f';
const NAVY_LIGHT = '#e8f0fb';
const BLACK      = '#1f2937';
const GRAY       = '#6b7280';
const LGRAY      = '#9ca3af';

function fmtDate(d: Date | string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();

    const report = await prisma.inspection_reports.findUnique({
      where: { id: params.id },
      include: {
        items: { orderBy: { sort_order: 'asc' } },
        photos: { orderBy: { created_at: 'asc' } },
      },
    });

    if (!report) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const damagedItems = report.items.filter((i) => i.damaged);
    const photosBySection = new Map<string, typeof report.photos>();
    for (const p of report.photos) {
      if (!photosBySection.has(p.section)) photosBySection.set(p.section, []);
      photosBySection.get(p.section)!.push(p);
    }

    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ margin: 50, size: 'LETTER', autoFirstPage: true });
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));

    await new Promise<void>((resolve) => {
      doc.on('end', resolve);

      const L = 50;
      const R = 562;
      const W = R - L;

      let pageNum = 1;

      // ── Watermark helper ─────────────────────────────────────────────────────
      function drawWatermark() {
        doc.save();
        doc.fillOpacity(0.06);
        try { doc.image(LOGO_PATH, 146, 307, { width: 320 }); } catch (_) {}
        doc.restore();
      }

      // ── Footer helper ────────────────────────────────────────────────────────
      function drawFooter(pn: number) {
        doc.save();
        doc.moveTo(L, 716).lineTo(R, 716).lineWidth(0.5).strokeColor('#d1d5db').stroke();
        doc.font('Helvetica').fontSize(7).fillColor(LGRAY)
          .text(
            'Roof Works of Texas  ·  (214) 795-3905  ·  info@roofworksoftexas.com  ·  roofworksoftexas.com',
            L, 722, { width: W, align: 'center' }
          );
        doc.font('Helvetica').fontSize(7).fillColor(LGRAY)
          .text(`Page ${pn}`, R - 30, 722, { width: 30, align: 'right' });
        doc.restore();
      }

      // ── Page 1 header ────────────────────────────────────────────────────────
      function drawPage1Header() {
        doc.rect(0, 0, 700, 90).fill(RED);

        try { doc.image(LOGO_PATH, 8, 12, { height: LOGO_H }); } catch (_) {}

        const TX = LOGO_W + 18;
        doc.fillColor('#fff').font('Helvetica-Bold').fontSize(16).text('ROOF WORKS OF TEXAS', TX, 20);
        doc.font('Helvetica').fontSize(8).fillColor('#fecaca')
          .text('Roofing Contractor · DFW & North Texas', TX, 42)
          .text('(214) 795-3905  ·  info@roofworksoftexas.com  ·  roofworksoftexas.com', TX, 55);

        doc.rect(0, 88, 700, 2).fill(NAVY);

        doc.rect(420, 0, 280, 90).fill('#b91c1c');
        doc.font('Helvetica-Bold').fontSize(11).fillColor('#fff')
          .text('PROPERTY INSPECTION REPORT', 424, 28, { width: R - 424 + 14, align: 'right' });
        doc.font('Helvetica').fontSize(8).fillColor('#fecaca')
          .text(fmtDate(new Date()), 424, 46, { width: R - 424 + 14, align: 'right' });
        doc.font('Helvetica').fontSize(7.5).fillColor('#fecaca')
          .text(`Ref: ${report.id.slice(-8).toUpperCase()}`, 424, 60, { width: R - 424 + 14, align: 'right' });
      }

      // ── Continuation header ───────────────────────────────────────────────────
      function drawContinuationHeader(pn: number) {
        doc.rect(0, 0, 700, 44).fill(NAVY);

        try { doc.image(LOGO_PATH, 8, 6, { height: 32 }); } catch (_) {}

        const TX2 = Math.round(32 * (1376 / 768)) + 14;
        doc.font('Helvetica-Bold').fontSize(10).fillColor('#fff').text('ROOF WORKS OF TEXAS', TX2, 14);
        doc.font('Helvetica').fontSize(7.5).fillColor(NAVY_LIGHT)
          .text('Property Inspection Report', TX2, 28);

        doc.font('Helvetica').fontSize(8).fillColor('#fff')
          .text(`Page ${pn}`, R, 18, { width: 30, align: 'right' });
      }

      // ── Section bar helper ────────────────────────────────────────────────────
      function drawSectionBar(label: string, y: number): number {
        doc.rect(L - 4, y, W + 8, 18).fill(NAVY);
        doc.font('Helvetica-Bold').fontSize(9).fillColor('#fff').text(label.toUpperCase(), L, y + 5);
        return y + 22;
      }

      // ── Add page with continuation header ────────────────────────────────────
      function addPage() {
        drawFooter(pageNum);
        doc.addPage();
        pageNum++;
        drawContinuationHeader(pageNum);
        drawWatermark();
        drawFooter(pageNum);
        return 58;
      }

      // ─────────────────────────────────────────────────────────────────────────
      // COVER PAGE
      // ─────────────────────────────────────────────────────────────────────────
      drawCoverPage(doc, 'PROPERTY INSPECTION REPORT', undefined, report.address);
      drawFooter(pageNum);
      doc.addPage();
      pageNum++;

      // ─────────────────────────────────────────────────────────────────────────
      // PAGE 1
      // ─────────────────────────────────────────────────────────────────────────
      drawPage1Header();
      drawWatermark();

      let y = 108;

      // ── Inspection Details section ────────────────────────────────────────────
      y = drawSectionBar('Inspection Details', y);

      const detailRows: [string, string][] = [
        ['Property Address', report.address],
        ['Inspection Date', fmtDate(report.inspection_date)],
        ['Inspector', report.inspector || '—'],
        ['Weather Conditions', report.weather || '—'],
        ['Report Status', report.status],
        ['Report Reference', report.id.slice(-8).toUpperCase()],
      ];

      detailRows.forEach(([label, value], idx) => {
        const rowY = y + idx * 18;
        if (idx % 2 === 0) {
          doc.rect(L - 4, rowY, W + 8, 18).fill(NAVY_LIGHT);
        }
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor(NAVY).text(label, L + 2, rowY + 5, { width: 160 });
        doc.font('Helvetica').fontSize(8.5).fillColor(BLACK).text(value, L + 170, rowY + 5, { width: W - 170 });
      });

      y += detailRows.length * 18 + 14;

      // ── Damage Summary section ────────────────────────────────────────────────
      if (y > 560) { y = addPage(); }

      y = drawSectionBar('Damage Summary', y);

      if (damagedItems.length === 0) {
        doc.font('Helvetica').fontSize(9).fillColor(GRAY).text('No damage items noted.', L, y);
        y += 20;
      } else {
        // Table header
        doc.rect(L - 4, y, W + 8, 16).fill('#f3f4f6');
        doc.font('Helvetica-Bold').fontSize(8).fillColor(GRAY)
          .text('SECTION', L, y + 4)
          .text('KEY FINDINGS', L + 140, y + 4);
        y += 20;

        damagedItems.forEach((item, idx) => {
          if (y > 660) { y = addPage(); }

          const sec = INSPECTION_SECTIONS.find((s) => s.key === item.section);
          const label = sec?.label || item.section;
          const data = (item.data as Record<string, any>) || {};

          const findings: string[] = [];
          if (sec) {
            for (const field of sec.fields) {
              const val = data[field.key];
              if (val === undefined || val === null || val === '' || val === false) continue;
              if (Array.isArray(val) && val.length === 0) continue;
              if (field.type === 'boolean' && val === true) {
                findings.push(field.label);
              } else if (field.type === 'multi' && Array.isArray(val)) {
                findings.push(`${field.label}: ${val.join(', ')}`);
              } else if (field.type !== 'boolean') {
                findings.push(`${field.label}: ${val}`);
              }
            }
          }

          const findingsText = findings.length > 0 ? findings.slice(0, 3).join(' · ') : 'Damage noted';

          if (idx % 2 === 0) {
            doc.rect(L - 4, y, W + 8, 16).fill('#fef2f2');
          }

          doc.font('Helvetica-Bold').fontSize(8).fillColor(RED).text(label, L, y + 4, { width: 130 });
          doc.font('Helvetica').fontSize(8).fillColor(BLACK).text(findingsText, L + 140, y + 4, { width: W - 140 });
          y += 16;
        });

        y += 8;
      }

      // ─────────────────────────────────────────────────────────────────────────
      // DAMAGED SECTIONS DETAIL
      // ─────────────────────────────────────────────────────────────────────────
      for (const item of damagedItems) {
        const sec = INSPECTION_SECTIONS.find((s) => s.key === item.section);
        if (!sec) continue;

        const data = (item.data as Record<string, any>) || {};
        const sectionPhotos = photosBySection.get(item.section) || [];

        // Check fields that have values
        const filledFields = sec.fields.filter((f) => {
          const val = data[f.key];
          if (val === undefined || val === null || val === '') return false;
          if (f.type === 'boolean') return val === true;
          if (f.type === 'multi') return Array.isArray(val) && val.length > 0;
          return true;
        });

        const hasContent = filledFields.length > 0 || item.notes || sectionPhotos.length > 0;
        if (!hasContent) continue;

        if (y > 620) { y = addPage(); }

        y = drawSectionBar(sec.label, y);

        // Field rows
        filledFields.forEach((field, idx) => {
          if (y > 660) { y = addPage(); }

          const val = data[field.key];
          let displayVal = '';
          if (field.type === 'boolean') {
            displayVal = 'Yes';
          } else if (field.type === 'multi' && Array.isArray(val)) {
            displayVal = val.join(', ');
          } else {
            displayVal = String(val);
          }

          if (idx % 2 === 0) {
            doc.rect(L - 4, y, W + 8, 16).fill(NAVY_LIGHT);
          }
          doc.font('Helvetica-Bold').fontSize(8.5).fillColor(NAVY).text(field.label, L + 2, y + 4, { width: 160 });
          doc.font('Helvetica').fontSize(8.5).fillColor(BLACK).text(displayVal, L + 170, y + 4, { width: W - 170 });
          y += 16;
        });

        // Notes
        if (item.notes) {
          if (y > 660) { y = addPage(); }
          y += 4;
          doc.font('Helvetica-Bold').fontSize(8).fillColor(GRAY).text('NOTES', L, y);
          y += 12;
          doc.font('Helvetica').fontSize(8.5).fillColor(BLACK).text(item.notes, L, y, { width: W });
          y += doc.heightOfString(item.notes, { width: W }) + 8;
        }

        // Photos
        if (sectionPhotos.length > 0) {
          if (y > 580) { y = addPage(); }
          y += 4;
          doc.font('Helvetica-Bold').fontSize(8).fillColor(GRAY).text('PHOTOS', L, y);
          y += 12;

          const IMG_H = 120;
          const IMG_W = Math.floor((W - 8) / 2);
          let col = 0;

          for (const photo of sectionPhotos) {
            if (col === 0 && y + IMG_H + 20 > 700) {
              y = addPage();
            }

            const xPos = L + col * (IMG_W + 8);

            try {
              // photo_data is a base64 data URL: "data:image/jpeg;base64,..."
              const base64Data = photo.photo_data.includes(',')
                ? photo.photo_data.split(',')[1]
                : photo.photo_data;
              const imgBuffer = Buffer.from(base64Data, 'base64');
              doc.image(imgBuffer, xPos, y, { width: IMG_W, height: IMG_H, fit: [IMG_W, IMG_H] });
            } catch (_) {
              doc.rect(xPos, y, IMG_W, IMG_H).fill('#f3f4f6');
              doc.font('Helvetica').fontSize(7).fillColor(LGRAY)
                .text('[photo]', xPos + 4, y + IMG_H / 2 - 4, { width: IMG_W - 8, align: 'center' });
            }

            if (photo.caption) {
              doc.font('Helvetica').fontSize(7).fillColor(LGRAY)
                .text(photo.caption, xPos, y + IMG_H + 2, { width: IMG_W });
            }

            col++;
            if (col >= 2) {
              col = 0;
              y += IMG_H + 20;
            }
          }

          if (col !== 0) {
            y += IMG_H + 20;
          }
        }

        y += 12;
      }

      // ── Signature line ────────────────────────────────────────────────────────
      if (y > 650) { y = addPage(); }
      y += 16;

      doc.moveTo(L, y).lineTo(L + 220, y).lineWidth(0.5).strokeColor('#9ca3af').stroke();
      doc.font('Helvetica').fontSize(8).fillColor(LGRAY).text('Inspector Signature', L, y + 4);

      doc.moveTo(R - 160, y).lineTo(R, y).lineWidth(0.5).strokeColor('#9ca3af').stroke();
      doc.font('Helvetica').fontSize(8).fillColor(LGRAY).text('Date', R - 160, y + 4);

      y += 28;
      doc.font('Helvetica').fontSize(8).fillColor(LGRAY)
        .text(report.inspector || '________________________________', L, y);

      // ── Final footer ──────────────────────────────────────────────────────────
      drawFooter(pageNum);

      doc.end();
    });

    const pdfBuffer = Buffer.concat(chunks);
    const filename = `inspection-${report.id.slice(-8)}.pdf`;

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Content-Length': String(pdfBuffer.length),
        'Cache-Control': 'no-store',
      },
    });
  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error('[inspection/pdf]', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
