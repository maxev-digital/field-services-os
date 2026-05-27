import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || '';
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'TX3LPaxmHKxFdv7VOQHJ';

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    const { text } = await req.json();
    if (!text) return NextResponse.json({ error: 'text required' }, { status: 400 });
    if (!ELEVENLABS_API_KEY) return NextResponse.json({ error: 'ElevenLabs not configured' }, { status: 500 });

    // Strip markdown for cleaner speech
    const clean = text
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/```[\s\S]*?```/g, '')
      .replace(/^[-*] /gm, '')
      .replace(/^\d+\. /gm, '')
      .replace(/\n+/g, '. ')
      .replace(/\.\./g, '.')
      .slice(0, 2000);

    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`, {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: clean,
        model_id: 'eleven_turbo_v2_5',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('ElevenLabs error:', res.status, err);
      return NextResponse.json({ error: 'TTS failed' }, { status: 502 });
    }

    const audioBuffer = await res.arrayBuffer();
    return new NextResponse(audioBuffer, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
