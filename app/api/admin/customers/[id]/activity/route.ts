import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import prisma from '@/lib/prisma'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try { await requireAdmin() } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const activity = await prisma.customer_activity.findMany({
    where: { customer_id: params.id },
    orderBy: { created_at: 'desc' },
    take: 100,
  })
  return NextResponse.json({ activity })
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try { await requireAdmin() } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const { type, note, created_by } = await req.json()
  if (!type) return NextResponse.json({ error: 'type required' }, { status: 400 })

  const entry = await prisma.customer_activity.create({
    data: {
      customer_id: params.id,
      type: type as any,
      note: note || null,
      created_by: created_by || 'Admin',
    },
  })
  return NextResponse.json({ entry }, { status: 201 })
}
