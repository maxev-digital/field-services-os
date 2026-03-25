import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';
import { sendEmail } from '@/lib/notify-email';

const fmtSize = (bytes: number) => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Satisfy Next.js 15 params requirement even though we use body for IDs
  await params;

  const body = await req.json();
  const { customerEmail, customerName, docIds } = body as {
    customerEmail: string;
    customerName: string;
    docIds: string[];
  };

  if (!customerEmail || !customerName || !docIds?.length) {
    return NextResponse.json(
      { error: 'customerEmail, customerName and docIds are required' },
      { status: 400 }
    );
  }

  const docs = await prisma.manufacturer_docs.findMany({
    where: { id: { in: docIds }, active: true },
    orderBy: [{ manufacturer: 'asc' }, { name: 'asc' }],
  });

  if (!docs.length) {
    return NextResponse.json({ error: 'No active docs found for provided IDs' }, { status: 404 });
  }

  const docCards = docs
    .map(
      doc => `
    <div style="border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-bottom:12px;background:#fff;">
      <div style="font-weight:bold;color:#1f2937;font-size:15px;">${doc.manufacturer} \u2014 ${doc.name}</div>
      ${doc.description ? `<div style="color:#6b7280;font-size:13px;margin:4px 0 8px;">${doc.description}</div>` : ''}
      <div style="color:#9ca3af;font-size:12px;margin-bottom:8px;">PDF &middot; ${fmtSize(doc.size_bytes)}</div>
      <a href="https://admin.roofworksoftexas.com/docs/manufacturers/${doc.filename}"
         style="display:inline-block;background:#b91c1c;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:13px;">
        View / Download PDF &#8594;
      </a>
    </div>`
    )
    .join('');

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:600px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <div style="background:#1f2937;padding:24px 32px;text-align:center;">
      <img src="https://roofworksoftexas.com/images/logo-3d.png" width="180" alt="Roof Works of Texas" style="max-width:100%;height:auto;">
    </div>
    <div style="padding:32px;">
      <h2 style="margin:0 0 8px;color:#1f2937;font-size:22px;">Your Product Documentation</h2>
      <p style="color:#4b5563;font-size:15px;margin:0 0 24px;">
        Hi ${customerName}, here are the product guides for the materials we&#39;ll be installing on your roof.
        You can view or download each PDF using the buttons below.
      </p>
      ${docCards}
      <div style="border-top:1px solid #e5e7eb;margin-top:24px;padding-top:20px;color:#6b7280;font-size:13px;">
        <p style="margin:0 0 4px;">Questions? Give us a call or reply to this email.</p>
        <p style="margin:0;font-weight:600;color:#1f2937;">214-795-3905</p>
      </div>
    </div>
    <div style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb;text-align:center;">
      <p style="margin:0;color:#9ca3af;font-size:12px;">Roof Works of Texas &middot; Dallas&#8211;Fort Worth Metroplex</p>
    </div>
  </div>
</body>
</html>`;

  await sendEmail({
    to: customerEmail,
    subject: 'Product Documentation \u2014 Roof Works of Texas',
    html,
  });

  return NextResponse.json({ ok: true, sent: docs.length });
}
