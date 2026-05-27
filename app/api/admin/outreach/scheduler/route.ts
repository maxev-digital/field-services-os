import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import prisma from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try { await requireAdmin() } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  let config = await prisma.outreach_scheduler_config.findFirst()
  if (!config) {
    config = await prisma.outreach_scheduler_config.create({
      data: { daily_cap: 50, contact_cooldown_days: 14, is_paused: false },
    })
  }

  const recentRuns = await prisma.outreach_runs.findMany({
    orderBy: { run_at: 'desc' },
    take: 20,
  })

  const queueDepth = await prisma.storm_prospects.count({
    where: { status: 'NEW', email: { not: null } },
  })

  return NextResponse.json({ config, recentRuns, queueDepth })
}

export async function PATCH(req: NextRequest) {
  try { await requireAdmin() } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const body = await req.json()
  let config = await prisma.outreach_scheduler_config.findFirst()

  if (!config) {
    config = await prisma.outreach_scheduler_config.create({
      data: { daily_cap: 50, contact_cooldown_days: 14, is_paused: false, ...body },
    })
  } else {
    config = await prisma.outreach_scheduler_config.update({
      where: { id: config.id },
      data: body,
    })
  }

  return NextResponse.json(config)
}
