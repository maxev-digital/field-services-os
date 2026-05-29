'use client';

import { Suspense, useState, useEffect, useCallback } from 'react';
import Map, { Source, Layer, Popup, NavigationControl, ScaleControl } from 'react-map-gl/maplibre';
import * as turf from '@turf/turf';
import { useSearchParams } from 'next/navigation';
import {
  MapPin, Users, TrendingUp, ArrowLeft, ExternalLink, Phone, Mail,
  RefreshCw, AlertTriangle, Target,
} from 'lucide-react';
import 'maplibre-gl/dist/maplibre-gl.css';

const DARK_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

interface ProspectPin {
  id: string;
  lat: number;
  lon: number;
  name: string;
  address: string;
  city: string;
  zip: string | null;
  phone: string | null;
  email: string | null;
  priority_score: number | null;
  status: string;
  damage_type: string | null;
  dist_miles?: number;
}

function scoreColor(score: number | null): string {
  if (!score) return '#6b7280';
  if (score >= 80) return '#ef4444';
  if (score >= 60) return '#f97316';
  if (score >= 40) return '#eab308';
  return '#22c55e';
}

function scoreBadgeCls(score: number | null): string {
  if (!score) return 'bg-gray-600';
  if (score >= 80) return 'bg-red-600';
  if (score >= 60) return 'bg-orange-500';
  if (score >= 40) return 'bg-yellow-500';
  return 'bg-green-600';
}

function tierLabel(hailIn: number): string {
  if (hailIn >= 3.0) return '3"+ Catastrophic';
  if (hailIn >= 2.0) return '2"+ Major';
  if (hailIn >= 1.5) return '1.5"+ Significant';
  if (hailIn >= 1.0) return '1"+ Damaging';
  return '0.75"+ Moderate';
}

function tierColor(hailIn: number): string {
  if (hailIn >= 3.0) return '#7c3aed';
  if (hailIn >= 2.0) return '#dc2626';
  if (hailIn >= 1.5) return '#ea580c';
  if (hailIn >= 1.0) return '#d97706';
  return '#ca8a04';
}

const SATELLITE_STYLE: any = {
  version: 8, name: 'Satellite',
  sources: {
    'esri-sat':    { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, attribution: '© ESRI' },
    'esri-labels': { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'], tileSize: 256 },
  },
  layers: [
    { id: 'sat-bg',     type: 'raster', source: 'esri-sat' },
    { id: 'sat-labels', type: 'raster', source: 'esri-labels', paint: { 'raster-opacity': 0.75 } },
  ],
};

function ZoneMapInner() {
  const params    = useSearchParams();
  const lat       = parseFloat(params.get('lat')          || '0');
  const lon       = parseFloat(params.get('lon')          || '0');
  const radiusMi  = parseFloat(params.get('radius_miles') || '1.5');
  const stormDate = params.get('storm_date') || '';
  const hailIn    = parseFloat(params.get('hail_in')      || '1');
  const label     = params.get('label') || tierLabel(hailIn);

  const [prospects, setProspects] = useState<ProspectPin[]>([]);
  const [loading, setLoading]     = useState(true);
  const [popup, setPopup]         = useState<ProspectPin | null>(null);
  const [total, setTotal]         = useState(0);
  const [basemap, setBasemap]     = useState<'dark' | 'satellite'>('dark');

  const mapStyle = basemap === 'satellite' ? SATELLITE_STYLE : DARK_STYLE;

  const load = useCallback(async () => {
    if (!lat || !lon) return;
    setLoading(true);
    try {
      const qp = new URLSearchParams({
        lat: String(lat), lon: String(lon),
        radius_miles: String(radiusMi),
        limit: '500', page: '1',
      });
      if (stormDate) qp.set('storm_date', stormDate);
      const res = await fetch(`/api/admin/prospects?${qp}`);
      const d   = await res.json();
      const pins: ProspectPin[] = (d.prospects || [])
        .filter((p: any) => p.lat && p.lon)
        .map((p: any) => ({
          id:             p.id,
          lat:            parseFloat(p.lat),
          lon:            parseFloat(p.lon),
          name:           p.name || 'Unknown',
          address:        p.address || '',
          city:           p.city   || '',
          zip:            p.zip,
          phone:          p.phone,
          email:          p.email,
          priority_score: p.priority_score,
          status:         p.status || 'NEW',
          damage_type:    p.damage_type,
          dist_miles:     p.dist_miles,
        }));
      setProspects(pins);
      setTotal(d.total || 0);
    } finally {
      setLoading(false);
    }
  }, [lat, lon, radiusMi, stormDate]);

  useEffect(() => { load(); }, [load]);

  const zoneCircle = (lat && lon)
    ? turf.circle([lon, lat], radiusMi, { steps: 64, units: 'miles' })
    : null;

  const prospectsGeoJson: any = {
    type: 'FeatureCollection',
    features: prospects.map(p => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
      properties: { id: p.id, score: p.priority_score || 0, color: scoreColor(p.priority_score) },
    })),
  };

  const score60  = prospects.filter(p => (p.priority_score || 0) >= 60).length;
  const hColor   = tierColor(hailIn);

  return (
    <div className="flex flex-col h-screen bg-gray-950">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 bg-gray-900 border-b border-gray-700 shrink-0">
        <div className="flex items-center gap-3">
          <a href="/admin/outreach/zones" className="text-gray-400 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </a>
          <div>
            <div className="flex items-center gap-2">
              <span
                className="text-xs font-bold px-2 py-0.5 rounded-full text-white"
                style={{ backgroundColor: hColor }}
              >
                {label}
              </span>
              {stormDate && <span className="text-xs text-gray-400">{stormDate}</span>}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">
              {lat.toFixed(5)}, {lon.toFixed(5)} · {radiusMi} mi radius
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1 text-sm">
            <Users className="w-4 h-4 text-blue-400" />
            <span className="text-white font-bold">{total.toLocaleString()}</span>
            <span className="text-gray-400 text-xs">total</span>
          </div>
          <div className="flex items-center gap-1 text-sm">
            <TrendingUp className="w-4 h-4 text-green-400" />
            <span className="text-white font-bold">{score60}</span>
            <span className="text-gray-400 text-xs">score 60+</span>
          </div>
          {loading && <RefreshCw className="w-4 h-4 text-blue-400 animate-spin" />}

          <div className="flex rounded overflow-hidden border border-gray-700 text-xs">
            <button
              onClick={() => setBasemap('dark')}
              className={`px-3 py-1.5 font-medium transition-colors ${basemap === 'dark' ? 'bg-gray-700 text-white' : 'bg-gray-900 text-gray-400 hover:text-white'}`}
            >
              Dark
            </button>
            <button
              onClick={() => setBasemap('satellite')}
              className={`px-3 py-1.5 font-medium transition-colors ${basemap === 'satellite' ? 'bg-gray-700 text-white' : 'bg-gray-900 text-gray-400 hover:text-white'}`}
            >
              Satellite
            </button>
          </div>

          <a
            href={`/admin/prospects?lat=${lat}&lon=${lon}&radius_miles=${radiusMi}&storm_date=${stormDate}&label=${encodeURIComponent(label)}`}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-700 hover:bg-blue-600 text-white text-xs font-medium rounded transition-colors"
          >
            <Users className="w-3 h-3" /> List View
          </a>
        </div>
      </div>

      {/* Map */}
      <div className="flex-1 relative">
        {!lat || !lon ? (
          <div className="absolute inset-0 flex items-center justify-center text-gray-500">
            <div className="text-center">
              <Target className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No zone selected. Open from Storm Scout Zones page.</p>
            </div>
          </div>
        ) : (
          <Map
            initialViewState={{ longitude: lon, latitude: lat, zoom: 13 }}
            style={{ width: '100%', height: '100%' }}
            mapStyle={mapStyle}
            interactiveLayerIds={['prospects-points']}
            onClick={e => {
              const feat = e.features?.[0];
              if (!feat) { setPopup(null); return; }
              const pid = feat.properties?.id;
              const found = prospects.find(p => p.id === pid);
              if (found) setPopup(found);
            }}
            cursor="pointer"
          >
            <NavigationControl position="top-right" />
            <ScaleControl position="bottom-right" />

            {/* Zone circle */}
            {zoneCircle && (
              <Source id="zone-circle" type="geojson" data={zoneCircle}>
                <Layer id="zone-fill"    type="fill" paint={{ 'fill-color': hColor, 'fill-opacity': 0.08 }} />
                <Layer id="zone-outline" type="line" paint={{ 'line-color': hColor, 'line-width': 2, 'line-opacity': 0.7, 'line-dasharray': [4, 2] }} />
              </Source>
            )}

            {/* Zone center */}
            {lat && lon && (
              <Source
                id="zone-center"
                type="geojson"
                data={{ type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties: {} }}
              >
                <Layer
                  id="zone-center-dot"
                  type="circle"
                  paint={{ 'circle-radius': 8, 'circle-color': hColor, 'circle-opacity': 0.9, 'circle-stroke-width': 2, 'circle-stroke-color': '#fff' }}
                />
              </Source>
            )}

            {/* Prospect pins */}
            {prospects.length > 0 && (
              <Source id="prospects" type="geojson" data={prospectsGeoJson}>
                <Layer
                  id="prospects-points"
                  type="circle"
                  paint={{
                    'circle-radius':       ['interpolate', ['linear'], ['zoom'], 11, 4, 14, 7, 17, 10],
                    'circle-color':        ['get', 'color'],
                    'circle-opacity':      0.85,
                    'circle-stroke-width': 1,
                    'circle-stroke-color': 'rgba(0,0,0,0.3)',
                  }}
                />
              </Source>
            )}

            {/* Popup */}
            {popup && (
              <Popup longitude={popup.lon} latitude={popup.lat} anchor="bottom" onClose={() => setPopup(null)} closeButton maxWidth="260px">
                <div className="p-2 min-w-[220px]">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-bold text-gray-900 truncate pr-2">{popup.name}</span>
                    {popup.priority_score != null && (
                      <span className={`text-xs font-bold text-white px-1.5 py-0.5 rounded shrink-0 ${scoreBadgeCls(popup.priority_score)}`}>
                        {popup.priority_score}
                      </span>
                    )}
                  </div>

                  <div className="text-xs text-gray-600 mb-1 flex items-start gap-1">
                    <MapPin className="w-3 h-3 shrink-0 mt-0.5" />
                    <span>{popup.address}, {popup.city} {popup.zip || ''}</span>
                  </div>

                  {popup.dist_miles != null && (
                    <div className="text-xs text-gray-400 mb-1">{popup.dist_miles} mi from zone center</div>
                  )}

                  {popup.damage_type && (
                    <div className="text-xs text-orange-600 mb-1 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />{popup.damage_type}
                    </div>
                  )}

                  <div className="flex flex-col gap-1 mt-2 border-t border-gray-100 pt-2">
                    {popup.phone && (
                      <a href={`tel:${popup.phone}`} className="flex items-center gap-1.5 text-xs text-blue-700 hover:text-blue-500">
                        <Phone className="w-3 h-3" /> {popup.phone}
                      </a>
                    )}
                    {popup.email && (
                      <a href={`mailto:${popup.email}`} className="flex items-center gap-1.5 text-xs text-blue-700 hover:text-blue-500 truncate">
                        <Mail className="w-3 h-3 shrink-0" /> {popup.email}
                      </a>
                    )}
                  </div>

                  <div className="flex gap-2 mt-3">
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${popup.lat},${popup.lon}`}
                      target="_blank" rel="noopener noreferrer"
                      className="flex-1 text-center text-xs font-semibold text-blue-700 bg-blue-50 rounded px-2 py-1.5 hover:bg-blue-100 flex items-center justify-center gap-1"
                    >
                      <ExternalLink className="w-3 h-3" /> Directions
                    </a>
                    <a
                      href={`/admin/prospects?search=${encodeURIComponent(popup.name)}`}
                      className="flex-1 text-center text-xs font-semibold text-gray-700 bg-gray-100 rounded px-2 py-1.5 hover:bg-gray-200 flex items-center justify-center gap-1"
                    >
                      <Users className="w-3 h-3" /> Profile
                    </a>
                  </div>
                </div>
              </Popup>
            )}
          </Map>
        )}

        {/* Score legend */}
        <div className="absolute bottom-10 left-3 bg-gray-900/90 border border-gray-700 rounded-lg p-3 text-xs space-y-1.5">
          <div className="text-gray-400 font-bold uppercase tracking-widest text-[10px] mb-2">Priority Score</div>
          {[
            { color: '#ef4444', label: '80+ Priority' },
            { color: '#f97316', label: '60–79 High' },
            { color: '#eab308', label: '40–59 Medium' },
            { color: '#22c55e', label: '<40 Low' },
            { color: '#6b7280', label: 'No score' },
          ].map(({ color, label: l }) => (
            <div key={l} className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
              <span className="text-gray-300">{l}</span>
            </div>
          ))}
          <div className="border-t border-gray-700 pt-1.5 mt-1 flex items-center gap-2">
            <div className="w-3 h-3 rounded-full border-2 shrink-0" style={{ borderColor: hColor }} />
            <span className="text-gray-300">SPC impact center</span>
          </div>
        </div>

        {/* No prospects overlay */}
        {!loading && prospects.length === 0 && lat && lon && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className="bg-gray-900/80 border border-gray-700 rounded-xl px-8 py-6 text-center">
              <Users className="w-10 h-10 text-gray-600 mx-auto mb-2" />
              <p className="text-gray-400 text-sm">No prospects with coordinates in this zone.</p>
              <p className="text-gray-600 text-xs mt-1">Prospects missing lat/lon won't appear on map.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ZoneMapPage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center bg-gray-950 text-gray-400">Loading map...</div>}>
      <ZoneMapInner />
    </Suspense>
  );
}
