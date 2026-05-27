/**
 * GET/POST /api/admin/webhooks/twilio-twiml
 * IVR TwiML — plays the script MP3 selected by the caller (via `script` param).
 * Defaults to script-new.mp3 if no valid script param supplied.
 */
import { NextRequest, NextResponse } from 'next/server';

const BASE_URL      = 'https://admin.roofworksoftexas.com';
const DEFAULT_SCRIPT = 'script-new.mp3';
const ALLOWED_EXT   = '.mp3';

function safeScriptUrl(scriptParam: string | null): string {
  if (!scriptParam) return `${BASE_URL}/audio/${DEFAULT_SCRIPT}`;
  // Strip path traversal — only allow filename characters + .mp3
  const safe = scriptParam.replace(/[^a-zA-Z0-9._-]/g, '');
  if (!safe.toLowerCase().endsWith(ALLOWED_EXT)) return `${BASE_URL}/audio/${DEFAULT_SCRIPT}`;
  return `${BASE_URL}/audio/${safe}`;
}

function twiml(xml: string) {
  return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?>${xml}`, {
    headers: { 'Content-Type': 'text/xml' },
  });
}

function buildIvr(scriptUrl: string, actionUrl: string): string {
  return `<Response>
  <Gather numDigits="1" action="${actionUrl}" method="POST" timeout="12">
    <Play>${scriptUrl}</Play>
  </Gather>
  <Hangup/>
</Response>`;
}

function buildActionUrl(prospectId: string, script: string): string {
  return `${BASE_URL}/api/admin/webhooks/twilio-ivr?prospect_id=${encodeURIComponent(prospectId)}&amp;action=keypress&amp;script=${encodeURIComponent(script)}`;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const prospectId = searchParams.get('prospect_id') || '';
  const script     = searchParams.get('script') || DEFAULT_SCRIPT;
  const scriptUrl  = safeScriptUrl(script);
  return twiml(buildIvr(scriptUrl, buildActionUrl(prospectId, script)));
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const prospectId = searchParams.get('prospect_id') || '';
  const script     = searchParams.get('script') || DEFAULT_SCRIPT;
  const scriptUrl  = safeScriptUrl(script);
  return twiml(buildIvr(scriptUrl, buildActionUrl(prospectId, script)));
}
