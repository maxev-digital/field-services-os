/**
 * GET  /api/admin/settings/inbound   — read inbound call settings
 * POST /api/admin/settings/inbound   — update inbound call settings
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import fs from 'fs';
import path from 'path';

const SETTINGS_FILE = path.join(process.cwd(), 'data', 'inbound-call-settings.json');

const DEFAULT_SETTINGS = {
  ownerMobile:        '',
  businessHoursStart: 8,
  businessHoursEnd:   19,
  businessDays:       [1, 2, 3, 4, 5, 6],
  afterHoursMessage:  "I'm sorry, we're currently outside business hours. I'll have someone call you back first thing tomorrow morning. Is there anything else I can help you with?",
  transferMessage:    "Please hold for just a moment while I connect you with our team. They'll be right with you.",
  enabled:            true,
};

function readSettings() {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) }; }
  catch { return DEFAULT_SETTINGS; }
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
    const updated = {
      ...current,
      ownerMobile:        body.ownerMobile        ?? current.ownerMobile,
      businessHoursStart: body.businessHoursStart ?? current.businessHoursStart,
      businessHoursEnd:   body.businessHoursEnd   ?? current.businessHoursEnd,
      businessDays:       body.businessDays        ?? current.businessDays,
      afterHoursMessage:  body.afterHoursMessage  ?? current.afterHoursMessage,
      transferMessage:    body.transferMessage     ?? current.transferMessage,
      enabled:            body.enabled             ?? current.enabled,
    };
    writeSettings(updated);
    return NextResponse.json({ ok: true, settings: updated });
  } catch (e: any) {
    if (e.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
