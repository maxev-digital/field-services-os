/**
 * GET /api/report/[token]
 * Public — no auth. Returns property + storm data for the prospect report page.
 * Only exposes non-sensitive fields (no phone, email, or internal notes).
 */
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

function hailLabel(sizeIn: number): string {
  if (sizeIn >= 2.75) return 'Baseball (2¾"+)';
  if (sizeIn >= 1.75) return 'Golf Ball (1¾"+)';
  if (sizeIn >= 1.25) return 'Half Dollar (1¼"+)';
  if (sizeIn >= 1.0)  return 'Quarter (1")';
  if (sizeIn >= 0.75) return 'Dime (¾")';
  return 'Pea (¼")';
}

function riskLabel(sizeIn: number): { label: string; color: string } {
  if (sizeIn >= 1.75) return { label: 'SEVERE', color: '#dc2626' };
  if (sizeIn >= 1.0)  return { label: 'HIGH', color: '#ea580c' };
  if (sizeIn >= 0.75) return { label: 'MODERATE', color: '#d97706' };
  return { label: 'LOW', color: '#65a30d' };
}

function fmtStormDate(raw: string | null): string {
  if (!raw || raw.length !== 8) return '—';
  const y = raw.slice(0, 4);
  const m = raw.slice(4, 6);
  const d = raw.slice(6, 8);
  return new Date(`${y}-${m}-${d}`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  try {
    const prospect = await prisma.storm_prospects.findUnique({
      where: { report_token: params.token },
      select: {
        id:           true,
        name:         true,
        address:      true,
        city:         true,
        zip:          true,
        county:       true,
        year_built:   true,
        hail_size_in: true,
        storm_date:   true,
        lat:          true,
        lon:          true,
      },
    });

    if (!prospect) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // All storm events recorded for this specific property address in our DB
    const addressEvents = await prisma.$queryRaw<
      { storm_date: string; hail_size_in: number }[]
    >`
      SELECT DISTINCT storm_date, hail_size_in
      FROM storm_prospects
      WHERE address = ${prospect.address}
        AND storm_date IS NOT NULL
        AND hail_size_in IS NOT NULL
      ORDER BY storm_date DESC
      LIMIT 6
    `;

    // Parcel lookup for sq footage
    const parcelRows = prospect.lat && prospect.lon
      ? await prisma.$queryRaw<{ living_sqft: number | null; year_built: number | null }[]>`
          SELECT living_sqft, year_built
          FROM parcels
          WHERE lat IS NOT NULL AND lon IS NOT NULL
          ORDER BY (lat - ${prospect.lat})^2 + (lon - ${prospect.lon})^2
          LIMIT 1
        `.catch(() => [])
      : [];

    const parcelData = (parcelRows as any[])[0] ?? null;
    const yearBuilt = prospect.year_built || parcelData?.year_built || null;
    const sqft = parcelData?.living_sqft || null;

    const stormEvents = (addressEvents as any[]).map((e) => {
      const sizeIn = Number(e.hail_size_in);
      return {
        date:      fmtStormDate(e.storm_date),
        rawDate:   e.storm_date,
        sizeIn,
        sizeLabel: hailLabel(sizeIn),
        risk:      riskLabel(sizeIn),
      };
    });

    // Fallback: if no address match, use the prospect's own event
    if (stormEvents.length === 0 && prospect.storm_date && prospect.hail_size_in) {
      const sizeIn = prospect.hail_size_in;
      stormEvents.push({
        date:      fmtStormDate(prospect.storm_date),
        rawDate:   prospect.storm_date,
        sizeIn,
        sizeLabel: hailLabel(sizeIn),
        risk:      riskLabel(sizeIn),
      });
    }

    const firstName = prospect.name ? prospect.name.split(' ')[0] : 'Homeowner';

    return NextResponse.json({
      prospect: {
        firstName,
        address:    prospect.address,
        city:       prospect.city,
        zip:        prospect.zip,
        county:     prospect.county,
        yearBuilt,
        sqft,
        lat:        prospect.lat,
        lon:        prospect.lon,
        hailSizeIn: prospect.hail_size_in,
        stormDate:  fmtStormDate(prospect.storm_date),
        hailLabel:  prospect.hail_size_in ? hailLabel(prospect.hail_size_in) : null,
        risk:       prospect.hail_size_in ? riskLabel(prospect.hail_size_in) : null,
      },
      stormEvents,
    });
  } catch (err: any) {
    console.error('[report/api]', err.message);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
