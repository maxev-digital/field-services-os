import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import prisma from '@/lib/prisma'

export async function GET() {
  try { await requireAdmin() } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const rows = await prisma.$queryRaw<{ city: string; total: bigint; callable: bigint }[]>`
    SELECT
      city,
      COUNT(*)                                                                          AS total,
      COUNT(*) FILTER (WHERE phone IS NOT NULL AND status NOT IN ('DNC','HARD_NO'))     AS callable
    FROM storm_prospects
    WHERE city IS NOT NULL AND city != ''
    GROUP BY city
    HAVING COUNT(*) FILTER (WHERE phone IS NOT NULL AND status NOT IN ('DNC','HARD_NO')) > 0
    ORDER BY callable DESC
    LIMIT 30
  `

  return NextResponse.json({
    segments: rows.map(r => ({
      city:     r.city,
      total:    Number(r.total),
      callable: Number(r.callable),
    }))
  })
}
