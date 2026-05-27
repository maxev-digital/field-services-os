/**
 * GET /api/admin/storm/hail-reports?date=YYYYMMDD
 * Fetches SPC daily hail report CSV and filters to the DFW bounding box.
 * Returns individual hail reports with lat/lon/size for map overlay.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';

const DFW_LAT_MIN = 32.0, DFW_LAT_MAX = 33.8;
const DFW_LON_MIN = -98.5, DFW_LON_MAX = -96.0;

export async function GET(req: NextRequest) {
  try { await requireAdmin(); } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const date = req.nextUrl.searchParams.get('date');
  if (!date || !/^\d{8}$/.test(date)) {
    return NextResponse.json({ error: 'date param YYYYMMDD required' }, { status: 400 });
  }

  const spcDate = date.slice(2); // YYYYMMDD → YYMMDD
  const url = `https://www.spc.noaa.gov/climo/reports/${spcDate}_rpts_hail.csv`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!res.ok) return NextResponse.json({ reports: [], date });

    const text  = await res.text();
    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length < 2) return NextResponse.json({ reports: [], date });

    // SPC CSV columns: Time(0), Size(1), Location(2), County(3), State(4), Lat(5), Lon(6), Comments(7)
    const reports: { time: string; size_in: number; location: string; county: string; lat: number; lon: number }[] = [];

    for (const line of lines.slice(1)) {
      const parts = line.split(',');
      if (parts.length < 7) continue;
      const state = (parts[4] ?? '').trim();
      if (state !== 'TX') continue;
      const lat = parseFloat(parts[5] ?? '');
      const lon = parseFloat(parts[6] ?? '');
      if (isNaN(lat) || isNaN(lon)) continue;
      if (lat < DFW_LAT_MIN || lat > DFW_LAT_MAX) continue;
      if (lon < DFW_LON_MIN || lon > DFW_LON_MAX) continue;

      const sizeRaw = parseInt(parts[1] ?? '0', 10);
      const size_in = isNaN(sizeRaw) ? 1.0 : sizeRaw / 100;

      reports.push({
        time:     (parts[0] ?? '').trim(),
        size_in,
        location: (parts[2] ?? '').trim(),
        county:   (parts[3] ?? '').trim(),
        lat,
        lon,
      });
    }

    return NextResponse.json({ reports, date, count: reports.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, reports: [], date }, { status: 500 });
  }
}
