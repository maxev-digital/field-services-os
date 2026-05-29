/**
 * POST /api/admin/webhooks/retell-transfer
 * Called by a Retell agent when it decides to warm-transfer a caller to the owner.
 * Returns: { destination_number, message } — Retell reads `message` aloud then transfers.
 * Also fires an immediate email + Telegram pre-transfer alert.
 *
 * Retell webhook payload: { call_id, from_number, to_number, metadata?, ... }
 */
import { NextRequest, NextResponse } from 'next/server';
import { sendEmail } from '@/lib/notify-email';
import { notifyInboundCall } from '@/lib/telegram-notify';
import fs from 'fs';
import path from 'path';

const NOTIFY_EMAIL   = 'info@roofworksoftexas.com';
const SETTINGS_FILE  = path.join(process.cwd(), 'data', 'inbound-call-settings.json');

function readSettings(): InboundSettings {
  try { return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')); } catch { return DEFAULT_SETTINGS; }
}

interface InboundSettings {
  ownerMobile:        string;
  businessHoursStart: number; // 0-23 CST hour
  businessHoursEnd:   number; // 0-23 CST hour
  businessDays:       number[]; // 0=Sun, 1=Mon, ...
  afterHoursMessage:  string;
  transferMessage:    string;
  enabled:            boolean;
}

const DEFAULT_SETTINGS: InboundSettings = {
  ownerMobile:        '',
  businessHoursStart: 8,
  businessHoursEnd:   19,
  businessDays:       [1, 2, 3, 4, 5, 6], // Mon-Sat
  afterHoursMessage:  "I'm sorry, we're currently outside business hours. I'll have someone call you back first thing tomorrow morning. Is there anything else I can help you with?",
  transferMessage:    "Please hold for just a moment while I connect you with our team. They'll be right with you.",
  enabled:            true,
};

function isBusinessHours(settings: InboundSettings): boolean {
  const now = new Date();
  const cst = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
  const day  = cst.getDay();
  const hour = cst.getHours();
  return (
    settings.businessDays.includes(day) &&
    hour >= settings.businessHoursStart &&
    hour < settings.businessHoursEnd
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { call_id, from_number, call } = body;
    const fromNum = from_number || call?.from_number || 'Unknown';
    const callId  = call_id || call?.call_id || 'unknown';

    const settings = readSettings();

    // If disabled or no mobile configured, reject gracefully
    if (!settings.enabled || !settings.ownerMobile) {
      return NextResponse.json({
        destination_number: null,
        message: "I'm sorry, I'm unable to transfer your call right now. Please leave your name and number and someone will call you back shortly.",
        error: 'transfer_unavailable',
      });
    }

    // Check business hours
    if (!isBusinessHours(settings)) {
      return NextResponse.json({
        destination_number: null,
        message: settings.afterHoursMessage,
        error: 'outside_hours',
      });
    }

    // Send pre-transfer alert (fire and forget)
    const time = new Date().toLocaleString('en-US', {
      timeZone: 'America/Chicago',
      dateStyle: 'short',
      timeStyle: 'short',
    });

    Promise.all([
      sendEmail({
        to:      NOTIFY_EMAIL,
        subject: `📲 Incoming Transfer — ${fromNum}`,
        html: `<div style="font-family:Arial,sans-serif;max-width:480px;padding:0;">
          <div style="background:#1d4ed8;padding:16px 20px;">
            <h2 style="margin:0;color:#fff;font-size:18px;">Incoming Call Transfer</h2>
            <p style="margin:4px 0 0;color:#bfdbfe;font-size:13px;">AI receptionist is transferring a qualified caller</p>
          </div>
          <div style="background:#fff;padding:20px;border:1px solid #e5e7eb;border-top:none;">
            <p style="margin:0 0 8px;font-size:15px;"><strong>Caller:</strong> ${fromNum}</p>
            <p style="margin:0 0 8px;font-size:15px;"><strong>Time:</strong> ${time} CT</p>
            <p style="margin:0;font-size:15px;"><strong>Call ID:</strong> <span style="font-family:monospace;font-size:13px;">${callId}</span></p>
            <div style="margin-top:16px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;padding:12px;">
              <p style="margin:0;font-size:13px;color:#1e40af;">Your phone is ringing now — this caller passed the AI screening and wants to speak with you.</p>
            </div>
          </div>
        </div>`,
      }),
      notifyInboundCall(`TRANSFER: ${fromNum}`),
    ]).catch(() => {});

    // Normalize owner mobile to E.164
    const digits = settings.ownerMobile.replace(/\D/g, '');
    const e164 = digits.length === 10 ? `+1${digits}`
      : digits.length === 11 ? `+${digits}`
      : settings.ownerMobile;

    return NextResponse.json({
      destination_number: e164,
      message: settings.transferMessage,
    });
  } catch (err: any) {
    console.error('[retell-transfer] Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
