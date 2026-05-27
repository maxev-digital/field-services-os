'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Users, Download, Filter, Home, RefreshCw, ChevronUp, ChevronDown,
  Phone, Mail, MapPin, ArrowUpDown, Search,
} from 'lucide-react';

interface Prospect {
  id: string;
  name: string | null;
  address: string;
  city: string;
  zip: string | null;
  county: string | null;
  phone: string | null;
  email: string | null;
  hail_size_in: number | null;
  home_value: number | null;
  year_built: number | null;
  priority_score: number | null;
  status: string;
  lat: number | null;
  lon: number | null;
}

interface Summary {
  total_all: number;
  has_phone: number;
  avg_value: number;
  avg_score: number;
  min_hail: number;
  max_hail: number;
}

interface Filters {
  counties: string[];
  cities:   string[];
  zips:     string[];
}

type SortCol = 'priority_score' | 'hail_size_in' | 'home_value' | 'year_built' | 'city' | 'zip';

function fmtCurrency(v: number | null) {
  if (!v) return '—';
  if (v >= 1000000) return `$${(v/1000000).toFixed(1)}M`;
  if (v >= 1000)    return `$${Math.round(v/1000)}k`;
  return `$${v}`;
}

function hailColor(h: number | null) {
  if (!h) return 'text-gray-500';
  if (h >= 3.0) return 'text-purple-400 font-bold';
  if (h >= 2.0) return 'text-red-400 font-bold';
  if (h >= 1.5) return 'text-orange-400 font-bold';
  if (h >= 1.0) return 'text-yellow-400';
  return 'text-gray-400';
}

function scoreBar(s: number | null) {
  const v = s ?? 0;
  const color = v >= 80 ? 'bg-red-500' : v >= 60 ? 'bg-orange-500' : v >= 40 ? 'bg-yellow-500' : 'bg-gray-600';
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-16 bg-gray-700 rounded-full h-1.5">
        <div className={`${color} h-1.5 rounded-full`} style={{ width: `${v}%` }} />
      </div>
      <span className="text-xs text-gray-400">{v}</span>
    </div>
  );
}

function CanvassContent() {
  const searchParams = useSearchParams();
  const paramDate = searchParams.get('date') || '';

  const [date,        setDate]        = useState(paramDate);
  const [county,      setCounty]      = useState('');
  const [city,        setCity]        = useState('');
  const [zip,         setZip]         = useState('');
  const [minHail,     setMinHail]     = useState('');
  const [minValue,    setMinValue]    = useState('');
  const [yearFrom,    setYearFrom]    = useState('');
  const [sort,        setSort]        = useState<SortCol>('priority_score');
  const [order,       setOrder]       = useState<'asc'|'desc'>('desc');
  const [availDates,  setAvailDates]  = useState<string[]>([]);

  const [prospects,   setProspects]   = useState<Prospect[]>([]);
  const [total,       setTotal]       = useState(0);
  const [offset,      setOffset]      = useState(0);
  const [loading,     setLoading]     = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [summary,     setSummary]     = useState<Summary | null>(null);
  const [filters,     setFilters]     = useState<Filters>({ counties: [], cities: [], zips: [] });
  const [selected,    setSelected]    = useState<Set<string>>(new Set());
  const [error,       setError]       = useState('');
  const LIMIT = 500;

  const buildParams = useCallback((d: string, off = 0) => {
    const p = new URLSearchParams({ date: d, limit: String(LIMIT), offset: String(off), sort, order });
    if (county)   p.set('county',    county);
    if (city)     p.set('city',      city);
    if (zip)      p.set('zip',       zip);
    if (minHail)  p.set('min_hail',  minHail);
    if (minValue) p.set('min_value', minValue);
    if (yearFrom) p.set('year_from', yearFrom);
    return p.toString();
  }, [county, city, zip, minHail, minValue, yearFrom, sort, order]);

  const loadDate = useCallback(async (d: string) => {
    if (!d) return;
    setLoading(true); setError(''); setOffset(0); setSelected(new Set());
    try {
      const res  = await fetch(`/api/admin/storm/canvass?${buildParams(d, 0)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setProspects(data.prospects || []);
      setTotal(data.total || 0);
      setOffset(LIMIT);
      if (data.summary) setSummary(data.summary);
      if (data.filters) setFilters(data.filters);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [buildParams]);

  const load = useCallback(() => loadDate(date), [loadDate, date]);

  const loadMore = async () => {
    if (loadingMore || prospects.length >= total) return;
    setLoadingMore(true);
    try {
      const res  = await fetch(`/api/admin/storm/canvass?${buildParams(date, offset)}`);
      const data = await res.json();
      setProspects(prev => [...prev, ...(data.prospects || [])]);
      setOffset(prev => prev + LIMIT);
    } catch {}
    finally { setLoadingMore(false); }
  };

  // On mount: fetch available dates, auto-select most recent if no URL param
  useEffect(() => {
    async function init() {
      try {
        const r = await fetch('/api/admin/storm/roi');
        const d = await r.json();
        const dates: string[] = (d.storms || []).map((s: any) => s.storm_date).filter(Boolean);
        setAvailDates(dates);
        const useDate = paramDate || dates[0] || '';
        if (useDate) {
          setDate(useDate);
          await loadDate(useDate);
        }
      } catch {
        if (paramDate) await loadDate(paramDate);
      }
    }
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleSort = (col: SortCol) => {
    if (sort === col) setOrder(o => o === 'desc' ? 'asc' : 'desc');
    else { setSort(col); setOrder('desc'); }
  };

  const SortIcon = ({ col }: { col: SortCol }) => {
    if (sort !== col) return <ArrowUpDown className="w-3 h-3 opacity-30 inline ml-0.5" />;
    return order === 'desc'
      ? <ChevronDown className="w-3 h-3 inline ml-0.5 text-yellow-400" />
      : <ChevronUp   className="w-3 h-3 inline ml-0.5 text-yellow-400" />;
  };

  const toggle = (id: string) => setSelected(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });
  const selectAll = () => setSelected(new Set(prospects.map(p => p.id)));
  const clearAll  = () => setSelected(new Set());

  const exportCsv = () => {
    const rows = selected.size > 0 ? prospects.filter(p => selected.has(p.id)) : prospects;
    const headers = ['Name','Address','City','Zip','County','Phone','Email','Hail (in)','Home Value','Year Built','Priority Score','Status'];
    const csv = [
      headers.join(','),
      ...rows.map(p => [
        `"${p.name || ''}"`,
        `"${p.address}"`,
        `"${p.city}"`,
        `"${p.zip || ''}"`,
        `"${p.county || ''}"`,
        `"${p.phone || ''}"`,
        `"${p.email || ''}"`,
        p.hail_size_in ?? '',
        p.home_value   ?? '',
        p.year_built   ?? '',
        p.priority_score ?? '',
        `"${p.status}"`,
      ].join(','))
    ].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `canvass-${date}-${county || 'all'}.csv`;
    a.click();
  };

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-yellow-700 rounded-lg">
            <Users className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Storm Canvassing</h1>
            <p className="text-sm text-gray-400">Field sales list — filter by area, hail size, or home value</p>
          </div>
        </div>
        <div className="flex gap-2">
          {selected.size > 0 && (
            <button onClick={exportCsv}
              className="flex items-center gap-1.5 px-3 py-2 bg-blue-700 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors">
              <Download className="w-4 h-4" /> Export {selected.size} selected
            </button>
          )}
          {selected.size === 0 && prospects.length > 0 && (
            <button onClick={exportCsv}
              className="flex items-center gap-1.5 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded-lg transition-colors">
              <Download className="w-4 h-4" /> Export CSV
            </button>
          )}
        </div>
      </div>

      {/* Summary bar */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: 'Total Prospects', value: summary.total_all.toLocaleString(), color: 'text-white' },
            { label: 'Have Phone',  value: summary.has_phone.toLocaleString(), color: 'text-green-400' },
            { label: 'No Phone',    value: (summary.total_all - summary.has_phone).toLocaleString(), color: 'text-red-400' },
            { label: 'Avg Value',   value: fmtCurrency(summary.avg_value), color: 'text-blue-400' },
            { label: 'Avg Score',   value: String(summary.avg_score), color: 'text-yellow-400' },
            { label: 'Max Hail',    value: `${summary.max_hail}"`, color: 'text-purple-400' },
          ].map(s => (
            <div key={s.label} className="bg-gray-800 border border-gray-700 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-0.5">{s.label}</p>
              <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filter panel */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-yellow-400" />
          <span className="text-sm font-semibold text-white">Filters</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3 items-end">

          {/* Date — dropdown when available dates known, else free input */}
          <div className="lg:col-span-1">
            <label className="text-xs text-gray-400 block mb-1">Storm Date</label>
            {availDates.length > 0 ? (
              <select value={date} onChange={e => setDate(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-500">
                {availDates.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            ) : (
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-500" />
            )}
          </div>

          {/* County */}
          <div>
            <label className="text-xs text-gray-400 block mb-1">County</label>
            <select value={county} onChange={e => { setCounty(e.target.value); setCity(''); }}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-500">
              <option value="">All Counties</option>
              {filters.counties.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* City */}
          <div>
            <label className="text-xs text-gray-400 block mb-1">City</label>
            <select value={city} onChange={e => setCity(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-500">
              <option value="">All Cities</option>
              {filters.cities.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Zip */}
          <div>
            <label className="text-xs text-gray-400 block mb-1">Zip Code</label>
            <input type="text" value={zip} onChange={e => setZip(e.target.value)}
              placeholder="e.g. 75080"
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-500" />
          </div>

          {/* Min Hail */}
          <div>
            <label className="text-xs text-gray-400 block mb-1">Min Hail Size</label>
            <select value={minHail} onChange={e => setMinHail(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-500">
              <option value="">Any Size</option>
              <option value="0.75">0.75"+ Moderate</option>
              <option value="1.0">1"+ Damaging</option>
              <option value="1.5">1.5"+ Significant</option>
              <option value="2.0">2"+ Major</option>
              <option value="3.0">3"+ Catastrophic</option>
            </select>
          </div>

          {/* Min Home Value */}
          <div>
            <label className="text-xs text-gray-400 block mb-1">Min Home Value</label>
            <select value={minValue} onChange={e => setMinValue(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-500">
              <option value="">Any Value</option>
              <option value="150000">$150k+</option>
              <option value="250000">$250k+</option>
              <option value="350000">$350k+</option>
              <option value="500000">$500k+</option>
              <option value="750000">$750k+</option>
            </select>
          </div>

          {/* Search */}
          <div>
            <button onClick={load} disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-yellow-600 hover:bg-yellow-500 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors">
              <Search className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'Loading...' : 'Search'}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg p-3 text-red-300 text-sm">{error}</div>
      )}

      {/* Results */}
      {prospects.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-400">
              Showing <span className="text-white font-semibold">{prospects.length.toLocaleString()}</span> of{' '}
              <span className="text-white font-semibold">{total.toLocaleString()}</span> prospects
              {selected.size > 0 && <span className="text-yellow-400 ml-2">· {selected.size} selected</span>}
            </p>
            <div className="flex gap-3 text-xs text-gray-500">
              <button onClick={selectAll} className="hover:text-gray-300">Select all {prospects.length}</button>
              <span>·</span>
              <button onClick={clearAll}  className="hover:text-gray-300">Clear</button>
            </div>
          </div>

          <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700 text-xs text-gray-400 uppercase tracking-wider">
                  <th className="px-3 py-3 w-8">
                    <input type="checkbox"
                      checked={selected.size === prospects.length && prospects.length > 0}
                      onChange={e => e.target.checked ? selectAll() : clearAll()}
                      className="rounded" />
                  </th>
                  <th className="px-3 py-3 text-left">Owner / Address</th>
                  <th className="px-3 py-3 text-left cursor-pointer hover:text-white" onClick={() => toggleSort('city')}>
                    City / Zip <SortIcon col="city" />
                  </th>
                  <th className="px-3 py-3 text-center cursor-pointer hover:text-white" onClick={() => toggleSort('hail_size_in')}>
                    Hail <SortIcon col="hail_size_in" />
                  </th>
                  <th className="px-3 py-3 text-right cursor-pointer hover:text-white" onClick={() => toggleSort('home_value')}>
                    Value <SortIcon col="home_value" />
                  </th>
                  <th className="px-3 py-3 text-center cursor-pointer hover:text-white" onClick={() => toggleSort('year_built')}>
                    Built <SortIcon col="year_built" />
                  </th>
                  <th className="px-3 py-3 text-center cursor-pointer hover:text-white" onClick={() => toggleSort('priority_score')}>
                    Score <SortIcon col="priority_score" />
                  </th>
                  <th className="px-3 py-3 text-center">Contact</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700/50">
                {prospects.map(p => (
                  <tr key={p.id}
                    onClick={() => toggle(p.id)}
                    className={`cursor-pointer transition-colors hover:bg-gray-700/30 ${selected.has(p.id) ? 'bg-yellow-900/20' : ''}`}
                  >
                    <td className="px-3 py-2.5">
                      <input type="checkbox" checked={selected.has(p.id)} onChange={() => {}}
                        onClick={e => e.stopPropagation()} className="rounded" />
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="text-white text-xs font-medium">{p.name || '—'}</div>
                      <div className="text-gray-500 text-xs truncate max-w-[220px]">{p.address}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="text-gray-200 text-xs">{p.city}</div>
                      <div className="text-gray-500 text-xs">{p.zip}{p.county ? ` · ${p.county}` : ''}</div>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`text-xs font-mono ${hailColor(p.hail_size_in)}`}>
                        {p.hail_size_in ? `${p.hail_size_in}"` : '—'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs text-gray-300">
                      {fmtCurrency(p.home_value)}
                    </td>
                    <td className="px-3 py-2.5 text-center text-xs text-gray-400">
                      {p.year_built || '—'}
                    </td>
                    <td className="px-3 py-2.5">
                      {scoreBar(p.priority_score)}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-center gap-2">
                        {p.phone
                          ? <Phone className="w-3.5 h-3.5 text-green-400" title={p.phone} />
                          : <Phone className="w-3.5 h-3.5 text-gray-700" />}
                        {p.email
                          ? <Mail className="w-3.5 h-3.5 text-blue-400" title={p.email} />
                          : <Mail className="w-3.5 h-3.5 text-gray-700" />}
                        {p.lat && p.lon && (
                          <a
                            href={`https://www.google.com/maps?q=${p.lat},${p.lon}`}
                            target="_blank" rel="noreferrer"
                            onClick={e => e.stopPropagation()}
                          >
                            <MapPin className="w-3.5 h-3.5 text-gray-500 hover:text-yellow-400" />
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {prospects.length < total && (
            <div className="text-center pt-2">
              <button onClick={loadMore} disabled={loadingMore}
                className="px-6 py-2.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-200 text-sm font-medium rounded-lg transition-colors">
                {loadingMore ? 'Loading...' : `Load More (${(total - prospects.length).toLocaleString()} remaining)`}
              </button>
            </div>
          )}
        </>
      )}

      {!loading && prospects.length === 0 && (
        <div className="text-center py-16 bg-gray-800 rounded-xl border border-gray-700">
          <Home className="w-10 h-10 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400 font-medium">No prospects found for this date</p>
          <p className="text-gray-500 text-sm mt-1">Try a different storm date or adjust your filters.</p>
        </div>
      )}
    </div>
  );
}

export default function CanvassPage() {
  return (
    <Suspense fallback={<div className="p-6 text-gray-400">Loading...</div>}>
      <CanvassContent />
    </Suspense>
  );
}
