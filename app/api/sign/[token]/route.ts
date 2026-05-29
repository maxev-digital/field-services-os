/**
 * GET  /api/sign/[token]  -- verify token & return estimate for signing
 * POST /api/sign/[token]  -- submit signature and mark signed
 */
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import crypto from 'crypto';

const SIGN_SECRET = process.env.SIGN_SECRET || 'rw-sign-secret-2026';

function verifyToken(token: string, estimateId: string): boolean {
  try {
    const raw   = Buffer.from(token, 'base64url').toString('utf8');
    const parts = raw.split(':');
    if (parts.length < 3) return false;
    const [eid, ts, sig] = [parts[0], parts[1], parts[2]];
    if (eid !== estimateId) return false;
    const payload  = eid + ':' + ts;
    const expected = crypto.createHmac('sha256', SIGN_SECRET).update(payload).digest('hex').slice(0, 16);
    return sig === expected;
  } catch { return false; }
}

export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const token      = params.token;
  const estimateId = req.nextUrl.searchParams.get('est');
  if (!estimateId) return NextResponse.json({ error: 'Missing est param' }, { status: 400 });
  if (!verifyToken(token, estimateId))
    return NextResponse.json({ error: 'Invalid or tampered link' }, { status: 403 });

  const rows = await prisma.$queryRaw<any[]>`
    SELECT e.id, e.address, e.insurance_total, e.our_total,
           e.sign_status, e.sign_expires_at,
           c.name AS customer_name
    FROM estimates e JOIN customers c ON c.id = e.customer_id
    WHERE e.id = ${estimateId} LIMIT 1`;

  if (!rows.length) return NextResponse.json({ error: 'Estimate not found' }, { status: 404 });
  const est = rows[0];

  if (est.sign_expires_at && new Date(est.sign_expires_at) < new Date())
    return NextResponse.json({ error: 'This signing link has expired. Please contact us for a new one.' }, { status: 410 });

  if (est.sign_status === 'signed')
    return NextResponse.json({ already_signed: true, address: est.address });

  const lineItems = await prisma.$queryRaw<any[]>`
    SELECT description, quantity, unit_price, line_total
    FROM estimate_line_items WHERE estimate_id = ${estimateId} ORDER BY created_at`;

  return NextResponse.json({ estimate: {
    id: est.id, address: est.address,
    insurance_total: est.insurance_total, our_total: est.our_total,
    customer_name: est.customer_name, line_items: lineItems,
  }});
}

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const token = params.token;
  const { estimateId, signatureDataUrl, signerName } = await req.json();

  if (!estimateId || !signatureDataUrl || !signerName)
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  if (!verifyToken(token, estimateId))
    return NextResponse.json({ error: 'Invalid or tampered link' }, { status: 403 });

  const rows = await prisma.$queryRaw<any[]>`
    SELECT sign_expires_at, sign_status FROM estimates WHERE id = ${estimateId} LIMIT 1`;
  if (!rows.length) return NextResponse.json({ error: 'Estimate not found' }, { status: 404 });
  const { sign_expires_at, sign_status } = rows[0];

  if (sign_status === 'signed') return NextResponse.json({ ok: true, already_signed: true });
  if (sign_expires_at && new Date(sign_expires_at) < new Date())
    return NextResponse.json({ error: 'Signing link expired' }, { status: 410 });

  const userIp = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';

  await prisma.$executeRaw`
    INSERT INTO contract_signatures (id, estimate_id, signer_name, signer_ip, signature_data, signed_at)
    VALUES (gen_random_uuid()::text, ${estimateId}, ${signerName}, ${userIp}, ${signatureDataUrl}, NOW())
    ON CONFLICT DO NOTHING`;

  await prisma.$executeRaw`
    UPDATE estimates
    SET sign_status = 'signed', sign_token = NULL, approved_at = NOW(),
        status = CASE WHEN status::text IN ('DRAFT','SENT','PENDING') THEN 'APPROVED'::"EstimateStatus" ELSE status END,
        updated_at = NOW()
    WHERE id = ${estimateId}`;

  return NextResponse.json({ ok: true, signed_at: new Date().toISOString() });
}
