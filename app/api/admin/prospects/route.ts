import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import prisma from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try {
    await requireAdmin()
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const city = searchParams.get('city')
  const search = searchParams.get('search')
  const damageType = searchParams.get('damage_type')
  const hasEmail = searchParams.get('has_email')
  const hasPhone = searchParams.get('has_phone')
  const neighborhood = searchParams.get('neighborhood')
  const source = searchParams.get('source')
  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '50')
  const skip = (page - 1) * limit

  const where: any = {}
  if (status && status !== 'all') where.status = status
  if (city) where.city = { contains: city, mode: 'insensitive' }
  if (damageType) where.damage_type = { contains: damageType, mode: 'insensitive' }
  if (neighborhood) where.neighborhood = { contains: neighborhood, mode: 'insensitive' }
  if (source) where.source = { contains: source, mode: 'insensitive' }
  if (hasEmail === '1') where.email = { not: null }
  if (hasPhone === '1') where.phone = { not: null }
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { address: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search } },
      { email: { contains: search, mode: 'insensitive' } },
      { damage_type: { contains: search, mode: 'insensitive' } },
      { notes: { contains: search, mode: 'insensitive' } },
    ]
  }

  const [total, prospects] = await Promise.all([
    prisma.storm_prospects.count({ where }),
    prisma.storm_prospects.findMany({
      where,
      orderBy: { created_at: 'desc' },
      skip,
      take: limit,
      include: { _count: { select: { outreach_history: true } } },
    }),
  ])

  const pages = Math.ceil(total / limit)
  return NextResponse.json({ prospects, total, page, pages, limit })
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin()
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const prospect = await prisma.storm_prospects.create({ data: body })
  return NextResponse.json(prospect, { status: 201 })
}
