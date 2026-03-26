'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Map, { Source, Layer, Popup, NavigationControl, ScaleControl } from 'react-map-gl/maplibre';
import * as turf from '@turf/turf';
import type { Feature, FeatureCollection, Polygon, MultiPolygon, Point } from 'geojson';
import {
  CloudLightning, AlertTriangle, Wind, RefreshCw,
  Copy, Check, MapPin, Layers, Eye, EyeOff, Users, Calendar,
  CloudRain, Sun, Thermometer, Bell, TrendingUp,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import 'maplibre-gl/dist/maplibre-gl.css';

type ReportType = 'hail' | 'wind' | 'torn';
type ActiveTab = 'map' | 'list' | 'forecast';

interface NwsAlert {
  id: string; event: string; severity: string; urgency: string;
  headline: string; description: string; instruction: string;
  effective: string; expires: string; areaDesc: string;
}
interface SpcOutlook {
  day: number; label: string; text: string; color: string; bg: string;
}
interface DailyForecast {
  date: string; shortForecast: string; icon: string;
  maxTemp: number; minTemp: number; maxPrecip: number;
  maxWind: number; windDir: string; tempUnit: string;
}
interface ForecastData {
  alerts: NwsAlert[];
  outlooks: SpcOutlook[];
  forecast: DailyForecast[];
}

interface StormEvent {
  type: ReportType;
  time: string;
  location: string;
  county: string;
  state: string;
  lat: number;
  lon: number;
  inDfw?: boolean;
  size?: number;
  sizeIn?: string;
  speed?: number;
  ef?: string;
  efN?: number;
}

interface SwdiPoint {
  lon: number; lat: number; maxSize: number; prob: number; sevprob: number; time: string;
}

interface CountySummary {
  county: string; state: string; count: number;
  maxSize?: number; maxSpeed?: number; events: StormEvent[];
}

interface StormData {
  date: string; dateFull: string; type: ReportType;
  total: number; dfwTotal: number;
  events: StormEvent[]; byCounty: CountySummary[]; swdiPoints: SwdiPoint[];
}

// SPC color scheme — matches the actual SPC reports page
const HAIL_COLOR  = '#00c800'; // SPC green for hail
const WIND_COLOR  = '#0066ff'; // SPC blue for wind
const TORN_COLOR  = '#cc0000'; // SPC red for tornado

// Hail severity thresholds — red-dominant palette for high visibility
const HAIL_THRESHOLDS = [
  { min: 3.0, label: '3"+ Catastrophic', color: '#ff00ff', fill: 'rgba(255,0,255,0.45)' },
  { min: 2.0, label: '2"+ Major',        color: '#ff0000', fill: 'rgba(255,0,0,0.45)'   },
  { min: 1.5, label: '1.5"+ Significant',color: '#ff6600', fill: 'rgba(255,102,0,0.40)' },
  { min: 1.0, label: '1"+ Damaging',     color: '#ffcc00', fill: 'rgba(255,204,0,0.35)' },
  { min: 0.5, label: '0.5"+ Any Hail',   color: '#00ff00', fill: 'rgba(0,255,0,0.25)'   },
];

const DFW_COUNTIES = ['Dallas','Collin','Denton','Tarrant','Rockwall','Kaufman','Johnson','Ellis','Parker','Wise'];
const DFW_CENTER: [number, number] = [-97.0, 32.8];
const DFW_ZOOM = 6.5;

const BASEMAP_STYLES: Record<string, any> = {
  dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  streets: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
  satellite: {
    version: 8,
    name: 'Satellite',
    sources: {
      'esri-sat': { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, attribution: '© ESRI World Imagery' },
      'esri-labels': { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'], tileSize: 256 },
    },
    layers: [
      { id: 'sat-bg', type: 'raster', source: 'esri-sat' },
      { id: 'sat-labels', type: 'raster', source: 'esri-labels', paint: { 'raster-opacity': 0.85 } },
    ],
  },
};

function fmtDate(d: string) {
  if (!d || d.length !== 6) return d;
  return new Date(`20${d.slice(0,2)}-${d.slice(2,4)}-${d.slice(4,6)}`)
    .toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function hailColorBySize(sizeHundredths: number) {
  const i = sizeHundredths / 100;
  if (i >= 3.0) return '#ff00ff';
  if (i >= 2.0) return '#ff0000';
  if (i >= 1.5) return '#ff6600';
  if (i >= 1.0) return '#ffcc00';
  return '#00ff00';
}

function hailLabel(s: number) {
  const i = s / 100;
  if (i >= 3.0) return 'CATASTROPHIC';
  if (i >= 2.0) return 'MAJOR';
  if (i >= 1.5) return 'SIGNIFICANT';
  if (i >= 1.0) return 'DAMAGING';
  return 'MODERATE';
}

// Render each SWDI radar cell as a proper ~1km grid square colored by actual max hail size.
// Far more accurate than hull approximations — matches actual radar footprint.
function buildHailGrid(swdiPoints: SwdiPoint[]): FeatureCollection {
  const CELL = 0.009; // ~1km half-size in degrees at 32°N
  const features: Feature[] = swdiPoints
    .filter(p => p.maxSize >= 0.5 && p.prob >= 10)
    .map(p => {
      const sz = p.maxSize;
      let color = '#00ff00';
      let fill = 'rgba(0,255,0,0.35)';
      if (sz >= 3.0) { color = '#ff00ff'; fill = 'rgba(255,0,255,0.55)'; }
      else if (sz >= 2.0) { color = '#ff0000'; fill = 'rgba(255,0,0,0.50)'; }
      else if (sz >= 1.5) { color = '#ff6600'; fill = 'rgba(255,102,0,0.48)'; }
      else if (sz >= 1.0) { color = '#ffcc00'; fill = 'rgba(255,204,0,0.45)'; }
      else if (sz >= 0.75) { color = '#aaff00'; fill = 'rgba(170,255,0,0.38)'; }
      return {
        type: 'Feature' as const,
        geometry: {
          type: 'Polygon' as const,
          coordinates: [[
            [p.lon - CELL, p.lat - CELL],
            [p.lon + CELL, p.lat - CELL],
            [p.lon + CELL, p.lat + CELL],
            [p.lon - CELL, p.lat + CELL],
            [p.lon - CELL, p.lat - CELL],
          ]],
        },
        properties: { maxSize: sz, prob: p.prob, color, fill, lon: p.lon, lat: p.lat },
      };
    });
  return turf.featureCollection(features);
}

function buildEventGeoJSON(events: StormEvent[], type: ReportType): FeatureCollection<Point> {
  return turf.featureCollection(
    events.map(e => turf.point([e.lon, e.lat], {
      county: e.county, state: e.state, location: e.location,
      time: e.time, size: e.size, sizeIn: e.sizeIn, speed: e.speed, ef: e.ef,
      inDfw: e.inDfw,
      // Color: hail graded by size, wind/torn flat SPC colors
      color: type === 'hail' ? hailColorBySize(e.size || 0)
           : type === 'wind' ? WIND_COLOR : TORN_COLOR,
      // Radius: hail sized by magnitude (matches SPC visual), wind/torn flat
      radius: type === 'hail' ? Math.max(5, Math.min(18, (e.size || 0) / 12))
            : type === 'wind' ? Math.max(5, Math.min(14, (e.speed || 0) / 8)) : 7,
    }))
  ) as FeatureCollection<Point>;
}

export default function StormDashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<StormData | null>(null);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState<ReportType>('hail');
  const [copied, setCopied] = useState<string | null>(null);
  const [popupInfo, setPopupInfo] = useState<{ lon: number; lat: number; props: any } | null>(null);
  const [showRadar, setShowRadar] = useState(true);
  const [showPolygons, setShowPolygons] = useState(true);
  const [showPoints, setShowPoints] = useState(true);
  const [activeTab, setActiveTab] = useState<ActiveTab>('map');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState('');
  const mapRef = useRef<any>(null);
  const [forecastData, setForecastData] = useState<ForecastData | null>(null);
  const [forecastLoading, setForecastLoading] = useState(false);
  const [basemap, setBasemap] = useState<'dark' | 'satellite' | 'streets'>('dark');
  const [showMesh, setShowMesh] = useState(false);
  const [showSwdiGrid, setShowSwdiGrid] = useState(true);
  const forecastFetchedRef = useRef(false);

  const loadForecast = useCallback(async () => {
    if (forecastFetchedRef.current) return;
    forecastFetchedRef.current = true;
    setForecastLoading(true);
    try {
      const res = await fetch('/api/admin/storm/forecast', { credentials: 'include' });
      if (!res.ok) { if (res.status === 401) { window.location.href = '/admin/login'; return; } throw new Error('HTTP ' + res.status); }
      const d = await res.json();
      setForecastData(d);
    } finally {
      setForecastLoading(false);
    }
  }, []);

  const refreshForecast = useCallback(async () => {
    forecastFetchedRef.current = false;
    setForecastData(null);
    loadForecast();
  }, [loadForecast]);

  useEffect(() => {
    if (activeTab === 'forecast') loadForecast();
  }, [activeTab, loadForecast]);

  const load = useCallback(async (t: ReportType, date?: string) => {
    setLoading(true);
    setPopupInfo(null);
    try {
      const dateParam = date ? `&date=${date.replace(/-/g, '')}` : '';
      const res = await fetch(`/api/admin/storm?type=${t}${dateParam}`, { credentials: "include" });
      if (!res.ok) { if (res.status === 401) { window.location.href = "/admin/login"; return; } throw new Error("HTTP " + res.status); }
      const d = await res.json();
      setData(d);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(type, selectedDate || undefined); }, [type]);

  const handleDateSearch = () => { load(type, selectedDate || undefined); };

  const copyTemplate = (county: string, maxSize?: number) => {
    const maxHail = maxSize ? (maxSize / 100).toFixed(2) : '?';
    const text = `Hi, this is [Your Name] with Roof Works of Texas. We're reaching out because ${county} County had ${maxHail}" hail recently. We're doing free roof inspections in your area — no obligation. Call 214-795-3905 or reply to schedule. We're local and insured. — Roof Works of Texas`;
    navigator.clipboard.writeText(text);
    setCopied(county);
    setTimeout(() => setCopied(null), 2000);
  };

  const hailGrid = data?.swdiPoints?.length ? buildHailGrid(data.swdiPoints) : null;
  const eventPoints  = data?.events?.length ? buildEventGeoJSON(data.events, type) : null;

  const dfwHits   = data?.byCounty.filter(c => DFW_COUNTIES.includes(c.county)) ?? [];
  const otherHits = data?.byCounty.filter(c => !DFW_COUNTIES.includes(c.county)) ?? [];

  const radarTileUrl = `https://mesonet.agron.iastate.edu/cgi-bin/wms/nexrad/n0r.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.1.1&LAYERS=nexrad-n0r&STYLES=&FORMAT=image/png&BGCOLOR=0x000000&TRANSPARENT=TRUE&SRS=EPSG:4326&BBOX={bbox-epsg-4326}&WIDTH=256&HEIGHT=256`;

  const tabs = [
    { id: 'hail' as ReportType, label: 'Hail',     icon: <AlertTriangle className="w-3.5 h-3.5" />, dot: HAIL_COLOR },
    { id: 'wind' as ReportType, label: 'Wind',     icon: <Wind className="w-3.5 h-3.5" />,          dot: WIND_COLOR },
    { id: 'torn' as ReportType, label: 'Tornado',  icon: <CloudLightning className="w-3.5 h-3.5" />,dot: TORN_COLOR },
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-gray-950">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-900 border-b border-gray-800 flex-shrink-0">
        <div className="flex items-center gap-3">
          <CloudLightning className="w-5 h-5 text-yellow-400" />
          <div>
            <h1 className="text-sm font-bold text-white">Storm Dashboard</h1>
            <p className="text-xs text-gray-400">
              NOAA SPC · {data?.date ? fmtDate(data.date) : 'Loading…'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setType(t.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
                type === t.id ? 'bg-yellow-600 text-white' : 'bg-gray-800 border border-gray-700 text-gray-400 hover:text-white'
              }`}>
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: t.dot }} />
              {t.icon} {t.label}
            </button>
          ))}

          <div className="w-px h-5 bg-gray-700 mx-1" />

          <div className="flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5 text-gray-400" />
            <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
              className="bg-gray-800 border border-gray-700 text-gray-300 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-yellow-500" />
            <button onClick={handleDateSearch} disabled={loading}
              className="px-2 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded transition-colors disabled:opacity-50">
              Go
            </button>
          </div>

          <div className="w-px h-5 bg-gray-700 mx-1" />

          <button onClick={() => router.push(`/admin/storm/canvass?date=${selectedDate || ''}`)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-700 hover:bg-yellow-600 text-white text-xs font-semibold rounded transition-colors">
            <Users className="w-3.5 h-3.5" /> Canvass
          </button>

          {(['map', 'list', 'forecast'] as ActiveTab[]).map(t => (
            <button key={t} onClick={() => setActiveTab(t)}
              className={`px-3 py-1.5 text-xs rounded transition-colors capitalize ${
                activeTab === t
                  ? 'bg-gray-600 text-white'
                  : 'bg-gray-800 border border-gray-700 text-gray-400 hover:text-white'
              }`}>
              {t === 'forecast' ? '⛅ Forecast' : t === 'map' ? 'Map' : 'List'}
            </button>
          ))}

          <button onClick={() => load(type, selectedDate || undefined)} disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 border border-gray-700 text-gray-400 hover:text-white text-xs rounded transition-colors disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      {/* Summary strip */}
      {data && (
        <div className="flex gap-5 px-4 py-2 bg-gray-900 border-b border-gray-800 flex-shrink-0 overflow-x-auto">
          <div className="flex items-center gap-2 text-xs whitespace-nowrap">
            <span className="text-gray-400">US total:</span>
            <span className="font-bold text-white">{data.total}</span>
          </div>
          <div className="flex items-center gap-2 text-xs whitespace-nowrap">
            <span className="text-gray-400">Counties hit:</span>
            <span className="font-bold text-yellow-400">{data.byCounty.length}</span>
          </div>
          <div className="flex items-center gap-2 text-xs whitespace-nowrap">
            <span className="text-gray-400">DFW area:</span>
            <span className={`font-bold ${(data.dfwTotal ?? 0) > 0 ? 'text-red-400' : 'text-gray-500'}`}>
              {data.dfwTotal ?? 0} events
            </span>
          </div>
          {type === 'hail' && data.events.length > 0 && (
            <div className="flex items-center gap-2 text-xs whitespace-nowrap">
              <span className="text-gray-400">Largest hail:</span>
              <span className="font-bold text-orange-400">
                {(Math.max(...data.events.map((e: any) => e.size || 0)) / 100).toFixed(2)}"
              </span>
            </div>
          )}
          {type === 'wind' && data.events.length > 0 && (
            <div className="flex items-center gap-2 text-xs whitespace-nowrap">
              <span className="text-gray-400">Strongest wind:</span>
              <span className="font-bold text-blue-400">
                {Math.max(...data.events.map((e: any) => e.speed || 0))} mph
              </span>
            </div>
          )}
          {data.swdiPoints?.length > 0 && (
            <div className="flex items-center gap-2 text-xs whitespace-nowrap">
              <span className="text-gray-400">Radar detections (DFW):</span>
              <span className="font-bold text-blue-400">{data.swdiPoints.length}</span>
            </div>
          )}
          <a href={`https://www.spc.noaa.gov/climo/reports/${data.date}_rpts.html`}
            target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-yellow-500 hover:text-yellow-400 whitespace-nowrap ml-auto">
            SPC Source ↗
          </a>
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {activeTab === 'map' ? (
          <>
            {/* Map */}
            <div className="flex-1 relative">
              {loading && (
                <div className="absolute inset-0 z-10 bg-gray-950/70 flex items-center justify-center">
                  <div className="flex items-center gap-2 text-gray-300 text-sm">
                    <RefreshCw className="w-4 h-4 animate-spin" /> Loading storm data…
                  </div>
                </div>
              )}

              <Map
                ref={mapRef}
                initialViewState={{ longitude: DFW_CENTER[0], latitude: DFW_CENTER[1], zoom: DFW_ZOOM }}
                style={{ width: '100%', height: '100%' }}
                mapStyle={BASEMAP_STYLES[basemap]}
                interactiveLayerIds={['spc-events-circle', 'swdi-grid-fill']}
                onClick={e => {
                  if (e.features && e.features.length > 0)
                    setPopupInfo({ lon: e.lngLat.lng, lat: e.lngLat.lat, props: e.features[0].properties });
                }}
                cursor="pointer"
              >
                <NavigationControl position="top-right" />
                <ScaleControl position="bottom-right" />

                {/* IEM NEXRAD radar */}
                {showRadar && (
                  <Source type="raster" tiles={[radarTileUrl]} tileSize={256}>
                    <Layer id="radar-layer" type="raster" paint={{ 'raster-opacity': basemap === 'satellite' ? 0.35 : 0.5 }} />
                  </Source>
                )}

                {/* MRMS MESH — radar-derived max hail size (Iowa State, current) */}
                {showMesh && (
                  <Source type="raster" tiles={[`https://mesonet.agron.iastate.edu/cgi-bin/wms/nexrad/mrms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.1.1&LAYERS=mrms_mesh&STYLES=&FORMAT=image/png&BGCOLOR=0x000000&TRANSPARENT=TRUE&SRS=EPSG:4326&BBOX={bbox-epsg-4326}&WIDTH=256&HEIGHT=256`]} tileSize={256}>
                    <Layer id="mesh-layer" type="raster" paint={{ 'raster-opacity': 0.7 }} />
                  </Source>
                )}

                {/* SWDI radar hail grid — each cell = ~1km actual radar footprint, colored by max hail size */}
                {showSwdiGrid && hailGrid && hailGrid.features.length > 0 && (
                  <Source id="swdi-grid" type="geojson" data={hailGrid}>
                    <Layer
                      id="swdi-grid-fill"
                      type="fill"
                      paint={{
                        'fill-color': ['coalesce', ['get', 'fill'], 'rgba(0,255,0,0.3)'],
                        'fill-opacity': ['interpolate', ['linear'], ['get', 'prob'], 10, 0.35, 50, 0.6, 90, 0.85],
                      }}
                    />
                    <Layer
                      id="swdi-grid-outline"
                      type="line"
                      paint={{
                        'line-color': ['coalesce', ['get', 'color'], '#00ff00'],
                        'line-width': 0.5,
                        'line-opacity': 0.5,
                      }}
                    />
                  </Source>
                )}

                {/* SPC report points — all US */}
                {showPoints && eventPoints && eventPoints.features.length > 0 && (
                  <Source id="spc-events" type="geojson" data={eventPoints}>
                    <Layer
                      id="spc-events-circle"
                      type="circle"
                      paint={{
                        'circle-radius': ['coalesce', ['get', 'radius'], 6],
                        'circle-color': ['coalesce', ['get', 'color'], '#00c800'],
                        'circle-opacity': 0.85,
                        'circle-stroke-width': [
                          'case',
                          ['==', ['get', 'inDfw'], true], 3,
                          1
                        ],
                        'circle-stroke-color': [
                          'case',
                          ['==', ['get', 'inDfw'], true], '#ffffff',
                          'rgba(0,0,0,0.5)'
                        ],
                      }}
                    />
                  </Source>
                )}

                {/* Popup */}
                {popupInfo && (
                  <Popup longitude={popupInfo.lon} latitude={popupInfo.lat} anchor="bottom" onClose={() => setPopupInfo(null)} closeButton>
                    <div className="text-xs text-gray-900 p-1 min-w-[160px]">
                      {/* SPC observer report */}
                      {popupInfo.props.sizeIn && <div className="font-bold text-sm">🟡 {popupInfo.props.sizeIn}" Hail (Observer)</div>}
                      {popupInfo.props.speed != null && popupInfo.props.speed > 0 && <div className="font-bold text-sm">💨 {popupInfo.props.speed} mph Wind</div>}
                      {popupInfo.props.ef && <div className="font-bold text-sm">🌪 {popupInfo.props.ef} Tornado</div>}
                      {popupInfo.props.location && <div className="text-gray-600 mt-0.5">{popupInfo.props.location}</div>}
                      {popupInfo.props.county && <div className="text-gray-500">{popupInfo.props.county} Co., {popupInfo.props.state}</div>}
                      {popupInfo.props.time && <div className="text-gray-500 mt-0.5">{popupInfo.props.time} UTC</div>}
                      {popupInfo.props.inDfw && <div className="text-red-600 font-semibold mt-1">⚠ DFW Area</div>}
                      {/* SWDI radar grid cell */}
                      {popupInfo.props.maxSize != null && !popupInfo.props.sizeIn && (
                        <>
                          <div className="font-bold text-sm">📡 Radar: {popupInfo.props.maxSize.toFixed(2)}" max hail</div>
                          <div className="text-gray-500 mt-0.5">Detection probability: {popupInfo.props.prob}%</div>
                          <div className="text-gray-500">~1km radar grid cell</div>
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${popupInfo.lat},${popupInfo.lon}`}
                            target="_blank" rel="noopener noreferrer"
                            className="block mt-2 text-center text-xs font-semibold text-blue-700 bg-blue-50 rounded px-2 py-1 hover:bg-blue-100"
                          >
                            Open in Google Maps →
                          </a>
                        </>
                      )}
                    </div>
                  </Popup>
                )}
              </Map>

              {/* Layer controls */}
              <div className="absolute top-3 left-3 flex flex-col gap-2">
                <div className="bg-gray-900/90 border border-gray-700 rounded-lg p-2 backdrop-blur-sm">
                  <div className="text-xs font-semibold text-gray-400 mb-2 flex items-center gap-1">
                    <Layers className="w-3 h-3" /> Layers
                  </div>
                  {/* Basemap selector */}
                  <div className="flex gap-1 mb-2">
                    {(['dark', 'satellite', 'streets'] as const).map(b => (
                      <button key={b} onClick={() => setBasemap(b)}
                        className={`flex-1 text-center text-xs py-0.5 rounded transition-colors border ${basemap === b ? 'bg-blue-700 border-blue-500 text-white font-bold' : 'bg-gray-800 border-gray-600 text-gray-400'}`}>
                        {b === 'dark' ? '🌑' : b === 'satellite' ? '🛰' : '🗺'}
                      </button>
                    ))}
                  </div>
                  {[
                    { key: 'radar', label: 'NEXRAD Radar', state: showRadar,    set: setShowRadar },
                    { key: 'mesh',  label: 'MRMS MESH',    state: showMesh,     set: setShowMesh },
                    { key: 'grid',  label: 'SWDI Grid',    state: showSwdiGrid, set: setShowSwdiGrid },
                    { key: 'pts',   label: 'SPC Reports',  state: showPoints,   set: setShowPoints },
                  ].map(l => (
                    <button key={l.key} onClick={() => l.set(!l.state)}
                      className={`flex items-center gap-1.5 w-full text-left text-xs py-0.5 transition-colors ${l.state ? 'text-white' : 'text-gray-500'}`}>
                      {l.state ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                      {l.label}
                    </button>
                  ))}
                </div>

                {/* Legend */}
                <div className="bg-gray-900/90 border border-gray-700 rounded-lg p-2 backdrop-blur-sm">
                  <div className="text-xs font-semibold text-gray-400 mb-1.5">Legend</div>
                  {type === 'hail' && [
                    { color: '#ff00ff', label: '3"+ Catastrophic' },
                    { color: '#ff0000', label: '2"+ Major' },
                    { color: '#ff6600', label: '1.5"+ Significant' },
                    { color: '#ffcc00', label: '1"+ Damaging' },
                    { color: '#00ff00', label: '0.5"+ Any Hail' },
                  ].map(l => (
                    <div key={l.color} className="flex items-center gap-1.5 text-xs text-gray-300 py-0.5">
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: l.color }} />
                      {l.label}
                    </div>
                  ))}
                  {type === 'wind' && (
                    <div className="flex items-center gap-1.5 text-xs text-gray-300 py-0.5">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: WIND_COLOR }} />
                      Wind Report
                    </div>
                  )}
                  {type === 'torn' && (
                    <div className="flex items-center gap-1.5 text-xs text-gray-300 py-0.5">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: TORN_COLOR }} />
                      Tornado Report
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 text-xs text-gray-400 pt-1 mt-0.5 border-t border-gray-700">
                    <div className="w-3 h-3 rounded-full border-2 border-white bg-transparent flex-shrink-0" />
                    DFW area event
                  </div>
                </div>
              </div>

              {!loading && data && data.total === 0 && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="bg-gray-900/90 border border-gray-700 rounded-xl p-8 text-center backdrop-blur-sm">
                    <CloudLightning className="w-10 h-10 text-gray-600 mx-auto mb-3" />
                    <p className="text-gray-300 font-semibold">No {type} reports for this date</p>
                    <p className="text-gray-500 text-xs mt-1">Check a different date or storm type.</p>
                  </div>
                </div>
              )}
            </div>

            {/* Right panel */}
            <div className="w-72 bg-gray-900 border-l border-gray-800 overflow-y-auto flex-shrink-0">
              <div className="p-3 border-b border-gray-800">
                <div className="text-xs font-bold text-gray-400 uppercase tracking-wider">Affected Counties</div>
              </div>

              {loading ? (
                <div className="p-4 space-y-2">
                  {[...Array(4)].map((_, i) => <div key={i} className="h-12 bg-gray-800 rounded animate-pulse" />)}
                </div>
              ) : (
                <>
                  {dfwHits.length > 0 && (
                    <div>
                      <div className="px-3 py-2 text-xs font-bold text-red-400 uppercase tracking-wider bg-red-950/20 border-b border-gray-800">
                        ⚠ DFW — Outreach Priority
                      </div>
                      {dfwHits.map(c => {
                        const key = `${c.county}-${c.state}`;
                        return (
                          <div key={key} className="border-b border-gray-800">
                            <div className="flex items-center justify-between px-3 py-2.5 hover:bg-gray-800 transition-colors">
                              <div>
                                <div className="text-sm font-semibold text-white flex items-center gap-1.5">
                                  <MapPin className="w-3 h-3 text-red-400" />
                                  {c.county}
                                </div>
                                {type === 'hail' && c.maxSize !== undefined && (
                                  <div className="text-xs mt-0.5" style={{ color: hailColorBySize(c.maxSize) }}>
                                    {(c.maxSize / 100).toFixed(2)}" · {hailLabel(c.maxSize)}
                                  </div>
                                )}
                                {type === 'wind' && c.maxSpeed !== undefined && (
                                  <div className="text-xs text-blue-400 mt-0.5">{c.maxSpeed} mph max</div>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs text-gray-400">{c.count}</span>
                                <button onClick={() => copyTemplate(c.county, c.maxSize)}
                                  className="p-1 bg-gray-700 hover:bg-gray-600 rounded transition-colors" title="Copy SMS">
                                  {copied === c.county ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3 text-gray-400" />}
                                </button>
                                <button onClick={() => setExpanded(expanded === key ? null : key)}
                                  className="text-xs text-gray-500 hover:text-gray-300 px-1">
                                  {expanded === key ? '▲' : '▼'}
                                </button>
                              </div>
                            </div>
                            {expanded === key && (
                              <div className="bg-gray-950 border-t border-gray-800 px-3 py-2 max-h-48 overflow-y-auto">
                                {c.events.map((e, i) => (
                                  <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-gray-800 last:border-0">
                                    <span className="text-gray-400">{e.time}</span>
                                    <span className="text-gray-300 max-w-[100px] truncate">{e.location}</span>
                                    {type === 'hail' && <span className="font-bold" style={{ color: hailColorBySize(e.size || 0) }}>{e.sizeIn}"</span>}
                                    {type === 'wind' && <span className="text-blue-400">{e.speed} mph</span>}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {dfwHits.length === 0 && !loading && data && data.total > 0 && (
                    <div className="px-3 py-4 text-center">
                      <div className="text-green-500 text-sm font-semibold">DFW Clear ✓</div>
                      <div className="text-xs text-gray-500 mt-1">No reports in DFW area today</div>
                    </div>
                  )}

                  {otherHits.length > 0 && (
                    <div>
                      <div className="px-3 py-2 text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-800 border-t border-gray-800 mt-1">
                        All Other Counties ({otherHits.length})
                      </div>
                      {otherHits.map(c => (
                        <div key={`${c.county}-${c.state}`}
                          className="flex items-center justify-between px-3 py-2 border-b border-gray-800/50 hover:bg-gray-800/50 transition-colors">
                          <span className="text-xs text-gray-300">{c.county}, {c.state}</span>
                          <div className="flex items-center gap-2 text-xs">
                            {type === 'hail' && c.maxSize !== undefined && (
                              <span style={{ color: hailColorBySize(c.maxSize) }}>{(c.maxSize / 100).toFixed(2)}"</span>
                            )}
                            {type === 'wind' && c.maxSpeed !== undefined && (
                              <span className="text-blue-400">{c.maxSpeed} mph</span>
                            )}
                            <span className="text-gray-600">{c.count}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {!loading && data && data.total === 0 && (
                    <div className="p-6 text-center text-gray-500 text-xs">No events for this date.</div>
                  )}
                </>
              )}
            </div>
          </>
        ) : (
          /* List view */
          <div className="flex-1 overflow-y-auto p-4">
            {loading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => <div key={i} className="h-24 bg-gray-800 rounded-xl animate-pulse" />)}
              </div>
            ) : !data || data.total === 0 ? (
              <div className="text-center py-16 text-gray-500">No {type} reports for this date.</div>
            ) : (
              <div className="max-w-4xl mx-auto space-y-4">
                {dfwHits.length > 0 && (
                  <>
                    <h2 className="text-xs font-bold text-red-400 uppercase tracking-widest flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5" /> DFW Counties — Outreach Priority
                    </h2>
                    {dfwHits.map(c => {
                      const key = `${c.county}-${c.state}`;
                      const isOpen = expanded === key;
                      return (
                        <div key={key} className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
                          <div className="flex items-center justify-between p-4">
                            <div>
                              <div className="font-bold text-white flex items-center gap-2">
                                <MapPin className="w-4 h-4 text-red-400" />
                                {c.county} County, {c.state}
                              </div>
                              {type === 'hail' && c.maxSize !== undefined && (
                                <div className="text-sm mt-0.5" style={{ color: hailColorBySize(c.maxSize) }}>
                                  {(c.maxSize / 100).toFixed(2)}" max · {hailLabel(c.maxSize)} · {c.count} reports
                                </div>
                              )}
                              {type === 'wind' && (
                                <div className="text-sm text-blue-400 mt-0.5">{c.maxSpeed} mph max · {c.count} reports</div>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <button onClick={() => copyTemplate(c.county, c.maxSize)}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-xs font-semibold rounded transition-colors text-white">
                                {copied === c.county ? <><Check className="w-3 h-3 text-green-400" /> Copied!</> : <><Copy className="w-3 h-3" /> Copy SMS</>}
                              </button>
                              <button onClick={() => setExpanded(isOpen ? null : key)}
                                className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-xs rounded transition-colors text-gray-300">
                                {isOpen ? 'Hide' : `Show ${c.count}`}
                              </button>
                            </div>
                          </div>
                          {isOpen && (
                            <div className="border-t border-gray-700 divide-y divide-gray-700/50">
                              {c.events.map((e, i) => (
                                <div key={i} className="flex items-center justify-between px-4 py-2 text-xs">
                                  <span className="text-gray-400">{e.time}</span>
                                  <span className="text-gray-300">{e.location}</span>
                                  {type === 'hail' && <span className="font-bold" style={{ color: hailColorBySize(e.size || 0) }}>{e.sizeIn}"</span>}
                                  {type === 'wind' && <span className="text-blue-400">{e.speed} mph</span>}
                                  {type === 'torn' && <span className="text-purple-400">{e.ef}</span>}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </>
                )}

                {otherHits.length > 0 && (
                  <>
                    <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-4">
                      All US Reports ({data.total} events · {otherHits.length} counties)
                    </h2>
                    <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-700">
                            <th className="px-4 py-2 text-left text-xs text-gray-400">County, State</th>
                            <th className="px-4 py-2 text-center text-xs text-gray-400">Reports</th>
                            <th className="px-4 py-2 text-right text-xs text-gray-400">Max</th>
                          </tr>
                        </thead>
                        <tbody>
                          {otherHits.map(c => (
                            <tr key={`${c.county}-${c.state}`} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                              <td className="px-4 py-2 text-gray-300 text-xs">{c.county}, {c.state}</td>
                              <td className="px-4 py-2 text-center text-gray-400 text-xs">{c.count}</td>
                              <td className="px-4 py-2 text-right text-xs">
                                {type === 'hail' && c.maxSize !== undefined && (
                                  <span style={{ color: hailColorBySize(c.maxSize) }}>{(c.maxSize / 100).toFixed(2)}"</span>
                                )}
                                {type === 'wind' && c.maxSpeed !== undefined && (
                                  <span className="text-blue-400">{c.maxSpeed} mph</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Forecast Tab ── */}
        {activeTab === 'forecast' && (
          <div className="flex-1 overflow-y-auto p-4 bg-gray-950">
            <div className="max-w-3xl mx-auto space-y-5">

              {/* Header row */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-white flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-yellow-400" />
                    DFW Weather Forecast
                  </h2>
                  <p className="text-xs text-gray-500 mt-0.5">Dallas-Fort Worth area · NOAA NWS + SPC</p>
                </div>
                <button onClick={refreshForecast} disabled={forecastLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 border border-gray-700 text-gray-400 hover:text-white text-xs rounded transition-colors disabled:opacity-50">
                  <RefreshCw className={`w-3.5 h-3.5 ${forecastLoading ? 'animate-spin' : ''}`} /> Refresh
                </button>
              </div>

              {forecastLoading && (
                <div className="space-y-3">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="h-20 bg-gray-800 rounded-xl animate-pulse" />
                  ))}
                </div>
              )}

              {!forecastLoading && forecastData && (
                <>
                  {/* Active Alerts */}
                  {forecastData.alerts.length > 0 ? (
                    <div className="space-y-2">
                      <h3 className="text-xs font-bold text-red-400 uppercase tracking-wider flex items-center gap-1.5">
                        <Bell className="w-3.5 h-3.5" /> Active NWS Alerts ({forecastData.alerts.length})
                      </h3>
                      {forecastData.alerts.map(alert => {
                        const sevColor =
                          alert.severity === 'Extreme' ? 'border-red-500 bg-red-950/30' :
                          alert.severity === 'Severe'  ? 'border-orange-500 bg-orange-950/20' :
                          alert.severity === 'Moderate'? 'border-yellow-500 bg-yellow-950/20' :
                                                         'border-blue-500 bg-blue-950/20';
                        const badge =
                          alert.severity === 'Extreme' ? 'bg-red-600 text-white' :
                          alert.severity === 'Severe'  ? 'bg-orange-600 text-white' :
                          alert.severity === 'Moderate'? 'bg-yellow-600 text-black' :
                                                         'bg-blue-700 text-white';
                        return (
                          <div key={alert.id} className={`border rounded-xl p-4 ${sevColor}`}>
                            <div className="flex items-start justify-between gap-3 mb-1">
                              <div className="font-semibold text-white text-sm">{alert.event}</div>
                              <span className={`text-xs font-bold px-2 py-0.5 rounded flex-shrink-0 ${badge}`}>
                                {alert.severity}
                              </span>
                            </div>
                            {alert.headline && (
                              <p className="text-xs text-gray-300 mb-1">{alert.headline}</p>
                            )}
                            {alert.areaDesc && (
                              <p className="text-xs text-gray-400 flex items-center gap-1">
                                <MapPin className="w-3 h-3" /> {alert.areaDesc}
                              </p>
                            )}
                            {alert.expires && (
                              <p className="text-xs text-gray-500 mt-1">
                                Expires: {new Date(alert.expires).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 px-4 py-3 bg-green-950/20 border border-green-800/40 rounded-xl">
                      <div className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                      <span className="text-sm text-green-400 font-semibold">No Active NWS Alerts for DFW</span>
                    </div>
                  )}

                  {/* SPC Day 1-3 Outlook */}
                  <div>
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                      <CloudLightning className="w-3.5 h-3.5" /> SPC Severe Weather Outlook — DFW
                    </h3>
                    <div className="grid grid-cols-3 gap-3">
                      {forecastData.outlooks.map(o => {
                        const dayLabel = o.day === 1 ? 'Today' : o.day === 2 ? 'Tomorrow' : `Day ${o.day}`;
                        const isRisk = o.label !== 'NONE' && o.label !== 'UNKNOWN';
                        return (
                          <div key={o.day} className="rounded-xl p-4 border border-gray-700/60 flex flex-col gap-2"
                            style={{ backgroundColor: o.bg }}>
                            <div className="text-xs text-gray-400 font-semibold">{dayLabel}</div>
                            <div className="text-sm font-bold" style={{ color: o.color }}>{o.text}</div>
                            {isRisk && o.label !== 'TSTM' && (
                              <div className="text-xs text-gray-300">Severe storms possible in DFW area</div>
                            )}
                            {o.label === 'TSTM' && (
                              <div className="text-xs text-gray-400">General thunderstorm activity</div>
                            )}
                            {o.label === 'NONE' && (
                              <div className="text-xs text-gray-400">Clear for scheduling</div>
                            )}
                            {o.label === 'UNKNOWN' && (
                              <div className="text-xs text-gray-500">Could not load SPC data</div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <p className="text-xs text-gray-600 mt-2">Source: NOAA Storm Prediction Center</p>
                  </div>

                  {/* 7-Day Forecast */}
                  {forecastData.forecast.length > 0 && (
                    <div>
                      <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                        <Sun className="w-3.5 h-3.5" /> 7-Day Forecast — Dallas, TX
                      </h3>
                      <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
                        {forecastData.forecast.map((day, i) => {
                          const d = new Date(day.date + 'T12:00:00');
                          const label = i === 0 ? 'Today' :
                            d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                          const hasPrecip = day.maxPrecip >= 20;
                          const hasSevere = day.maxPrecip >= 60 || day.maxWind >= 40;
                          return (
                            <div key={day.date}
                              className={`flex items-center gap-4 px-4 py-3 border-b border-gray-800 last:border-0 hover:bg-gray-800/40 transition-colors ${hasSevere ? 'bg-red-950/10' : ''}`}>
                              {/* Day label */}
                              <div className="w-24 flex-shrink-0">
                                <div className={`text-sm font-semibold ${i === 0 ? 'text-yellow-400' : 'text-white'}`}>
                                  {label}
                                </div>
                              </div>
                              {/* Weather description */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 text-xs text-gray-300">
                                  {hasPrecip ? <CloudRain className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" /> :
                                               <Sun className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" />}
                                  <span className="truncate">{day.shortForecast}</span>
                                </div>
                              </div>
                              {/* Temp */}
                              <div className="flex items-center gap-1 text-xs flex-shrink-0">
                                <Thermometer className="w-3 h-3 text-orange-400" />
                                <span className="text-white font-semibold">{day.maxTemp}°</span>
                                <span className="text-gray-500">/{day.minTemp}°{day.tempUnit}</span>
                              </div>
                              {/* Precip */}
                              <div className="w-12 text-right flex-shrink-0">
                                {day.maxPrecip > 0 ? (
                                  <span className={`text-xs font-semibold ${day.maxPrecip >= 60 ? 'text-red-400' : day.maxPrecip >= 30 ? 'text-yellow-400' : 'text-blue-400'}`}>
                                    {day.maxPrecip}%
                                  </span>
                                ) : (
                                  <span className="text-xs text-gray-600">—</span>
                                )}
                              </div>
                              {/* Wind */}
                              <div className="w-20 text-right flex-shrink-0">
                                {day.maxWind > 0 ? (
                                  <span className={`text-xs ${day.maxWind >= 40 ? 'text-red-400 font-semibold' : day.maxWind >= 25 ? 'text-yellow-400' : 'text-gray-400'}`}>
                                    <Wind className="w-3 h-3 inline mr-0.5" />{day.maxWind} mph
                                  </span>
                                ) : (
                                  <span className="text-xs text-gray-600">—</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {/* Legend */}
                      <div className="flex items-center gap-4 mt-2 text-xs text-gray-600">
                        <span className="flex items-center gap-1"><span className="text-blue-400">%</span> Precip chance</span>
                        <span className="flex items-center gap-1"><span className="text-yellow-400">↑</span> Max temp</span>
                        <span className="flex items-center gap-1"><span className="text-red-400">■</span> Severe conditions</span>
                      </div>
                      <p className="text-xs text-gray-600 mt-1">Source: NOAA National Weather Service · NWS Fort Worth</p>
                    </div>
                  )}

                  {forecastData.forecast.length === 0 && (
                    <div className="text-center py-8 text-gray-500 text-sm">
                      7-day forecast unavailable — NWS API may be temporarily down.
                    </div>
                  )}
                </>
              )}

              {!forecastLoading && !forecastData && (
                <div className="text-center py-16 text-gray-500">Failed to load forecast data.</div>
              )}
            </div>
          </div>
        )}
      </div>

      <p className="text-xs text-gray-700 text-center py-1.5 border-t border-gray-800 flex-shrink-0">
        Data: NOAA SPC observer reports · DFW swath: NOAA SWDI NEXRAD radar
      </p>
    </div>
  );
}
