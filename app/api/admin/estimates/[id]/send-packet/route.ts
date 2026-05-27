import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';
import { generateLienWaiver, generateChecklist, generateGuidelines, generateCertificate } from '@/lib/pdf/generators';
import { sendEmail } from '@/lib/mailer';
import { wrapInBrandedEmail } from '@/lib/brandedWrapper';
import fs from 'fs';
import path from 'path';

const SETTINGS_FILE = path.join(process.cwd(), 'data', 'contractor-settings.json');
function readSettings() {
  try { return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')); } catch { return {}; }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();

    const estimate = await prisma.estimates.findUnique({
      where: { id: params.id },
      include: { customer: true, line_items: { orderBy: { category: 'asc' } }, invoice: true },
    });
    if (!estimate) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const cust = estimate.customer;
    if (!cust.email) return NextResponse.json({ error: 'Customer has no email address' }, { status: 400 });

    const body = await req.json();
    const { docs = ['lien-waiver','checklist','guidelines','certificate'], productDocIds = [], includeEstimatePdf = false, includeInvoicePdf = false, completionDate, notes, contractorSig: bodySig } = body;

    const settings = readSettings();
    const contractorSig: string | undefined = bodySig || settings.contractorSig || undefined;
    const opts = { completionDate: completionDate || undefined, notes: notes || undefined, contractorSig };

    const attachments: { filename: string; content: Buffer; contentType: string }[] = [];
    const docRef = `RWT-${estimate.id.slice(-8).toUpperCase()}`;

    for (const doc of docs) {
      let buf: Buffer;
      let filename: string;
      if (doc === 'lien-waiver')       { buf = await generateLienWaiver(estimate, cust, opts);  filename = `lien-waiver-${docRef}.pdf`; }
      else if (doc === 'checklist')    { buf = await generateChecklist(estimate, cust, opts);   filename = `post-construction-checklist-${docRef}.pdf`; }
      else if (doc === 'guidelines')   { buf = await generateGuidelines(estimate, cust, opts);  filename = `customer-guidelines-${docRef}.pdf`; }
      else if (doc === 'certificate')  { buf = await generateCertificate(estimate, cust, opts); filename = `certificate-of-completion-${docRef}.pdf`; }
      else continue;
      attachments.push({ filename, content: buf, contentType: 'application/pdf' });
    }

    // Attach selected manufacturer/product docs
    if (productDocIds.length > 0) {
      const mfrDocs = await prisma.manufacturer_docs.findMany({ where: { id: { in: productDocIds } } });
      for (const mfr of mfrDocs) {
        const filePath = path.join(process.cwd(), 'public', 'docs', 'manufacturers', mfr.filename);
        try {
          const content = fs.readFileSync(filePath);
          attachments.push({ filename: mfr.filename, content, contentType: 'application/pdf' });
        } catch (err) {
          console.warn(`[send-packet] Could not read manufacturer doc: ${mfr.filename}`, err);
        }
      }
    }

    // Attach estimate PDF
    if (includeEstimatePdf) {
      try {
        const pdfRes = await fetch(`http://localhost:3020/api/admin/estimates/${params.id}/pdf`, {
          headers: { cookie: req.headers.get('cookie') || '' },
        });
        if (pdfRes.ok) {
          const pdfBuf = Buffer.from(await pdfRes.arrayBuffer());
          attachments.push({ filename: `estimate-${docRef}.pdf`, content: pdfBuf, contentType: 'application/pdf' });
        }
      } catch (err) { console.warn('[send-packet] Could not generate estimate PDF', err); }
    }

    // Attach invoice PDF
    if (includeInvoicePdf && estimate.invoice) {
      try {
        const invRes = await fetch(`http://localhost:3020/api/admin/invoices/${estimate.invoice.id}/pdf`, {
          headers: { cookie: req.headers.get('cookie') || '' },
        });
        if (invRes.ok) {
          const invBuf = Buffer.from(await invRes.arrayBuffer());
          attachments.push({ filename: `invoice-${docRef}.pdf`, content: invBuf, contentType: 'application/pdf' });
        }
      } catch (err) { console.warn('[send-packet] Could not generate invoice PDF', err); }
    }

    const docListHtml = attachments.map(a =>
      `<li>${a.filename.replace(`-${docRef}.pdf`, '').replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}</li>`
    ).join('');

    const emailBody = wrapInBrandedEmail(`
      <h2 style="color:#1e3a5f;margin:0 0 16px">Your Roofing Project Documents</h2>
      <p>Dear ${cust.name},</p>
      <p>Please find your project documentation attached for the property at <strong>${estimate.address}</strong>.</p>
      <p>The following documents are included:</p>
      <ul style="margin:120x 0;padding-left:20px">${docListHtml}</ul>
      <p>Please review and retain these documents for your records. If you have any questions, do not hesitate to reach out.</p>
      <p style="margin-top:24px">Thank you for choosing Roof Works of Texas!</p>
      <p><strong>Roof Works of Texas</strong><br/>(214) 795-3905 &middot; info@roofworksoftexas.com</p>
    `);

    await sendEmail({
      to: cust.email,
      toName: cust.name,
      subject: `Your Roofing Documents — ${estimate.address}`,
      html: emailBody,
      attachments,
    });

    return NextResponse.json({ ok: true, sent: attachments.length, to: cust.email });
  } catch (e: any) {
    if (e.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error('[send-packet]', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
