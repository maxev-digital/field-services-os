// app/api/admin/document-packets/send/route.ts
// GET: Fetch send history for an estimate
// POST: Send a document packet to customer email

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';
import { sendTransactionalEmail } from '@/lib/mailer';
import { wrapInBrandedEmail } from '@/lib/brandedWrapper';

// GET — send history for an estimate
export async function GET(req: NextRequest) {
  try { await requireAdmin(); } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); }

  const url = new URL(req.url);
  const estimateId = url.searchParams.get('estimateId');
  if (!estimateId) return NextResponse.json({ sends: [] });

  const sends = await prisma.estimate_packet_sends.findMany({
    where: { estimate_id: estimateId },
    orderBy: { sent_at: 'desc' },
  });

  return NextResponse.json({ sends });
}

export async function POST(req: NextRequest) {
  try { await requireAdmin(); } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); }

  try {
    const body = await req.json();
    const { estimateId, customerEmail, customerName, packetType, docIds, estimateTotal, invoiceNo } = body;

    if (!estimateId || !customerEmail || !packetType || !docIds?.length) {
      return NextResponse.json({ error: 'estimateId, customerEmail, packetType, and docIds are required' }, { status: 400 });
    }

    if (!['pre_project', 'post_project'].includes(packetType)) {
      return NextResponse.json({ error: 'packetType must be pre_project or post_project' }, { status: 400 });
    }

    // Fetch selected documents with file_data
    const docs = await prisma.document_packets.findMany({
      where: { id: { in: docIds }, active: true },
      orderBy: { sort_order: 'asc' },
    });

    if (docs.length === 0) {
      return NextResponse.json({ error: 'No valid documents found' }, { status: 400 });
    }

    // Build attachments from base64 file_data
    const attachments: { filename: string; content: Buffer; contentType: string }[] = [];
    for (const doc of docs) {
      if (!doc.file_data) continue;
      const buffer = Buffer.from(doc.file_data, 'base64');
      const ext = doc.filename.split('.').pop()?.toLowerCase() || 'pdf';
      const contentType = ext === 'pdf' ? 'application/pdf'
        : ext === 'png' ? 'image/png'
        : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
        : 'application/octet-stream';
      attachments.push({ filename: doc.filename, content: buffer, contentType });
    }

    if (attachments.length === 0) {
      return NextResponse.json({ error: 'None of the selected documents have file data' }, { status: 400 });
    }

    // Fetch estimate for context
    const estimate = await prisma.estimates.findUnique({
      where: { id: estimateId },
      select: { address: true, id: true },
    });

    const address = estimate?.address || 'your property';
    const name = customerName || 'Valued Customer';
    const isPreProject = packetType === 'pre_project';

    // Category badge labels
    const categoryLabels: Record<string, string> = {
      agreement: 'Agreement',
      license: 'License',
      insurance: 'Insurance',
      warranty: 'Warranty',
      certificate: 'Certificate',
      guide: 'Guide',
      inspection: 'Inspection',
      other: 'Document',
      general: 'Document',
    };

    const docListHtml = docs.map(d => {
      const catLabel = categoryLabels[d.category] || 'Document';
      return `<li style="margin-bottom:6px;">
        <span style="display:inline-block;padding:2px 8px;background:#fef2f2;color:#dc2626;border-radius:4px;font-size:11px;font-weight:600;margin-right:8px;">${catLabel}</span>
        ${d.display_name}
      </li>`;
    }).join('');

    const subject = isPreProject
      ? `Pre-Project Documents — ${address}`
      : `Post-Project Documents — ${address}`;

    const heading = isPreProject
      ? 'Your Pre-Project Documents'
      : 'Your Post-Project Documents';

    const intro = isPreProject
      ? `<p>We're excited to get started on your roofing project at <strong>${address}</strong>. Please review the following documents included with your estimate.</p>`
      : `<p>Thank you for choosing Roof Works of Texas for your roofing project at <strong>${address}</strong>. Please find your post-project documentation below for your records.</p>`;

    const extra = invoiceNo
      ? `<p style="margin-top:16px;font-size:13px;color:#6b7280;">Reference: Invoice #${invoiceNo}</p>`
      : estimateTotal
      ? `<p style="margin-top:16px;font-size:13px;color:#6b7280;">Estimate Total: $${Number(estimateTotal).toLocaleString()}</p>`
      : '';

    const emailBody = wrapInBrandedEmail(`
      <h2 style="color:#1e3a5f;margin:0 0 16px">${heading}</h2>
      <p>Dear ${name},</p>
      ${intro}
      <p>The following documents are attached:</p>
      <ul style="margin:12px 0;padding-left:20px;list-style:none;">${docListHtml}</ul>
      ${extra}
      <p style="margin-top:20px;">If you have any questions about these documents, please don't hesitate to reach out.</p>
      <p style="margin-top:24px"><strong>Roof Works of Texas</strong><br/>(214) 795-3905 &middot; info@roofworksoftexas.com</p>
    `);

    const result = await sendTransactionalEmail({
      to: customerEmail,
      toName: name,
      subject,
      html: emailBody,
      attachments,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Failed to send email' }, { status: 500 });
    }

    // Record the send
    await prisma.estimate_packet_sends.create({
      data: {
        estimate_id: estimateId,
        packet_type: packetType,
        doc_ids: docIds,
        sent_to: customerEmail,
      },
    });

    return NextResponse.json({
      ok: true,
      sent: attachments.length,
      to: customerEmail,
      type: packetType,
    });
  } catch (e: any) {
    if (e.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error('[document-packets send]', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
