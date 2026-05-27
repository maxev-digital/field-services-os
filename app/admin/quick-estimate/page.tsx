'use client';

import { useState } from 'react';
import {
  Search, Home, Ruler, DollarSign, Calendar, MapPin,
  ChevronRight, AlertCircle, Zap, RefreshCw, ExternalLink,
} from 'lucide-react';

interface Tier { label: string; low: number; high: number }
interface Estimate {
  squares:    number;
  pitch_mult: number;
  age_factor: number;
  standard:      Tier;
  architectural: Tier;
  impact:        Tier;
  note:          string | null;
}
interface Property {
  id:          number;
  apn:         string;
  address:     string;
  city:        string;
  zip:         string;
  owner:       string;
  living_sqft: number;
  roof_type:   string | null;
  year_built:  number | null;
  total_value: number | null;
  lat:         number | null;
  lon:         number | null;
  estimate:    Estimate;
}

const fmt  = (n: number) => '$' + n.toLocaleString('en-US');
const fmtK = (n: number) => '$' + Math.round(n / 1000) + 'K';

function TierCard({ tier, color, selected }: { tier: Tier; color: 'gray' | 'blue' | 'red'; selected?: boolean }) {
  const colors = {
    gray: { bg: 'bg-gray-800', border: 'border-gray-600', label: 'text-gray-400', val: 'text-white' },
    blue: { bg: 'bg-blue-950', border: 'border-blue-700', label: 'text-blue-400', val: 'text-blue-200' },
    red:  { bg: 'bg-red-950',  border: 'border-red-700',  label: 'text-red-400',  val: 'text-red-200'  },
  }[color];
  return (
    <div className={`rounded-xl border ${colors.border} ${colors.bg} p-4 flex-1`}>
      <div className={`text-xs font-semibold uppercase tracking-wider ${colors.label} mb-1`}>{tier.label}</div>
      <div className={`text-2xl font-bold ${colors.val}`}>{fmtK(tier.low)} – {fmtK(tier.high)}</div>
      <div className="text-xs text-gray-500 mt-0.5">{fmt(tier.low)} – {fmt(tier.high)}</div>
    </div>
  );
}

function PropertyCard({ p, onSelect, selected }: { p: Property; onSelect: () => void; selected: boolean }) {
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left rounded-xl border p-4 transition-colors ${
        selected ? 'border-red-600 bg-red-950/30' : 'border-gray-700 bg-gray-800 hover:border-gray-500'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold text-white text-sm">{p.address}</div>
          <div className="text-xs text-gray-400">{p.city}, TX {p.zip}</div>
        </div>
        <ChevronRight className={`w-4 h-4 mt-0.5 flex-shrink-0 ${selected ? 'text-red-400' : 'text-gray-600'}`} />
      </div>
      <div className="flex gap-4 mt-2 text-xs text-gray-400">
        <span>{p.living_sqft?.toLocaleString()} sqft</span>
        {p.roof_type && <span>{p.roof_type}</span>}
        {p.year_built && <span>Built {p.year_built}</span>}
      </div>
      <div className="mt-2 text-sm font-semibold text-green-400">
        Est. {fmtK(p.estimate.architectural.low)} – {fmtK(p.estimate.impact.high)}
      </div>
    </button>
  );
}

export default function QuickEstimatePage() {
  const [query,   setQuery]   = useState('');
  const [results, setResults] = useState<Property[]>([]);
  const [selected, setSelected] = useState<Property | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [searched, setSearched] = useState(false);

  async function search(q = query) {
    if (!q.trim()) return;
    setLoading(true);
    setError('');
    setSelected(null);
    setSearched(true);
    try {
      const r = await fetch(`/api/admin/quick-estimate?address=${encodeURIComponent(q)}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setResults(d.properties ?? []);
      if (d.properties?.length === 1) setSelected(d.properties[0]);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const est = selected?.estimate;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-red-700 rounded-xl"><Zap className="w-5 h-5 text-white" /></div>
        <div>
          <h1 className="text-2xl font-bold text-white">Quick Estimate</h1>
          <p className="text-sm text-gray-400 mt-0.5">Instant roofing range from address — no data entry required</p>
        </div>
      </div>

      {/* Search */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
        <label className="block text-xs text-gray-400 uppercase tracking-wider mb-2">Property Address</label>
        <div className="flex gap-3">
          <div className="relative flex-1">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && search()}
              placeholder="1234 Main St, Dallas TX  —  or just  1234 Main"
              className="w-full bg-gray-900 border border-gray-600 rounded-lg pl-9 pr-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-red-600"
            />
          </div>
          <button
            onClick={() => search()}
            disabled={loading || !query.trim()}
            className="flex items-center gap-2 bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white px-5 py-3 rounded-lg text-sm font-semibold transition-colors"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Look Up
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Searches 682,000+ Dallas County parcels · Includes sqft, roof type, and year built
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 bg-red-900/30 border border-red-800 text-red-300 rounded-xl p-4">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Results layout */}
      {searched && !loading && (
        <div className={`grid gap-6 ${results.length > 1 ? 'grid-cols-1 md:grid-cols-[320px_1fr]' : 'grid-cols-1'}`}>

          {/* Property list (only shown if multiple results) */}
          {results.length > 1 && (
            <div className="space-y-2">
              <p className="text-xs text-gray-500 uppercase tracking-wider px-1">{results.length} matches — select one</p>
              {results.map(p => (
                <PropertyCard
                  key={p.id}
                  p={p}
                  onSelect={() => setSelected(p)}
                  selected={selected?.id === p.id}
                />
              ))}
            </div>
          )}

          {/* Estimate panel */}
          {selected && est ? (
            <div className="space-y-4">

              {/* Property info */}
              <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-bold text-white">{selected.address}</h2>
                    <p className="text-sm text-gray-400">{selected.city}, TX {selected.zip}</p>
                    {selected.owner && (
                      <p className="text-xs text-gray-500 mt-1">Owner: {selected.owner}</p>
                    )}
                  </div>
                  {selected.lat && selected.lon && (
                    <a
                      href={`https://maps.google.com/?q=${selected.lat},${selected.lon}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 flex-shrink-0"
                    >
                      <ExternalLink className="w-3 h-3" /> Maps
                    </a>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                  {[
                    { icon: Ruler,    label: 'Living Area',  val: `${selected.living_sqft?.toLocaleString()} sqft` },
                    { icon: Home,     label: 'Roof Type',    val: selected.roof_type ?? 'Unknown' },
                    { icon: Calendar, label: 'Year Built',   val: selected.year_built ? String(selected.year_built) : '—' },
                    { icon: DollarSign, label: 'Assessed Value', val: selected.total_value ? fmt(selected.total_value) : '—' },
                  ].map(s => (
                    <div key={s.label} className="bg-gray-900 rounded-lg p-3">
                      <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
                        <s.icon className="w-3 h-3" />{s.label}
                      </div>
                      <div className="text-sm font-semibold text-white">{s.val}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Calculation breakdown */}
              <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-gray-300 mb-3">Roof Calculation</h3>
                <div className="grid grid-cols-3 gap-3 text-sm mb-3">
                  <div className="bg-gray-900 rounded-lg p-3">
                    <div className="text-xs text-gray-500">Living Area</div>
                    <div className="font-semibold text-white">{selected.living_sqft?.toLocaleString()} sqft</div>
                  </div>
                  <div className="bg-gray-900 rounded-lg p-3">
                    <div className="text-xs text-gray-500">Pitch Multiplier</div>
                    <div className="font-semibold text-white">{est.pitch_mult}×</div>
                    <div className="text-xs text-gray-600">{selected.roof_type ?? 'est.'}</div>
                  </div>
                  <div className="bg-gray-900 rounded-lg p-3">
                    <div className="text-xs text-gray-500">Roof Squares</div>
                    <div className="font-semibold text-yellow-400 text-lg">{est.squares}</div>
                    <div className="text-xs text-gray-600">@ 100 sqft each</div>
                  </div>
                </div>
                {est.note && (
                  <div className="text-xs text-amber-400 bg-amber-950/40 border border-amber-800/50 rounded-lg px-3 py-2">
                    ⚠ {est.note}
                  </div>
                )}
              </div>

              {/* Estimate tiers */}
              <div>
                <h3 className="text-sm font-semibold text-gray-300 mb-3">Estimate Range by Shingle Grade</h3>
                <div className="flex gap-3">
                  <TierCard tier={est.standard}      color="gray" />
                  <TierCard tier={est.architectural}  color="blue" />
                  <TierCard tier={est.impact}         color="red"  />
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Rates: Standard $500/sq · Architectural $680/sq · Impact $880/sq · All include labor, materials, haul-off, permits
                </p>
              </div>

              {/* Insurance estimate note */}
              <div className="bg-blue-950/40 border border-blue-800/50 rounded-xl p-4">
                <div className="text-sm font-semibold text-blue-300 mb-1">Insurance Replacement Estimate</div>
                <div className="text-2xl font-bold text-white mb-1">
                  {fmtK(est.architectural.low)} – {fmtK(est.impact.high)}
                </div>
                <p className="text-xs text-blue-400">
                  Architectural through impact-resistant · Hail damage claims typically land in this range with O&P included.
                  Final RCV determined after EagleView aerial measurement and adjuster inspection.
                </p>
              </div>

              {/* CTAs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <a
                  href={`/admin/estimates/new?address=${encodeURIComponent(selected.address + ', ' + selected.city + ' TX ' + selected.zip)}`}
                  className="flex items-center justify-center gap-2 bg-red-700 hover:bg-red-600 text-white rounded-xl py-3 px-4 text-sm font-semibold transition-colors"
                >
                  <DollarSign className="w-4 h-4" /> Create Full Estimate
                </a>
                <a
                  href={`/admin/storm/prospects/new?address=${encodeURIComponent(selected.address + ', ' + selected.city + ' TX ' + selected.zip)}&lat=${selected.lat ?? ''}&lon=${selected.lon ?? ''}`}
                  className="flex items-center justify-center gap-2 bg-gray-700 hover:bg-gray-600 text-white rounded-xl py-3 px-4 text-sm font-semibold transition-colors"
                >
                  <Home className="w-4 h-4" /> Add as Storm Prospect
                </a>
              </div>

              {/* Disclaimer */}
              <p className="text-xs text-gray-600">
                This is a preliminary estimate only. Actual cost depends on roof pitch, number of penetrations, decking condition, local permit fees, and material pricing at time of job.
                Order an EagleView aerial report for precise square count before finalizing any proposal.
              </p>
            </div>
          ) : results.length === 0 ? (
            <div className="bg-gray-800 border border-gray-700 rounded-xl p-10 text-center">
              <Home className="w-10 h-10 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400 font-semibold">No matching properties found</p>
              <p className="text-gray-500 text-sm mt-1">Try a partial street address — e.g. "4821 Maple" instead of the full address</p>
            </div>
          ) : null}
        </div>
      )}

      {/* Intro state */}
      {!searched && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-8 text-center">
          <Search className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-gray-300 mb-2">Enter any Dallas County address</h2>
          <p className="text-gray-500 text-sm max-w-md mx-auto">
            The system pulls square footage, roof type, and year built from the county parcel database
            and instantly calculates a roofing estimate range — no field visit or data entry needed.
          </p>
          <div className="mt-6 grid grid-cols-3 gap-4 max-w-sm mx-auto text-center">
            {[
              { val: '682K+', label: 'Parcels indexed' },
              { val: '< 1s',  label: 'Lookup time' },
              { val: '0',     label: 'Data entry required' },
            ].map(s => (
              <div key={s.label} className="bg-gray-900 rounded-lg p-3">
                <div className="text-xl font-bold text-red-400">{s.val}</div>
                <div className="text-xs text-gray-500 mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
