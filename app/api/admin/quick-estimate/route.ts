/**
 * GET /api/admin/quick-estimate?address=1234+Main+St
 *
 * Looks up address in the parcels table (682k Dallas County records).
 * Returns property details + roofing estimate range — no manual data entry.
 *
 * Estimate formula:
 *   squares = (living_sqft × pitch_multiplier) / 100
 *   price_range = squares × $/sq  (standard | architectural | impact-resistant)
 *   age_surcharge applied for pre-1980 and pre-2000 homes
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';

// Pitch multiplier by roof type (accounts for slope surface area vs footprint)
const PITCH_MULT: Record<string, number> = {
  GABLE:           1.30,
  HIP:             1.50,
  FLAT:            1.05,
  MANSARD:         1.65,
  SHED:            1.20,
  IRREGULAR:       1.42,
  'CUTUP, DORMER': 1.55,
  GAMBREL:         1.45,
  'TRUSS,WOOD':    1.35,
  'TRUSS, STEEL':  1.20,
  SAWTOOTH:        1.30,
  SALTBOX:         1.40,
};

// Price per roofing square (100 sqft installed, DFW insurance replacement rates)
const PRICE = {
  standard:      500,  // 3-tab / economy shingle
  architectural: 680,  // 30-yr architectural (most common insurance claim)
  impact:        880,  // Class 4 impact-resistant (TX hail premium)
};

function calcEstimate(living_sqft: number, roof_type: string | null, year_built: number | null) {
  const mult   = PITCH_MULT[roof_type ?? ''] ?? 1.35;
  const squares = Math.round((living_sqft * mult) / 100 * 10) / 10;

  // Age surcharge: older homes have worn decking, complex flashing, lead pipe boots
  const ageFactor = !year_built ? 1.0
    : year_built < 1980 ? 1.15
    : year_built < 2000 ? 1.07
    : 1.0;

  const low  = Math.round(squares * PRICE.standard      * ageFactor / 100) * 100;
  const mid  = Math.round(squares * PRICE.architectural  * ageFactor / 100) * 100;
  const high = Math.round(squares * PRICE.impact         * ageFactor / 100) * 100;

  return { squares, mult, ageFactor, low, mid, high };
}

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const raw = req.nextUrl.searchParams.get('address')?.trim() ?? '';
  if (!raw) return NextResponse.json({ error: 'address required' }, { status: 400 });

  // Strip city/state/zip suffix for cleaner matching
  const stripped = raw
    .replace(/,?\s*(dallas|fort worth|irving|garland|plano|frisco|mckinney|allen|richardson|mesquite|arlington|grand prairie|denton|lewisville|carrollton|addison|keller|grapevine|euless|bedford|hurst|haltom|rowlett|rockwall|duncanville|cedar hill|desoto|lancaster|waxahachie|mansfield|burleson)[^,]*/i, '')
    .replace(/,?\s*tx(as)?\s*/i, '')
    .replace(/,?\s*\d{5}(-\d{4})?\s*$/, '')
    .trim();

  // Fuzzy match: try exact prefix first, then ILIKE contains
  const results = await prisma.$queryRaw<any[]>`
    SELECT
      id, apn, prop_address, prop_city, prop_zip,
      living_sqft, roof_type, year_built, total_value,
      owner_name, lat, lon,
      similarity(LOWER(prop_address), LOWER(${stripped})) AS sim
    FROM parcels
    WHERE prop_address ILIKE ${stripped + '%'}
       OR prop_address ILIKE ${'%' + stripped + '%'}
    ORDER BY sim DESC, prop_address ASC
    LIMIT 8
  `;

  // Fallback: word-by-word token match if no results
  let matches = results;
  if (matches.length === 0) {
    const words = stripped.split(/\s+/).filter(w => w.length > 2);
    if (words.length > 0) {
      matches = await prisma.$queryRaw<any[]>`
        SELECT id, apn, prop_address, prop_city, prop_zip,
               living_sqft, roof_type, year_built, total_value,
               owner_name, lat, lon
        FROM parcels
        WHERE prop_address ILIKE ${`%${words[0]}%`}
        LIMIT 8
      `;
    }
  }

  const properties = matches
    .filter(r => r.living_sqft > 0)
    .map(r => {
      const est = calcEstimate(r.living_sqft, r.roof_type, r.year_built);
      return {
        id:          r.id,
        apn:         r.apn,
        address:     r.prop_address,
        city:        r.prop_city,
        zip:         r.prop_zip,
        owner:       r.owner_name,
        living_sqft: r.living_sqft,
        roof_type:   r.roof_type,
        year_built:  r.year_built,
        total_value: r.total_value,
        lat:         r.lat,
        lon:         r.lon,
        estimate: {
          squares:    est.squares,
          pitch_mult: est.mult,
          age_factor: est.ageFactor,
          standard:   { label: 'Standard (3-tab)',                low: est.low,  high: Math.round(est.low  * 1.08 / 100) * 100 },
          architectural: { label: 'Architectural (30-yr)',        low: est.mid,  high: Math.round(est.mid  * 1.08 / 100) * 100 },
          impact:     { label: 'Impact Resistant (Class 4)',      low: est.high, high: Math.round(est.high * 1.08 / 100) * 100 },
          note: est.ageFactor > 1.0
            ? `+${Math.round((est.ageFactor - 1) * 100)}% age surcharge applied (built ${r.year_built})`
            : null,
        },
      };
    });

  return NextResponse.json({
    query:      raw,
    count:      properties.length,
    properties,
  });
}
