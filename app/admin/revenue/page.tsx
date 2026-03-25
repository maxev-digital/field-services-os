'use client';

import { useEffect, useState } from 'react';
import { DollarSign, TrendingUp, RefreshCw } from 'lucide-react';

interface Revenue {
  allTime:    { revenue: number; insurance: number; savings: number; count: number };
  thisMonth:  { revenue: number; count: number };
  thisYear:   { revenue: number; count: number };
  pipeline:   { value: number; count: number };
  byStatus:   { status: string; our_total: number; ins_total: number; count: number }[];
  recentPaid: { id: string; address: string; our_total: number; updated_at: string; customer: { name: string } }[];
}

function fmt(n: number) {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft', SENT: 'Sent', APPROVED: 'Approved',
  DECLINED: 'Declined', INVOICED: 'Invoiced', PAID: 'Paid',
};

const STATUS_COLORS: Record<string, string> = {
  PAID: 'text-emerald-400', INVOICED: 'text-teal-400', APPROVED: 'text-green-400',
  SENT: 'text-blue-400', DRAFT: 'text-gray-400', DECLINED: 'text-red-400',
};

export default function RevenuePage() {
  const [data, setData]             = useState<Revenue | null>(null);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const res = await fetch('/api/admin/revenue');
      setData(await res.json());
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { load(); }, []);

  if (loading) return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-red-600" />
    </div>
  );

  const d = data!;
  const savingsPct = d.allTime.insurance > 0 ? ((d.allTime.savings / d.allTime.insurance) * 100).toFixed(1) : '0';

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-red-700 rounded-xl"><DollarSign className="w-5 h-5 text-white" /></div>
          <div>
            <h1 className="text-xl font-black text-white tracking-tight leading-none">Revenue</h1>
            <p className="text-gray-500 text-xs mt-0.5">Financial overview &middot; approved &amp; closed estimates</p>
          </div>
        </div>
        <button onClick={() => { setRefreshing(true); load(); }} disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 bg-gray-800 border border-gray-700 hover:bg-gray-700 text-gray-300 rounded-xl text-sm font-medium disabled:opacity-50 transition-colors">
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'All-Time Revenue', value: fmt(d.allTime.revenue),   sub: `${d.allTime.count} jobs`,       accent: 'bg-red-500',     vc: 'text-white' },
          { label: 'This Month',        value: fmt(d.thisMonth.revenue), sub: `${d.thisMonth.count} jobs`,     accent: 'bg-emerald-500', vc: 'text-emerald-400' },
          { label: 'This Year',         value: fmt(d.thisYear.revenue),  sub: `${d.thisYear.count} jobs`,      accent: 'bg-blue-500',    vc: 'text-blue-400' },
          { label: 'Pipeline (Open)',   value: fmt(d.pipeline.value),    sub: `${d.pipeline.count} estimates`, accent: 'bg-yellow-500',  vc: 'text-yellow-400' },
        ].map(({ label, value, sub, accent, vc }) => (
          <div key={label} className="relative bg-gray-800 border border-gray-700 rounded-2xl p-5 overflow-hidden">
            <div className={`absolute top-0 left-0 right-0 h-0.5 ${accent}`} />
            <div className="inline-flex p-2.5 rounded-xl bg-gray-700 mb-3">
              <DollarSign className="w-4 h-4 text-gray-400" />
            </div>
            <div className={`text-2xl font-black tracking-tight ${vc}`}>{value}</div>
            <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">{label}</div>
            <div className="text-xs text-gray-600 mt-0.5">{sub}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Insurance vs Our Total */}
        <div className="bg-gray-800 border border-gray-700 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-5">
            <TrendingUp className="w-4 h-4 text-red-500" />
            <h2 className="text-sm font-bold text-gray-200">Insurance vs Our Total</h2>
            <span className="text-xs text-gray-500 ml-auto">All time &middot; saving {savingsPct}%</span>
          </div>
          <div className="space-y-5">
            {[
              { label: 'Insurance Estimate', value: fmt(d.allTime.insurance), pct: 100,       color: 'bg-purple-600', vc: 'text-purple-400' },
              { label: 'Our Total',          value: fmt(d.allTime.revenue),   pct: d.allTime.insurance > 0 ? (d.allTime.revenue / d.allTime.insurance) * 100 : 0, color: 'bg-red-600', vc: 'text-white font-bold' },
              { label: 'Customer Savings',   value: fmt(d.allTime.savings),   pct: d.allTime.insurance > 0 ? (d.allTime.savings / d.allTime.insurance) * 100 : 0, color: 'bg-emerald-600', vc: 'text-emerald-400' },
            ].map(({ label, value, pct, color, vc }) => (
              <div key={label}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-400">{label}</span>
                  <span className={`text-sm font-mono ${vc}`}>{value}</span>
                </div>
                <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* By Status */}
        <div className="bg-gray-800 border border-gray-700 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-5">
            <DollarSign className="w-4 h-4 text-red-500" />
            <h2 className="text-sm font-bold text-gray-200">Revenue by Status</h2>
          </div>
          <div className="space-y-1">
            {d.byStatus.sort((a, b) => b.our_total - a.our_total).map(({ status, our_total, count }) => (
              <div key={status} className="flex items-center justify-between py-2.5 border-b border-gray-700/50 last:border-0">
                <div className="flex items-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full ${STATUS_COLORS[status]?.replace('text-', 'bg-') || 'bg-gray-500'}`} />
                  <span className="text-sm text-gray-300">{STATUS_LABELS[status] || status}</span>
                  <span className="text-xs text-gray-600">({count})</span>
                </div>
                <span className={`font-mono font-bold text-sm ${STATUS_COLORS[status] || 'text-white'}`}>{fmt(our_total)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent jobs */}
      {d.recentPaid.length > 0 && (
        <div className="bg-gray-800 border border-gray-700 rounded-2xl overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-700">
            <TrendingUp className="w-4 h-4 text-red-500" />
            <h2 className="text-sm font-bold text-gray-200">Recent Approved / Paid Jobs</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700 text-left">
                <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Customer</th>
                <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Address</th>
                <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Our Total</th>
                <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
              </tr>
            </thead>
            <tbody>
              {d.recentPaid.map(e => (
                <tr key={e.id} onClick={() => window.location.href = `/admin/estimates/${e.id}`}
                  className="border-b border-gray-700/50 hover:bg-gray-700/30 cursor-pointer transition-colors">
                  <td className="px-5 py-3 font-medium text-white">{e.customer.name}</td>
                  <td className="px-5 py-3 text-gray-400 text-xs truncate max-w-48">{e.address}</td>
                  <td className="px-5 py-3 text-right font-mono font-bold text-emerald-400">{fmt(e.our_total)}</td>
                  <td className="px-5 py-3 text-gray-500 text-xs">{fmtDate(e.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
