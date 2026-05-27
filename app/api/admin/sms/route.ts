import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(req.url);
    const phone = searchParams.get('phone');

    if (phone) {
      // Full thread for one number
      const [sent, replies] = await Promise.all([
        prisma.$queryRaw<any[]>`
          SELECT sl.id, sl.phone, sl.message, sl.status, sl.sent_at,
                 sp.name, sp.address
          FROM sms_log sl
          LEFT JOIN storm_prospects sp ON sp.id = sl.prospect_id
          WHERE sl.phone = ${phone}
          ORDER BY sl.sent_at ASC
        `,
        prisma.$queryRaw<any[]>`
          SELECT id, from_number AS phone, body AS message, received_at AS sent_at
          FROM sms_replies
          WHERE from_number = ${phone}
          ORDER BY received_at ASC
        `,
      ]);
      return NextResponse.json({ sent, replies });
    }

    // Conversation list: one row per unique phone, latest message, reply count
    const conversations = await prisma.$queryRaw<any[]>`
      SELECT
        sl.phone,
        MAX(sp.name) AS name,
        MAX(sp.address) AS address,
        COUNT(DISTINCT sl.id)::int AS sent_count,
        COUNT(DISTINCT sr.id)::int AS reply_count,
        GREATEST(MAX(sl.sent_at), MAX(sr.received_at)) AS last_activity,
        (SELECT sl2.message FROM sms_log sl2
         WHERE sl2.phone = sl.phone ORDER BY sl2.sent_at DESC LIMIT 1) AS last_sent,
        (SELECT sr2.body FROM sms_replies sr2
         WHERE sr2.from_number = sl.phone ORDER BY sr2.received_at DESC LIMIT 1) AS last_reply
      FROM sms_log sl
      LEFT JOIN storm_prospects sp ON sp.id = sl.prospect_id
      LEFT JOIN sms_replies sr ON sr.from_number = sl.phone
      WHERE sl.phone IS NOT NULL
      GROUP BY sl.phone
      ORDER BY last_activity DESC
      LIMIT 200
    `;

    const totalReplies = await prisma.$queryRaw<any[]>`
      SELECT COUNT(*)::int AS count FROM sms_replies
    `;

    return NextResponse.json({
      conversations,
      totalReplies: totalReplies[0]?.count ?? 0,
    });
  } catch (e: any) {
    if (e.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
