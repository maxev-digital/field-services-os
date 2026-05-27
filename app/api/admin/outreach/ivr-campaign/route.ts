/**
 * POST /api/admin/outreach/ivr-campaign
 * Dispatches outbound IVR robocalls via Twilio.
 * Plays a pre-recorded/TTS message, captures keypress:
 *   1 → INTERESTED (free inspection)
 *   2 → INTERESTED (free estimate — SMS sent)
 *   3 → DNC (opt-out)
 *   no input → VOICEMAIL (retry eligible)
 *
 * ~$0.006–0.014/call vs ~$0.14/call with Retell AI.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrInternal } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';
import { telegramNotify } from '@/lib/telegram-notify';

const TWILIO_SID   = process.env.TWILIO_ACCOUNT_SID!;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN!;
const TWILIO_FROM  = process.env.TWILIO_FROM_NUMBER!;
const BASE_URL     = 'https://admin.roofworksoftexas.com';

const MAX_ATTEMPTS     = 3;
const COOLDOWN_DAYS    = 3;   // min days between calls to same prospect
const HARD_NO_DAYS     = 90;
const NO_INTEREST_DAYS = 30;

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return `+${digits}`;
}


function daysSince(date: Date | null): number {
  if (!date) return 9999;
  return (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
}

export async function POST(req: NextRequest) {
  try {
    const _admin = await requireAdminOrInternal(req);

    if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_FROM) {
      return NextResponse.json({
        error: 'Twilio not configured. Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER to .env.local',
      }, { status: 500 });
    }

    const { prospect_ids, city, storm_date, script_filename = 'script-new.mp3', force = false } = await req.json();
    // Sanitize: only allow safe filename chars + .mp3
    const scriptFile = (script_filename as string).replace(/[^a-zA-Z0-9._-]/g, '').replace(/(?<!\.mp3)$/i, '') || 'script-new.mp3';
    if (!city && (!Array.isArray(prospect_ids) || prospect_ids.length === 0))
      return NextResponse.json({ error: 'prospect_ids or city required' }, { status: 400 });

    const where: any = {
      phone:  { not: null },
      status: { notIn: ['DNC', 'INTERESTED', 'PENDING_CONFIRMATION', 'CONVERTED'] },
    };
    if (city) {
      where.city = { contains: city, mode: 'insensitive' };
    } else {
      where.id = { in: prospect_ids };
    }

    const rows = await prisma.storm_prospects.findMany({
      where,
      select: {
        id: true, name: true, phone: true, city: true,
        hail_size_in: true, status: true,
        call_attempts: true, last_contacted_at: true,
      },
    });

    if (rows.length === 0)
      return NextResponse.json({ error: 'No callable prospects' }, { status: 400 });

    const dncPhones = new Set(
      (await prisma.dnc_list.findMany({ select: { phone: true } })).map(d => d.phone)
    );

    const results = {
      dispatched: 0,
      skipped:    0,
      skipped_reasons: { dnc: 0, cooldown: 0, max_attempts: 0, hard_no: 0, no_interest: 0, invalid_phone: 0 },
      errors:     [] as { id: string; error: string }[],
      call_sids:  [] as { prospect_id: string; call_sid: string }[],
    };

    for (const p of rows) {
      const phone = normalizePhone(p.phone!);

      if (phone.length < 12)                                                       { results.skipped++; results.skipped_reasons.invalid_phone++; continue; }
      if (dncPhones.has(phone))                                                    { results.skipped++; results.skipped_reasons.dnc++;           continue; }
      if (!force && daysSince(p.last_contacted_at) < COOLDOWN_DAYS)                   { results.skipped++; results.skipped_reasons.cooldown++;      continue; }
      if ((p.call_attempts ?? 0) >= MAX_ATTEMPTS)                                  { results.skipped++; results.skipped_reasons.max_attempts++;   continue; }
      if (p.status === 'HARD_NO'    && daysSince(p.last_contacted_at) < HARD_NO_DAYS)   { results.skipped++; results.skipped_reasons.hard_no++;    continue; }
      if ((p.status === 'NO_INTEREST' || p.status === 'NO_RESPONSE') && daysSince(p.last_contacted_at) < NO_INTEREST_DAYS) { results.skipped++; results.skipped_reasons.no_interest++; continue; }

      const firstName = p.name ? p.name.split(' ')[0].replace(/[^a-zA-Z]/g, '') || 'there' : 'there';
      const city      = p.city?.split('(')[0].trim() || 'your area';
      const hailSize  = p.hail_size_in ? `${p.hail_size_in} inch` : 'significant';

      const twimlUrl = `${BASE_URL}/api/admin/webhooks/twilio-twiml?prospect_id=${p.id}&name=${encodeURIComponent(firstName)}&city=${encodeURIComponent(city)}&hail=${encodeURIComponent(hailSize)}&script=${encodeURIComponent(scriptFile)}`;
      const statusCb = `${BASE_URL}/api/admin/webhooks/twilio-ivr?prospect_id=${p.id}&action=status&script=${encodeURIComponent(scriptFile)}`;

      try {
        const body = new URLSearchParams({
          To:             phone,
          From:           TWILIO_FROM,
          Url:            twimlUrl,
          StatusCallback: statusCb,
          StatusCallbackMethod: 'POST',
        });

        const res = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Calls.json`,
          {
            method:  'POST',
            headers: {
              'Authorization': 'Basic ' + Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64'),
              'Content-Type':  'application/x-www-form-urlencoded',
            },
            body: body.toString(),
          }
        );

        if (!res.ok) {
          const err = await res.text();
          throw new Error(`Twilio ${res.status}: ${err}`);
        }

        const call = await res.json();
        const callSid = call.sid;

        await prisma.$executeRaw`
          INSERT INTO ivr_calls (id, call_sid, prospect_id, to_number, status, script_variant)
          VALUES (gen_random_uuid()::text, ${callSid}, ${p.id}, ${phone}, 'dispatched', ${scriptFile})
          ON CONFLICT (call_sid) DO NOTHING
        `.catch(() => {});

        await prisma.storm_prospects.update({
          where: { id: p.id },
          data:  {
            status:            'CONTACTED' as any,
            call_attempts:     { increment: 1 },
            last_contacted_at: new Date(),
            updated_at:        new Date(),
          },
        });

        results.dispatched++;
        results.call_sids.push({ prospect_id: p.id, call_sid: callSid });
      } catch (err: any) {
        results.errors.push({ id: p.id, error: err.message });
        results.skipped++;
      }

      await sleep(100);
    }

    telegramNotify(
      `📞 *IVR Campaign Launched*\n\n🎙 Script: \`${scriptFile}\`\n✅ Dispatched: ${results.dispatched}\n⏭ Skipped: ${results.skipped}\n❌ Errors: ${results.errors.length}\n\nYou'll get a ping for every Press 1 or Press 2.\n\n[View Prospects](https://admin.roofworksoftexas.com/admin/prospects)`
    ).catch(() => {});

    return NextResponse.json({
      success:    true,
      script:     scriptFile,
      storm_date: storm_date || null,
      total:      rows.length,
      dispatched: results.dispatched,
      skipped:    results.skipped,
      skipped_breakdown: results.skipped_reasons,
      errors:     results.errors,
    });
  } catch (err: any) {
    if (err.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
