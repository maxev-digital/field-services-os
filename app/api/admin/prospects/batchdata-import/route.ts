import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';
import { randomUUID } from 'crypto';

interface ImportRecord {
  address:   string;
  name:      string;
  city:      string;
  zip:       string;
  phone:     string | null;
  phone2:    string | null;
  email:     string | null;
  email2:    string | null;
  email3:    string | null;
  litigator: boolean;
  dnc:       boolean;
  year_built: number | null;
  sqft:       number | null;
  home_value: number | null;
}

export async function POST(req: NextRequest) {
  try { await requireAdmin(); } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { records }: { records: ImportRecord[] } = await req.json();
  if (!Array.isArray(records) || !records.length) {
    return NextResponse.json({ error: 'records array required' }, { status: 400 });
  }

  let updated = 0;
  let created = 0;
  let skipped = 0;

  for (const r of records) {
    if (!r.address) { skipped++; continue; }

    const addrNorm = r.address.trim().toUpperCase();
    const status = r.litigator ? 'DNC' : r.dnc ? 'DNC' : undefined;

    // Try to match existing prospect by address (TCAD addresses are uppercase)
    const existing = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM storm_prospects
      WHERE UPPER(TRIM(address)) = ${addrNorm}
      LIMIT 1
    `;

    if (existing.length) {
      await prisma.$executeRaw`
        UPDATE storm_prospects SET
          phone     = COALESCE(${r.phone},     phone),
          phone2    = COALESCE(${r.phone2},    phone2),
          email     = COALESCE(${r.email},     email),
          email2    = COALESCE(${r.email2},    email2),
          email3    = COALESCE(${r.email3},    email3),
          litigator = ${r.litigator},
          status    = CASE WHEN ${status ?? null}::text IS NOT NULL THEN ${status ?? 'NEW'}::"ProspectStatus" ELSE status END,
          updated_at = NOW()
        WHERE id = ${existing[0].id}
      `;
      updated++;
    } else {
      // Try to get parcel for lat/lon
      const parcel = await prisma.$queryRaw<{ id: number; lat: number; lon: number; county: string }[]>`
        SELECT id, lat, lon, county FROM parcels
        WHERE UPPER(TRIM(prop_address)) = ${addrNorm}
        LIMIT 1
      `;

      await prisma.storm_prospects.create({
        data: {
          id:          randomUUID(),
          name:        r.name || null,
          address:     r.address,
          city:        r.city || '',
          zip:         r.zip || null,
          phone:       r.phone || null,
          phone2:      r.phone2 || null,
          email:       r.email || null,
          email2:      r.email2 || null,
          email3:      r.email3 || null,
          litigator:   r.litigator,
          year_built:  r.year_built || null,
          sqft:        r.sqft || null,
          home_value:  r.home_value || null,
          source:      'batchdata_import',
          damage_type: 'hail',
          status:      (r.litigator || r.dnc ? 'DNC' : 'NEW') as any,
          lat:         parcel[0]?.lat ?? null,
          lon:         parcel[0]?.lon ?? null,
          county:      parcel[0]?.county || null,
          parcel_id:   parcel[0]?.id ?? null,
        },
      });
      created++;
    }
  }

  return NextResponse.json({ updated, created, skipped, total: records.length });
}
