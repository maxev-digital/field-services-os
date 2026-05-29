'use client';

import { useEffect, useState } from 'react';
import { TrendingDown, Phone, Users, Calendar, FileText, PenLine, DollarSign, RefreshCw } from 'lucide-react';

interface FunnelStage {
  label: string;
  value: number;
  rate: number | null;
  color: string;
}

interface FunnelData {
  range: string;
  funnel: FunnelStage[];
  recentLeads: { name: string; phone: string; status: string; created_at: string }[];
  weeklyChart: { week: string; dialed: number; leads: number }[];
}

const ICONS = [Phone, TrendingDown, Calendar, FileText, PenLine, DollarSign];
const RANGE_OPTIONS = [
  { label: '7 days',  value: '7d' },
  { label: '30 days', value: '30d' },
  { label: '90 days', value: '90d' },
];

export default function FunnelPage() {
  const [data, setData]       = useState<FunnelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange]     = useState('30d');
  const [refreshing, setRefreshing] = useState(false);

  const load = async (r = range) => {
    try {
      const res = await fetch(`/api/admin/funnel?range=${r}`);
      setData(await res.json());
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { load(); }, []);

  const changeRange = (r: string) => {
    setRange(r);
    setRefreshing(true);
    load(r);
  };

  if (loading) return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-red-600" />
    </div>
  );

  const f = data!.funnel;
  const maxVal = Math.max(...f.map(s => s.value), 1);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <TrendingDown className="h-7 w-7 text-red-500" />
            Lead Funnel
          </h1>
          <p className="text-gray-400 mt-1 text-sm">Calls dialed through paid jobs</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-gray-800 rounded-lg p-1 gap-1">
            {RANGE_OPTIONS.map(o => (
              <button
                key={o.value}
                onClick={() => changeRange(o.value)}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  range === o.value ? 'bg-red-600 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >{o.label}</button>
            ))}
          </div>
          <button
            onClick={() => { setRefreshing(true); load(); }}
            className="p-2 text-gray-400 hover:text-white transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Funnel stages */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden mb-8">
        {f.map((stage, i) => {
          const Icon = ICONS[i] || DollarSign;
          const barWidth = maxVal > 0 ? `${(stage.value / maxVal) * 100}%` : '0%';
          return (
            <div key={stage.label} className="relative px-6 py-5 border-b border-gray-700 last:border-0">
              {/* Bar background */}
              <div
                className="absolute left-0 top-0 h-full opacity-10 transition-all duration-700"
                style={{ width: barWidth, backgroundColor: stage.color }}
              />
              <div className="relative flex items-center gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center"
                     style={{ backgroundColor: stage.color + '20', border: `1px solid ${stage.color}40` }}>
                  <Icon className="h-5 w-5" style={{ color: stage.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-white font-medium">{stage.label}</span>
                    <span className="text-2xl font-bold text-white tabular-nums ml-4">{stage.value.toLocaleString()}</span>
                  </div>
                  {stage.rate !== null && (
                    <div className="flex items-center gap-2 mt-0.5">
                      <div className="text-xs text-gray-400">
                        Conversion from previous stage:
                        <span className="ml-1 font-semibold" style={{ color: stage.color }}>
                          {stage.rate}%
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              {/* Connector arrow */}
              {i < f.length - 1 && (
                <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 z-10 text-gray-600 text-xs">
                  &#8595;
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Summary conversion metrics */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
        {[
          { label: 'Dial → Lead',         a: f[1]?.value, b: f[0]?.value },
          { label: 'Lead → Appointment',  a: f[2]?.value, b: f[1]?.value },
          { label: 'Appointment → Estimate', a: f[3]?.value, b: f[2]?.value || f[1]?.value },
          { label: 'Estimate → Signed',   a: f[4]?.value, b: f[3]?.value },
          { label: 'Signed → Paid',       a: f[5]?.value, b: f[4]?.value || f[3]?.value },
          { label: 'Dial → Paid (Overall)', a: f[5]?.value, b: f[0]?.value },
        ].map(m => {
          const rate = m.b > 0 ? ((m.a / m.b) * 100).toFixed(1) : '—';
          return (
            <div key={m.label} className="bg-gray-800 rounded-lg p-4 border border-gray-700">
              <div className="text-gray-400 text-xs mb-1">{m.label}</div>
              <div className="text-xl font-bold text-white">{rate}{typeof rate === 'string' && rate !== '—' ? '%' : ''}</div>
            </div>
          );
        })}
      </div>

      {/* Recent leads */}
      {data!.recentLeads.length > 0 && (
        <div className="bg-gray-800 rounded-xl border border-gray-700">
          <div className="px-6 py-4 border-b border-gray-700">
            <h2 className="text-white font-semibold">Recent IVR Leads</h2>
          </div>
          <div className="divide-y divide-gray-700">
            {data!.recentLeads.map((lead, i) => (
              <div key={i} className="px-6 py-3 flex items-center justify-between">
                <div>
                  <div className="text-white text-sm font-medium">{lead.name || 'Unknown'}</div>
                  <div className="text-gray-400 text-xs">{lead.phone}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    lead.status === 'APPOINTMENT_SET' ? 'bg-purple-900 text-purple-300' :
                    lead.status === 'CONVERTED'       ? 'bg-green-900 text-green-300' :
                    lead.status === 'INTERESTED'      ? 'bg-blue-900 text-blue-300' :
                    'bg-gray-700 text-gray-300'
                  }`}>{lead.status}</span>
                  <span className="text-gray-500 text-xs">
                    {new Date(lead.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
