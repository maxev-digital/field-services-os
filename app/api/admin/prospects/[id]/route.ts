import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import prisma from '@/lib/prisma'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try { await requireAdmin() } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const prospect = await prisma.storm_prospects.findUnique({
    where: { id: params.id },
    include: {
      outreach_history: {
        orderBy: { sent_at: 'desc' },
        include: { template: { select: { slug: true, variant: true } } },
      },
    },
  })
  if (!prospect) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(prospect)
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try { await requireAdmin() } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const body = await req.json()
  const prospect = await prisma.storm_prospects.update({
    where: { id: params.id },
    data: { ...body, updated_at: new Date() },
  })
  return NextResponse.json(prospect)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try { await requireAdmin() } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  await prisma.storm_prospects.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}
