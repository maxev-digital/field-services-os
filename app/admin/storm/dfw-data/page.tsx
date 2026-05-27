"use client";
import { useEffect, useState, useRef } from "react";
import { Database, Upload, RefreshCw, AlertCircle, CheckCircle2 } from "lucide-react";

const COUNTIES = [
  { id: 'tarrant', label: 'Tarrant County',  cities: 'Fort Worth, Arlington, Mansfield, Euless, Bedford, Hurst, Colleyville, Grapevine, Southlake, Keller, NRH',
    url: 'https://www.tad.org/data-downloads/', note: 'Download "Real Property" CSV export' },
  { id: 'collin',  label: 'Collin County',   cities: 'Plano, McKinney, Allen, Frisco, Wylie, Murphy, Sachse, Prosper, Celina',
    url: 'https://www.collincad.org/downloads', note: 'Download residential property export' },
  { id: 'denton',  label: 'Denton County',   cities: 'Denton, Lewisville, The Colony, Flower Mound, Highland Village, Little Elm, Argyle',
    url: 'https://www.dentoncad.com/data-download', note: 'Download parcel data CSV' },
  { id: 'rockwall',label: 'Rockwall County', cities: 'Rockwall, Royse City, Heath, Rowlett (part)',
    url: 'https://www.rockwallcad.com/', note: 'Request bulk data export' },
  { id: 'ellis',   label: 'Ellis County',    cities: 'Waxahachie, Midlothian, Ennis, Ferris, Red Oak',
    url: 'https://www.elliscad.com/', note: 'Request bulk data export' },
  { id: 'johnson', label: 'Johnson County',  cities: 'Burleson, Cleburne, Crowley (part), Alvarado',
    url: 'https://johnsoncad.com/', note: 'Request bulk data export' },
];

interface CountyStat { county: string; total: number; owner_occ: number; zip_count: number; }

export default function DfwDataPage() {
  const [stats,        setStats]        = useState<{ byCounty: CountyStat[]; totals: any } | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [importing,    setImporting]    = useState<string | null>(null);
  const [importResult, setImportResult] = useState<any>(null);
  const [resOnly,      setResOnly]      = useState(true);
  const [selCounty,    setSelCounty]    = useState('tarrant');
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch('/api/admin/storm/dfw-data');
      setStats(await r.json());
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function handleImport(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setImporting(selCounty); setImportResult(null);
    const fd = new FormData();
    fd.append('file', file); fd.append('county', selCounty); fd.append('residentialOnly', String(resOnly));
    try {
      const r = await fetch('/api/admin/storm/dfw-import', { method: 'POST', body: fd });
      const d = await r.json();
      setImportResult(d);
      if (d.ok) { load(); if (fileRef.current) fileRef.current.value = ''; }
    } catch (e: any) { setImportResult({ error: e.message }); }
    finally { setImporting(null); }
  }

  const loaded = new Set(stats?.byCounty.map(c => c.county) ?? []);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-blue-900 rounded-xl"><Database className="w-6 h-6 text-blue-300" /></div>
          <div>
            <h1 className="text-2xl font-bold text-white">DFW Property Database</h1>
            <p className="text-sm text-gray-400">Free public CAD data — foundation for storm targeting</p>
          </div>
        </div>
        <button onClick={load} className="flex items-center gap-2 text-sm text-gray-400 hover:text-white border border-gray-700 rounded-lg px-3 py-2">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Total Parcels',   value: stats.totals.total_parcels?.toLocaleString() ?? '–' },
            { label: 'Owner-Occupied',  value: stats.totals.owner_occ?.toLocaleString()     ?? '–' },
            { label: 'Zip Codes',       value: stats.totals.zip_count?.toLocaleString()     ?? '–' },
            { label: 'Counties Loaded', value: stats.totals.county_count?.toLocaleString()  ?? '–' },
          ].map(s => (
            <div key={s.label} className="bg-gray-900 rounded-xl p-4">
              <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">{s.label}</div>
              <div className="text-2xl font-bold text-white">{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {stats?.byCounty && stats.byCounty.length > 0 && (
        <div className="bg-gray-900 rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Loaded Counties</h2>
          <div className="space-y-2">
            {stats.byCounty.map(c => (
              <div key={c.county} className="flex items-center justify-between bg-gray-800 rounded-lg px-4 py-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                  <span className="font-medium text-white capitalize">{c.county} County</span>
                </div>
                <div className="flex gap-6 text-sm text-gray-400">
                  <span><span className="text-white font-semibold">{c.total.toLocaleString()}</span> parcels</span>
                  <span><span className="text-white font-semibold">{c.owner_occ.toLocaleString()}</span> owner-occ</span>
                  <span><span className="text-white font-semibold">{c.zip_count}</span> zips</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-gray-900 rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">County Coverage</h2>
        <div className="space-y-2 mb-6">
          {COUNTIES.map(c => (
            <div key={c.id} className={"rounded-xl border p-4 " + (loaded.has(c.id) ? "border-green-800 opacity-70" : "border-gray-700 bg-gray-800")}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-2">
                  {loaded.has(c.id) ? <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 text-yellow-500 flex-shrink-0" />}
                  <div>
                    <p className="font-semibold text-white text-sm">{c.label}</p>
                    <p className="text-xs text-gray-500">{c.cities}</p>
                  </div>
                </div>
                {!loaded.has(c.id) && (
                  <div className="text-right flex-shrink-0">
                    <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:text-blue-300 underline block">Download ↗</a>
                    <p className="text-xs text-gray-600 mt-0.5">{c.note}</p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <form onSubmit={handleImport} className="border border-gray-700 rounded-xl p-4 space-y-3">
          <h3 className="font-semibold text-white text-sm flex items-center gap-2"><Upload className="w-4 h-4" /> Upload CAD Export CSV</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">County</label>
              <select value={selCounty} onChange={e => setSelCounty(e.target.value)}
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm">
                {COUNTIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                <input type="checkbox" checked={resOnly} onChange={e => setResOnly(e.target.checked)} className="w-4 h-4 accent-yellow-400" />
                Residential only
              </label>
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">CSV File</label>
            <input ref={fileRef} type="file" accept=".csv,.txt"
              className="w-full text-sm text-gray-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-yellow-500 file:text-black file:font-semibold cursor-pointer" />
          </div>
          <button type="submit" disabled={!!importing}
            className="px-4 py-2 bg-yellow-500 hover:bg-yellow-400 text-black font-semibold rounded-lg text-sm disabled:opacity-50 flex items-center gap-2">
            {importing ? <><RefreshCw className="w-4 h-4 animate-spin" /> Importing {importing}...</> : 'Import County Data'}
          </button>
          {importResult && (
            <div className={"rounded-lg p-3 text-sm " + (importResult.error ? "bg-red-900/30 text-red-300" : "bg-green-900/30 text-green-300")}>
              {importResult.error ? importResult.error
                : `✓ ${importResult.inserted?.toLocaleString()} imported · ${importResult.skipped?.toLocaleString()} skipped · ${importResult.errors ?? 0} errors`}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
