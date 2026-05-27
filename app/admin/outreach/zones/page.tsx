'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  MapPin, RefreshCw, Copy, Check, ExternalLink, CloudLightning,
  Users, TrendingUp, Navigation, Target, AlertTriangle, Calendar, Map as MapIcon,
} from 'lucide-react';

interface Zone {
  id: number;
  lat: number;
  lon: number;
  hailIn: number;
  radiusMiles: number;
  label: string;
  color: string;
  location: string;
  county: string;
  crossStreets: string;
  prospectCount: number;
  score60Count: number;
  maxScore: number;
  milesFromPlano: number;
}

const TIER_BG: Record<number, string> = {
  3: 'bg-purple-900/40 border-purple-500/40',
  2: 'bg-red-900/40 border-red-500/40',
  1.5: 'bg-orange-900/40 border-orange-500/40',
  1: 'bg-yellow-900/40 border-yellow-500/40',
};

function tierBg(hailIn: number) {
  if (hailIn >= 3.0) return 'bg-purple-900/40 border-purple-500/40';
  if (hailIn >= 2.0) return 'bg-red-900/40 border-red-500/40';
  if (hailIn >= 1.5) return 'bg-orange-900/40 border-orange-500/40';
  if (hailIn >= 1.0) return 'bg-yellow-900/40 border-yellow-500/40';
  return 'bg-green-900/40 border-green-500/40';
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button onClick={copy} className="ml-1 text-gray-500 hover:text-gray-300 transition-colors">
      {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
    </button>
  );
}

export default function StormZonesPage() {
  const [date, setDate]       = useState('');
  const [zones, setZones]     = useState<Zone[]>([]);
  const [loading, setLoading] = useState(false);
  const [computing, setComputing] = useState(false);
  const [cached, setCached]   = useState(false);
  const [error, setError]     = useState('');
  const [radiusOverride, setRadiusOverride] = useState<number | null>(null);

  // Default to yesterday (CST) — use locale string to avoid UTC rollover bug
  useEffect(() => {
    const cst = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }));
    cst.setDate(cst.getDate() - 1);
    const ymd = `${cst.getFullYear()}${String(cst.getMonth()+1).padStart(2,'0')}${String(cst.getDate()).padStart(2,'0')}`;
    setDate(ymd);
  }, []);

  const load = useCallback(async (dateStr: string) => {
    if (!dateStr) return;
    setLoading(true);
    setError('');
    try {
      const res  = await fetch(`/api/admin/storm/zones?date=${dateStr}`);
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed'); return; }
      setZones(data.zones || []);
      setCached(data.cached);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (date) load(date); }, [date, load]);

  const recompute = async () => {
    setComputing(true);
    setError('');
    try {
      const res  = await fetch('/api/admin/storm/zones', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ date }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed'); return; }
      setZones(data.zones || []);
      setCached(false);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setComputing(false);
    }
  };

  const totalProspects = zones.reduce((s, z) => s + z.prospectCount, 0);
  const totalScore60   = zones.reduce((s, z) => s + z.score60Count, 0);

  const dateDisplay = date
    ? `${date.slice(4, 6)}/${date.slice(6, 8)}/${date.slice(0, 4)}`
    : '';

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <CloudLightning className="w-6 h-6 text-yellow-400" />
            Storm Scout Zones
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            Confirmed SPC hail impact areas — lat/lon + cross streets for field scouting
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={date}
              onChange={e => setDate(e.target.value.replace(/\D/g, '').slice(0, 8))}
              placeholder="YYYYMMDD"
              className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-white text-sm w-32 font-mono"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-400 whitespace-nowrap">Search Radius</label>
            <input
              type="number"
              min="0.5" max="20" step="0.5"
              value={radiusOverride ?? ''}
              onChange={e => setRadiusOverride(e.target.value ? parseFloat(e.target.value) : null)}
              placeholder="auto"
              className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-white text-sm w-20 font-mono"
            />
            <span className="text-xs text-gray-500">mi</span>
          </div>
          <button
            onClick={recompute}
            disabled={computing || !date}
            className="flex items-center gap-2 px-4 py-2 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${computing ? 'animate-spin' : ''}`} />
            {computing ? 'Computing...' : 'Recompute'}
          </button>
        </div>
      </div>

      {/* Summary bar */}
      {zones.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Confirmed Zones', value: zones.length, icon: Target, color: 'text-yellow-400' },
            { label: 'Total Prospects', value: totalProspects.toLocaleString(), icon: Users, color: 'text-blue-400' },
            { label: 'Score 60+', value: totalScore60.toLocaleString(), icon: TrendingUp, color: 'text-green-400' },
            { label: 'Max Hail', value: `${Math.max(...zones.map(z => z.hailIn))}"`, icon: AlertTriangle, color: 'text-red-400' },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="bg-gray-800 rounded-lg p-4 border border-gray-700">
              <div className="flex items-center gap-2 mb-1">
                <Icon className={`w-4 h-4 ${color}`} />
                <span className="text-xs text-gray-400 uppercase tracking-wide">{label}</span>
              </div>
              <div className="text-2xl font-bold text-white">{value}</div>
            </div>
          ))}
        </div>
      )}

      {/* State */}
      {loading && (
        <div className="text-center py-16 text-gray-400">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 text-blue-400" />
          Loading zones for {dateDisplay}...
        </div>
      )}
      {error && (
        <div className="bg-red-900/30 border border-red-500/40 rounded-lg p-4 text-red-300">{error}</div>
      )}
      {!loading && !error && zones.length === 0 && date && (
        <div className="text-center py-16 text-gray-500">
          <CloudLightning className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No confirmed DFW hail zones for {dateDisplay}.</p>
          <p className="text-sm mt-1">SPC data typically posts by 8am CST the following morning.</p>
        </div>
      )}

      {/* Zone cards */}
      {!loading && zones.length > 0 && (
        <div className="space-y-3">
          {cached && (
            <p className="text-xs text-gray-500">
              Showing cached results · <button onClick={recompute} className="text-blue-400 hover:underline">Recompute</button> to refresh prospect counts
            </p>
          )}

          {zones.map((zone, i) => (
            <div key={zone.id || i} className={`rounded-xl border p-5 ${tierBg(zone.hailIn)}`}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                {/* Left: zone info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2 flex-wrap">
                    <span
                      className="text-xs font-bold px-2 py-0.5 rounded-full text-white"
                      style={{ backgroundColor: zone.color }}
                    >
                      {zone.label}
                    </span>
                    <span className="text-sm text-gray-300 font-medium">
                      {zone.location}{zone.county ? `, ${zone.county} Co.` : ''}
                    </span>
                    <span className="text-xs text-gray-500">{radiusOverride ? <><span className="text-yellow-400 font-medium">{radiusOverride} mi</span> (override)</> : <>{zone.radiusMiles} mi</>} radius</span>
                  </div>

                  {/* Cross streets */}
                  {zone.crossStreets && (
                    <div className="flex items-center gap-1.5 mb-3">
                      <Navigation className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                      <span className="text-sm text-gray-300">{zone.crossStreets}</span>
                    </div>
                  )}

                  {/* Coordinates */}
                  <div className="flex flex-wrap gap-4 text-xs font-mono">
                    <div className="flex items-center gap-1 text-gray-400">
                      <span className="text-gray-500">LAT</span>
                      <span className="text-white">{zone.lat.toFixed(5)}</span>
                      <CopyBtn text={zone.lat.toFixed(5)} />
                    </div>
                    <div className="flex items-center gap-1 text-gray-400">
                      <span className="text-gray-500">LON</span>
                      <span className="text-white">{zone.lon.toFixed(5)}</span>
                      <CopyBtn text={zone.lon.toFixed(5)} />
                    </div>
                    <div className="flex items-center gap-1 text-gray-400">
                      <span className="text-gray-500">COORDS</span>
                      <CopyBtn text={`${zone.lat.toFixed(5)},${zone.lon.toFixed(5)}`} />
                      <a
                        href={`https://www.google.com/maps?q=${zone.lat},${zone.lon}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-400 hover:text-blue-300 ml-1"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                    <div className="flex items-center gap-1 text-gray-400">
                      <MapPin className="w-3 h-3" />
                      <span>{zone.milesFromPlano} mi from Plano</span>
                    </div>
                  </div>
                </div>

                {/* Right: prospect counts */}
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <div className="text-right">
                    <div className="text-2xl font-bold text-white">{zone.prospectCount.toLocaleString()}</div>
                    <div className="text-xs text-gray-400">prospects in zone</div>
                  </div>
                  {zone.score60Count > 0 && (
                    <div className="text-right">
                      <div className="text-lg font-semibold text-green-400">{zone.score60Count.toLocaleString()}</div>
                      <div className="text-xs text-gray-400">score 60+</div>
                    </div>
                  )}
                  <a
                    href={`/admin/prospects?lat=${zone.lat}&lon=${zone.lon}&radius_miles=${radiusOverride ?? zone.radiusMiles}&storm_date=${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}&label=${encodeURIComponent(zone.label + " — " + zone.location)}`}
                    className="text-xs px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg flex items-center gap-1 transition-colors"
                  >
                    <Users className="w-3 h-3" />
                    View Prospects
                  </a>
                  <a
                    href={`/admin/outreach/zones/map?lat=${zone.lat}&lon=${zone.lon}&radius_miles=${zone.radiusMiles}&hail_in=${zone.hailIn}&storm_date=${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}&label=${encodeURIComponent(zone.label + " — " + zone.location)}`}
                    className="text-xs px-3 py-1.5 bg-purple-800 hover:bg-purple-700 text-white rounded-lg flex items-center gap-1 transition-colors"
                  >
                    <MapIcon className="w-3 h-3" />
                    Map
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
