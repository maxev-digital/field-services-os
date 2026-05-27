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
    // Query date + next UTC day: evening CST storms cross midnight UTC (e.g. 6pm CST = 00:02Z next day).
    // Filter: keep only data before noon UTC of next day — covers the full CST/CDT calendar day.
    // SWDI date range is end-exclusive: "20260303:20260304" only covers March 3.
    // To capture evening CST storms that fall in UTC next-day (e.g. 6pm CST = 00:02Z March 4),
    // query +2 days and filter with cutoff at noon UTC of day+1.
    const base = new Date(`${dateYYYYMMDD.slice(0,4)}-${dateYYYYMMDD.slice(4,6)}-${dateYYYYMMDD.slice(6,8)}T12:00:00Z`);
    const nextD  = new Date(base.getTime() + 24 * 60 * 60 * 1000);
    const endD   = new Date(base.getTime() + 48 * 60 * 60 * 1000);
    const nextDate = `${nextD.getUTCFullYear()}${String(nextD.getUTCMonth()+1).padStart(2,'0')}${String(nextD.getUTCDate()).padStart(2,'0')}`;
    const endDate  = `${endD.getUTCFullYear()}${String(endD.getUTCMonth()+1).padStart(2,'0')}${String(endD.getUTCDate()).padStart(2,'0')}`;
    const cutoff = `${nextDate.slice(0,4)}-${nextDate.slice(4,6)}-${nextDate.slice(6,8)}T12:00:00Z`;
    const dateRange = `${dateYYYYMMDD}:${endDate}`;

    // SWDI bbox limit is 15°×15°. Tile CONUS into 4 regions.
    // Actual column order: ZTIME(0), WSR_ID(1), CELL_ID(2), PROB(3), SEVPROB(4), MAXSIZE(5), LAT(6), LON(7)
    const tiles = [
      '-111,24,-97,39',  // Texas west / Oklahoma / New Mexico / Kansas (DFW lon ~-97)
      '-98,24,-83,39',   // Texas east / Louisiana / Arkansas / Southeast (overlap 1° for DFW)
      '-111,39,-96,50',  // Northern Plains / Mountain West
      '-96,39,-81,50',   // Great Lakes / Midwest
    ];

    const seen = new Set<string>();
    const allPoints: any[] = [];

    await Promise.all(tiles.map(async bbox => {
      try {
        const url = `https://www.ncei.noaa.gov/swdiws/csv/nx3hail/${dateRange}?bbox=${bbox}&limit=10000`;
        const res = await fetch(url, {
          headers: { 'User-Agent': 'RoofWorksAdmin/1.0' },
          signal: AbortSignal.timeout(12000),
        });
        if (!res.ok) return;
        const text = await res.text();
        for (const line of text.split('\n')) {
          if (!line.trim() || line.startsWith('ZTIME') || line.startsWith('summary') || line.startsWith('count') || line.startsWith('error') || line.startsWith('#')) continue;
          const c = line.split(',');
          if (c.length < 8) continue;
          const ztime = c[0]?.trim() ?? '';
          if (!ztime.match(/^\d{4}-\d{2}-\d{2}T/)) continue;
          if (ztime > cutoff) continue;
          const lat = parseFloat(c[6]);
          const lon = parseFloat(c[7]);
          const prob = parseInt(c[3], 10);
          const maxSize = parseFloat(c[5]);
          if (isNaN(lat) || isNaN(lon) || isNaN(maxSize)) continue;
          if (prob < 30) continue;
          const key = `${c[1]?.trim()}_${c[2]?.trim()}_${ztime}`;
          if (seen.has(key)) continue;
          seen.add(key);
          allPoints.push({
            lon, lat,
            wsr_id: c[1]?.trim(),
            cell_id: c[2]?.trim(),
            sevprob: parseInt(c[4], 10) || 0,
            prob,
            maxSize,
            time: ztime,
          });
        }
      } catch { /* tile failed, skip */ }
    }));

    return allPoints;
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

    const dates = dateArg ? [dateArg] : Array.from({length:14},(_,i)=>ctDate(-i));
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
