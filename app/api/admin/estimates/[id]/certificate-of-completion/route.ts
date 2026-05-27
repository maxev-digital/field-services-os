import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';
import { generateCertificate } from '@/lib/pdf/generators';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();
    const estimate = await prisma.estimates.findUnique({ where: { id: params.id }, include: { customer: true, line_items: { orderBy: { category: 'asc' } } } });
    if (!estimate) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const sp = req.nextUrl.searchParams;
    const opts = { completionDate: sp.get('completionDate') || undefined, notes: sp.get('notes') || undefined, contractorSig: sp.get('contractorSig') || undefined };
    const pdfBuffer = await generateCertificate(estimate, estimate.customer, opts);
    const docRef = `RWT-${estimate.id.slice(-8).toUpperCase()}`;
    return new NextResponse(pdfBuffer, { status: 200, headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="certificate-of-completion-${docRef}.pdf"`, 'Content-Length': String(pdfBuffer.length), 'Cache-Control': 'no-store' } });
  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error('[certificate/pdf]', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
