import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';

const RETELL_API_KEY = process.env.RETELL_API_KEY!;
const RETELL_FROM_NUMBER = process.env.RETELL_FROM_NUMBER || '';

interface RetellCall {
  call_id: string;
  call_type?: string;
  agent_id?: string;
  agent_name?: string;
  call_status: string;
  start_timestamp?: number;
  end_timestamp?: number;
  duration_ms?: number;
  from_number?: string;
  to_number?: string;
  transcript?: string;
  transcript_object?: any[];
  recording_url?: string;
  call_analysis?: {
    call_summary?: string;
    user_sentiment?: string;
    [key: string]: any;
  };
  disconnect_reason?: string;
  metadata?: any;
}

function formatRetellCall(call: RetellCall) {
  const direction = call.call_type === 'inbound' ? 'inbound'
    : call.call_type === 'outbound' ? 'outbound'
    : (call.to_number === RETELL_FROM_NUMBER ? 'inbound' : 'outbound');

  return {
    call_id:          call.call_id,
    agent_name:       call.agent_name || 'AI Agent',
    call_status:      call.call_status,
    duration_seconds: call.duration_ms ? Math.round(call.duration_ms / 1000) : 0,
    from_number:      call.from_number || '',
    to_number:        call.to_number || '',
    recording_url:    call.recording_url || null,
    transcript:       call.transcript || '',
    call_summary:     call.call_analysis?.call_summary || null,
    user_sentiment:   call.call_analysis?.user_sentiment || null,
    direction,
    created_at:       call.start_timestamp ? new Date(call.start_timestamp).toISOString() : null,
    end_time:         call.end_timestamp ? new Date(call.end_timestamp).toISOString() : null,
    disconnect_reason: call.disconnect_reason || null,
    call_analysis:    call.call_analysis || null,
    source:           'retell',
    prospect_name:    null as string | null,
  };
}

function ivrSummary(digit: string | null, variant: string | null): string {
  if (digit === '1') return `Pressed 1 — wants free inspection [Script ${variant || '?'}]`;
  if (digit === '2') return `Pressed 2 — DNC request [Script ${variant || '?'}]`;
  return `No digit pressed [Script ${variant || '?'}]`;
}

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();

    const { searchParams } = new URL(req.url);
    const limit     = parseInt(searchParams.get('limit') || '50', 10);
    const direction = searchParams.get('direction') || 'all';
    const status    = searchParams.get('status')    || 'all';
    const source    = searchParams.get('source')    || 'all'; // 'all' | 'retell' | 'ivr'

    // ── Fetch IVR calls from DB ───────────────────────────────────────────────
    let ivrCalls: any[] = [];
    try {
      const rows = await prisma.$queryRaw<any[]>`
        SELECT
          ic.id, ic.call_sid, ic.prospect_id, ic.to_number,
          ic.status, ic.duration_seconds, ic.digit_pressed,
          ic.script_variant, ic.created_at, ic.updated_at,
          sp.name  AS prospect_name,
          sp.address, sp.city
        FROM ivr_calls ic
        LEFT JOIN storm_prospects sp ON sp.id = ic.prospect_id
        ORDER BY ic.created_at DESC
        LIMIT 500
      `;
      ivrCalls = rows.map((r: any) => ({
        call_id:          r.call_sid || r.id,
        agent_name:       'IVR Robocall — Script ' + (r.script_variant || '?'),
        call_status:      r.status || 'dispatched',
        duration_seconds: r.duration_seconds || 0,
        from_number:      '+19723621301',
        to_number:        r.to_number || '',
        recording_url:    null,
        transcript:       '',
        call_summary:     ivrSummary(r.digit_pressed, r.script_variant),
        user_sentiment:   null,
        direction:        'outbound',
        created_at:       r.created_at ? new Date(r.created_at).toISOString() : null,
        end_time:         null,
        disconnect_reason: null,
        call_analysis:    null,
        source:           'ivr',
        prospect_name:    r.prospect_name || null,
        city:             r.city || null,
        address:          r.address || null,
        script_variant:   r.script_variant || null,
        digit_pressed:    r.digit_pressed || null,
      }));
    } catch (e) {
      console.warn('[call-center] IVR DB fetch error:', e);
    }

    // ── Fetch Retell calls ────────────────────────────────────────────────────
    let retellCalls: any[] = [];
    try {
      const response = await fetch('https://api.retellai.com/v2/list-calls', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RETELL_API_KEY}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({ limit: 1000, sort_order: 'descending' }),
      });
      if (response.ok) {
        const raw: RetellCall[] = await response.json();
        retellCalls = raw.map(formatRetellCall);
      } else {
        console.warn('[call-center] Retell API error:', response.status);
      }
    } catch (e) {
      console.warn('[call-center] Retell fetch error:', e);
    }

    // ── Merge and sort ────────────────────────────────────────────────────────
    let calls = source === 'ivr'    ? ivrCalls
              : source === 'retell' ? retellCalls
              : [...retellCalls, ...ivrCalls];

    calls.sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return tb - ta;
    });

    // ── Apply filters ─────────────────────────────────────────────────────────
    if (direction === 'inbound')  calls = calls.filter(c => c.direction === 'inbound');
    if (direction === 'outbound') calls = calls.filter(c => c.direction === 'outbound');
    if (status === 'ended')       calls = calls.filter(c => c.call_status === 'ended' || c.call_status === 'registered');
    if (status === 'not_connected') calls = calls.filter(c =>
      c.call_status !== 'ended' && c.call_status !== 'registered' && c.call_status !== 'ongoing'
    );

    // ── Stats ─────────────────────────────────────────────────────────────────
    const totalCalls     = calls.length;
    const totalDuration  = calls.reduce((s: number, c: any) => s + c.duration_seconds, 0);
    const avgDuration    = totalCalls > 0 ? Math.round(totalDuration / totalCalls) : 0;
    const inboundCount   = calls.filter((c: any) => c.direction === 'inbound').length;
    const outboundCount  = calls.filter((c: any) => c.direction === 'outbound').length;
    const connectedCount = calls.filter((c: any) => c.call_status === 'ended' || c.call_status === 'registered').length;
    const notConnectedCount = calls.filter((c: any) =>
      c.call_status !== 'ended' && c.call_status !== 'registered' && c.call_status !== 'ongoing'
    ).length;

    // IVR-specific stats
    const ivrTotal    = ivrCalls.length;
    const ivrPress1   = ivrCalls.filter((c: any) => c.digit_pressed === '1').length;
    const ivrPress2   = ivrCalls.filter((c: any) => c.digit_pressed === '2').length;
    const ivrVoicemail = ivrCalls.filter((c: any) => c.call_status === 'voicemail').length;
    const ivrVariantA  = ivrCalls.filter((c: any) => c.script_variant === 'A').length;
    const ivrVariantB  = ivrCalls.filter((c: any) => c.script_variant === 'B').length;

    return NextResponse.json({
      calls: calls.slice(0, limit),
      stats: {
        totalCalls,
        totalDuration,
        avgDuration,
        inboundCount,
        outboundCount,
        connectedCount,
        notConnectedCount,
        ivrStats: {
          total:     ivrTotal,
          press1:    ivrPress1,
          press2:    ivrPress2,
          voicemail: ivrVoicemail,
          variantA:  ivrVariantA,
          variantB:  ivrVariantB,
          press1Rate: ivrTotal > 0 ? ((ivrPress1 / ivrTotal) * 100).toFixed(1) + '%' : '0%',
        },
      },
    });
  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error('[call-center] error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
