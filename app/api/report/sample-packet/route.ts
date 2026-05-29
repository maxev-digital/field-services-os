import { NextResponse } from 'next/server';
import { PDFDocument } from 'pdf-lib';
import { generateLienWaiver, generateChecklist, generateGuidelines, generateCertificate } from '@/lib/pdf/generators';

export const dynamic = 'force-dynamic';

const BASE = 'https://admin.roofworksoftexas.com';

const SAMPLE_CUST = {
  name: 'Sample Homeowner',
  address: '3513 Bankside Dr, The Colony, TX 75056',
  phone: '(214) 555-0100',
  email: 'homeowner@example.com',
};

const SAMPLE_EST_BASE = {
  address: '3513 Bankside Dr, The Colony, TX 75056',
  status: 'INVOICED',
  our_total: 12_850.00,
  insurance_total: 15_200.00,
  insurer: 'State Farm',
  claim_no: 'CLM-SAMPLE-001',
  adj_date: null as null,
  created_at: new Date('2025-04-01'),
  change_orders: [] as any[],
  line_items: [] as any[],
  customer: SAMPLE_CUST,
};

async function fetchPdf(url: string): Promise<Buffer> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`PDF fetch failed: ${url} → ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function mergeBuffers(buffers: Buffer[]): Promise<Buffer> {
  const merged = await PDFDocument.create();
  for (const buf of buffers) {
    try {
      const doc = await PDFDocument.load(buf);
      const pages = await merged.copyPages(doc, doc.getPageIndices());
      pages.forEach(p => merged.addPage(p));
    } catch (e: any) {
      console.warn('[sample-packet] skipping doc:', e.message);
    }
  }
  const bytes = await merged.save();
  return Buffer.from(bytes);
}

export async function GET() {
  try {
    const inspId = process.env.SAMPLE_INSPECTION_ID;
    const estId  = process.env.SAMPLE_ESTIMATE_ID;

    if (!inspId || !estId) {
      return NextResponse.json({ error: 'Sample IDs not configured' }, { status: 500 });
    }

    const sampleEst = { ...SAMPLE_EST_BASE, id: estId };

    const completionDate = new Date().toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric',
    });

    const [inspBuf, estBuf, lienBuf, checkBuf, guidBuf, certBuf] = await Promise.all([
      fetchPdf(`${BASE}/api/admin/inspections/${inspId}/pdf`),
      fetchPdf(`${BASE}/api/admin/estimates/${estId}/pdf`),
      generateLienWaiver(sampleEst, SAMPLE_CUST),
      generateChecklist(sampleEst, SAMPLE_CUST),
      generateGuidelines(sampleEst, SAMPLE_CUST),
      generateCertificate(sampleEst, SAMPLE_CUST, { completionDate }),
    ]);

    const combined = await mergeBuffers([inspBuf, estBuf, lienBuf, checkBuf, guidBuf, certBuf]);

    return new NextResponse(combined, {
      status: 200,
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': 'inline; filename="roof-works-sample-packet.pdf"',
        'Content-Length':      String(combined.length),
        'Cache-Control':       'public, max-age=3600',
      },
    });
  } catch (err: any) {
    console.error('[sample-packet]', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
