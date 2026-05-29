"use client";
import { useEffect, useState, useMemo } from "react";
import { Target, Zap, RefreshCw, CheckSquare, Square } from "lucide-react";

interface ZipRow { zip: string; city: string; county: string; total: number; owner_occ: number; }

export default function StormTargetPage() {
  const [zips,       setZips]       = useState<ZipRow[]>([]);
  const [selected,   setSelected]   = useState<Set<string>>(new Set());
  const [search,     setSearch]     = useState('');
  const [countyFilt, setCountyFilt] = useState('all');
  const [ownerOnly,  setOwnerOnly]  = useState(true);
  const [maxPerZip,  setMaxPerZip]  = useState(2000);
  const [stormDate,  setStormDate]  = useState(new Date().toISOString().split('T')[0]);
  const [stormLabel, setStormLabel] = useState('');
  const [generating, setGenerating] = useState(false);
  const [result,     setResult]     = useState<any>(null);
  const [loading,    setLoading]    = useState(true);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch('/api/admin/storm/dfw-data');
      const d = await r.json();
      setZips(d.byZip ?? []);
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  const counties = useMemo(() =>
    ['all', ...Array.from(new Set(zips.map(z => z.county).filter(Boolean).sort()))], [zips]);

  const filtered = useMemo(() => zips.filter(z =>
    (countyFilt === 'all' || z.county === countyFilt) &&
    (z.zip.includes(search) || (z.city || '').toLowerCase().includes(search.toLowerCase()))
  ), [zips, search, countyFilt]);

  const toggle = (zip: string) => setSelected(s => { const n = new Set(s); n.has(zip) ? n.delete(zip) : n.add(zip); return n; });
  const selectAll = () => setSelected(new Set(filtered.map(z => z.zip)));
  const clearAll  = () => setSelected(new Set());

  const estRecords = [...selected].reduce((a, z) => {
    const row = zips.find(r => r.zip === z);
    return a + (ownerOnly ? (row?.owner_occ ?? 0) : (row?.total ?? 0));
  }, 0);
  const skipCost = (Math.min(estRecords, maxPerZip * selected.size) * 0.15).toFixed(2);

  async function generate() {
    if (!selected.size) return;
    const label = stormLabel || ('Storm ' + stormDate);
    if (!confirm(`Generate storm prospects for ${selected.size} zip codes (~${estRecords.toLocaleString()} records)?\n\nLabel: "${label}"\nThis will add to /admin/storm.`)) return;
    setGenerating(true); setResult(null);
    try {
      const r = await fetch('/api/admin/storm/target', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zips: [...selected], stormDate, stormLabel: label, ownerOccOnly: ownerOnly, maxPerZip }),
      });
      setResult(await r.json());
    } catch (e: any) { setResult({ error: e.message }); }
    finally { setGenerating(false); }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-red-900 rounded-xl"><Target className="w-6 h-6 text-red-300" /></div>
        <div>
          <h1 className="text-2xl font-bold text-white">Storm Targeting</h1>
          <p className="text-sm text-gray-400">Select affected zip codes — generate a prospect list instantly from property database</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Zip selector */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex gap-3">
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search zip or city..."
              className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm" />
            <select value={countyFilt} onChange={e => setCountyFilt(e.target.value)}
              className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm capitalize">
              {counties.map(c => <option key={c} value={c} className="capitalize">{c === 'all' ? 'All counties' : c + ' county'}</option>)}
            </select>
          </div>
          <div className="flex gap-2 text-xs items-center">
            <button onClick={selectAll} className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg flex items-center gap-1">
              <CheckSquare className="w-3.5 h-3.5" /> All ({filtered.length})
            </button>
            <button onClick={clearAll} className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg flex items-center gap-1">
              <Square className="w-3.5 h-3.5" /> Clear
            </button>
            <span className="text-gray-500">{selected.size} zip{selected.size !== 1 ? 's' : ''} selected</span>
          </div>

          <div className="bg-gray-900 rounded-xl overflow-hidden" style={{ maxHeight: 520 }}>
            {loading ? (
              <div className="p-10 text-center text-gray-500"><RefreshCw className="w-5 h-5 animate-spin mx-auto" /></div>
            ) : (
              <div className="overflow-y-auto" style={{ maxHeight: 520 }}>
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-800 z-10">
                    <tr className="text-xs text-gray-400 uppercase">
                      <th className="px-3 py-2 w-8"></th>
                      <th className="px-3 py-2 text-left">Zip</th>
                      <th className="px-3 py-2 text-left">City</th>
                      <th className="px-3 py-2 text-left">County</th>
                      <th className="px-3 py-2 text-right">Total</th>
                      <th className="px-3 py-2 text-right">Owner-Occ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(z => (
                      <tr key={z.zip} onClick={() => toggle(z.zip)}
                        className={"cursor-pointer " + (selected.has(z.zip) ? "bg-yellow-900/40 hover:bg-yellow-900/50" : "hover:bg-gray-800")}>
                        <td className="px-3 py-1.5">
                          {selected.has(z.zip) ? <CheckSquare className="w-4 h-4 text-yellow-400" /> : <Square className="w-4 h-4 text-gray-600" />}
                        </td>
                        <td className="px-3 py-1.5 font-mono text-white">{z.zip}</td>
                        <td className="px-3 py-1.5 text-gray-300 capitalize">{(z.city || '').toLowerCase()}</td>
                        <td className="px-3 py-1.5 text-gray-500 capitalize">{z.county}</td>
                        <td className="px-3 py-1.5 text-right text-gray-300">{z.total.toLocaleString()}</td>
                        <td className="px-3 py-1.5 text-right text-green-400">{z.owner_occ.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Generate panel */}
        <div className="space-y-4">
          <div className="bg-gray-900 rounded-2xl p-5 space-y-4">
            <h2 className="font-semibold text-white">Generate Prospects</h2>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Storm Date</label>
              <input type="date" value={stormDate} onChange={e => setStormDate(e.target.value)}
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Storm Label</label>
              <input value={stormLabel} onChange={e => setStormLabel(e.target.value)}
                placeholder="e.g. April 2 DFW Hail"
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Max per zip</label>
              <input type="number" value={maxPerZip} onChange={e => setMaxPerZip(Number(e.target.value))}
                min={100} max={10000} step={100}
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm" />
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
              <input type="checkbox" checked={ownerOnly} onChange={e => setOwnerOnly(e.target.checked)} className="w-4 h-4 accent-yellow-400" />
              Owner-occupied only
            </label>

            {selected.size > 0 && (
              <div className="bg-gray-800 rounded-xl p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Zip codes</span>
                  <span className="text-white font-semibold">{selected.size}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">~Records</span>
                  <span className="text-white font-semibold">{estRecords.toLocaleString()}</span>
                </div>
                <div className="flex justify-between border-t border-gray-700 pt-2">
                  <span className="text-gray-400">Skip-trace cost</span>
                  <span className="text-yellow-400 font-semibold">${skipCost}</span>
                </div>
                <p className="text-xs text-gray-600">If you skip-trace all @ $0.15/ea</p>
              </div>
            )}

            <button onClick={generate} disabled={!selected.size || generating}
              className="w-full py-3 bg-red-700 hover:bg-red-600 text-white font-bold rounded-xl disabled:opacity-40 flex items-center justify-center gap-2 transition-colors">
              {generating
                ? <><RefreshCw className="w-4 h-4 animate-spin" /> Generating...</>
                : <><Zap className="w-4 h-4" /> Generate {selected.size > 0 ? `${selected.size} zip${selected.size>1?'s':''}` : 'Prospects'}</>}
            </button>

            {result && (
              <div className={"rounded-xl p-4 text-sm " + (result.error ? "bg-red-900/30 text-red-300" : "bg-green-900/30 text-green-300")}>
                {result.error ? result.error : <>
                  <p className="font-bold">Done!</p>
                  <p>{result.inserted?.toLocaleString()} prospects created</p>
                  <p className="opacity-70">{result.skipped?.toLocaleString()} already existed</p>
                  <a href="/admin/storm" className="text-blue-400 underline text-xs mt-2 block">View Storm Dashboard →</a>
                </>}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
