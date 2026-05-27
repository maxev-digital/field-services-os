'use client';

import { useEffect, useState } from 'react';
import {
  TrendingUp, DollarSign, Phone, Users, Target,
  BarChart2, RefreshCw, ChevronDown, ChevronUp, AlertCircle, CheckCircle,
} from 'lucide-react';

interface StormROI {
  storm_date:         string;
  total_prospects:    number;
  with_phone:         number;
  contacted:          number;
  interested:         number;
  converted:          number;
  dnc:                number;
  total_calls:        number;
  answered_calls:     number;
  total_minutes:      number;
  avg_duration_s:     number;
  answer_rate:        number;
  booking_rate:       number;
  conversion_rate:    number;
  cost_total:         number;
  cost_skip_trace:    number;
  cost_calls:         number;
  cost_per_lead:      number;
  cost_per_booked:    number | null;
  actual_jobs:        number;
  contracted_value:   number;
  revenue_collected:  number;
  revenue_invoiced:   number;
  est_revenue:        number;
  revenue_is_actual:  boolean;
  est_roi_pct:        number | null;
}

interface Totals {
  total_prospects:   number;
  interested:        number;
  converted:         number;
  total_calls:       number;
  total_minutes:     number;
  cost_total:        number;
  contracted_value:  number;
  revenue_collected: number;
  est_revenue:       number;
  actual_jobs:       number;
}

function fmt$(n: number) { return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }); }
function fmtPct(n: number | null) { return n === null ? '—' : n.toFixed(1) + '%'; }
function fmtDate(d: string) {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  return `${m}/${day}/${y}`;
}

function ROIBadge({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-gray-400 text-sm">—</span>;
  const color = pct >= 500 ? 'text-green-400' : pct >= 100 ? 'text-yellow-400' : pct >= 0 ? 'text-orange-400' : 'text-red-400';
  return <span className={`font-bold text-sm ${color}`}>{pct > 0 ? '+' : ''}{pct}%</span>;
}

function LiveBadge() {
  return (
    <span className="inline-flex items-center gap-1 bg-green-900/40 border border-green-700/60 text-green-400 text-xs px-1.5 py-0.5 rounded font-semibold">
      <CheckCircle size={10} />
      LIVE
    </span>
  );
}

function StatCard({ label, value, sub, color = 'text-white', badge }: { label: string; value: string; sub?: string; color?: string; badge?: React.ReactNode }) {
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
      <div className="text-xs text-gray-400 uppercase tracking-wide mb-1 flex items-center gap-2">{label}{badge}</div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </div>
  );
}

export default function StormROIPage() {
  const [storms,   setStorms]   = useState<StormROI[]>([]);
  const [totals,   setTotals]   = useState<Totals | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const r = await fetch('/api/admin/storm/roi');
      if (!r.ok) throw new Error('Failed to load ROI data');
      const d = await r.json();
      setStorms(d.storms || []);
      setTotals(d.totals || null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const overallROI = totals && totals.cost_total > 0
    ? Math.round(((totals.est_revenue - totals.cost_total) / totals.cost_total) * 100)
    : null;

  const hasRealRevenue = (totals?.actual_jobs ?? 0) > 0;

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <BarChart2 className="text-yellow-400" size={28} />
          <div>
            <h1 className="text-2xl font-bold">Storm Campaign ROI</h1>
            <p className="text-gray-400 text-sm mt-0.5">Cost per lead · Booking rate · Revenue per storm</p>
          </div>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 bg-gray-800 border border-gray-700 text-gray-300 px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50"
        >
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-900/30 border border-red-800 text-red-300 rounded-xl p-4 mb-6">
          <AlertCircle size={18} />
          {error}
        </div>
      )}

      {/* Summary cards */}
      {totals && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard
            label="Total Prospects"
            value={totals.total_prospects.toLocaleString()}
            sub={`${totals.interested} booked inspections`}
          />
          <StatCard
            label="Total Spend"
            value={fmt$(totals.cost_total)}
            sub={`${totals.total_calls.toLocaleString()} AI calls · ${totals.total_minutes.toLocaleString()} min`}
            color="text-orange-400"
          />
          <StatCard
            label="Revenue"
            value={fmt$(totals.est_revenue)}
            sub={hasRealRevenue
              ? `${totals.actual_jobs} linked jobs · ${fmt$(totals.revenue_collected)} collected`
              : `${totals.converted} jobs × $8,500 est.`}
            color="text-green-400"
            badge={hasRealRevenue ? <LiveBadge /> : undefined}
          />
          <StatCard
            label="Overall ROI"
            value={overallROI !== null ? (overallROI > 0 ? '+' : '') + overallROI + '%' : '—'}
            sub={hasRealRevenue ? 'Actual contracted value vs. cost' : 'Est. revenue vs. campaign cost'}
            color={overallROI !== null && overallROI >= 0 ? 'text-green-400' : 'text-red-400'}
          />
        </div>
      )}

      {/* Data note */}
      {hasRealRevenue ? (
        <div className="bg-green-900/20 border border-green-800/40 rounded-xl p-3 mb-6 flex items-start gap-2">
          <CheckCircle size={15} className="text-green-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-green-300">
            Revenue is pulled from <strong>real job data</strong> — matched via phone number from storm prospects to customers and jobs.
            Rows marked <strong>LIVE</strong> use actual contracted values from signed estimates.
          </p>
        </div>
      ) : (
        <div className="bg-blue-900/20 border border-blue-800/40 rounded-xl p-3 mb-6 flex items-start gap-2">
          <AlertCircle size={15} className="text-blue-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-blue-300">
            Revenue estimated at $8,500/job until jobs are linked. Phone-matched job data upgrades estimates to real revenue automatically.
          </p>
        </div>
      )}

      {/* Storm table */}
      {loading ? (
        <div className="text-center text-gray-500 py-20">Loading...</div>
      ) : storms.length === 0 ? (
        <div className="text-center text-gray-500 py-20">
          No storm campaigns yet. Run your first pipeline when hail hits.
        </div>
      ) : (
        <div className="space-y-3">
          {storms.map((s) => (
            <div key={s.storm_date} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              {/* Row header */}
              <button
                className="w-full flex items-center gap-4 p-4 hover:bg-gray-800/50 transition-colors text-left"
                onClick={() => setExpanded(expanded === s.storm_date ? null : s.storm_date)}
              >
                {/* Date */}
                <div className="w-28 flex-shrink-0">
                  <div className="font-mono font-bold text-yellow-400 text-sm">{fmtDate(s.storm_date)}</div>
                  <div className="text-xs text-gray-500 flex items-center gap-1">
                    Storm {s.revenue_is_actual && <LiveBadge />}
                  </div>
                </div>

                {/* Prospects */}
                <div className="w-20 flex-shrink-0">
                  <div className="flex items-center gap-1">
                    <Users size={13} className="text-gray-500" />
                    <span className="font-semibold">{s.total_prospects.toLocaleString()}</span>
                  </div>
                  <div className="text-xs text-gray-500">{s.with_phone} w/ phone</div>
                </div>

                {/* Calls */}
                <div className="w-24 flex-shrink-0">
                  <div className="flex items-center gap-1">
                    <Phone size={13} className="text-gray-500" />
                    <span className="font-semibold">{s.total_calls}</span>
                  </div>
                  <div className="text-xs text-gray-500">{s.answer_rate}% answered</div>
                </div>

                {/* Booked */}
                <div className="w-24 flex-shrink-0">
                  <div className="flex items-center gap-1">
                    <Target size={13} className="text-gray-500" />
                    <span className="font-semibold text-green-400">{s.interested}</span>
                  </div>
                  <div className="text-xs text-gray-500">{fmtPct(s.booking_rate)} rate</div>
                </div>

                {/* Cost */}
                <div className="w-24 flex-shrink-0">
                  <div className="flex items-center gap-1">
                    <DollarSign size={13} className="text-gray-500" />
                    <span className="font-semibold text-orange-400">{fmt$(s.cost_total)}</span>
                  </div>
                  <div className="text-xs text-gray-500">
                    {s.cost_per_booked !== null ? `${fmt$(s.cost_per_booked)}/booked` : 'no cost data'}
                  </div>
                </div>

                {/* Revenue / ROI */}
                <div className="flex-1 flex items-center gap-2">
                  <div>
                    <div className="flex items-center gap-1">
                      <TrendingUp size={13} className="text-gray-500" />
                      <ROIBadge pct={s.est_roi_pct} />
                    </div>
                    <div className="text-xs text-gray-500">
                      {fmt$(s.est_revenue)} {s.revenue_is_actual ? 'contracted' : 'est.'}
                    </div>
                  </div>
                </div>

                <div className="text-gray-600 ml-auto">
                  {expanded === s.storm_date ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>
              </button>

              {/* Expanded detail */}
              {expanded === s.storm_date && (
                <div className="border-t border-gray-800 p-4 grid grid-cols-2 md:grid-cols-4 gap-4 bg-gray-950">
                  <div>
                    <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">Prospect Funnel</div>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between"><span className="text-gray-400">Total</span><span>{s.total_prospects}</span></div>
                      <div className="flex justify-between"><span className="text-gray-400">With phone</span><span>{s.with_phone}</span></div>
                      <div className="flex justify-between"><span className="text-gray-400">Contacted</span><span>{s.contacted}</span></div>
                      <div className="flex justify-between"><span className="text-gray-400">Interested</span><span className="text-green-400 font-bold">{s.interested}</span></div>
                      <div className="flex justify-between"><span className="text-gray-400">Converted</span><span className="text-blue-400 font-bold">{s.converted}</span></div>
                      <div className="flex justify-between"><span className="text-gray-400">DNC</span><span className="text-red-400">{s.dnc}</span></div>
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">Call Stats</div>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between"><span className="text-gray-400">Calls placed</span><span>{s.total_calls}</span></div>
                      <div className="flex justify-between"><span className="text-gray-400">Answered</span><span>{s.answered_calls}</span></div>
                      <div className="flex justify-between"><span className="text-gray-400">Answer rate</span><span>{fmtPct(s.answer_rate)}</span></div>
                      <div className="flex justify-between"><span className="text-gray-400">Total minutes</span><span>{s.total_minutes}</span></div>
                      <div className="flex justify-between"><span className="text-gray-400">Avg duration</span><span>{s.avg_duration_s}s</span></div>
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">Cost Breakdown</div>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between"><span className="text-gray-400">Skip trace</span><span>{fmt$(s.cost_skip_trace)}</span></div>
                      <div className="flex justify-between"><span className="text-gray-400">AI calls</span><span>{fmt$(s.cost_calls)}</span></div>
                      <div className="flex justify-between font-bold border-t border-gray-800 pt-1 mt-1"><span className="text-gray-300">Total</span><span className="text-orange-400">{fmt$(s.cost_total)}</span></div>
                      <div className="flex justify-between"><span className="text-gray-400">Per lead</span><span>{fmt$(s.cost_per_lead)}</span></div>
                      <div className="flex justify-between"><span className="text-gray-400">Per booking</span><span>{s.cost_per_booked !== null ? fmt$(s.cost_per_booked) : '—'}</span></div>
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-2">
                      Revenue / ROI {s.revenue_is_actual && <LiveBadge />}
                    </div>
                    <div className="space-y-1 text-sm">
                      {s.revenue_is_actual ? (
                        <>
                          <div className="flex justify-between"><span className="text-gray-400">Linked jobs</span><span className="text-blue-400 font-bold">{s.actual_jobs}</span></div>
                          <div className="flex justify-between"><span className="text-gray-400">Contracted</span><span className="text-green-400 font-bold">{fmt$(s.contracted_value)}</span></div>
                          <div className="flex justify-between"><span className="text-gray-400">Invoiced</span><span>{fmt$(s.revenue_invoiced)}</span></div>
                          <div className="flex justify-between"><span className="text-gray-400">Collected</span><span className="text-emerald-400">{fmt$(s.revenue_collected)}</span></div>
                        </>
                      ) : (
                        <>
                          <div className="flex justify-between"><span className="text-gray-400">Jobs closed</span><span className="text-blue-400">{s.converted}</span></div>
                          <div className="flex justify-between"><span className="text-gray-400">Est. revenue</span><span className="text-green-400 font-bold">{fmt$(s.est_revenue)}</span></div>
                          <div className="text-xs text-gray-600 mt-1">$8,500 avg × conversions</div>
                        </>
                      )}
                      <div className="flex justify-between border-t border-gray-800 pt-1 mt-1"><span className="text-gray-400">Est. ROI</span><span><ROIBadge pct={s.est_roi_pct} /></span></div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
