import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import fs from 'fs';
import path from 'path';

const SETTINGS_FILE = path.join(process.cwd(), 'data', 'admin-settings.json');

const DEFAULTS = {
  businessName: 'Roof Works of Texas',
  phone: '214-795-3905',
  email: 'info@roofworksoftexas.com',
  website: 'roofworksoftexas.com',
  serviceArea: 'DFW Metroplex',
  license: '',
  googleReviewUrl: '',
  repName: 'Will',
  notifyNewEstimate: true,
  notifyJobStatus: true,
  notifyInsuranceClaim: true,
};

function readSettings() {
  try { return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) }; }
  catch { return DEFAULTS; }
}
function writeSettings(data: any) {
  fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2));
}

export async function GET() {
  try {
    await requireAdmin();
    return NextResponse.json(readSettings());
  } catch (e: any) {
    if (e.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    const body = await req.json();
    const current = readSettings();
    writeSettings({ ...current, ...body });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
