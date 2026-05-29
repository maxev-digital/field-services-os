'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { MapPin, Users, Home, ChevronLeft, RefreshCw, Download, AlertCircle } from 'lucide-react';

interface Parcel {
  prop_address: string;
  prop_city: string;
  prop_zip: string;
  owner_name: string | null;
  total_value: number | null;
  year_built: number | null;
  living_sqft: number | null;
  is_owner_occupied: boolean | null;
  distance_miles: number;
}

interface CanvassData {
  job: { id: string; address: string; customer?: string };
  center: { lat: number; lon: number } | null;
  radius: number;
  parcels: Parcel[];
  total: number;
  error?: string;
}

const fmt$ = (n: number | null) => n ? `$${Number(n).toLocaleString()}` : '—';

export default function JobCanvassPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<CanvassData | null>(null);
  const [loading, setLoading] = useState(true);
  const [radius, setRadius] = useState(0.25);

  async function load(r = radius) {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/jobs/${id}/canvass?radius=${r}&limit=150`);
      setData(await res.json());
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  function exportCSV() {
    if (!data?.parcels.length) return;
    const rows = [
      ['Address', 'City', 'Zip', 'Owner', 'Home Value', 'Year Built', 'Sq Ft', 'Owner-Occupied', 'Distance (mi)'],
      ...data.parcels.map(p => [
        p.prop_address, p.prop_city, p.prop_zip,
        p.owner_name || '', fmt$(p.total_value), p.year_built || '', p.living_sqft || '',
        p.is_owner_occupied ? 'Yes' : 'No', p.distance_miles,
      ]),
    ];
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `canvass-${data.job.address.replace(/[^a-z0-9]/gi, '-').slice(0,40)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-5">
        <Link href={`/admin/jobs/${id}`} className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-white mb-3 transition-colors">
          <ChevronLeft className="w-3.5 h-3.5" /> Back to Job
        </Link>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-orange-700 rounded-xl"><MapPin className="w-5 h-5 text-white" /></div>
            <div>
              <h1 className="text-2xl font-bold text-white">Neighborhood Canvass</h1>
              <p className="text-sm text-gray-400">{data?.job.address || 'Loading...'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select value={radius} onChange={e => { const r = parseFloat(e.target.value); setRadius(r); load(r); }}
              className="bg-gray-800 border border-gray-600 text-white rounded-lg px-3 py-2 text-sm">
              <option value={0.1}>0.1 mi — immediate block</option>
              <option value={0.25}>0.25 mi — neighborhood</option>
              <option value={0.5}>0.5 mi — wider area</option>
              <option value={1.0}>1.0 mi — full zone</option>
            </select>
            <button onClick={() => load()} className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-gray-700 transition-colors">
              <RefreshCw className="w-4 h-4" />
            </button>
            {data?.total > 0 && (
              <button onClick={exportCSV}
                className="flex items-center gap-1.5 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded-lg transition-colors">
                <Download className="w-4 h-4" /> CSV
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Stats */}
      {data && !loading && (
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-white">{data.total}</div>
            <div className="text-xs text-gray-500 mt-1">Homes in Radius</div>
          </div>
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-green-400">
              {data.parcels.filter(p => p.is_owner_occupied).length}
            </div>
            <div className="text-xs text-gray-500 mt-1">Owner-Occupied</div>
          </div>
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-blue-400">
              {data.parcels.filter(p => p.total_value && Number(p.total_value) > 200000).length}
            </div>
            <div className="text-xs text-gray-500 mt-1">$200k+ Value</div>
          </div>
        </div>
      )}

      {data?.error && (
        <div className="flex items-center gap-2 bg-amber-900/30 border border-amber-700 text-amber-300 rounded-xl px-4 py-3 text-sm mb-4">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {data.error}
          <span className="text-amber-500">— Job address must match a parcel or storm prospect record.</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="w-6 h-6 animate-spin text-gray-500" />
        </div>
      ) : data?.parcels.length === 0 ? (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-12 text-center">
          <Home className="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400">No properties found within {radius} miles</p>
          <p className="text-gray-600 text-sm mt-1">Try expanding the radius or ensure the job address matches the property database.</p>
        </div>
      ) : (
        <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-700 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-orange-400" />
              Door-Knock List — {data.total} homes within {radius} mi
            </h2>
            <span className="text-xs text-gray-500">Sorted by distance</span>
          </div>
          <div className="divide-y divide-gray-700">
            {data.parcels.map((p, i) => (
              <div key={i} className="px-5 py-3 flex items-center justify-between gap-4 hover:bg-gray-700/30 transition-colors">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-6 h-6 rounded-full bg-gray-700 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-[10px] text-gray-400 font-bold">{i + 1}</span>
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-white truncate">{p.prop_address}</div>
                    <div className="text-xs text-gray-500">{p.prop_city}, TX {p.prop_zip}</div>
                    {p.owner_name && <div className="text-xs text-gray-400 mt-0.5">{p.owner_name}</div>}
                  </div>
                </div>
                <div className="flex items-center gap-4 flex-shrink-0 text-right">
                  <div>
                    <div className="text-sm font-semibold text-white">{fmt$(p.total_value)}</div>
                    <div className="text-xs text-gray-500">{p.year_built ? `Built ${p.year_built}` : '—'}</div>
                  </div>
                  <div>
                    {p.is_owner_occupied && (
                      <span className="inline-block px-2 py-0.5 bg-green-900/40 border border-green-700 text-green-400 text-[10px] font-bold rounded-full mb-1">
                        Owner-Occ
                      </span>
                    )}
                    <div className="text-xs text-gray-500">{Number(p.distance_miles).toFixed(2)} mi</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
