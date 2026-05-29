'use client';

import { Suspense, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import Map, { Source, Layer, Popup, NavigationControl, ScaleControl } from 'react-map-gl/maplibre';
import { MapPin, Home, ArrowLeft, Search, Layers, CheckSquare, Square, Phone, Download,
         Crosshair, Upload, X, ExternalLink, Cloud, ChevronDown, ChevronRight, Navigation } from 'lucide-react';
import 'maplibre-gl/dist/maplibre-gl.css';

// Satellite + reference overlay — proxied via /api/tiles/esri to avoid CORS
const SATELLITE_STYLE: any = {
  version: 8, name: 'Satellite Hybrid',
  sources: {
    'esri-sat': { type: 'raster', tiles: ['/api/tiles/esri?z={z}&y={y}&x={x}&svc=World_Imagery/MapServer'], tileSize: 256, attribution: '© ESRI' },
    'esri-ref': { type: 'raster', tiles: ['/api/tiles/esri?z={z}&y={y}&x={x}&svc=Reference/World_Reference_Overlay/MapServer'], tileSize: 256, attribution: '© ESRI' },
  },
  layers: [
    { id: 'sat-bg',  type: 'raster', source: 'esri-sat' },
    { id: 'sat-ref', type: 'raster', source: 'esri-ref', paint: { 'raster-opacity': 0.85 } },
  ],
};
// CartoDB Dark Matter — free, no API key, full CORS support, road/label overlay included
const DARK_STYLE: any = {
  version: 8, name: 'Dark',
  sources: {
    'carto-dark': { type: 'raster', tiles: [
      'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
      'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
      'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
      'https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
    ], tileSize: 256, attribution: '© CartoDB, © OpenStreetMap contributors' },
  },
  layers: [
    { id: 'carto-dark', type: 'raster', source: 'carto-dark' },
  ],
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface Parcel {
  id: number; apn: string; owner_name: string | null; prop_address: string;
  prop_city: string; prop_zip: string | null; year_built: number | null;
  living_sqft: number | null; total_value: number | null; is_owner_occupied: boolean;
  lat: number; lon: number; county: string; dist_miles: number | null; enriched: boolean;
  stories: number | null;
}
interface HailReport {
  lat: number; lon: number; size_in: number; location: string; county: string; time: string;
}
interface StormDate {
  date: string;       // YYYYMMDD
  dfw_hail: number;
  max_hail_in: number; // converted to inches
}
interface HailCluster {
  county: string;
  reports: HailReport[];
  max_size: number;
  centerLat: number;
  centerLon: number;
  latMin: number;
  latMax: number;
  lonMin: number;
  lonMax: number;
}

// ─── Hail helpers ─────────────────────────────────────────────────────────────

// Color scale entirely separate from parcel pin colors (no blue/purple/orange/gray)
function hailColor(size_in: number): string {
  if (size_in >= 3.0) return '#EC4899'; // magenta  — baseball+
  if (size_in >= 2.5) return '#EF4444'; // red      — tennis ball
  if (size_in >= 2.0) return '#F87171'; // rose     — egg
  if (size_in >= 1.5) return '#FACC15'; // yellow   — ping pong
  return '#4ADE80';                     // green    — quarter
}
function hailSizeLabel(size_in: number): string {
  if (size_in >= 4.0) return 'Grapefruit+';
  if (size_in >= 3.0) return 'Baseball';
  if (size_in >= 2.5) return 'Tennis Ball';
  if (size_in >= 2.0) return 'Egg';
  if (size_in >= 1.75) return 'Golf Ball';
  if (size_in >= 1.5) return 'Ping Pong';
  return 'Quarter';
}
function fmtDate(yyyymmdd: string): string {
  const y = parseInt(yyyymmdd.slice(0, 4));
  const m = parseInt(yyyymmdd.slice(4, 6)) - 1;
  const d = parseInt(yyyymmdd.slice(6, 8));
  return new Date(y, m, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Maps swath polygon fill color → minimum hail size in inches (matches swath route)
const SWATH_COLOR_SIZE: Record<string, number> = {
  '#7c3aed': 3.0,
  '#dc2626': 2.0,
  '#ea580c': 1.5,
  '#d97706': 1.0,
  '#16a34a': 0.5,
};

// ─── Pin color helpers ────────────────────────────────────────────────────────

function estRoofSqft(p: Parcel): number | null {
  if (!p.living_sqft) return null;
  const s = p.stories || 1;
  return Math.round((p.living_sqft / s) * 1.4);
}

function pointInRing(lon: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    if (((yi > lat) !== (yj > lat)) && (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi))
      inside = !inside;
  }
  return inside;
}
function pointInGeometry(lon: number, lat: number, geometry: any): boolean {
  if (geometry.type === 'Polygon') return pointInRing(lon, lat, geometry.coordinates[0]);
  if (geometry.type === 'MultiPolygon') {
    for (const poly of geometry.coordinates) if (pointInRing(lon, lat, poly[0])) return true;
  }
  return false;
}

function pinColor(p: Parcel, mode: 'status' | 'value' | 'age' | 'roof' | 'hail', isSelected: boolean, isEnriched: boolean, hailTierMap: Record<number, string> | null = null): string {
  if (isSelected) return '#3b82f6';
  if (mode === 'hail') return hailTierMap?.[p.id] ?? '#64748b';
  if (mode === 'value') {
    const v = p.total_value;
    if (!v) return '#64748b';
    if (v >= 500000) return '#ef4444';   // red    — $500k+
    if (v >= 350000) return '#f97316';   // orange — $350-500k
    if (v >= 200000) return '#facc15';   // yellow — $200-350k
    return '#4ade80';                    // green  — under $200k
  }
  if (mode === 'age') {
    const y = p.year_built;
    if (!y) return '#64748b';
    const age = 2026 - y;
    if (age >= 30) return '#ef4444';     // red    — 30+ yrs, prime target
    if (age >= 20) return '#f97316';     // orange — 20-30 yrs
    if (age >= 10) return '#facc15';     // yellow — 10-20 yrs
    return '#4ade80';                    // green  — under 10 yrs
  }
  if (mode === 'roof') {
    const rsf = estRoofSqft(p);
    if (!rsf) return '#64748b';
    if (rsf >= 5000) return '#ef4444';   // red    — 5000+ sqft, very large
    if (rsf >= 3500) return '#f97316';   // orange — 3500-5000
    if (rsf >= 2000) return '#facc15';   // yellow — 2000-3500
    return '#4ade80';                    // green  — under 2000
  }
  // status mode
  if (isEnriched) return '#a855f7';
  if (p.is_owner_occupied) return '#f97316';
  return '#94a3b8';
}

// ─── CSV helpers (for manual BatchData upload) ────────────────────────────────

function parseCsvRow(line: string): string[] {
  const out: string[] = [];
  let cur = ''; let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (inQ && line[i+1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
    else if (c === ',' && !inQ) { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}
function pickBestPhone(g: (col: string) => string): [string|null, string|null] {
  const all: {num:string; reachable:boolean; dnc:boolean}[] = [];
  for (let i = 0; i < 5; i++) {
    const num = g(`Skiptrace:phoneNumbers.${i}.number`).replace(/\D/g,'');
    if (!num || num.length < 10) continue;
    all.push({ num, reachable: g(`Skiptrace:phoneNumbers.${i}.reachable`) === 'true', dnc: g(`Skiptrace:phoneNumbers.${i}.dnc`) === 'true' });
  }
  const sorted = [...all.filter(c=>c.reachable&&!c.dnc), ...all.filter(c=>c.reachable&&c.dnc), ...all.filter(c=>!c.reachable)];
  return [sorted[0]?.num||null, sorted[1]?.num||null];
}
function parseBatchDataCsv(text: string) {
  const lines = text.split('\n').filter(l=>l.trim());
  if (lines.length < 2) return [];
  const headers = parseCsvRow(lines[0]);
  const g = (row: string[], col: string) => (row[headers.indexOf(col)]??'').trim();
  return lines.slice(1).map(line => {
    const vals = parseCsvRow(line);
    const get  = (col: string) => g(vals, col);
    if (get('Skiptrace:death.deceased') === 'true') return null;
    const litigator = get('Skiptrace:litigator') === 'true';
    const dnc       = get('Skiptrace:dnc.tcpa')  === 'true';
    const address   = get('Input Data:Property Street').toUpperCase();
    if (!address) return null;
    const [phone, phone2] = pickBestPhone(get);
    const emails = new Set<string>();
    for (let i = 0; i < 3; i++) { const em = get(`Skiptrace:emails.${i}.email`).toLowerCase(); if (em&&em.includes('@')) emails.add(em); }
    const [email, email2, email3] = [...emails];
    const sqftRaw = parseInt(get('Sqft'),10); const valueRaw = parseFloat(get('Est Value')); const yearRaw = parseInt(get('Year Built'),10);
    return { address, name: get('Owner Name'), city: get('Property City'), zip: get('Property Zip'), phone:phone||null, phone2:phone2||null, email:email||null, email2:email2||null, email3:email3||null, litigator, dnc, year_built:isNaN(yearRaw)?null:yearRaw, sqft:isNaN(sqftRaw)?null:sqftRaw, home_value:isNaN(valueRaw)?null:valueRaw };
  }).filter(Boolean);
}

// ─── Component ────────────────────────────────────────────────────────────────

function ParcelsMapInner() {
  // ── Parcel state ────────────────────────────────────────────────────────────
  const [parcels, setParcels]       = useState<Parcel[]>([]);
  const [loading, setLoading]       = useState(false);
  const [popup, setPopup]           = useState<Parcel | null>(null);
  const [basemap, setBasemap]       = useState<'satellite' | 'dark'>('satellite');
  const [selected, setSelected]     = useState<Set<number>>(new Set());
  const [enriched, setEnriched]     = useState<Set<number>>(new Set());
  const [searchZip, setSearchZip]   = useState('');
  const [searchLat, setSearchLat]   = useState('');
  const [searchLon, setSearchLon]   = useState('');
  const [radius, setRadius]         = useState('0.5');
  const [campaignName, setCampaignName] = useState('');
  const [tracing, setTracing]           = useState(false);
  const [traceResult, setTraceResult]   = useState<{msg: string; neighborhood: string} | null>(null);
  const [truncated, setTruncated]       = useState<{shown: number; total: number} | null>(null);

  // ── Box select ──────────────────────────────────────────────────────────────
  const mapRef     = useRef<any>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [boxMode, setBoxMode]       = useState(false);
  const [boxStart, setBoxStart]     = useState<{x:number;y:number}|null>(null);
  const [boxCurrent, setBoxCurrent] = useState<{x:number;y:number}|null>(null);

  // ── CSV import ──────────────────────────────────────────────────────────────
  const fileInputRef                    = useRef<HTMLInputElement>(null);
  const [importing, setImporting]       = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);

  // ── Storm sidebar ───────────────────────────────────────────────────────────
  const [stormOpen, setStormOpen]         = useState(true);
  const [stormDates, setStormDates]       = useState<StormDate[]>([]);
  const [selectedDate, setSelectedDate]   = useState<string | null>(null);
  const [hailReports, setHailReports]     = useState<HailReport[]>([]);
  const [hailLoading, setHailLoading]     = useState(false);
  const [hailPopup, setHailPopup]         = useState<HailReport | null>(null);
  const [hailPopupZip, setHailPopupZip]   = useState<string | null>(null);
  const [swathGeoJson, setSwathGeoJson]   = useState<any>(null);
  const [swathMethod, setSwathMethod]     = useState<string | null>(null);
  const [showSwath, setShowSwath]         = useState(true);
  const [swathMinSize, setSwathMinSize]   = useState(0); // 0=all tiers, 0.5/1/1.5/2/3 = filter

  // ── Filter + color mode ─────────────────────────────────────────────────────
  const [filterOpen, setFilterOpen]         = useState(false);
  const [colorMode, setColorMode]           = useState<'status' | 'value' | 'age' | 'roof' | 'hail'>('status');
  const [filterYearMin, setFilterYearMin]       = useState(1900);
  const [filterYearMax, setFilterYearMax]       = useState(2025);
  const [filterValueMin, setFilterValueMin]     = useState(0);
  const [filterSqftMin, setFilterSqftMin]       = useState(0);
  const [filterRoofMin, setFilterRoofMin]       = useState(0);
  const [filterStoriesMax, setFilterStoriesMax] = useState(0); // 0=any, 1=1 story, 2=2 stories
  const [filterInSwathOnly, setFilterInSwathOnly] = useState(false); // hide pins outside swath polygon

  const mapStyle = basemap === 'satellite' ? SATELLITE_STYLE : DARK_STYLE;

  // ── Fetch recent DFW storm dates ────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/storm/history?months=2&dfw=1')
      .then(r => r.json())
      .then(data => {
        const dates: StormDate[] = [];
        for (const month of data.grouped ?? []) {
          for (const ev of month.events ?? []) {
            if ((ev.dfwHail ?? 0) > 0) {
              dates.push({ date: ev.date, dfw_hail: ev.dfwHail, max_hail_in: (ev.maxHail ?? 0) / 100 });
            }
          }
        }
        setStormDates(dates.slice(0, 20));
      })
      .catch(() => {});
  }, []);

  // ── Reverse-geocode ZIP when hail popup opens ───────────────────────────────
  useEffect(() => {
    if (!hailPopup) { setHailPopupZip(null); return; }
    fetch(`/api/admin/geo/reverse?lat=${hailPopup.lat}&lon=${hailPopup.lon}`)
      .then(r => r.json())
      .then(d => setHailPopupZip(d.zip ?? null))
      .catch(() => setHailPopupZip(null));
  }, [hailPopup]);

  // ── Hail clusters (group reports by county) ─────────────────────────────────
  const hailClusters = useMemo<HailCluster[]>(() => {
    if (!hailReports.length) return [];
    const byCounty: Record<string, HailReport[]> = {};
    for (const r of hailReports) {
      const key = r.county || 'Unknown';
      if (!byCounty[key]) byCounty[key] = [];
      byCounty[key].push(r);
    }
    const BUFFER = 0.15; // ~10 miles padding — ensures full residential coverage even if SPC reports are sparse
    return Object.entries(byCounty).map(([county, reports]) => {
      const max  = reports.reduce((a, b) => a.size_in > b.size_in ? a : b);
      const cLat = reports.reduce((s, r) => s + r.lat, 0) / reports.length;
      const cLon = reports.reduce((s, r) => s + r.lon, 0) / reports.length;
      const latMin = Math.min(...reports.map(r => r.lat)) - BUFFER;
      const latMax = Math.max(...reports.map(r => r.lat)) + BUFFER;
      const lonMin = Math.min(...reports.map(r => r.lon)) - BUFFER;
      const lonMax = Math.max(...reports.map(r => r.lon)) + BUFFER;
      return { county, reports, max_size: max.size_in, centerLat: cLat, centerLon: cLon, latMin, latMax, lonMin, lonMax };
    }).sort((a, b) => b.max_size - a.max_size);
  }, [hailReports]);

  // Precompute per-tier bboxes from swath features (reversed back to most-severe-first for PIP priority)
  const swathTiers = useMemo(() => {
    if (!swathGeoJson?.features?.length) return [];
    return [...swathGeoJson.features].reverse().map((f: any) => {
      const g = f.geometry;
      const allCoords: number[][] = [];
      if (g.type === 'Polygon') allCoords.push(...g.coordinates[0]);
      else if (g.type === 'MultiPolygon') for (const poly of g.coordinates) allCoords.push(...poly[0]);
      const lons = allCoords.map((c: number[]) => c[0]);
      const lats = allCoords.map((c: number[]) => c[1]);
      return {
        color: f.properties.color as string,
        geometry: g,
        bbox: { minLon: Math.min(...lons), maxLon: Math.max(...lons), minLat: Math.min(...lats), maxLat: Math.max(...lats) },
      };
    });
  }, [swathGeoJson]);

  // Swath tiers filtered by minimum hail size (0 = show all)
  const visibleSwathTiers = useMemo(() => {
    if (!swathMinSize) return swathTiers;
    return swathTiers.filter(t => (SWATH_COLOR_SIZE[t.color] ?? 0) >= swathMinSize);
  }, [swathTiers, swathMinSize]);

  // Swath GeoJSON filtered to only visible tiers (for map rendering)
  const visibleSwathGeoJson = useMemo(() => {
    if (!swathGeoJson?.features?.length) return swathGeoJson;
    if (!swathMinSize) return swathGeoJson;
    const features = swathGeoJson.features.filter((f: any) =>
      (SWATH_COLOR_SIZE[f.properties?.color] ?? 0) >= swathMinSize
    );
    return { ...swathGeoJson, features };
  }, [swathGeoJson, swathMinSize]);

  // Assign each parcel to its highest-severity hail tier via point-in-polygon
  // Uses a plain object instead of Map to avoid shadowing the react-map-gl Map import
  const parcelHailTierMap = useMemo((): Record<number, string> | null => {
    if (!visibleSwathTiers.length || colorMode !== 'hail') return null;
    const result: Record<number, string> = {};
    for (const p of parcels) {
      for (const tier of visibleSwathTiers) {
        if (p.lon < tier.bbox.minLon || p.lon > tier.bbox.maxLon || p.lat < tier.bbox.minLat || p.lat > tier.bbox.maxLat) continue;
        if (pointInGeometry(p.lon, p.lat, tier.geometry)) { result[p.id] = tier.color; break; }
      }
    }
    return result;
  }, [visibleSwathTiers, parcels, colorMode]);

  // ── Filtered parcels (live — no DB reload) ──────────────────────────────────
  // Declared after parcelHailTierMap so we can reference it for swath-only filter
  const filteredParcels = useMemo(() => {
    return parcels.filter(p => {
      if (filterYearMin > 1900 && p.year_built !== null && p.year_built < filterYearMin) return false;
      if (filterYearMax < 2025 && p.year_built !== null && p.year_built > filterYearMax) return false;
      if (filterValueMin > 0 && p.total_value !== null && p.total_value < filterValueMin) return false;
      if (filterSqftMin > 0 && (p.living_sqft === null || p.living_sqft < filterSqftMin)) return false;
      if (filterRoofMin > 0) {
        const rsf = estRoofSqft(p);
        if (!rsf || rsf < filterRoofMin) return false;
      }
      if (filterStoriesMax > 0 && p.stories !== null && p.stories > filterStoriesMax) return false;
      if (filterInSwathOnly && parcelHailTierMap !== null && !parcelHailTierMap[p.id]) return false;
      return true;
    });
  }, [parcels, filterYearMin, filterYearMax, filterValueMin, filterSqftMin, filterRoofMin, filterStoriesMax, filterInSwathOnly, parcelHailTierMap]);

  const activeFilterCount = (filterYearMin > 1900 || filterYearMax < 2025 ? 1 : 0) +
    (filterValueMin > 0 ? 1 : 0) + (filterSqftMin > 0 ? 1 : 0) + (filterRoofMin > 0 ? 1 : 0) +
    (filterStoriesMax > 0 ? 1 : 0) + (filterInSwathOnly ? 1 : 0);

  // ── Load parcels at a specific location ─────────────────────────────────────
  const loadAtLocation = useCallback(async (lat: number, lon: number, radiusMi = 0.5) => {
    setLoading(true);
    setTraceResult(null);
    setImportResult(null);
    setTruncated(null);
    try {
      const qp = new URLSearchParams({ lat: lat.toString(), lon: lon.toString(), radius_miles: radiusMi.toString(), limit: '20000' });
      const res  = await fetch(`/api/admin/parcels?${qp}`);
      const data = await res.json();
      const ps: Parcel[] = data.parcels ?? [];
      setParcels(ps);
      setSelected(new Set());
      setEnriched(new Set(ps.filter(p => p.enriched).map(p => p.id)));
      if (data.truncated) setTruncated({ shown: data.total, total: data.total_available });
    } finally { setLoading(false); }
  }, []);

  // ── Load parcels for a full storm swath bbox ────────────────────────────────
  const loadAtBbox = useCallback(async (latMin: number, latMax: number, lonMin: number, lonMax: number) => {
    setLoading(true);
    setTraceResult(null);
    setImportResult(null);
    setTruncated(null);
    try {
      const qp  = new URLSearchParams({ lat_min: latMin.toFixed(5), lat_max: latMax.toFixed(5), lon_min: lonMin.toFixed(5), lon_max: lonMax.toFixed(5), limit: '20000' });
      const res  = await fetch(`/api/admin/parcels?${qp}`);
      const data = await res.json();
      const ps: Parcel[] = data.parcels ?? [];
      setParcels(ps);
      setSelected(new Set());
      setEnriched(new Set(ps.filter(p => p.enriched).map(p => p.id)));
      if (data.truncated) setTruncated({ shown: data.total, total: data.total_available });
    } finally { setLoading(false); }
  }, []);

  // ── Load pins covering only the visible (filtered) swath tiers ─────────────
  const loadSwathPins = useCallback(() => {
    if (!visibleSwathTiers.length) return;
    let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
    for (const t of visibleSwathTiers) {
      if (t.bbox.minLat < minLat) minLat = t.bbox.minLat;
      if (t.bbox.maxLat > maxLat) maxLat = t.bbox.maxLat;
      if (t.bbox.minLon < minLon) minLon = t.bbox.minLon;
      if (t.bbox.maxLon > maxLon) maxLon = t.bbox.maxLon;
    }
    if (minLat === Infinity) return;
    mapRef.current?.getMap().fitBounds([[minLon, minLat], [maxLon, maxLat]], { padding: 80, duration: 900, maxZoom: 12 });
    loadAtBbox(minLat, maxLat, minLon, maxLon);
    setColorMode('hail');
    setFilterInSwathOnly(true);
  }, [visibleSwathTiers, loadAtBbox]);

  // ── Fly to a storm cluster — fits map to full hail swath bbox ───────────────
  const flyToCluster = useCallback((cluster: HailCluster) => {
    const { latMin, latMax, lonMin, lonMax } = cluster;
    setSearchLat(cluster.centerLat.toFixed(4));
    setSearchLon(cluster.centerLon.toFixed(4));
    setSearchZip('');
    setRadius('');
    mapRef.current?.getMap().fitBounds(
      [[lonMin, latMin], [lonMax, latMax]],
      { padding: 60, duration: 800, maxZoom: 13 }
    );
    loadAtBbox(latMin, latMax, lonMin, lonMax);
  }, [loadAtBbox]);

  // ── Load hail reports for a storm date ─────────────────────────────────────
  // autoFly=true → immediately flies to the highest-impact cluster and loads parcels
  const loadHailReports = useCallback(async (date: string, autoFly = false) => {
    if (selectedDate === date && !autoFly) {
      setSelectedDate(null); setHailReports([]); setSwathGeoJson(null); setSwathMethod(null);
      setColorMode('status'); setSwathMinSize(0); setParcels([]); setSelected(new Set()); setEnriched(new Set());
      setFilterInSwathOnly(false);
      return;
    }
    setSelectedDate(date);
    setHailLoading(true);
    setHailReports([]);
    setSwathGeoJson(null);
    setSwathMethod(null);
    setColorMode('status');
    setSwathMinSize(0);
    setParcels([]);        // clear any previously loaded pins — user must use Load Pins button
    setSelected(new Set());
    setEnriched(new Set());
    setTruncated(null);
    setFilterInSwathOnly(false);

    // Fetch MRMS swath in parallel — don't block hail report load
    fetch(`/api/admin/storm/swath?date=${date}`)
      .then(r => r.json())
      .then(d => {
        if (d.features?.length > 0) {
          // Reverse so least severe renders first (most severe paints on top)
          const reversed = { ...d, features: [...d.features].reverse() };
          setSwathGeoJson(reversed);
          setSwathMethod(d.method);
          // Compute swath bbox from MRMS polygon coordinates
          let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
          for (const f of d.features) {
            const g = f.geometry;
            const rings: number[][][] = g.type === 'Polygon' ? [g.coordinates[0]] : g.coordinates.map((p: any) => p[0]);
            for (const ring of rings) for (const [lon, lat] of ring) {
              if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
              if (lon < minLon) minLon = lon; if (lon > maxLon) maxLon = lon;
            }
          }
          if (minLat !== Infinity) {
            // Fly to swath area — pins NOT auto-loaded, user clicks "Load Pins in Swath"
            mapRef.current?.getMap().fitBounds(
              [[minLon, minLat], [maxLon, maxLat]],
              { padding: 80, duration: 900, maxZoom: 12 }
            );
          }
        }
      })
      .catch(() => {});

    try {
      const res     = await fetch(`/api/admin/storm/hail-reports?date=${date}`);
      const data    = await res.json();
      const reports: HailReport[] = data.reports ?? [];
      setHailReports(reports);
      if (autoFly && reports.length > 0 && !swathGeoJson) {
        // Swath didn't load — fall back to SPC cluster fly (no pin load)
        const BUFFER = 0.15;
        const byCounty: Record<string, HailReport[]> = {};
        for (const r of reports) { const k = r.county || 'Unknown'; (byCounty[k] = byCounty[k] ?? []).push(r); }
        const top = Object.values(byCounty)
          .map(rs => ({
            latMin: Math.min(...rs.map(r=>r.lat)) - BUFFER,
            latMax: Math.max(...rs.map(r=>r.lat)) + BUFFER,
            lonMin: Math.min(...rs.map(r=>r.lon)) - BUFFER,
            lonMax: Math.max(...rs.map(r=>r.lon)) + BUFFER,
          }))
          .sort((a, b) => (b.latMax - b.latMin) - (a.latMax - a.latMin))[0];
        if (top) mapRef.current?.getMap().fitBounds(
          [[top.lonMin, top.latMin], [top.lonMax, top.latMax]],
          { padding: 60, duration: 800, maxZoom: 13 }
        );
      }
    } catch {}
    finally { setHailLoading(false); }
  }, [selectedDate, flyToCluster, loadAtBbox]);

  // ── Load parcels by a specific ZIP (used from hail popup "Use ZIP" button) ───
  const loadAtZip = useCallback(async (zip: string) => {
    setLoading(true); setTraceResult(null); setImportResult(null); setTruncated(null);
    try {
      const res  = await fetch(`/api/admin/parcels?zip=${zip}&limit=10000`);
      const data = await res.json();
      const ps: Parcel[] = data.parcels ?? [];
      setParcels(ps);
      setSelected(new Set());
      setEnriched(new Set(ps.filter(p => p.enriched).map(p => p.id)));
      if (data.truncated) setTruncated({ shown: data.total, total: data.total_available });
      if (ps.length > 0) {
        const cLat = ps.reduce((s, p) => s + p.lat, 0) / ps.length;
        const cLon = ps.reduce((s, p) => s + p.lon, 0) / ps.length;
        mapRef.current?.getMap().flyTo({ center: [cLon, cLat], zoom: 13, duration: 800 });
      }
    } finally { setLoading(false); }
  }, []);

  // ── Load parcels (zip or lat/lon from search bar) ───────────────────────────
  const load = useCallback(async () => {
    if (!searchZip && (!searchLat || !searchLon)) return;
    setLoading(true);
    setTraceResult(null);
    setImportResult(null);
    setTruncated(null);
    try {
      const qp = new URLSearchParams();
      if (searchZip) { qp.set('zip', searchZip); qp.set('limit', '10000'); }
      else { qp.set('lat', searchLat); qp.set('lon', searchLon); qp.set('radius_miles', radius); qp.set('limit', '20000'); }
      const res  = await fetch(`/api/admin/parcels?${qp}`);
      const data = await res.json();
      const ps: Parcel[] = data.parcels ?? [];
      setParcels(ps);
      setSelected(new Set());
      setEnriched(new Set(ps.filter(p => p.enriched).map(p => p.id)));
      if (data.truncated) setTruncated({ shown: data.total, total: data.total_available });
      if (ps.length > 0 && (searchZip || (searchLat && searchLon))) {
        const cLat = searchLat ? parseFloat(searchLat) : ps.reduce((s, p) => s + p.lat, 0) / ps.length;
        const cLon = searchLon ? parseFloat(searchLon) : ps.reduce((s, p) => s + p.lon, 0) / ps.length;
        mapRef.current?.getMap().flyTo({ center: [cLon, cLat], zoom: 14, duration: 800 });
      }
    } finally { setLoading(false); }
  }, [searchZip, searchLat, searchLon, radius]);

  const suggestCampaignName = useCallback(() => {
    const date = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    if (searchZip) return `ZIP ${searchZip} — ${date}`;
    if (searchLat && searchLon) return `Lat ${parseFloat(searchLat).toFixed(3)} Lon ${parseFloat(searchLon).toFixed(3)} — ${date}`;
    return `Parcels Map — ${date}`;
  }, [searchZip, searchLat, searchLon]);

  // ── GeoJSON for parcels ─────────────────────────────────────────────────────
  const geoJson: any = useMemo(() => ({
    type: 'FeatureCollection',
    features: filteredParcels.map(p => {
      const isSel = selected.has(p.id);
      const isEnr = enriched.has(p.id);
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
        properties: {
          id: p.id,
          selected: isSel ? 1 : 0,
          pin_color: pinColor(p, colorMode, isSel, isEnr, parcelHailTierMap),
          stroke_w: isSel ? 2 : 1,
        },
      };
    }),
  }), [filteredParcels, selected, enriched, colorMode, parcelHailTierMap]);

  // ── GeoJSON for hail overlay ────────────────────────────────────────────────
  const hailGeoJson: any = {
    type: 'FeatureCollection',
    features: hailReports.map(r => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [r.lon, r.lat] },
      properties: { size_in: r.size_in, location: r.location, county: r.county, time: r.time, lat: r.lat, lon: r.lon },
    })),
  };

  const toggleSelect = (id: number) => {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const selectAll = () => { setSelected(new Set(parcels.map(p=>p.id))); if (!campaignName) setCampaignName(suggestCampaignName()); };
  const clearAll  = () => setSelected(new Set());

  // ── Export CSV ──────────────────────────────────────────────────────────────
  const exportCsv = () => {
    const rows = selected.size > 0 ? parcels.filter(p=>selected.has(p.id)) : parcels;
    if (!rows.length) return;
    const header = ['Owner Name','Property Street','Property City','Property State','Property Zip','Year Built','Sqft','Est Value'];
    const lines  = rows.map(p=>[p.owner_name||'',p.prop_address||'',p.prop_city||'','TX',p.prop_zip||'',p.year_built||'',p.living_sqft||'',p.total_value?Math.round(p.total_value):''].map(v=>`"${String(v).replace(/"/g,'""')}"`).join(','));
    const csv  = [header.join(','),...lines].join('\n');
    const blob = new Blob([csv],{type:'text/csv'});
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a'); a.href=url; a.download=`parcels-${rows.length}-records.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  // ── Skip Trace ──────────────────────────────────────────────────────────────
  const runSkipTrace = async () => {
    if (!selected.size) return;
    const name = campaignName || suggestCampaignName();
    setCampaignName(name);
    setTracing(true);
    setTraceResult(null);
    try {
      const importRes  = await fetch('/api/admin/parcels/import-prospects', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ parcel_ids: Array.from(selected), neighborhood: name }) });
      const importData = await importRes.json();
      const prospectIds: string[] = importData.prospect_ids ?? [];
      if (!prospectIds.length) { setTraceResult({msg:'No prospects created.',neighborhood:name}); return; }
      const traceRes  = await fetch('/api/admin/prospects/skip-trace', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ prospect_ids: prospectIds }) });
      const traceData = await traceRes.json();
      if (traceData.found > 0) setEnriched(prev => new Set([...prev, ...Array.from(selected)]));
      setTraceResult({ msg: `${traceData.found} of ${traceData.total_sent} homes enriched with phones${traceData.already_had_phone ? ` (${traceData.already_had_phone} already had phones)` : ''}. Cost: ${traceData.cost_logged}`, neighborhood: name });
      setSelected(new Set());
    } catch (e: any) {
      setTraceResult({msg:`Error: ${e.message}`, neighborhood: ''});
    } finally { setTracing(false); }
  };

  // ── BatchData manual CSV import ─────────────────────────────────────────────
  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    e.target.value = '';
    setImporting(true); setImportResult(null);
    try {
      const text    = await file.text();
      const records = parseBatchDataCsv(text);
      if (!records.length) { setImportResult('No valid records found.'); return; }
      const res  = await fetch('/api/admin/prospects/batchdata-import', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ records }) });
      const data = await res.json();
      setImportResult(`Imported ${data.total} records — ${data.updated} updated, ${data.created} new.`);
      const updated = parcels.filter(p => records.some((r:any) => r?.address === p.prop_address.toUpperCase() && r?.phone));
      if (updated.length) setEnriched(prev => new Set([...prev, ...updated.map(p=>p.id)]));
    } catch (err: any) {
      setImportResult(`Import error: ${err.message}`);
    } finally { setImporting(false); }
  };

  // ── Box select ──────────────────────────────────────────────────────────────
  const getRelativePos = (e: React.MouseEvent) => {
    if (!overlayRef.current) return {x:0,y:0};
    const r = overlayRef.current.getBoundingClientRect();
    return {x: e.clientX-r.left, y: e.clientY-r.top};
  };
  const handleBoxMouseDown = (e: React.MouseEvent<HTMLDivElement>) => { e.preventDefault(); const pos = getRelativePos(e); setBoxStart(pos); setBoxCurrent(pos); };
  const handleBoxMouseMove = (e: React.MouseEvent<HTMLDivElement>) => { if (!boxStart) return; setBoxCurrent(getRelativePos(e)); };
  const handleBoxMouseUp   = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!boxStart || !mapRef.current) { setBoxStart(null); setBoxCurrent(null); return; }
    const end = getRelativePos(e);
    if (Math.abs(end.x-boxStart.x) < 8 || Math.abs(end.y-boxStart.y) < 8) { setBoxStart(null); setBoxCurrent(null); return; }
    const map = mapRef.current.getMap();
    const sw  = map.unproject([Math.min(boxStart.x,end.x), Math.max(boxStart.y,end.y)]);
    const ne  = map.unproject([Math.max(boxStart.x,end.x), Math.min(boxStart.y,end.y)]);
    setSelected(prev => { const next = new Set(prev); filteredParcels.filter(p=>p.lat>=sw.lat&&p.lat<=ne.lat&&p.lon>=sw.lng&&p.lon<=ne.lng).forEach(p=>next.add(p.id)); return next; });
    if (!campaignName) setCampaignName(suggestCampaignName());
    setBoxStart(null); setBoxCurrent(null); setBoxMode(false);
  };
  const handleBoxMouseLeave = () => { if (boxStart) { setBoxStart(null); setBoxCurrent(null); } };


  const boxRect = boxStart && boxCurrent ? {
    left: Math.min(boxStart.x,boxCurrent.x), top: Math.min(boxStart.y,boxCurrent.y),
    width: Math.abs(boxCurrent.x-boxStart.x), height: Math.abs(boxCurrent.y-boxStart.y),
  } : null;

  const enrichedCount = enriched.size;

  return (
    <div className="flex flex-col h-screen bg-gray-950">

      {/* ── Header row 1 — search ─────────────────────────────────────────── */}
      <div className="flex items-center gap-4 px-5 py-3 bg-gray-900 border-b border-gray-700 shrink-0 flex-wrap">
        <a href="/admin/outreach/zones" className="text-gray-400 hover:text-white"><ArrowLeft className="w-5 h-5" /></a>
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-blue-400" />
          <span className="text-white font-semibold text-sm">Property Map</span>
        </div>

        <div className="flex items-center gap-2 flex-1 flex-wrap">
          <input className="bg-gray-800 border border-gray-600 text-white text-xs rounded px-2 py-1.5 w-24" placeholder="ZIP code"
            value={searchZip} onChange={e=>{setSearchZip(e.target.value);setSearchLat('');setSearchLon('');}} />
          <span className="text-gray-600 text-xs">or</span>
          <input className="bg-gray-800 border border-gray-600 text-white text-xs rounded px-2 py-1.5 w-24" placeholder="Lat"
            value={searchLat} onChange={e=>{setSearchLat(e.target.value);setSearchZip('');}} />
          <input className="bg-gray-800 border border-gray-600 text-white text-xs rounded px-2 py-1.5 w-28" placeholder="Lon"
            value={searchLon} onChange={e=>{setSearchLon(e.target.value);setSearchZip('');}} />
          {!searchZip && (
            <input className="bg-gray-800 border border-gray-600 text-white text-xs rounded px-2 py-1.5 w-20" placeholder="Radius mi"
              value={radius} onChange={e=>setRadius(e.target.value)} />
          )}
          <button onClick={load} disabled={loading}
            className="px-3 py-1.5 bg-blue-700 hover:bg-blue-600 text-white text-xs font-medium rounded flex items-center gap-1.5 disabled:opacity-50">
            <Search className="w-3 h-3" /> {loading ? 'Loading…' : searchZip ? 'Load All' : 'Load'}
          </button>

          {/* Storm date quick-jump */}
          {stormDates.length > 0 && (
            <select
              value={selectedDate ?? ''}
              onChange={e => {
                if (!e.target.value) return;
                setStormOpen(true);
                loadHailReports(e.target.value, true);
              }}
              className="bg-gray-800 border border-yellow-600/60 text-white text-xs rounded px-2 py-1.5 cursor-pointer"
              title="Pick a storm date — flies to highest-impact area and loads parcels"
            >
              <option value="">⚡ Storm date…</option>
              {stormDates.map(sd => (
                <option key={sd.date} value={sd.date}>
                  {fmtDate(sd.date)} — {sd.max_hail_in.toFixed(2)}" max
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="text-xs text-gray-400">
            {filteredParcels.length < parcels.length
              ? <><span className="text-yellow-300 font-bold">{filteredParcels.length.toLocaleString()}</span><span className="text-gray-500"> of {parcels.length.toLocaleString()}</span></>
              : <span className="text-white font-bold">{parcels.length.toLocaleString()}</span>
            } parcels
            {enrichedCount > 0 && <span className="text-purple-400 ml-2">{enrichedCount} enriched</span>}
            {selected.size > 0 && <span className="text-blue-400 ml-2 font-bold">{selected.size} selected</span>}
          </div>

          {parcels.length > 0 && (
            <div className="flex items-center gap-2">
              <button onClick={selectAll} className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"><CheckSquare className="w-3 h-3" /> All</button>
              <button onClick={clearAll}  className="text-xs text-gray-400 hover:text-gray-300 flex items-center gap-1"><Square className="w-3 h-3" /> None</button>
            </div>
          )}

          {parcels.length > 0 && (
            <button onClick={()=>{setBoxMode(m=>!m);setBoxStart(null);setBoxCurrent(null);}}
              className={`px-3 py-1.5 text-xs font-medium rounded flex items-center gap-1.5 transition-colors ${boxMode?'bg-blue-600 text-white ring-2 ring-blue-400':'bg-gray-700 hover:bg-gray-600 text-white'}`}>
              <Crosshair className="w-3 h-3" /> Box Select
            </button>
          )}

          {parcels.length > 0 && (
            <button onClick={exportCsv}
              className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-xs font-medium rounded flex items-center gap-1.5">
              <Download className="w-3 h-3" />
              {selected.size > 0 ? `Export ${selected.size}` : 'Export All'}
            </button>
          )}

          <button onClick={()=>fileInputRef.current?.click()} disabled={importing}
            className="px-3 py-1.5 bg-purple-700 hover:bg-purple-600 text-white text-xs font-medium rounded flex items-center gap-1.5 disabled:opacity-50"
            title="Upload BatchData enriched CSV">
            <Upload className="w-3 h-3" /> {importing ? 'Importing…' : 'Import CSV'}
          </button>
          <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleImportFile} />

          {/* Filter toggle */}
          <button onClick={()=>setFilterOpen(o=>!o)}
            className={`px-3 py-1.5 text-xs font-medium rounded flex items-center gap-1.5 transition-colors relative ${filterOpen?'bg-indigo-600 text-white':'bg-gray-700 hover:bg-gray-600 text-white'}`}>
            <Layers className="w-3 h-3" /> Filters
            {activeFilterCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-yellow-400 text-gray-900 text-[10px] font-bold flex items-center justify-center">{activeFilterCount}</span>
            )}
          </button>

          {/* Color mode toggle */}
          <div className="flex rounded overflow-hidden border border-gray-700 text-xs">
            {(['status','value','age','roof','hail'] as const).map(mode => (
              <button key={mode} onClick={()=>setColorMode(mode)}
                className={`px-2.5 py-1.5 font-medium transition-colors ${colorMode===mode?(mode==='hail'?'bg-yellow-600 text-white':'bg-gray-700 text-white'):'bg-gray-900 text-gray-400 hover:text-white'}`}>
                {mode === 'status' ? 'Status' : mode === 'value' ? '$ Value' : mode === 'age' ? 'Roof Age' : mode === 'roof' ? 'Roof Size' : '⚡ Hail'}
              </button>
            ))}
          </div>

          {/* MRMS Swath toggle — only shown when a date has swath data */}
          {swathGeoJson && (
            <button onClick={()=>setShowSwath(o=>!o)}
              className={`px-3 py-1.5 text-xs font-medium rounded flex items-center gap-1.5 transition-colors ${showSwath?'bg-purple-700 text-white ring-1 ring-purple-400':'bg-gray-700 hover:bg-gray-600 text-white'}`}
              title={`MRMS radar-derived hail swath (${swathMethod})`}>
              <Cloud className="w-3 h-3" /> Hail Swath
            </button>
          )}

          {/* Storm areas toggle */}
          <button onClick={()=>setStormOpen(o=>!o)}
            className={`px-3 py-1.5 text-xs font-medium rounded flex items-center gap-1.5 transition-colors ${stormOpen?'bg-yellow-600 text-white':'bg-gray-700 hover:bg-gray-600 text-white'}`}>
            <Cloud className="w-3 h-3" /> Storm Areas
          </button>

          <div className="flex rounded overflow-hidden border border-gray-700 text-xs">
            <button onClick={()=>setBasemap('satellite')} className={`px-3 py-1.5 font-medium transition-colors ${basemap==='satellite'?'bg-gray-700 text-white':'bg-gray-900 text-gray-400 hover:text-white'}`}>Satellite</button>
            <button onClick={()=>setBasemap('dark')}      className={`px-3 py-1.5 font-medium transition-colors ${basemap==='dark'?'bg-gray-700 text-white':'bg-gray-900 text-gray-400 hover:text-white'}`}>Dark</button>
          </div>
        </div>
      </div>

      {/* ── Header row 2 — campaign name + skip trace ─────────────────────── */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 px-5 py-2 bg-gray-800/80 border-b border-gray-700 shrink-0">
          <span className="text-xs text-gray-400 shrink-0">Campaign name:</span>
          <input className="flex-1 bg-gray-700 border border-gray-600 text-white text-xs rounded px-2 py-1.5 max-w-xs"
            placeholder={suggestCampaignName()} value={campaignName} onChange={e => setCampaignName(e.target.value)} />
          <button onClick={runSkipTrace} disabled={tracing}
            className="px-4 py-1.5 bg-green-700 hover:bg-green-600 text-white text-xs font-bold rounded flex items-center gap-1.5 disabled:opacity-50 shrink-0">
            <Phone className="w-3 h-3" />
            {tracing ? 'Enriching…' : `Skip Trace ${selected.size} homes`}
          </button>
          <span className="text-xs text-gray-500">~${(selected.size * 0.12).toFixed(2)} est.</span>
        </div>
      )}

      {/* ── Banners ────────────────────────────────────────────────────────── */}
      {truncated && (
        <div className="px-5 py-2 bg-yellow-900/50 border-b border-yellow-700 text-yellow-300 text-xs">
          ⚠ Showing {truncated.shown.toLocaleString()} of {truncated.total.toLocaleString()} parcels — use Lat/Lon + Radius for a specific neighborhood.
        </div>
      )}
      {boxMode && (
        <div className="px-5 py-2 bg-blue-900/50 border-b border-blue-700 text-blue-200 text-xs flex items-center gap-2">
          <Crosshair className="w-3 h-3" /> Box Select active — drag to select all pins inside the rectangle.
        </div>
      )}
      {traceResult && (
        <div className="px-5 py-2 bg-green-900/50 border-b border-green-700 text-green-300 text-xs flex items-center justify-between gap-4">
          <span>{traceResult.msg}</span>
          <div className="flex items-center gap-3 shrink-0">
            {traceResult.neighborhood && (
              <a href={`/admin/prospects?source=parcels_map&neighborhood=${encodeURIComponent(traceResult.neighborhood)}`}
                className="flex items-center gap-1 text-green-200 hover:text-white font-semibold underline underline-offset-2">
                View Campaign <ExternalLink className="w-3 h-3" />
              </a>
            )}
            <button onClick={()=>setTraceResult(null)}><X className="w-3 h-3 text-green-500 hover:text-white" /></button>
          </div>
        </div>
      )}
      {importResult && (
        <div className="px-5 py-2 bg-purple-900/50 border-b border-purple-700 text-purple-200 text-xs flex items-center justify-between">
          <span>{importResult}</span>
          <button onClick={()=>setImportResult(null)}><X className="w-3 h-3" /></button>
        </div>
      )}

      {/* ── Swath hail-size filter + Load Pins bar ───────────────────────── */}
      {swathGeoJson && (
        <div className="flex items-center gap-2 px-5 py-2 bg-gray-800/80 border-b border-purple-800/50 shrink-0 flex-wrap">
          <Cloud className="w-3.5 h-3.5 text-purple-400 shrink-0" />
          <span className="text-xs text-gray-400 shrink-0 font-medium">Min hail:</span>
          {([
            [0,    'All tiers'],
            [0.5,  '0.5"+'],
            [1.0,  '1"+'],
            [1.5,  '1.5"+'],
            [2.0,  '2"+'],
            [3.0,  '3"+'],
          ] as [number, string][]).map(([val, label]) => (
            <button key={label}
              onClick={() => setSwathMinSize(val)}
              className={`text-xs px-2.5 py-1 rounded font-medium transition-colors ${swathMinSize === val ? 'bg-purple-700 text-white ring-1 ring-purple-400' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'}`}>
              {label}
            </button>
          ))}
          <div className="flex-1" />
          {parcels.length > 0 && (
            <button
              onClick={() => setFilterInSwathOnly(v => !v)}
              className={`text-xs px-2.5 py-1 rounded font-medium transition-colors border ${filterInSwathOnly ? 'bg-purple-700 text-white border-purple-500 ring-1 ring-purple-400' : 'bg-gray-700 hover:bg-gray-600 text-gray-300 border-gray-600'}`}
              title="Hide pins that fall outside the swath polygon">
              Swath only
            </button>
          )}
          <button onClick={loadSwathPins} disabled={!visibleSwathTiers.length || loading}
            className="px-4 py-1.5 bg-orange-700 hover:bg-orange-600 disabled:opacity-40 text-white text-xs font-bold rounded flex items-center gap-1.5 transition-colors"
            title="Fly to and load all parcels inside the visible swath area">
            <MapPin className="w-3 h-3" />
            {loading ? 'Loading…' : `Load Pins in ${swathMinSize > 0 ? `${swathMinSize}"+ ` : ''}Swath`}
          </button>
        </div>
      )}

      {/* ── Main area: map + sidebar ──────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Map */}
        <div className="flex-1 relative">
          {/* Empty state overlay — only before any data is loaded */}
          {parcels.length === 0 && !loading && hailReports.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-gray-500 z-10 pointer-events-none">
              <div className="text-center">
                <Home className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Enter a ZIP code or lat/lon to load properties</p>
                <p className="text-xs mt-1 text-gray-600">or click <span className="text-yellow-400">Storm Areas</span> → Fly Here to jump to a storm zone</p>
              </div>
            </div>
          )}
            <Map
              ref={mapRef}
              initialViewState={{ latitude: 32.695, longitude: -97.459, zoom: 14 }}
              style={{ width: '100%', height: '100%' }}
              mapStyle={mapStyle}
              interactiveLayerIds={boxMode ? [] : ['parcels-points', 'hail-circles']}
              onClick={e => {
                if (boxMode) return;
                const feat = e.features?.[0];
                if (!feat) { setPopup(null); setHailPopup(null); return; }
                if (feat.layer?.id === 'hail-circles') {
                  setPopup(null);
                  const p = feat.properties as any;
                  setHailPopup({ lat: p.lat, lon: p.lon, size_in: p.size_in, location: p.location, county: p.county, time: p.time });
                  return;
                }
                const found = filteredParcels.find(p => p.id === feat.properties?.id);
                if (found) { setHailPopup(null); setPopup(found); }
              }}
              cursor={boxMode ? 'crosshair' : 'pointer'}
              dragPan={!boxMode}
            >
              <NavigationControl position="top-right" />
              <ScaleControl position="bottom-right" />

              {/* MRMS Swath polygons — rendered BELOW everything else, toggleable */}
              {visibleSwathGeoJson && showSwath && (
                <Source id="hail-swath" type="geojson" data={visibleSwathGeoJson}>
                  <Layer
                    id="hail-swath-fill"
                    type="fill"
                    paint={{
                      'fill-color': ['get', 'color'],
                      'fill-opacity': 0.38,
                    }}
                  />
                  <Layer
                    id="hail-swath-outline"
                    type="line"
                    paint={{
                      'line-color': ['get', 'color'],
                      'line-width': 2.5,
                      'line-opacity': 0.85,
                    }}
                  />
                </Source>
              )}

              {/* Hail overlay — rendered BELOW parcel pins so pins stay readable */}
              {hailReports.length > 0 && (
                <Source id="hail-overlay" type="geojson" data={hailGeoJson}>
                  <Layer
                    id="hail-circles"
                    type="circle"
                    paint={{
                      'circle-radius': ['interpolate', ['linear'], ['zoom'],
                        10, ['interpolate', ['linear'], ['get', 'size_in'], 1, 8,  2, 14, 3, 20, 5, 30],
                        13, ['interpolate', ['linear'], ['get', 'size_in'], 1, 20, 2, 35, 3, 55, 5, 80],
                        16, ['interpolate', ['linear'], ['get', 'size_in'], 1, 40, 2, 70, 3, 100, 5, 150],
                      ],
                      'circle-color': [
                        'step', ['get', 'size_in'],
                        '#4ADE80',   // green  — < 1.5" quarter
                        1.5, '#FACC15', // yellow — ping pong
                        2.0, '#F87171', // rose   — egg
                        2.5, '#EF4444', // red    — tennis ball
                        3.0, '#EC4899', // magenta — baseball+
                      ],
                      'circle-opacity': 0.18,
                      'circle-stroke-color': [
                        'step', ['get', 'size_in'],
                        '#4ADE80',
                        1.5, '#FACC15',
                        2.0, '#F87171',
                        2.5, '#EF4444',
                        3.0, '#EC4899',
                      ],
                      'circle-stroke-width': 1.5,
                      'circle-stroke-opacity': 0.65,
                    }}
                  />
                </Source>
              )}

              {/* Parcel pins — rendered ON TOP of hail overlay */}
              {parcels.length > 0 && (
                <Source id="parcels" type="geojson" data={geoJson}>
                  <Layer
                    id="parcels-points"
                    type="circle"
                    paint={{
                      'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 5, 16, 10, 19, 16],
                      'circle-color': ['get', 'pin_color'],
                      'circle-opacity': 0.88,
                      'circle-stroke-width': ['get', 'stroke_w'],
                      'circle-stroke-color': ['case', ['==', ['get', 'selected'], 1], '#fff', 'rgba(0,0,0,0.3)'],
                    }}
                  />
                </Source>
              )}

              {hailPopup && !boxMode && (
                <Popup longitude={hailPopup.lon} latitude={hailPopup.lat} anchor="bottom" onClose={() => setHailPopup(null)} closeButton maxWidth="260px">
                  <div className="p-3 min-w-[220px]">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: hailColor(hailPopup.size_in) }} />
                      <span className="text-sm font-bold text-gray-900 truncate">{hailPopup.location || hailPopup.county}</span>
                    </div>
                    <div className="text-xs text-gray-500 mb-1 pl-5">{hailPopup.county} County{hailPopup.time ? ` · ${hailPopup.time}` : ''}</div>
                    <div className="text-xs text-gray-700 mb-3 pl-5">
                      <span className="font-bold">{hailPopup.size_in.toFixed(2)}"</span> — {hailSizeLabel(hailPopup.size_in)}
                    </div>
                    {hailPopupZip ? (
                      <div className="flex items-center gap-2 mb-2.5 bg-gray-100 rounded px-2 py-1.5">
                        <span className="text-xs text-gray-500">ZIP:</span>
                        <span className="text-sm font-bold text-gray-900">{hailPopupZip}</span>
                        <button
                          onClick={() => { setSearchZip(hailPopupZip); setSearchLat(''); setSearchLon(''); setHailPopup(null); loadAtZip(hailPopupZip); }}
                          className="ml-auto text-[11px] font-bold bg-indigo-600 hover:bg-indigo-700 text-white px-2 py-0.5 rounded transition-colors"
                          title="Load all pins in this ZIP code">
                          Load ZIP
                        </button>
                      </div>
                    ) : (
                      <div className="text-[11px] text-gray-400 mb-2">Fetching ZIP…</div>
                    )}
                    <div className="text-[11px] text-gray-500 mb-1.5 font-semibold uppercase tracking-wide">Load pins within:</div>
                    <div className="flex gap-1.5">
                      {[0.5, 1, 2, 5].map(r => (
                        <button
                          key={r}
                          onClick={() => {
                            const lat = hailPopup.lat, lon = hailPopup.lon;
                            setHailPopup(null);
                            setSearchLat(lat.toFixed(5));
                            setSearchLon(lon.toFixed(5));
                            setRadius(r.toString());
                            setSearchZip('');
                            mapRef.current?.getMap().flyTo({ center: [lon, lat], zoom: r <= 0.5 ? 15 : r <= 1 ? 14 : r <= 2 ? 13 : 11, duration: 600 });
                            loadAtLocation(lat, lon, r);
                          }}
                          className="flex-1 text-center text-xs font-bold rounded py-1.5 bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                        >
                          {r}mi
                        </button>
                      ))}
                    </div>
                  </div>
                </Popup>
              )}

              {popup && !boxMode && (
                <Popup longitude={popup.lon} latitude={popup.lat} anchor="bottom" onClose={()=>setPopup(null)} closeButton maxWidth="280px">
                  <div className="p-3 min-w-[240px]">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-bold text-gray-900 truncate pr-2">{popup.owner_name || 'Unknown Owner'}</span>
                      <div className="flex gap-1 shrink-0">
                        {popup.enriched && <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-medium">Enriched</span>}
                        {popup.is_owner_occupied && <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-medium">Owner-Occ</span>}
                      </div>
                    </div>
                    <div className="text-xs text-gray-600 mb-1 flex items-start gap-1">
                      <MapPin className="w-3 h-3 shrink-0 mt-0.5" />
                      <span>{popup.prop_address}, {popup.prop_city} {popup.prop_zip||''}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs text-gray-500 mt-2">
                      {popup.year_built  && <span>Built {popup.year_built}</span>}
                      {popup.living_sqft && <span>{popup.living_sqft.toLocaleString()} sqft</span>}
                      {popup.total_value && <span>Value ${Math.round(popup.total_value).toLocaleString()}</span>}
                      {popup.dist_miles != null && <span>{popup.dist_miles} mi away</span>}
                      {popup.stories     && <span>{popup.stories === 1 ? '1 story' : popup.stories === 1.5 ? '1.5 stories' : popup.stories === 2 ? '2 stories' : `${popup.stories} stories`}</span>}
                      {estRoofSqft(popup) && <span className="text-orange-300 font-medium">~{estRoofSqft(popup)!.toLocaleString()} sqft roof</span>}
                    </div>
                    <div className="flex gap-2 mt-3">
                      <button onClick={()=>toggleSelect(popup.id)}
                        className={`flex-1 text-center text-xs font-semibold rounded px-2 py-1.5 transition-colors ${selected.has(popup.id)?'bg-blue-600 text-white hover:bg-blue-700':'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                        {selected.has(popup.id) ? '✓ Selected' : '+ Select'}
                      </button>
                      <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(popup.prop_address+', '+popup.prop_city+' TX')}`}
                        target="_blank" rel="noopener noreferrer"
                        className="flex-1 text-center text-xs font-semibold text-blue-700 bg-blue-50 rounded px-2 py-1.5 hover:bg-blue-100">
                        Street View
                      </a>
                    </div>
                  </div>
                </Popup>
              )}
            </Map>

          {/* Box-select overlay */}
          <div ref={overlayRef}
            className={`absolute inset-0 z-10 ${boxMode?'cursor-crosshair':'pointer-events-none'}`}
            onMouseDown={boxMode?handleBoxMouseDown:undefined}
            onMouseMove={boxMode?handleBoxMouseMove:undefined}
            onMouseUp={boxMode?handleBoxMouseUp:undefined}
            onMouseLeave={boxMode?handleBoxMouseLeave:undefined}
          >
            {boxRect && (
              <div style={{position:'absolute',left:boxRect.left,top:boxRect.top,width:boxRect.width,height:boxRect.height,border:'2px solid #3b82f6',backgroundColor:'rgba(59,130,246,0.12)',pointerEvents:'none'}} />
            )}
          </div>

          {/* ── Legend (bottom-left, dual section) ─────────────────────────── */}
          {parcels.length > 0 && (
            <div className="absolute bottom-10 left-3 bg-gray-900/90 border border-gray-700 rounded-lg p-3 text-xs space-y-1.5 pointer-events-none z-20">
              <div className="text-gray-400 font-bold uppercase tracking-widest text-[10px] mb-1">
                Parcels · {colorMode === 'status' ? 'Status' : colorMode === 'value' ? '$ Value' : colorMode === 'age' ? 'Roof Age' : colorMode === 'roof' ? 'Roof Size' : '⚡ Hail Tier'}
              </div>
              {colorMode === 'status' && [
                { color: '#3b82f6', label: 'Selected' },
                { color: '#a855f7', label: 'Enriched (phone acquired)' },
                { color: '#f97316', label: 'Owner-occupied' },
                { color: '#94a3b8', label: 'Not yet enriched' },
              ].map(({ color, label }) => (
                <div key={label} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
                  <span className="text-gray-300">{label}</span>
                </div>
              ))}
              {colorMode === 'value' && [
                { color: '#ef4444', label: '$500k+' },
                { color: '#f97316', label: '$350–500k' },
                { color: '#facc15', label: '$200–350k' },
                { color: '#4ade80', label: 'Under $200k' },
                { color: '#64748b', label: 'No data' },
              ].map(({ color, label }) => (
                <div key={label} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
                  <span className="text-gray-300">{label}</span>
                </div>
              ))}
              {colorMode === 'age' && [
                { color: '#ef4444', label: '30+ yrs (prime target)' },
                { color: '#f97316', label: '20–30 yrs' },
                { color: '#facc15', label: '10–20 yrs' },
                { color: '#4ade80', label: 'Under 10 yrs' },
                { color: '#64748b', label: 'No data' },
              ].map(({ color, label }) => (
                <div key={label} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
                  <span className="text-gray-300">{label}</span>
                </div>
              ))}
              {colorMode === 'roof' && [
                { color: '#ef4444', label: '5,000+ sqft (50+ squares)' },
                { color: '#f97316', label: '3,500–5,000 sqft' },
                { color: '#facc15', label: '2,000–3,500 sqft' },
                { color: '#4ade80', label: 'Under 2,000 sqft' },
                { color: '#64748b', label: 'No data (OSM record)' },
              ].map(({ color, label }) => (
                <div key={label} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
                  <span className="text-gray-300">{label}</span>
                </div>
              ))}
              {colorMode === 'hail' && [
                { color: '#7c3aed', label: '3"+ Catastrophic' },
                { color: '#dc2626', label: '2"+ Major' },
                { color: '#ea580c', label: '1.5"+ Significant' },
                { color: '#d97706', label: '1"+ Damaging' },
                { color: '#16a34a', label: '0.5"+ Any hail' },
                { color: '#64748b', label: 'Outside swath' },
              ].map(({ color, label }) => (
                <div key={label} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
                  <span className="text-gray-300">{label}</span>
                </div>
              ))}

              {hailReports.length > 0 && (
                <>
                  <div className="border-t border-gray-700 my-2" />
                  <div className="text-gray-400 font-bold uppercase tracking-widest text-[10px] mb-1">Hail Reports · {fmtDate(selectedDate!)}</div>
                  {[
                    { color: '#EC4899', label: '3.0"+ Baseball' },
                    { color: '#EF4444', label: '2.5" Tennis Ball' },
                    { color: '#F87171', label: '2.0" Egg' },
                    { color: '#FACC15', label: '1.5" Ping Pong' },
                    { color: '#4ADE80', label: '< 1.5" Quarter' },
                  ].map(({ color, label }) => (
                    <div key={label} className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full shrink-0 opacity-80 ring-1 ring-white/20" style={{ backgroundColor: color }} />
                      <span className="text-gray-300">{label}</span>
                    </div>
                  ))}
                </>
              )}
              {swathGeoJson && showSwath && (
                <>
                  <div className="border-t border-gray-700 my-2" />
                  <div className="text-gray-400 font-bold uppercase tracking-widest text-[10px] mb-1">
                    MRMS Swath {swathMethod === 'mrms' ? '· Radar' : '· SWDI est.'}
                  </div>
                  {[
                    { color: '#7c3aed', label: '3"+ Catastrophic' },
                    { color: '#dc2626', label: '2"+ Major' },
                    { color: '#ea580c', label: '1.5"+ Significant' },
                    { color: '#d97706', label: '1"+ Damaging' },
                    { color: '#16a34a', label: '0.5"+ Any hail' },
                  ].map(({ color, label }) => (
                    <div key={label} className="flex items-center gap-2">
                      <div className="w-4 h-2.5 rounded-sm shrink-0 opacity-70" style={{ backgroundColor: color }} />
                      <span className="text-gray-300">{label}</span>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        {/* ── Filter Sidebar ────────────────────────────────────────────────── */}
        {filterOpen && (
          <div className="w-64 shrink-0 bg-gray-900 border-r border-gray-700 flex flex-col overflow-hidden order-first">
            <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-400" />
                <span className="text-white text-sm font-semibold">Filters</span>
              </div>
              <div className="flex items-center gap-2">
                {activeFilterCount > 0 && (
                  <button onClick={()=>{setFilterYearMin(1900);setFilterYearMax(2025);setFilterValueMin(0);setFilterSqftMin(0);setFilterRoofMin(0);setFilterStoriesMax(0);setFilterInSwathOnly(false);}}
                    className="text-[11px] text-yellow-400 hover:text-yellow-300 font-medium">Reset all</button>
                )}
                <button onClick={()=>setFilterOpen(false)} className="text-gray-500 hover:text-white"><X className="w-4 h-4" /></button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">

              {/* Match count */}
              <div className="text-center py-2 bg-gray-800 rounded-lg">
                <div className="text-xl font-bold text-white">{filteredParcels.length.toLocaleString()}</div>
                <div className="text-xs text-gray-400">of {parcels.length.toLocaleString()} parcels visible</div>
              </div>

              {/* Year Built */}
              <div>
                <div className="text-xs font-semibold text-gray-300 uppercase tracking-wide mb-2">Year Built</div>
                <div className="flex items-center gap-2">
                  <input type="number" value={filterYearMin} onChange={e=>setFilterYearMin(parseInt(e.target.value)||1900)}
                    className="w-20 bg-gray-800 border border-gray-600 text-white text-xs rounded px-2 py-1.5" placeholder="From" />
                  <span className="text-gray-500 text-xs">–</span>
                  <input type="number" value={filterYearMax} onChange={e=>setFilterYearMax(parseInt(e.target.value)||2025)}
                    className="w-20 bg-gray-800 border border-gray-600 text-white text-xs rounded px-2 py-1.5" placeholder="To" />
                </div>
                <div className="flex gap-1.5 mt-2 flex-wrap">
                  {[['Pre-1980', 1900, 1979], ['1980–99', 1980, 1999], ['2000–09', 2000, 2009], ['2010+', 2010, 2025]].map(([label, min, max]) => (
                    <button key={label as string}
                      onClick={()=>{setFilterYearMin(min as number);setFilterYearMax(max as number);}}
                      className={`text-[10px] px-2 py-1 rounded transition-colors ${filterYearMin===(min as number)&&filterYearMax===(max as number)?'bg-indigo-600 text-white':'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'}`}>
                      {label as string}
                    </button>
                  ))}
                </div>
              </div>

              {/* Home Value */}
              <div>
                <div className="text-xs font-semibold text-gray-300 uppercase tracking-wide mb-2">Min Home Value</div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-500 text-xs">$</span>
                  <input type="number" value={filterValueMin||''} onChange={e=>setFilterValueMin(parseInt(e.target.value)||0)}
                    className="flex-1 bg-gray-800 border border-gray-600 text-white text-xs rounded px-2 py-1.5" placeholder="0" />
                </div>
                <div className="flex gap-1.5 mt-2 flex-wrap">
                  {[['Any', 0], ['$150k', 150000], ['$250k', 250000], ['$350k', 350000], ['$500k', 500000]].map(([label, val]) => (
                    <button key={label as string}
                      onClick={()=>setFilterValueMin(val as number)}
                      className={`text-[10px] px-2 py-1 rounded transition-colors ${filterValueMin===(val as number)?'bg-indigo-600 text-white':'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'}`}>
                      {label as string}
                    </button>
                  ))}
                </div>
              </div>

              {/* Min Sqft */}
              <div>
                <div className="text-xs font-semibold text-gray-300 uppercase tracking-wide mb-2">Min Square Footage</div>
                <div className="flex items-center gap-2">
                  <input type="number" value={filterSqftMin||''} onChange={e=>setFilterSqftMin(parseInt(e.target.value)||0)}
                    className="flex-1 bg-gray-800 border border-gray-600 text-white text-xs rounded px-2 py-1.5" placeholder="0" />
                  <span className="text-gray-500 text-xs">sqft</span>
                </div>
                <div className="flex gap-1.5 mt-2 flex-wrap">
                  {[['Any', 0], ['1,000', 1000], ['1,500', 1500], ['2,000', 2000], ['2,500', 2500]].map(([label, val]) => (
                    <button key={label as string}
                      onClick={()=>setFilterSqftMin(val as number)}
                      className={`text-[10px] px-2 py-1 rounded transition-colors ${filterSqftMin===(val as number)?'bg-indigo-600 text-white':'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'}`}>
                      {label as string}
                    </button>
                  ))}
                </div>
              </div>

              {/* Min Est. Roof Sqft */}
              <div>
                <div className="text-xs font-semibold text-orange-300 uppercase tracking-wide mb-1">Min Est. Roof Sqft</div>
                <div className="text-[10px] text-gray-500 mb-2">Dallas only · living area ÷ stories × 1.4 pitch factor</div>
                <div className="flex items-center gap-2">
                  <input type="number" value={filterRoofMin||''} onChange={e=>setFilterRoofMin(parseInt(e.target.value)||0)}
                    className="flex-1 bg-gray-800 border border-gray-600 text-white text-xs rounded px-2 py-1.5" placeholder="0" />
                  <span className="text-gray-500 text-xs">sqft</span>
                </div>
                <div className="flex gap-1.5 mt-2 flex-wrap">
                  {[['Any', 0], ['2,000', 2000], ['3,000', 3000], ['4,000', 4000], ['5,000', 5000]].map(([label, val]) => (
                    <button key={label as string}
                      onClick={()=>setFilterRoofMin(val as number)}
                      className={`text-[10px] px-2 py-1 rounded transition-colors ${filterRoofMin===(val as number)?'bg-orange-700 text-white':'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'}`}>
                      {label as string}
                    </button>
                  ))}
                </div>
              </div>

              {/* Stories */}
              <div>
                <div className="text-xs font-semibold text-gray-300 uppercase tracking-wide mb-2">Stories</div>
                <div className="text-[10px] text-gray-500 mb-2">Dallas only · OSM records have no story data</div>
                <div className="flex gap-1.5 flex-wrap">
                  {[['Any', 0], ['1 Story', 1], ['2 Stories', 2]].map(([label, val]) => (
                    <button key={label as string}
                      onClick={()=>setFilterStoriesMax(val as number)}
                      className={`text-[10px] px-2.5 py-1.5 rounded transition-colors ${filterStoriesMax===(val as number)?'bg-indigo-600 text-white':'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'}`}>
                      {label as string}
                    </button>
                  ))}
                </div>
              </div>

            </div>

            <div className="px-4 py-2 border-t border-gray-700 text-[10px] text-gray-600">
              Filters apply instantly · no reload needed
            </div>
          </div>
        )}

        {/* ── Storm Areas Sidebar ───────────────────────────────────────────── */}
        {stormOpen && (
          <div className="w-72 shrink-0 bg-gray-900 border-l border-gray-700 flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Cloud className="w-4 h-4 text-yellow-400" />
                <span className="text-white text-sm font-semibold">Storm Areas</span>
                {hailReports.length > 0 && (
                  <span className="text-xs bg-yellow-600/30 text-yellow-300 px-1.5 py-0.5 rounded">{hailReports.length} reports</span>
                )}
              </div>
              <button onClick={()=>setStormOpen(false)} className="text-gray-500 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {stormDates.length === 0 ? (
                <div className="px-4 py-8 text-center text-gray-500 text-xs">Loading storm history…</div>
              ) : (
                <div className="divide-y divide-gray-800">
                  {stormDates.map(sd => {
                    const isSelected = selectedDate === sd.date;
                    return (
                      <div key={sd.date}>
                        {/* Date row */}
                        <button
                          onClick={() => loadHailReports(sd.date)}
                          className={`w-full px-4 py-3 flex items-center justify-between hover:bg-gray-800 transition-colors text-left ${isSelected ? 'bg-gray-800' : ''}`}
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              {isSelected ? <ChevronDown className="w-3.5 h-3.5 text-yellow-400" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-500" />}
                              <span className="text-white text-sm font-medium">{fmtDate(sd.date)}</span>
                            </div>
                            <div className="text-xs text-gray-500 ml-5 mt-0.5">{sd.dfw_hail} DFW hail reports</div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-xs font-bold" style={{ color: hailColor(sd.max_hail_in) }}>
                              {sd.max_hail_in.toFixed(2)}"
                            </div>
                            <div className="text-[10px] text-gray-500">{hailSizeLabel(sd.max_hail_in)}</div>
                          </div>
                        </button>

                        {/* Clusters (expanded) */}
                        {isSelected && (
                          <div className="bg-gray-800/50 pb-1">
                            {hailLoading ? (
                              <div className="px-5 py-4 text-xs text-gray-500">Loading SPC reports…</div>
                            ) : hailClusters.length === 0 ? (
                              <div className="px-5 py-4 text-xs text-gray-500">No DFW reports found for this date.</div>
                            ) : (
                              hailClusters.map(cluster => (
                                <div key={cluster.county} className="px-4 py-2.5 flex items-center justify-between gap-2 border-t border-gray-700/50">
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5">
                                      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: hailColor(cluster.max_size) }} />
                                      <span className="text-white text-xs font-medium truncate">{cluster.county} Co.</span>
                                    </div>
                                    <div className="text-[11px] text-gray-500 ml-3.5 mt-0.5">
                                      {cluster.max_size.toFixed(2)}" max · {cluster.reports.length} reports
                                    </div>
                                  </div>
                                  <button
                                    onClick={() => flyToCluster(cluster)}
                                    className="shrink-0 flex items-center gap-1 px-2 py-1 bg-blue-700 hover:bg-blue-600 text-white text-[11px] font-medium rounded transition-colors"
                                    title={`Fly to ${cluster.county} County`}
                                  >
                                    <Navigation className="w-3 h-3" /> Fly Here
                                  </button>
                                </div>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Sidebar footer */}
            <div className="px-4 py-2 border-t border-gray-700 text-[10px] text-gray-600">
              Click a date to load SPC hail reports · Fly Here loads parcels
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ParcelsMapPage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center bg-gray-950 text-gray-400">Loading…</div>}>
      <ParcelsMapInner />
    </Suspense>
  );
}
