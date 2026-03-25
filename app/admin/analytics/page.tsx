'use client';

import { useEffect, useState } from 'react';
import { BarChart2, TrendingUp, Users, Briefcase, ShieldCheck, FileText, RefreshCw } from 'lucide-react';

interface Analytics {
  estimates:          { total: number; last30d: number };
  jobs:               { total: number; active: number; completed: number };
  customers:          { total: number; last30d: number };
  claims:             { total: number; approved: number };
  weeklyChart:        { week: string; count: number; our_total: number; ins_total: number }[];
  jobStatusBreakdown: { status: string; count: number }[];
}

const JOB_COLORS: Record<string, string> = {
  LEAD:               'bg-gray-500',
  ESTIMATE_SENT:      'bg-blue-500',
  INSURANCE_APPROVED: 'bg-purple-500',
  SCHEDULED:          'bg-yellow-500',
  IN_PROGRESS:        'bg-orange-500',
  COMPLETE:           'bg-green-500',
  INVOICED:           'bg-teal-500',
  PAID:               'bg-emerald-500',
};

const JOB_LABELS: Record<string, string> = {
  LEAD:               'Lead',
  ESTIMATE_SENT:      'Estimate Sent',
  INSURANCE_APPROVED: 'Ins. Approved',
  SCHEDULED:          'Scheduled',
  IN_PROGRESS:        'In Progress',
  COMPLETE:           'Complete',
  INVOICED:           'Invoiced',
  PAID:               'Paid',
};

function fmtK(n: number) { return `$${(n / 1000).toFixed(1)}k`; }

export default function AnalyticsPage() {
  const [data, setData]             = useState<Analytics | null>(null);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const res = await fetch('/api/admin/analytics');
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
  const maxWeekCount = Math.max(...(d.weeklyChart?.map(w => w.count) || [1]), 1);
  const totalJobs    = d.jobStatusBreakdown.reduce((s, j) => s + j.count, 0) || 1;

  const kpis = [
    { label: 'Total Estimates', value: d.estimates.total,  sub: `+${d.estimates.last30d} this month`, icon: FileText,    accent: 'bg-blue-500',    iconBg: 'bg-blue-600',    vc: 'text-blue-400' },
    { label: 'Total Jobs',       value: d.jobs.total,       sub: `${d.jobs.active} active`,             icon: Briefcase,   accent: 'bg-purple-500',  iconBg: 'bg-purple-600',  vc: 'text-purple-400' },
    { label: 'Customers',        value: d.customers.total,  sub: `+${d.customers.last30d} this month`,  icon: Users,       accent: 'bg-emerald-500', iconBg: 'bg-emerald-600', vc: 'text-emerald-400' },
    { label: 'Claims',           value: d.claims.total,     sub: `${d.claims.approved} approved`,       icon: ShieldCheck, accent: 'bg-orange-500',  iconBg: 'bg-orange-600',  vc: 'text-orange-400' },
  ];

  const rates = [
    { label: 'Estimate \u2192 Job',     value: d.estimates.total > 0 ? `${((d.jobs.total / d.estimates.total) * 100).toFixed(1)}%` : '\u2014',      sub: `${d.jobs.total} of ${d.estimates.total} converted`,   color: 'text-blue-400' },
    { label: 'Job Completion',     value: d.jobs.total > 0 ? `${((d.jobs.completed / d.jobs.total) * 100).toFixed(1)}%` : '\u2014',             sub: `${d.jobs.completed} of ${d.jobs.total} complete`,      color: 'text-emerald-400' },
    { label: 'Claim Approval',     value: d.claims.total > 0 ? `${((d.claims.approved / d.claims.total) * 100).toFixed(1)}%` : '\u2014',        sub: `${d.claims.approved} of ${d.claims.total} approved`,   color: 'text-orange-400' },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-red-700 rounded-xl"><BarChart2 className="w-5 h-5 text-white" /></div>
          <div>
            <h1 className="text-xl font-black text-white tracking-tight leading-none">Analytics</h1>
            <p className="text-gray-500 text-xs mt-0.5">Business performance overview</p>
          </div>
        </div>
        <button onClick={() => { setRefreshing(true); load(); }} disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 bg-gray-800 border border-gray-700 hover:bg-gray-700 text-gray-300 rounded-xl text-sm font-medium disabled:opacity-50 transition-colors">
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {kpis.map(({ label, value, sub, icon: Icon, accent, iconBg, vc }) => (
          <div key={label} className="relative bg-gray-800 border border-gray-700 rounded-2xl p-5 overflow-hidden">
            <div className={`absolute top-0 left-0 right-0 h-0.5 ${accent}`} />
            <div className={`inline-flex p-2.5 rounded-xl ${iconBg} mb-3`}><Icon className="w-4 h-4 text-white" /></div>
            <div className={`text-3xl font-black tracking-tight ${vc}`}>{value}</div>
            <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">{label}</div>
            <div className="text-xs text-gray-600 mt-0.5">{sub}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-gray-800 border border-gray-700 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-5">
            <TrendingUp className="w-4 h-4 text-red-500" />
            <h2 className="text-sm font-bold text-gray-200">Weekly Estimates</h2>
            <span className="text-xs text-gray-500 ml-auto">Last 90 days</span>
          </div>
          {d.weeklyChart.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-gray-500 text-sm">No data yet</div>
          ) : (
            <>
              <div className="flex items-end gap-1 h-40">
                {d.weeklyChart.map(w => {
                  const height = Math.max((w.count / maxWeekCount) * 100, 4);
                  return (
                    <div key={w.week} className="flex-1 flex flex-col items-center group relative">
                      <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-gray-900 border border-gray-700 text-white text-xs px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 pointer-events-none">
                        {w.count} &middot; {fmtK(w.our_total)}
                      </div>
                      <div className="relative flex-1 flex items-end w-full">
                        <div className="w-full bg-red-700 hover:bg-red-600 rounded-t transition-colors" style={{ height: `${height}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between mt-2 text-xs text-gray-600">
                <span>{d.weeklyChart[0]?.week}</span>
                <span>{d.weeklyChart[d.weeklyChart.length - 1]?.week}</span>
              </div>
            </>
          )}
        </div>

        <div className="bg-gray-800 border border-gray-700 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-5">
            <Briefcase className="w-4 h-4 text-red-500" />
            <h2 className="text-sm font-bold text-gray-200">Jobs by Status</h2>
          </div>
          {d.jobStatusBreakdown.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-gray-500 text-sm">No jobs yet</div>
          ) : (
            <div className="space-y-3">
              {d.jobStatusBreakdown.sort((a, b) => b.count - a.count).map(({ status, count }) => {
                const pct = (count / totalJobs) * 100;
                return (
                  <div key={status}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm text-gray-300 font-medium">{JOB_LABELS[status] || status}</span>
                      <span className="text-sm font-bold text-white tabular-nums">{count}</span>
                    </div>
                    <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${JOB_COLORS[status] || 'bg-gray-500'}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {rates.map(({ label, value, sub, color }) => (
          <div key={label} className="bg-gray-800 border border-gray-700 rounded-2xl p-5">
            <div className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">{label}</div>
            <div className={`text-3xl font-black tracking-tight ${color}`}>{value}</div>
            <div className="text-xs text-gray-600 mt-1">{sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
