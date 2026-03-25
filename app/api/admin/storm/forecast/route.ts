/**
 * Storm Forecast API
 * Sources (all free, no API key):
 *   - NOAA NWS: active alerts + 7-day hourly forecast for DFW
 *   - NOAA SPC: Day 1-3 convective outlook risk level for DFW
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';

const DFW_LAT = 32.7767;
const DFW_LON = -96.7970;

// Ray-casting point-in-polygon
function pip(lon: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    if (((yi > lat) !== (yj > lat)) && (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi))
      inside = !inside;
  }
  return inside;
}

function riskForPoint(lon: number, lat: number, geojson: any): string | null {
  if (!geojson?.features) return null;
  const PRIORITY = ['HIGH', 'MDT', 'ENH', 'SLGT', 'MRGL', 'TSTM'];
  let best: string | null = null;
  for (const f of geojson.features) {
    const geom = f.geometry;
    if (!geom) continue;
    const label = (f.properties?.LABEL ?? f.properties?.label ?? '').toUpperCase().trim();
    if (!label) continue;
    const rank = PRIORITY.indexOf(label);
    const bestRank = best !== null ? PRIORITY.indexOf(best) : PRIORITY.length;
    if (rank === -1 || rank >= bestRank) continue;
    let inPoly = false;
    if (geom.type === 'Polygon') {
      inPoly = pip(lon, lat, geom.coordinates[0]);
    } else if (geom.type === 'MultiPolygon') {
      inPoly = geom.coordinates.some((poly: number[][][]) => pip(lon, lat, poly[0]));
    }
    if (inPoly) best = label;
  }
  return best;
}

const RISK_META: Record<string, { text: string; color: string; bg: string }> = {
  HIGH: { text: 'High Risk',       color: '#ff00ff', bg: 'rgba(255,0,255,0.12)' },
  MDT:  { text: 'Moderate Risk',   color: '#ff4444', bg: 'rgba(255,68,68,0.12)'  },
  ENH:  { text: 'Enhanced Risk',   color: '#ff8800', bg: 'rgba(255,136,0,0.12)'  },
  SLGT: { text: 'Slight Risk',     color: '#ffcc00', bg: 'rgba(255,204,0,0.12)'  },
  MRGL: { text: 'Marginal Risk',   color: '#66cc44', bg: 'rgba(102,204,68,0.12)' },
  TSTM: { text: 'General Thunder', color: '#888888', bg: 'rgba(136,136,136,0.12)'},
};

async function fetchOutlook(day: 1 | 2 | 3) {
  // SPC publishes GeoJSON outlooks — try both URL patterns
  const urls = [
    `https://www.spc.noaa.gov/products/outlook/day${day}otlk-geojson.txt`,
    `https://www.spc.noaa.gov/products/outlook/day${day}otlk_cat.nolyr.geojson`,
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'RoofWorksAdmin/1.0' },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const geo = await res.json();
      const label = riskForPoint(DFW_LON, DFW_LAT, geo);
      const meta = label ? (RISK_META[label] ?? null) : null;
      return {
        day,
        label: label ?? 'NONE',
        text: meta?.text ?? 'No Severe Risk',
        color: meta?.color ?? '#22cc66',
        bg: meta?.bg ?? 'rgba(34,204,102,0.10)',
      };
    } catch { continue; }
  }
  return { day, label: 'UNKNOWN', text: 'Data Unavailable', color: '#555555', bg: 'rgba(85,85,85,0.10)' };
}

async function fetchAlerts() {
  try {
    const res = await fetch(
      `https://api.weather.gov/alerts/active?point=${DFW_LAT},${DFW_LON}`,
      {
        headers: {
          'User-Agent': 'RoofWorksAdmin/1.0 (info@roofworksoftexas.com)',
          'Accept': 'application/geo+json',
        },
        signal: AbortSignal.timeout(8000),
      }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.features ?? []).map((f: any) => ({
      id: f.properties.id ?? '',
      event: f.properties.event ?? '',
      severity: f.properties.severity ?? 'Unknown',   // Extreme | Severe | Moderate | Minor | Unknown
      urgency: f.properties.urgency ?? '',
      headline: (
        f.properties.parameters?.NWSheadline?.[0] ??
        f.properties.headline ??
        f.properties.event ?? ''
      ).substring(0, 250),
      description: (f.properties.description ?? '').substring(0, 500),
      instruction: (f.properties.instruction ?? '').substring(0, 400),
      effective: f.properties.effective ?? '',
      expires: f.properties.expires ?? '',
      areaDesc: (f.properties.areaDesc ?? '').substring(0, 200),
    }));
  } catch {
    return [];
  }
}

async function fetchForecast() {
  try {
    // Step 1: Resolve grid
    const ptRes = await fetch(
      `https://api.weather.gov/points/${DFW_LAT},${DFW_LON}`,
      {
        headers: {
          'User-Agent': 'RoofWorksAdmin/1.0 (info@roofworksoftexas.com)',
          'Accept': 'application/geo+json',
        },
        signal: AbortSignal.timeout(8000),
      }
    );
    if (!ptRes.ok) return [];
    const ptData = await ptRes.json();
    const hourlyUrl: string | undefined = ptData.properties?.forecastHourly;
    if (!hourlyUrl) return [];

    // Step 2: Fetch hourly periods (168h = 7 days)
    const fcRes = await fetch(hourlyUrl, {
      headers: {
        'User-Agent': 'RoofWorksAdmin/1.0 (info@roofworksoftexas.com)',
        'Accept': 'application/geo+json',
      },
      signal: AbortSignal.timeout(12000),
    });
    if (!fcRes.ok) return [];
    const fcData = await fcRes.json();
    const periods: any[] = (fcData.properties?.periods ?? []).slice(0, 168);

    // Group into daily summaries
    const byDay: Record<string, any[]> = {};
    for (const p of periods) {
      const day = p.startTime?.substring(0, 10);
      if (!day) continue;
      if (!byDay[day]) byDay[day] = [];
      byDay[day].push(p);
    }

    return Object.entries(byDay).slice(0, 7).map(([date, hours]) => {
      const temps  = hours.map((h: any) => h.temperature ?? 0);
      const precips = hours.map((h: any) => h.probabilityOfPrecipitation?.value ?? 0);
      const winds  = hours.map((h: any) => parseInt((h.windSpeed ?? '0').replace(/[^0-9]/g, ''), 10) || 0);
      // Prefer the daytime period for description / icon
      const dayPeriod = hours.find((h: any) => h.isDaytime) ?? hours[0];
      return {
        date,
        shortForecast: dayPeriod?.shortForecast ?? '',
        icon: dayPeriod?.icon ?? '',
        maxTemp: Math.max(...temps),
        minTemp: Math.min(...temps),
        maxPrecip: Math.max(...precips),
        maxWind: Math.max(...winds),
        windDir: dayPeriod?.windDirection ?? '',
        tempUnit: dayPeriod?.temperatureUnit ?? 'F',
      };
    });
  } catch {
    return [];
  }
}

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const [alerts, day1, day2, day3, forecast] = await Promise.all([
      fetchAlerts(),
      fetchOutlook(1),
      fetchOutlook(2),
      fetchOutlook(3),
      fetchForecast(),
    ]);
    return NextResponse.json({ alerts, outlooks: [day1, day2, day3], forecast });
  } catch (error: any) {
    if (error.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
