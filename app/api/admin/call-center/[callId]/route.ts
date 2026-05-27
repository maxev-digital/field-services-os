import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';

const RETELL_API_KEY = process.env.RETELL_API_KEY!;
const RETELL_FROM_NUMBER = process.env.RETELL_FROM_NUMBER || '';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ callId: string }> }
) {
  try {
    await requireAdmin();

    const { callId } = await params;

    const response = await fetch(`https://api.retellai.com/v2/get-call/${callId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${RETELL_API_KEY}`,
      },
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Retell get-call error:', response.status, errText);
      return NextResponse.json({ error: 'Failed to fetch call detail' }, { status: 502 });
    }

    const call = await response.json();

    const direction = call.call_type === 'inbound' ? 'inbound'
      : call.call_type === 'outbound' ? 'outbound'
      : (call.to_number === RETELL_FROM_NUMBER ? 'inbound' : 'outbound');

    return NextResponse.json({
      call_id: call.call_id,
      call_type: call.call_type,
      agent_name: call.agent_name || 'AI Agent',
      call_status: call.call_status,
      duration_seconds: call.duration_ms ? Math.round(call.duration_ms / 1000) : 0,
      from_number: call.from_number || '',
      to_number: call.to_number || '',
      recording_url: call.recording_url || null,
      transcript: call.transcript || '',
      transcript_object: call.transcript_object || [],
      call_summary: call.call_analysis?.call_summary || null,
      user_sentiment: call.call_analysis?.user_sentiment || null,
      call_analysis: call.call_analysis || null,
      direction,
      created_at: call.start_timestamp ? new Date(call.start_timestamp).toISOString() : null,
      end_time: call.end_timestamp ? new Date(call.end_timestamp).toISOString() : null,
      disconnect_reason: call.disconnect_reason || null,
      metadata: call.metadata || null,
    });
  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error('Call detail API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
