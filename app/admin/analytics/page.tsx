'use client';

import { useEffect, useState } from 'react';
import { BarChart2, TrendingUp, Users, Briefcase, ShieldCheck, FileText, RefreshCw, Mail, Phone, Target, Activity } from 'lucide-react';

interface Analytics {
  estimates:          { total: number; last30d: number };
  jobs:               { total: number; active: number; completed: number };
  customers:          { total: number; last30d: number };
  claims:             { total: number; approved: number };
  weeklyChart:        { week: string; count: number; our_total: number; ins_total: number }[];
  jobStatusBreakdown: { status: string; count: number }[];
}

interface CampaignAnalytics {
  email: {
    total_sent: number;
    total_failed: number;
    last30d_sent: number;
    last30d_failed: number;
    by_template: { template: string; sent: number; failed: number }[];
    daily_30d: { day: string; sent: number; failed: number }[];
  };
  ivr: {
    total_dispatched: number;
    last30d_dispatched: number;
    press1: number;
    press2: number;
    press3: number;
    response_rate: number;
  };
  prospects: {
    total: number;
    contacted: number;
    interested: number;
    appt: number;
    converted: number;
    dnc: number;
    by_status: { status: string; count: number }[];
  };
}

const JOB_COLORS: Record<string, string> = {
  LEAD: 'bg-gray-500', ESTIMATE_SENT: 'bg-blue-500', INSURANCE_APPROVED: 'bg-purple-500',
  SCHEDULED: 'bg-yellow-500', IN_PROGRESS: 'bg-orange-500', COMPLETE: 'bg-green-500',
  INVOICED: 'bg-teal-500', PAID: 'bg-emerald-500',
};
const JOB_LABELS: Record<string, string> = {
  LEAD: 'Lead', ESTIMATE_SENT: 'Estimate Sent', INSURANCE_APPROVED: 'Ins. Approved',
  SCHEDULED: 'Scheduled', IN_PROGRESS: 'In Progress', COMPLETE: 'Complete',
  INVOICED: 'Invoiced', PAID: 'Paid',
};

const PROSPECT_COLORS: Record<string, string> = {
  NEW: 'bg-gray-500', CONTACTED: 'bg-blue-500', INTERESTED: 'bg-yellow-500',
  PRESS_1: 'bg-yellow-500', APPOINTMENT_SET: 'bg-purple-500', BOOKED: 'bg-purple-500',
  CONVERTED: 'bg-emerald-500', NO_INTEREST: 'bg-orange-400', NO_RESPONSE: 'bg-gray-400',
  DNC: 'bg-red-500', HARD_NO: 'bg-red-600',
};

function fmtK(n: number) { return `$${(n / 1000).toFixed(1)}k`; }
function pct(a: number, b: number) { return b > 0 ? `${((a / b) * 100).toFixed(1)}%` : '—'; }

export default function AnalyticsPage() {
  const [data,     setData]     = useState<Analytics | null>(null);
  const [campaign, setCampaign] = useState<CampaignAnalytics | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const [a, c] = await Promise.all([
        fetch('/api/admin/analytics').then(r => r.json()),
        fetch('/api/admin/analytics/campaigns').then(r => r.json()),
      ]);
      setData(a);
      setCampaign(c);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { load(); }, []);

  if (loading) return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-red-600" />
    </div>
  );

  const d  = data!;
  const ca = campaign;
  const maxWeekCount = Math.max(...(d.weeklyChart?.map(w => w.count) || [1]), 1);
  const totalJobs    = d.jobStatusBreakdown.reduce((s, j) => s + j.count, 0) || 1;

  const kpis = [
    { label: 'Total Estimates', value: d.estimates.total,  sub: `+${d.estimates.last30d} this month`, icon: FileText,    accent: 'bg-blue-500',    iconBg: 'bg-blue-600',    vc: 'text-blue-400' },
    { label: 'Total Jobs',       value: d.jobs.total,       sub: `${d.jobs.active} active`,             icon: Briefcase,   accent: 'bg-purple-500',  iconBg: 'bg-purple-600',  vc: 'text-purple-400' },
    { label: 'Customers',        value: d.customers.total,  sub: `+${d.customers.last30d} this month`,  icon: Users,       accent: 'bg-emerald-500', iconBg: 'bg-emerald-600', vc: 'text-emerald-400' },
    { label: 'Claims',           value: d.claims.total,     sub: `${d.claims.approved} approved`,       icon: ShieldCheck, accent: 'bg-orange-500',  iconBg: 'bg-orange-600',  vc: 'text-orange-400' },
  ];

  const rates = [
    { label: 'Estimate → Job',   value: pct(d.jobs.total, d.estimates.total),      sub: `${d.jobs.total} of ${d.estimates.total} converted`,   color: 'text-blue-400' },
    { label: 'Job Completion',   value: pct(d.jobs.completed, d.jobs.total),        sub: `${d.jobs.completed} of ${d.jobs.total} complete`,      color: 'text-emerald-400' },
    { label: 'Claim Approval',   value: pct(d.claims.approved, d.claims.total),     sub: `${d.claims.approved} of ${d.claims.total} approved`,   color: 'text-orange-400' },
  ];

  // Campaign stat cards
  const campaignKpis = ca ? [
    {
      label: 'Emails Sent',
      value: ca.email.total_sent.toLocaleString(),
      sub: `+${ca.email.last30d_sent} last 30 days`,
      icon: Mail, accent: 'bg-blue-500', iconBg: 'bg-blue-600', vc: 'text-blue-400',
    },
    {
      label: 'IVR Calls',
      value: ca.ivr.total_dispatched.toLocaleString(),
      sub: `+${ca.ivr.last30d_dispatched} last 30 days`,
      icon: Phone, accent: 'bg-orange-500', iconBg: 'bg-orange-600', vc: 'text-orange-400',
    },
    {
      label: 'Hot Leads (Press 1)',
      value: ca.ivr.press1.toLocaleString(),
      sub: `${pct(ca.ivr.press1, ca.ivr.total_dispatched)} of calls`,
      icon: Target, accent: 'bg-yellow-500', iconBg: 'bg-yellow-600', vc: 'text-yellow-400',
    },
    {
      label: 'Prospects Contacted',
      value: ca.prospects.contacted.toLocaleString(),
      sub: `${pct(ca.prospects.contacted, ca.prospects.total)} of database`,
      icon: Activity, accent: 'bg-emerald-500', iconBg: 'bg-emerald-600', vc: 'text-emerald-400',
    },
  ] : [];

  const maxDaily = ca ? Math.max(...ca.email.daily_30d.map(d => d.sent), 1) : 1;

  const funnelSteps = ca ? [
    { label: 'Total Prospects', count: ca.prospects.total,    color: 'bg-gray-500' },
    { label: 'Contacted',       count: ca.prospects.contacted, color: 'bg-blue-500' },
    { label: 'Interested',      count: ca.prospects.interested, color: 'bg-yellow-500' },
    { label: 'Appointment Set', count: ca.prospects.appt,     color: 'bg-purple-500' },
    { label: 'Converted',       count: ca.prospects.converted, color: 'bg-emerald-500' },
  ] : [];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* ── Header ───────────────────────────────────────────────────────── */}
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

      {/* ── Business KPIs ─────────────────────────────────────────────────── */}
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

      {/* ── Charts row ───────────────────────────────────────────────────── */}
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
                const p = (count / totalJobs) * 100;
                return (
                  <div key={status}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm text-gray-300 font-medium">{JOB_LABELS[status] || status}</span>
                      <span className="text-sm font-bold text-white tabular-nums">{count}</span>
                    </div>
                    <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${JOB_COLORS[status] || 'bg-gray-500'}`} style={{ width: `${p}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Conversion rates ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-12">
        {rates.map(({ label, value, sub, color }) => (
          <div key={label} className="bg-gray-800 border border-gray-700 rounded-2xl p-5">
            <div className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">{label}</div>
            <div className={`text-3xl font-black tracking-tight ${color}`}>{value}</div>
            <div className="text-xs text-gray-600 mt-1">{sub}</div>
          </div>
        ))}
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          CAMPAIGN ANALYTICS
      ════════════════════════════════════════════════════════════════════ */}
      <div className="border-t border-gray-700 pt-10 mb-8">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-700 rounded-xl"><Activity className="w-5 h-5 text-white" /></div>
          <div>
            <h2 className="text-xl font-black text-white tracking-tight leading-none">Campaign Analytics</h2>
            <p className="text-gray-500 text-xs mt-0.5">Outreach performance — email and IVR</p>
          </div>
        </div>
      </div>

      {!ca ? (
        <div className="text-center py-12 text-gray-500">Loading campaign data...</div>
      ) : (
        <>
          {/* Campaign KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {campaignKpis.map(({ label, value, sub, icon: Icon, accent, iconBg, vc }) => (
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
            {/* Daily email volume */}
            <div className="bg-gray-800 border border-gray-700 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-5">
                <Mail className="w-4 h-4 text-blue-400" />
                <h3 className="text-sm font-bold text-gray-200">Daily Email Volume</h3>
                <span className="text-xs text-gray-500 ml-auto">Last 30 days</span>
              </div>
              {ca.email.daily_30d.length === 0 ? (
                <div className="h-40 flex items-center justify-center text-gray-500 text-sm">No emails sent yet</div>
              ) : (
                <>
                  <div className="flex items-end gap-0.5 h-40">
                    {ca.email.daily_30d.map(d => {
                      const h = Math.max((d.sent / maxDaily) * 100, 4);
                      return (
                        <div key={d.day} className="flex-1 flex flex-col items-center group relative">
                          <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-900 border border-gray-700 text-white text-xs px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 pointer-events-none">
                            {d.day}: {d.sent} sent{d.failed > 0 ? `, ${d.failed} failed` : ''}
                          </div>
                          <div className="relative flex-1 flex items-end w-full">
                            <div className="w-full bg-blue-600 hover:bg-blue-500 rounded-t transition-colors" style={{ height: `${h}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex justify-between mt-2 text-xs text-gray-600">
                    <span>{ca.email.daily_30d[0]?.day}</span>
                    <span>{ca.email.daily_30d[ca.email.daily_30d.length - 1]?.day}</span>
                  </div>
                </>
              )}
            </div>

            {/* IVR outcomes */}
            <div className="bg-gray-800 border border-gray-700 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-5">
                <Phone className="w-4 h-4 text-orange-400" />
                <h3 className="text-sm font-bold text-gray-200">IVR Call Outcomes</h3>
                <span className="text-xs text-gray-500 ml-auto">All time</span>
              </div>
              {ca.ivr.total_dispatched === 0 ? (
                <div className="h-40 flex items-center justify-center text-gray-500 text-sm">No calls dispatched yet</div>
              ) : (
                <div className="space-y-4">
                  {[
                    { label: 'Press 1 — Wants Inspection (Hot)',  count: ca.ivr.press1, color: 'bg-yellow-500' },
                    { label: 'Press 2 — Wants Estimate',          count: ca.ivr.press2, color: 'bg-blue-500' },
                    { label: 'Press 3 — Opted Out (DNC)',         count: ca.ivr.press3, color: 'bg-red-500' },
                    { label: 'No Input / Voicemail',               count: Math.max(0, ca.ivr.total_dispatched - ca.ivr.press1 - ca.ivr.press2 - ca.ivr.press3), color: 'bg-gray-600' },
                  ].map(({ label, count, color }) => {
                    const p = (count / ca.ivr.total_dispatched) * 100;
                    return (
                      <div key={label}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-gray-300">{label}</span>
                          <span className="text-xs font-bold text-white tabular-nums">{count} <span className="text-gray-500 font-normal">({p.toFixed(1)}%)</span></span>
                        </div>
                        <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(p, p > 0 ? 1 : 0)}%` }} />
                        </div>
                      </div>
                    );
                  })}
                  <div className="pt-2 border-t border-gray-700 flex justify-between text-xs">
                    <span className="text-gray-500">Response rate</span>
                    <span className="font-bold text-yellow-400">{ca.ivr.response_rate}%</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Prospect funnel */}
            <div className="bg-gray-800 border border-gray-700 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-5">
                <Target className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-bold text-gray-200">Prospect Funnel</h3>
                <span className="text-xs text-gray-500 ml-auto">{ca.prospects.total.toLocaleString()} total</span>
              </div>
              <div className="space-y-3">
                {funnelSteps.map(({ label, count, color }) => {
                  const p = ca.prospects.total > 0 ? (count / ca.prospects.total) * 100 : 0;
                  return (
                    <div key={label}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-gray-300">{label}</span>
                        <span className="text-sm font-bold text-white tabular-nums">
                          {count.toLocaleString()} <span className="text-xs text-gray-500 font-normal">({p.toFixed(1)}%)</span>
                        </span>
                      </div>
                      <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(p, p > 0 ? 0.5 : 0)}%` }} />
                      </div>
                    </div>
                  );
                })}
                {ca.prospects.dnc > 0 && (
                  <div className="pt-2 border-t border-gray-700 flex justify-between text-xs">
                    <span className="text-gray-500">DNC / Hard No</span>
                    <span className="text-red-400 font-bold">{ca.prospects.dnc}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Email by template */}
            <div className="bg-gray-800 border border-gray-700 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-5">
                <FileText className="w-4 h-4 text-blue-400" />
                <h3 className="text-sm font-bold text-gray-200">Email by Template</h3>
                <span className="text-xs text-gray-500 ml-auto">All time</span>
              </div>
              {ca.email.by_template.length === 0 ? (
                <div className="h-40 flex items-center justify-center text-gray-500 text-sm">No emails sent yet</div>
              ) : (
                <div className="overflow-auto max-h-64">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-gray-500 uppercase border-b border-gray-700">
                        <th className="text-left pb-2 font-semibold">Template</th>
                        <th className="text-right pb-2 font-semibold">Sent</th>
                        <th className="text-right pb-2 font-semibold">Failed</th>
                        <th className="text-right pb-2 font-semibold">Rate</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700">
                      {ca.email.by_template.map(t => {
                        const total  = t.sent + t.failed;
                        const rate   = total > 0 ? ((t.sent / total) * 100).toFixed(0) : '—';
                        const rateColor = total === 0 ? 'text-gray-500' : t.failed === 0 ? 'text-emerald-400' : 'text-yellow-400';
                        return (
                          <tr key={t.template} className="hover:bg-gray-700/40">
                            <td className="py-2 pr-4 text-gray-300 truncate max-w-[200px]" title={t.template}>
                              {t.template || 'Unknown'}
                            </td>
                            <td className="py-2 text-right text-blue-400 font-bold tabular-nums">{t.sent}</td>
                            <td className="py-2 text-right text-red-400 tabular-nums">{t.failed || '—'}</td>
                            <td className={`py-2 text-right font-bold tabular-nums ${rateColor}`}>{rate}{total > 0 ? '%' : ''}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Bottom stat row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Email Delivery Rate', value: pct(ca.email.total_sent, ca.email.total_sent + ca.email.total_failed), color: 'text-blue-400' },
              { label: 'IVR Response Rate',   value: `${ca.ivr.response_rate}%`,                                             color: 'text-yellow-400' },
              { label: 'Contact Rate',         value: pct(ca.prospects.contacted, ca.prospects.total),                       color: 'text-orange-400' },
              { label: 'Conversion Rate',      value: pct(ca.prospects.converted, ca.prospects.contacted || 1),              color: 'text-emerald-400' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-gray-800 border border-gray-700 rounded-2xl p-5">
                <div className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">{label}</div>
                <div className={`text-3xl font-black tracking-tight ${color}`}>{value}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
