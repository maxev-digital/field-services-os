/**
 * Admin Storm Dashboard API
 * Proxies NOAA SPC storm reports + NOAA SWDI radar hail data server-side.
 * Filters for DFW-area events: TX state, lat 31.5–34.5, lon -99.5 to -94.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';

// DFW bbox — used only for SWDI radar query and DFW county detection
const DFW_LAT_MIN = 31.5, DFW_LAT_MAX = 34.5;
const DFW_LON_MIN = -99.5, DFW_LON_MAX = -94.0;

function ctDate(offset = 0): string {
  const d = new Date();
  d.setHours(d.getHours() - 6 + offset * 24);
  const yy = String(d.getFullYear()).slice(2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}${mm}${dd}`;
}

function ctDateFull(offset = 0): string {
  const d = new Date();
  d.setHours(d.getHours() - 6 + offset * 24);
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

function parseSpcCsv(text: string, type: 'hail' | 'wind' | 'torn') {
  const lines = text.replace(/\r/g, '').trim().split('\n');
  if (lines.length < 2) return [];
  return lines.slice(1).flatMap(line => {
    if (!line.trim()) return [];
    const cols = line.split(',');
    if (cols.length < 8) return [];
    const lat = parseFloat(cols[5]);
    const lon = parseFloat(cols[6]);
    if (isNaN(lat) || isNaN(lon)) return [];
    const inDfw = lat >= DFW_LAT_MIN && lat <= DFW_LAT_MAX && lon >= DFW_LON_MIN && lon <= DFW_LON_MAX;
    const base = { type, time: cols[0]?.trim() ?? '', location: cols[2]?.trim() ?? '', county: cols[3]?.trim() ?? '', state: cols[4]?.trim() ?? '', lat, lon, inDfw };
    if (type === 'hail') {
      const size = parseInt(cols[1], 10);
      if (isNaN(size)) return [];
      return [{ ...base, size, sizeIn: (size / 100).toFixed(2) }];
    }
    if (type === 'wind') {
      const speed = parseInt(cols[1], 10);
      return [{ ...base, speed: isNaN(speed) ? 0 : speed }];
    }
    if (type === 'torn') {
      const ef = cols[1]?.trim() ?? 'EF?';
      const efN = parseInt(ef.replace(/[^0-9]/g, ''), 10);
      return [{ ...base, ef, efN: isNaN(efN) ? 0 : efN }];
    }
    return [];
  });
}

// Fetch SWDI radar hail data — more complete than SPC observer reports
async function fetchSwdiHail(dateYYYYMMDD: string): Promise<any[]> {
  try {
    // Full CONUS bbox — polygons generated client-side for wherever storms actually hit
    const url = `https://www.ncei.noaa.gov/swdiws/csv/nx3hail/${dateYYYYMMDD}:${dateYYYYMMDD}?bbox=-130,20,-60,55&limit=10000`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'RoofWorksAdmin/1.0' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const text = await res.text();
    const lines = text.split('\n').filter(l => !l.startsWith('#') && l.trim());
    if (lines.length < 2) return [];
    // Fields: ZTIME, LON, LAT, WSR_ID, CELL_ID, RANGE, AZIMUTH, SEVPROB, PROB, MAXSIZE
    return lines.slice(1).flatMap(line => {
      const c = line.split(',');
      if (c.length < 10) return [];
      const lon = parseFloat(c[1]);
      const lat = parseFloat(c[2]);
      const prob = parseInt(c[8], 10);
      const maxSize = parseFloat(c[9]);
      if (isNaN(lat) || isNaN(lon) || isNaN(maxSize)) return [];
      if (prob < 30) return [];
      return [{
        lon, lat,
        wsr_id: c[3]?.trim(),
        cell_id: c[4]?.trim(),
        sevprob: parseInt(c[7], 10) || 0,
        prob,
        maxSize, // inches
        time: c[0]?.trim(),
      }];
    });
  } catch {
    return [];
  }
}

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();

    const { searchParams } = new URL(req.url);
    const type = (searchParams.get('type') || 'hail') as 'hail' | 'wind' | 'torn';
    const dateRaw = searchParams.get('date'); // may be YYMMDD or YYYYMMDD from date picker

    // Normalize: date picker sends YYYYMMDD (8), SPC needs YYMMDD (6)
    const dateArg = dateRaw && dateRaw.length === 8 ? dateRaw.slice(2) : dateRaw;
    const dateArgFull = dateRaw && dateRaw.length === 6 ? `20${dateRaw}` : dateRaw;

    const dates = dateArg ? [dateArg] : [ctDate(0), ctDate(-1)];
    const SPC_BASE = 'https://www.spc.noaa.gov/climo/reports/';

    let events: any[] = [];
    let usedDate = '';
    let usedDateFull = '';

    for (const d of dates) {
      const url = `${SPC_BASE}${d}_rpts_filtered_${type}.csv`;
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'RoofWorksAdmin/1.0' },
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) continue;
        const text = await res.text();
        const parsed = parseSpcCsv(text, type);
        if (parsed.length > 0) { events = parsed; usedDate = d; break; }
        if (text.includes(',')) { usedDate = d; break; }
      } catch { continue; }
    }

    // Resolve full dates for SWDI
    if (usedDate) {
      usedDateFull = `20${usedDate}`;
    } else if (dateArgFull) {
      usedDateFull = dateArgFull;
      usedDate = dateArgFull.slice(2);
    } else {
      usedDateFull = ctDateFull(0);
      usedDate = ctDate(0);
    }

    if (type === 'hail') events.sort((a, b) => b.size - a.size);
    if (type === 'wind') events.sort((a, b) => b.speed - a.speed);

    const byCounty = new Map<string, any>();
    for (const e of events) {
      const key = `${e.county}, ${e.state}`;
      if (!byCounty.has(key)) byCounty.set(key, { county: e.county, state: e.state, count: 0, events: [] });
      const g = byCounty.get(key)!;
      g.count++;
      g.events.push(e);
      if (type === 'hail' && (g.maxSize === undefined || e.size > g.maxSize)) g.maxSize = e.size;
      if (type === 'wind' && (g.maxSpeed === undefined || e.speed > g.maxSpeed)) g.maxSpeed = e.speed;
    }

    // Fetch SWDI radar hail points for polygon generation (hail only)
    let swdiPoints: any[] = [];
    if (type === 'hail') {
      swdiPoints = await fetchSwdiHail(usedDateFull);
    }

    const dfwEvents = events.filter((e: any) => e.inDfw);
    return NextResponse.json({
      date: usedDate,
      dateFull: usedDateFull,
      type,
      total: events.length,
      dfwTotal: dfwEvents.length,
      events,
      byCounty: Array.from(byCounty.values()).sort((a, b) => b.count - a.count),
      swdiPoints, // radar hail points for DFW polygon generation
    });
  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
