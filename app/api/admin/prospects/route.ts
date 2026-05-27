import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try {
    await requireAdmin()
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const status    = searchParams.get('status')
  const city      = searchParams.get('city')
  const search    = searchParams.get('search')
  const damageType  = searchParams.get('damage_type')
  const hasEmail    = searchParams.get('has_email')
  const hasPhone    = searchParams.get('has_phone')
  const noPhone     = searchParams.get('no_phone')
  const neighborhood = searchParams.get('neighborhood')
  const source    = searchParams.get('source')
  const stormDate = searchParams.get('storm_date')
  const page  = parseInt(searchParams.get('page')  || '1')
  const limit = parseInt(searchParams.get('limit') || '50')
  const skip  = (page - 1) * limit

  // Geographic zone filter
  const latParam    = searchParams.get('lat')
  const lonParam    = searchParams.get('lon')
  const radiusParam = searchParams.get('radius_miles')
  const latF    = latParam    ? parseFloat(latParam)    : NaN
  const lonF    = lonParam    ? parseFloat(lonParam)    : NaN
  const radiusF = radiusParam ? parseFloat(radiusParam) : NaN
  const hasGeo  = !isNaN(latF) && !isNaN(lonF) && !isNaN(radiusF)

  // ── Geographic path: raw SQL with distance filter ────────────────────────
  if (hasGeo) {
    const radiusDeg    = radiusF / 69.0
    const radiusDegLon = radiusDeg * 1.4

    const clauses: Prisma.Sql[] = [
      Prisma.sql`lat IS NOT NULL AND lon IS NOT NULL`,
      Prisma.sql`ABS(lat::numeric - ${latF}) <= ${radiusDeg}`,
      Prisma.sql`ABS(lon::numeric - ${lonF}) <= ${radiusDegLon}`,
      Prisma.sql`(69.0 * SQRT(POWER(lat::numeric - ${latF}, 2) + POWER(lon::numeric - ${lonF}, 2))) <= ${radiusF}`,
    ]

    if (stormDate) clauses.push(Prisma.sql`storm_date = ${stormDate}`)
    if (status && status !== 'all') clauses.push(Prisma.sql`status = ${status}`)
    if (hasEmail === '1') clauses.push(Prisma.sql`email IS NOT NULL`)
    if (hasPhone === '1') clauses.push(Prisma.sql`phone IS NOT NULL`)
    if (noPhone  === '1') clauses.push(Prisma.sql`phone IS NULL`)
    if (city)         clauses.push(Prisma.sql`LOWER(city)         LIKE ${'%' + city.toLowerCase() + '%'}`)
    if (damageType)   clauses.push(Prisma.sql`LOWER(damage_type)  LIKE ${'%' + damageType.toLowerCase() + '%'}`)
    if (neighborhood) clauses.push(Prisma.sql`LOWER(neighborhood) LIKE ${'%' + neighborhood.toLowerCase() + '%'}`)
    if (source)       clauses.push(Prisma.sql`LOWER(source)       LIKE ${'%' + source.toLowerCase() + '%'}`)
    if (search) {
      const q = '%' + search.toLowerCase() + '%'
      clauses.push(Prisma.sql`(LOWER(name) LIKE ${q} OR LOWER(address) LIKE ${q} OR phone LIKE ${q} OR LOWER(email) LIKE ${q})`)
    }

    const whereExpr = Prisma.join(clauses, ' AND ')

    const [totalRows, prospects] = await Promise.all([
      prisma.$queryRaw<{ count: bigint }[]>(
        Prisma.sql`SELECT COUNT(*) as count FROM storm_prospects WHERE ${whereExpr}`
      ),
      prisma.$queryRaw<any[]>(
        Prisma.sql`
          SELECT *, ROUND((69.0 * SQRT(POWER(lat::numeric - ${latF}, 2) + POWER(lon::numeric - ${lonF}, 2)))::numeric, 2) as dist_miles
          FROM storm_prospects
          WHERE ${whereExpr}
          ORDER BY priority_score DESC NULLS LAST
          LIMIT ${limit} OFFSET ${skip}
        `
      ),
    ])

    const total = Number(totalRows[0]?.count || 0)
    const pages = Math.ceil(total / limit)
    return NextResponse.json({ prospects, total, page, pages, limit, geo_filtered: true })
  }

  // ── Standard Prisma path ─────────────────────────────────────────────────
  const where: any = {}
  if (status && status !== 'all') where.status = status
  if (city)         where.city        = { contains: city,         mode: 'insensitive' }
  if (damageType)   where.damage_type = { contains: damageType,   mode: 'insensitive' }
  if (neighborhood) where.neighborhood = { contains: neighborhood, mode: 'insensitive' }
  if (source)       where.source      = { contains: source,       mode: 'insensitive' }
  if (stormDate)    where.storm_date  = stormDate
  if (hasEmail === '1') where.email = { not: null }
  if (hasPhone === '1') where.phone = { not: null }
  if (noPhone  === '1') where.phone = null
  if (search) {
    where.OR = [
      { name:        { contains: search, mode: 'insensitive' } },
      { address:     { contains: search, mode: 'insensitive' } },
      { phone:       { contains: search } },
      { email:       { contains: search, mode: 'insensitive' } },
      { damage_type: { contains: search, mode: 'insensitive' } },
      { notes:       { contains: search, mode: 'insensitive' } },
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
