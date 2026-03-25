'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Users, Download, Plus, Filter, Home, Calendar, ArrowLeft, RefreshCw, UserCheck, Building } from 'lucide-react';

interface Property {
  id: number;
  apn: string;
  source: string;
  owner: string | null;
  ownerMailAddress: string | null;
  address: string | null;
  city: string | null;
  zip: string | null;
  yearBuilt: number | null;
  sqft: number | null;
  roofType: string | null;
  value: number | null;
  lat: number | null;
  lon: number | null;
  isLikelyRental: boolean;
  isExistingCustomer: boolean;
  customerId: string | null;
  customerName: string | null;
}

function fmtCurrency(v: number | null) {
  if (!v) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);
}

function CanvassContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const date = searchParams.get('date') || '';
  const county = searchParams.get('county') || '';

  const [properties, setProperties] = useState<Property[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [dbStatus, setDbStatus] = useState<{ sources: { cad_source: string; count: string }[] } | null>(null);

  // Filters
  const [excludeRentals, setExcludeRentals] = useState(false);
  const [excludeExisting, setExcludeExisting] = useState(false);
  const [minYear, setMinYear] = useState('');
  const [selectedDate, setSelectedDate] = useState(date);

  // Selection
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [addingProspects, setAddingProspects] = useState(false);

  useEffect(() => {
    // Check DB status
    fetch('/api/admin/storm/properties')
      .then(r => r.json())
      .then(d => setDbStatus(d))
      .catch(() => {});
  }, []);

  const fetchProperties = useCallback(async (polygon?: any) => {
    if (!polygon) return;
    setLoading(true);
    setSelected(new Set());
    try {
      const res = await fetch('/api/admin/storm/properties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          polygon,
          excludeRentals,
          excludeExisting,
          minYearBuilt: minYear ? parseInt(minYear) : undefined,
          limit: 500,
        }),
      });
      const data = await res.json();
      setProperties(data.properties || []);
      setTotal(data.total || 0);
      if (data.message) setMessage(data.message);
    } finally {
      setLoading(false);
    }
  }, [excludeRentals, excludeExisting, minYear]);

  // Load swath polygon for the county+date, then fetch properties
  const loadForDate = useCallback(async () => {
    if (!selectedDate) return;
    setLoading(true);
    try {
      const swathRes = await fetch(`/api/admin/storm/swath?date=${selectedDate.replace(/-/g, '')}`);
      const swath = await swathRes.json();
      if (!swath.features || swath.features.length === 0) {
        setMessage(`No hail swath data found for ${selectedDate}. Try a different date.`);
        setProperties([]);
        setLoading(false);
        return;
      }
      // Use the most severe polygon (first = highest threshold)
      const poly = swath.features[0].geometry;
      await fetchProperties(poly);
    } catch (e) {
      setMessage('Failed to load swath data.');
      setLoading(false);
    }
  }, [selectedDate, fetchProperties]);

  useEffect(() => {
    if (selectedDate) loadForDate();
  }, []);

  const toggleSelect = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(properties.map(p => p.id)));
  const clearAll = () => setSelected(new Set());

  const exportCsv = () => {
    const rows = properties.filter(p => selected.size === 0 || selected.has(p.id));
    const headers = ['Owner', 'Address', 'City', 'Zip', 'Year Built', 'Sq Ft', 'Roof Type', 'Value', 'Owner Mail', 'Likely Rental', 'Existing Customer'];
    const csv = [
      headers.join(','),
      ...rows.map(p => [
        `"${p.owner || ''}"`,
        `"${p.address || ''}"`,
        `"${p.city || ''}"`,
        `"${p.zip || ''}"`,
        p.yearBuilt || '',
        p.sqft || '',
        `"${p.roofType || ''}"`,
        p.value || '',
        `"${p.ownerMailAddress || ''}"`,
        p.isLikelyRental ? 'Yes' : 'No',
        p.isExistingCustomer ? 'Yes' : 'No',
      ].join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `storm-leads-${selectedDate || 'today'}.csv`;
    a.click();
  };

  const addToProspects = async () => {
    const rows = properties.filter(p => selected.has(p.id));
    if (rows.length === 0) return;
    setAddingProspects(true);
    try {
      for (const p of rows) {
        await fetch('/api/admin/prospects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: p.owner || '',
            address: p.address || '',
            city: p.city || '',
            zip: p.zip || '',
            source: `storm_${selectedDate}`,
            damage_type: 'hail',
            notes: `Year built: ${p.yearBuilt || 'unknown'} | Sq ft: ${p.sqft || 'unknown'} | Roof: ${p.roofType || 'unknown'} | Value: ${fmtCurrency(p.value)}`,
          }),
        });
      }
      alert(`Added ${rows.length} properties to Storm Prospects.`);
      clearAll();
    } finally {
      setAddingProspects(false);
    }
  };

  const totalParcels = dbStatus?.sources?.reduce((s, r) => s + parseInt(r.count), 0) ?? 0;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/admin/storm')}
            className="p-1.5 bg-gray-800 hover:bg-gray-700 rounded transition-colors">
            <ArrowLeft className="w-4 h-4 text-gray-400" />
          </button>
          <div className="p-2 bg-yellow-700 rounded">
            <Users className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Storm Canvassing</h1>
            <p className="text-sm text-gray-400">
              CAD property data · {totalParcels > 0 ? `${totalParcels.toLocaleString()} parcels loaded` : 'Property DB not loaded yet'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <>
              <button onClick={addToProspects} disabled={addingProspects}
                className="flex items-center gap-1.5 px-3 py-2 bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white text-sm font-medium rounded transition-colors">
                <Plus className="w-4 h-4" />
                {addingProspects ? 'Adding...' : `Add ${selected.size} to Prospects`}
              </button>
              <button onClick={exportCsv}
                className="flex items-center gap-1.5 px-3 py-2 bg-blue-700 hover:bg-blue-600 text-white text-sm font-medium rounded transition-colors">
                <Download className="w-4 h-4" />
                Export {selected.size} CSV
              </button>
            </>
          )}
          {properties.length > 0 && selected.size === 0 && (
            <button onClick={exportCsv}
              className="flex items-center gap-1.5 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded transition-colors">
              <Download className="w-4 h-4" />
              Export All CSV
            </button>
          )}
        </div>
      </div>

      {/* DB Status */}
      {dbStatus && totalParcels === 0 && (
        <div className="mb-6 bg-yellow-900/30 border border-yellow-700 rounded-lg p-4">
          <div className="font-semibold text-yellow-400 text-sm mb-1">Property Database Not Loaded</div>
          <p className="text-yellow-200/70 text-xs">
            Run the CAD ingestion script to load Tarrant, Dallas, Collin, and Denton county property records.
            Once loaded, you can query thousands of properties within any storm swath.
          </p>
          <code className="block mt-2 text-xs bg-black/30 rounded p-2 text-green-400">
            cd /var/www/roof-works-admin && python python-services/cad/ingest_cad.py --cad tad
          </code>
        </div>
      )}
      {dbStatus && totalParcels > 0 && (
        <div className="mb-4 flex gap-3">
          {dbStatus.sources.map(s => (
            <div key={s.cad_source} className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-xs">
              <span className="text-gray-400 uppercase">{s.cad_source}</span>
              <span className="text-white font-bold ml-2">{parseInt(s.count).toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}

      {/* Search controls */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1 font-medium">Storm Date</label>
            <div className="flex gap-2">
              <input
                type="date"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                className="flex-1 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1 font-medium">Min Year Built</label>
            <input
              type="number"
              value={minYear}
              onChange={e => setMinYear(e.target.value)}
              placeholder="e.g. 2000"
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-500"
            />
          </div>
          <div className="flex flex-col justify-end gap-2">
            <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
              <input type="checkbox" checked={excludeRentals} onChange={e => setExcludeRentals(e.target.checked)}
                className="rounded" />
              Exclude likely rentals
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
              <input type="checkbox" checked={excludeExisting} onChange={e => setExcludeExisting(e.target.checked)}
                className="rounded" />
              Exclude existing customers
            </label>
          </div>
          <div className="flex items-end">
            <button
              onClick={loadForDate}
              disabled={loading || !selectedDate}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-yellow-600 hover:bg-yellow-500 disabled:opacity-50 text-white text-sm font-medium rounded transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'Loading...' : 'Load Properties'}
            </button>
          </div>
        </div>
      </div>

      {/* Results */}
      {message && (
        <div className="mb-4 bg-blue-900/30 border border-blue-700 rounded-lg p-3 text-blue-300 text-sm">
          {message}
        </div>
      )}

      {properties.length > 0 && (
        <>
          {/* Results header */}
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm text-gray-400">
              Showing <span className="text-white font-semibold">{properties.length}</span> of{' '}
              <span className="text-white font-semibold">{total.toLocaleString()}</span> properties in storm swath
              {selected.size > 0 && <span className="text-yellow-400 ml-2">· {selected.size} selected</span>}
            </div>
            <div className="flex gap-2">
              <button onClick={selectAll} className="text-xs text-blue-400 hover:text-blue-300">Select all</button>
              <span className="text-gray-600">·</span>
              <button onClick={clearAll} className="text-xs text-gray-400 hover:text-gray-300">Clear</button>
            </div>
          </div>

          {/* Table */}
          <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700 text-left">
                  <th className="px-3 py-3 w-8">
                    <input type="checkbox"
                      checked={selected.size === properties.length && properties.length > 0}
                      onChange={e => e.target.checked ? selectAll() : clearAll()}
                      className="rounded"
                    />
                  </th>
                  <th className="px-3 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Owner</th>
                  <th className="px-3 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Property Address</th>
                  <th className="px-3 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider text-center">Year</th>
                  <th className="px-3 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider text-center">Sq Ft</th>
                  <th className="px-3 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Roof</th>
                  <th className="px-3 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider text-right">Value</th>
                  <th className="px-3 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Flags</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {properties.map(p => (
                  <tr key={p.id}
                    className={`hover:bg-gray-750 transition-colors cursor-pointer ${selected.has(p.id) ? 'bg-yellow-900/20' : ''}`}
                    onClick={() => toggleSelect(p.id)}
                  >
                    <td className="px-3 py-2.5">
                      <input type="checkbox" checked={selected.has(p.id)} onChange={() => {}}
                        onClick={e => e.stopPropagation()} className="rounded" />
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="text-white font-medium text-xs">{p.owner || '—'}</div>
                      {p.ownerMailAddress && p.isLikelyRental && (
                        <div className="text-gray-500 text-xs truncate max-w-[180px]">{p.ownerMailAddress}</div>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="text-gray-200 text-xs">{p.address}</div>
                      <div className="text-gray-500 text-xs">{p.city}, TX {p.zip}</div>
                    </td>
                    <td className="px-3 py-2.5 text-center text-gray-300 text-xs">{p.yearBuilt || '—'}</td>
                    <td className="px-3 py-2.5 text-center text-gray-300 text-xs">{p.sqft?.toLocaleString() || '—'}</td>
                    <td className="px-3 py-2.5 text-gray-300 text-xs">{p.roofType || '—'}</td>
                    <td className="px-3 py-2.5 text-right text-gray-300 text-xs">{fmtCurrency(p.value)}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1 flex-wrap">
                        {p.isLikelyRental && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs bg-blue-900/50 text-blue-300 border border-blue-700">
                            <Building className="w-2.5 h-2.5" /> Rental
                          </span>
                        )}
                        {p.isExistingCustomer && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs bg-green-900/50 text-green-300 border border-green-700">
                            <UserCheck className="w-2.5 h-2.5" /> Customer
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {total > 500 && (
            <p className="text-xs text-gray-500 text-center mt-3">
              Showing first 500 of {total.toLocaleString()} properties. Use filters or export CSV to see all.
            </p>
          )}
        </>
      )}

      {!loading && properties.length === 0 && !message && (
        <div className="text-center py-16 bg-gray-800 rounded-lg border border-gray-700">
          <Home className="w-10 h-10 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400 font-medium">Select a date and click Load Properties</p>
          <p className="text-gray-500 text-sm mt-1">
            Properties within the NEXRAD hail swath will appear here.
          </p>
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
