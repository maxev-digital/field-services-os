/**
 * Storm Swath API
 * Returns hail swath GeoJSON polygons for a given date.
 * Primary: proxies MRMS Python microservice (accurate NEXRAD-based polygons)
 * Fallback: generates polygons from SWDI radar points using server-side convex hull
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';

const MRMS_BASE = 'http://127.0.0.1:8001';
const LON_MIN = -98.5, LAT_MIN = 32.0, LON_MAX = -95.5, LAT_MAX = 33.9; // DFW + Collin/Rockwall/Kaufman/Fannin

function ctDateFull(offset = 0): string {
  const d = new Date();
  d.setHours(d.getHours() - 6 + offset * 24);
  return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
}

async function fetchSwdiPoints(dateYYYYMMDD: string) {
  try {
    // Date range is end-exclusive. Evening CST storms cross midnight UTC (e.g. 6pm CST = 00:02Z next day).
    // Query date:date+2 and filter to <noon UTC of day+1 to capture full CST calendar day.
    // Actual column order: ZTIME(0), WSR_ID(1), CELL_ID(2), PROB(3), SEVPROB(4), MAXSIZE(5), LAT(6), LON(7)
    const base = new Date(`${dateYYYYMMDD.slice(0,4)}-${dateYYYYMMDD.slice(4,6)}-${dateYYYYMMDD.slice(6,8)}T17:00:00Z`);
    const startCutoff = base.toISOString(); // noon CDT on requested date — lower bound
    const nextD = new Date(base.getTime() + 24 * 60 * 60 * 1000);
    const endD  = new Date(base.getTime() + 48 * 60 * 60 * 1000);
    const nextDate = `${nextD.getUTCFullYear()}${String(nextD.getUTCMonth()+1).padStart(2,'0')}${String(nextD.getUTCDate()).padStart(2,'0')}`;
    const endDate  = `${endD.getUTCFullYear()}${String(endD.getUTCMonth()+1).padStart(2,'0')}${String(endD.getUTCDate()).padStart(2,'0')}`;
    const cutoff = `${nextDate.slice(0,4)}-${nextDate.slice(4,6)}-${nextDate.slice(6,8)}T17:00:00Z`;
    const url = `https://www.ncei.noaa.gov/swdiws/csv/nx3hail/${dateYYYYMMDD}:${endDate}?bbox=${LON_MIN},${LAT_MIN},${LON_MAX},${LAT_MAX}&limit=5000`;

    const res = await fetch(url, {
      headers: { 'User-Agent': 'RoofWorksAdmin/1.0' },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return [];
    const text = await res.text();

    const points: { lon: number; lat: number; maxSize: number; prob: number }[] = [];
    for (const line of text.split('\n')) {
      if (!line.trim() || line.startsWith('ZTIME') || line.startsWith('summary') || line.startsWith('count') || line.startsWith('error') || line.startsWith('#')) continue;
      const c = line.split(',');
      if (c.length < 8) continue;
      const ztime = c[0]?.trim() ?? '';
      if (!ztime.match(/^\d{4}-\d{2}-\d{2}T/)) continue;
      if (ztime < startCutoff) continue;  // exclude prior CDT day bleed-in
      if (ztime > cutoff) continue;
      const lat = parseFloat(c[6]);
      const lon = parseFloat(c[7]);
      const prob = parseInt(c[3], 10);
      const maxSize = parseFloat(c[5]);
      if (isNaN(lat) || isNaN(lon) || isNaN(maxSize) || prob < 30) continue;
      points.push({ lon, lat, maxSize, prob });
    }
    return points;
  } catch { return []; }
}

// Server-side convex hull — no Turf dependency needed
function buildConvexHull(points: {lon:number,lat:number}[]): number[][] | null {
  if (points.length < 3) return null;
  const pts = points.map(p => [p.lon, p.lat]).sort((a,b) => a[0]-b[0] || a[1]-b[1]);

  function cross(O: number[], A: number[], B: number[]) {
    return (A[0]-O[0])*(B[1]-O[1]) - (A[1]-O[1])*(B[0]-O[0]);
  }

  const lower: number[][] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length-2], lower[lower.length-1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: number[][] = [];
  for (const p of [...pts].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length-2], upper[upper.length-1], p) <= 0) upper.pop();
    upper.push(p);
  }

  const hull = [...lower.slice(0,-1), ...upper.slice(0,-1)];
  if (hull.length < 3) return null;
  return [...hull, hull[0]];
}

function bufferHull(ring: number[][], bufferDeg = 0.05): number[][] {
  const cx = ring.reduce((s,p) => s+p[0], 0) / ring.length;
  const cy = ring.reduce((s,p) => s+p[1], 0) / ring.length;
  return ring.map(([lon,lat]) => {
    const dx = lon - cx, dy = lat - cy;
    const dist = Math.sqrt(dx*dx + dy*dy);
    const scale = dist > 0 ? (dist + bufferDeg) / dist : 1;
    return [cx + dx*scale, cy + dy*scale];
  });
}

const HAIL_THRESHOLDS = [
  { min: 3.0, label: '3"+ (Catastrophic)', color: '#7c3aed' },
  { min: 2.0, label: '2"+ (Major)',         color: '#dc2626' },
  { min: 1.5, label: '1.5"+ (Significant)', color: '#ea580c' },
  { min: 1.0, label: '1"+ (Damaging)',       color: '#d97706' },
  { min: 0.5, label: '0.5"+ (Any Hail)',     color: '#16a34a' },
];

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date') || ctDateFull(0);

    // 1. Try MRMS microservice (best accuracy — works for recent/live data)
    try {
      const mrmsRes = await fetch(`${MRMS_BASE}/swath/${date}`, {
        signal: AbortSignal.timeout(15000),
      });
      if (mrmsRes.ok) {
        const data = await mrmsRes.json();
        if (data.features && data.features.length > 0) {
          return NextResponse.json({ ...data, method: 'mrms' });
        }
      }
    } catch { /* microservice not running — fall through to SWDI */ }

    // 2. Fallback: SWDI radar points → convex hull polygons (handles historical dates)
    const swdiPts = await fetchSwdiPoints(date);
    if (swdiPts.length === 0) {
      return NextResponse.json({ type: 'FeatureCollection', features: [], method: 'none', date });
    }

    const features = HAIL_THRESHOLDS.flatMap(t => {
      const pts = swdiPts.filter(p => p.maxSize >= t.min);
      if (pts.length < 4) return [];
      const hull = buildConvexHull(pts);
      if (!hull) return [];
      const buffered = bufferHull(hull, 0.06);
      return [{
        type: 'Feature' as const,
        geometry: { type: 'Polygon' as const, coordinates: [buffered] },
        properties: { threshold_in: t.min, label: t.label, color: t.color },
      }];
    });

    return NextResponse.json({ type: 'FeatureCollection', features, method: 'swdi_fallback', date });
  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
