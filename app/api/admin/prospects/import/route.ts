import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import prisma from '@/lib/prisma'

export async function POST(req: NextRequest) {
  try { await requireAdmin() } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const ct = req.headers.get('content-type') || ''
  let rows: Record<string, string>[] = []

  if (ct.includes('application/json')) {
    rows = await req.json()
  } else {
    const text = await req.text()
    const lines = text.trim().split('\n')
    const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''))
    rows = lines.slice(1).filter((l) => l.trim()).map((line) => {
      const vals = line.split(',').map((v) => v.trim().replace(/^"|"$/g, ''))
      const obj: Record<string, string> = {}
      headers.forEach((h, i) => { obj[h] = vals[i] || '' })
      return obj
    })
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: 'No rows provided' }, { status: 400 })
  }

  const created = await prisma.storm_prospects.createMany({
    data: rows.map((r) => ({
      name: r.name || null,
      address: r.address || '',
      city: r.city || '',
      neighborhood: r.neighborhood || null,
      zip: r.zip || null,
      phone: r.phone || null,
      email: r.email || null,
      damage_type: r.damage_type || 'hail',
      source: r.source || 'csv_import',
    })),
    skipDuplicates: false,
  })

  return NextResponse.json({ imported: created.count })
}
