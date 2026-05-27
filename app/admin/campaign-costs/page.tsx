'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  DollarSign, Phone, Search, Trash2, Plus, RefreshCw,
  TrendingUp, TrendingDown, BarChart3, Target, Loader2,
} from 'lucide-react';

interface DashboardData {
  syncResult: { synced: number; total?: number; error?: string };
  totalSpend: number;
  spendByCategory: { category: string; total: number; count: number }[];
  spendByMonth: { month: string; total: number }[];
  spendByCategoryMonth: { month: string; category: string; total: number }[];
  retellBreakdown: {
    totalCalls: number;
    totalMinutes: number;
    totalCost: number;
    costPerMinute: number;
    costPerCall: number;
    productBreakdown: { product: string; total: number }[];
  };
  retellDaily: { day: string; total: number; count: number }[];
  roi: {
    totalRevenue: number;
    totalSpend: number;
    roiPct: number;
    revenuePerDollarSpent: number;
    paidInvoiceCount: number;
  };
  pipeline: {
    estimatesCount: number;
    estimatesValue: number;
    jobsCount: number;
  };
  recentCosts: any[];
}

const CATEGORY_COLORS: Record<string, string> = {
  retell_calls: 'bg-blue-600',
  skip_trace: 'bg-purple-600',
  ai_personalization: 'bg-amber-600',
  email_outreach: 'bg-green-600',
  manual: 'bg-gray-600',
};

const CATEGORY_LABELS: Record<string, string> = {
  retell_calls: 'Retell AI',
  skip_trace: 'Skip Trace',
  ai_personalization: 'AI Personalization',
  email_outreach: 'Email Outreach',
  manual: 'Manual / Other',
};

const PRODUCT_LABELS: Record<string, string> = {
  retell_voice_engine: 'Voice Engine',
  elevenlabs_tts: 'ElevenLabs TTS',
  gpt_4o_mini: 'GPT-4o Mini',
  us_twilio_telephony: 'Twilio Telephony',
  deepgram_stt: 'Deepgram STT',
  openai_realtime: 'OpenAI Realtime',
};

const PRODUCT_COLORS: Record<string, string> = {
  retell_voice_engine: 'bg-blue-500',
  elevenlabs_tts: 'bg-purple-500',
  gpt_4o_mini: 'bg-green-500',
  us_twilio_telephony: 'bg-amber-500',
  deepgram_stt: 'bg-cyan-500',
  openai_realtime: 'bg-rose-500',
};

function fmt(cents: number): string {
  return '$' + (cents / 100).toFixed(2);
}

function fmtBig(cents: number): string {
  if (cents >= 100000) return '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  return '$' + (cents / 100).toFixed(2);
}

export default function CampaignCostsPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Form state
  const [formDate, setFormDate] = useState(new Date().toISOString().slice(0, 10));
  const [formCategory, setFormCategory] = useState('skip_trace');
  const [formDesc, setFormDesc] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formQty, setFormQty] = useState('1');
  const [formUnitCost, setFormUnitCost] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/campaign-costs');
      if (!res.ok) throw new Error('Failed to load');
      setData(await res.json());
      setError('');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const amountCents = Math.round(parseFloat(formAmount) * 100);
      const qty = parseInt(formQty) || 1;
      const unitCostCents = formUnitCost ? Math.round(parseFloat(formUnitCost) * 100) : Math.round(amountCents / qty);
      const res = await fetch('/api/admin/campaign-costs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: formDate,
          category: formCategory,
          description: formDesc,
          amount_cents: amountCents,
          quantity: qty,
          unit_cost_cents: unitCostCents,
        }),
      });
      if (!res.ok) throw new Error('Failed to save');
      setFormDesc('');
      setFormAmount('');
      setFormQty('1');
      setFormUnitCost('');
      load();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this cost entry?')) return;
    await fetch(`/api/admin/campaign-costs/${id}`, { method: 'DELETE' });
    load();
  };

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900">
        <Loader2 className="w-8 h-8 text-red-500 animate-spin" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="p-8 bg-gray-900 min-h-screen text-white">
        <p className="text-red-400">Error: {error}</p>
        <button onClick={load} className="mt-4 px-4 py-2 bg-red-600 rounded">Retry</button>
      </div>
    );
  }

  if (!data) return null;

  const catSpend = (cat: string) => data.spendByCategory.find((c) => c.category === cat);
  const retell = catSpend('retell_calls');
  const skipTrace = catSpend('skip_trace');
  const aiPers = catSpend('ai_personalization');

  // Monthly chart data (last 6 months)
  const months = data.spendByMonth.slice(0, 6).reverse();
  const maxMonthly = Math.max(...months.map((m) => m.total), 1);

  // Daily retell chart (last 14 days)
  const dailyRetell = data.retellDaily.slice(0, 14).reverse();
  const maxDaily = Math.max(...dailyRetell.map((d) => d.total), 1);

  // Product breakdown bar
  const productTotal = data.retellBreakdown.productBreakdown.reduce((a, b) => a + b.total, 0) || 1;

  return (
    <div className="p-4 md:p-8 bg-gray-900 min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-red-600/20 rounded-lg">
            <DollarSign className="w-6 h-6 text-red-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Campaign Costs & ROI</h1>
            <p className="text-sm text-gray-400">Track spend across Retell AI, skip tracing, and outreach</p>
          </div>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors text-sm"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Syncing...' : 'Refresh & Sync'}
        </button>
      </div>

      {/* Sync status */}
      {data.syncResult.synced > 0 && (
        <div className="mb-4 px-4 py-2 bg-green-900/30 border border-green-700 rounded-lg text-green-400 text-sm">
          Synced {data.syncResult.synced} new Retell calls
        </div>
      )}
      {data.syncResult.error && (
        <div className="mb-4 px-4 py-2 bg-red-900/30 border border-red-700 rounded-lg text-red-400 text-sm">
          Retell sync: {data.syncResult.error}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        {/* Total Spend */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Total Spend</p>
          <p className="text-2xl font-bold text-red-400">{fmtBig(data.totalSpend)}</p>
          <p className="text-xs text-gray-500 mt-1">all time</p>
        </div>

        {/* Retell AI */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Retell AI</p>
          <p className="text-2xl font-bold text-blue-400">{fmtBig(retell?.total ?? 0)}</p>
          <p className="text-xs text-gray-500 mt-1">{retell?.count ?? 0} calls</p>
        </div>

        {/* Skip Trace */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Skip Trace</p>
          <p className="text-2xl font-bold text-purple-400">{fmtBig(skipTrace?.total ?? 0)}</p>
          <p className="text-xs text-gray-500 mt-1">{skipTrace?.count ?? 0} batches</p>
        </div>

        {/* AI Personalization */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">AI Personalization</p>
          <p className="text-2xl font-bold text-amber-400">{fmtBig(aiPers?.total ?? 0)}</p>
          <p className="text-xs text-gray-500 mt-1">{aiPers?.count ?? 0} entries</p>
        </div>

        {/* Pipeline Value */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Pipeline Value</p>
          <p className="text-2xl font-bold text-white">{fmtBig(data.pipeline.estimatesValue)}</p>
          <p className="text-xs text-gray-500 mt-1">{data.pipeline.estimatesCount} estimates</p>
        </div>

        {/* ROI */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">ROI</p>
          <p className={`text-2xl font-bold ${data.roi.roiPct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {data.roi.roiPct >= 0 ? '+' : ''}{data.roi.roiPct}%
          </p>
          <p className="text-xs text-gray-500 mt-1">{fmt(data.roi.totalRevenue)} revenue</p>
        </div>
      </div>

      {/* Retell Breakdown + ROI Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Retell Breakdown */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Phone className="w-5 h-5 text-blue-400" />
            Retell AI Breakdown
          </h2>

          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-gray-900/50 rounded-lg p-3">
              <p className="text-xs text-gray-400">Total Calls</p>
              <p className="text-xl font-bold text-white">{data.retellBreakdown.totalCalls}</p>
            </div>
            <div className="bg-gray-900/50 rounded-lg p-3">
              <p className="text-xs text-gray-400">Total Minutes</p>
              <p className="text-xl font-bold text-white">{data.retellBreakdown.totalMinutes}</p>
            </div>
            <div className="bg-gray-900/50 rounded-lg p-3">
              <p className="text-xs text-gray-400">Avg Cost / Call</p>
              <p className="text-xl font-bold text-white">{fmt(data.retellBreakdown.costPerCall)}</p>
            </div>
            <div className="bg-gray-900/50 rounded-lg p-3">
              <p className="text-xs text-gray-400">Avg Cost / Min</p>
              <p className="text-xl font-bold text-white">{fmt(data.retellBreakdown.costPerMinute)}</p>
            </div>
          </div>

          {/* Product cost stacked bar */}
          {data.retellBreakdown.productBreakdown.length > 0 && (
            <div className="mb-6">
              <p className="text-xs text-gray-400 mb-2 uppercase tracking-wider">Cost by Product</p>
              <div className="h-6 rounded-full overflow-hidden flex bg-gray-700">
                {data.retellBreakdown.productBreakdown.map((p) => (
                  <div
                    key={p.product}
                    className={`${PRODUCT_COLORS[p.product] ?? 'bg-gray-500'} transition-all`}
                    style={{ width: `${(p.total / productTotal) * 100}%` }}
                    title={`${PRODUCT_LABELS[p.product] ?? p.product}: ${fmt(p.total)}`}
                  />
                ))}
              </div>
              <div className="flex flex-wrap gap-3 mt-3">
                {data.retellBreakdown.productBreakdown.map((p) => (
                  <div key={p.product} className="flex items-center gap-1.5 text-xs">
                    <div className={`w-2.5 h-2.5 rounded-full ${PRODUCT_COLORS[p.product] ?? 'bg-gray-500'}`} />
                    <span className="text-gray-400">{PRODUCT_LABELS[p.product] ?? p.product}</span>
                    <span className="text-gray-300 font-medium">{fmt(p.total)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Daily cost chart */}
          {dailyRetell.length > 0 && (
            <div>
              <p className="text-xs text-gray-400 mb-2 uppercase tracking-wider">Daily Cost (Last 14 Days)</p>
              <div className="flex items-end gap-1 h-24">
                {dailyRetell.map((d) => (
                  <div key={d.day} className="flex-1 flex flex-col items-center gap-1">
                    <div
                      className="w-full bg-blue-500/80 rounded-t hover:bg-blue-400 transition-colors cursor-default"
                      style={{ height: `${Math.max((d.total / maxDaily) * 80, 2)}px` }}
                      title={`${d.day}: ${fmt(d.total)} (${d.count} calls)`}
                    />
                  </div>
                ))}
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-[10px] text-gray-500">{dailyRetell[0]?.day.slice(5)}</span>
                <span className="text-[10px] text-gray-500">{dailyRetell[dailyRetell.length - 1]?.day.slice(5)}</span>
              </div>
            </div>
          )}
        </div>

        {/* ROI Section */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Target className="w-5 h-5 text-red-400" />
            Campaign ROI
          </h2>

          <div className="space-y-4 mb-6">
            <div className="flex items-center justify-between bg-gray-900/50 rounded-lg p-4">
              <div>
                <p className="text-sm text-gray-400">Revenue from Storm Leads</p>
                <p className="text-xs text-gray-500">{data.roi.paidInvoiceCount} paid invoices matched</p>
              </div>
              <p className="text-xl font-bold text-green-400">{fmtBig(data.roi.totalRevenue)}</p>
            </div>

            <div className="flex items-center justify-between bg-gray-900/50 rounded-lg p-4">
              <div>
                <p className="text-sm text-gray-400">Total Campaign Spend</p>
                <p className="text-xs text-gray-500">All categories combined</p>
              </div>
              <p className="text-xl font-bold text-red-400">{fmtBig(data.roi.totalSpend)}</p>
            </div>

            <div className="border-t border-gray-700 pt-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-400">Net Profit / Loss</p>
                <div className="flex items-center gap-2">
                  {data.roi.totalRevenue - data.roi.totalSpend >= 0 ? (
                    <TrendingUp className="w-4 h-4 text-green-400" />
                  ) : (
                    <TrendingDown className="w-4 h-4 text-red-400" />
                  )}
                  <p className={`text-xl font-bold ${data.roi.totalRevenue - data.roi.totalSpend >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {fmtBig(Math.abs(data.roi.totalRevenue - data.roi.totalSpend))}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between bg-gray-900/50 rounded-lg p-4">
              <p className="text-sm text-gray-400">Revenue per $1 Spent</p>
              <p className="text-xl font-bold text-white">${data.roi.revenuePerDollarSpent.toFixed(2)}</p>
            </div>

            <div className="flex items-center justify-between bg-gray-900/50 rounded-lg p-4">
              <div>
                <p className="text-sm text-gray-400">Pipeline Value</p>
                <p className="text-xs text-gray-500">{data.pipeline.estimatesCount} estimates, {data.pipeline.jobsCount} active jobs</p>
              </div>
              <p className="text-xl font-bold text-white">{fmtBig(data.pipeline.estimatesValue)}</p>
            </div>
          </div>

          {/* ROI gauge */}
          <div className="bg-gray-900/50 rounded-lg p-4 text-center">
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">Return on Investment</p>
            <p className={`text-4xl font-bold ${data.roi.roiPct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {data.roi.roiPct >= 0 ? '+' : ''}{data.roi.roiPct}%
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {data.roi.roiPct >= 100 ? 'Campaign is profitable' :
               data.roi.roiPct >= 0 ? 'Breaking even' :
               data.totalSpend === 0 ? 'No spend tracked yet' : 'Not yet profitable'}
            </p>
          </div>
        </div>
      </div>

      {/* Spend Over Time */}
      {months.length > 0 && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 mb-8">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-gray-400" />
            Monthly Spend
          </h2>
          <div className="space-y-3">
            {months.map((m) => {
              const monthCats = data.spendByCategoryMonth.filter((c) => c.month === m.month);
              return (
                <div key={m.month}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-gray-300">{m.month}</span>
                    <span className="text-sm font-medium text-gray-300">{fmtBig(m.total)}</span>
                  </div>
                  <div className="h-5 rounded-full overflow-hidden flex bg-gray-700">
                    {monthCats.map((mc) => (
                      <div
                        key={mc.category}
                        className={`${CATEGORY_COLORS[mc.category] ?? 'bg-gray-500'} transition-all`}
                        style={{ width: `${(mc.total / maxMonthly) * 100}%` }}
                        title={`${CATEGORY_LABELS[mc.category] ?? mc.category}: ${fmtBig(mc.total)}`}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-4 mt-4">
            {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
              <div key={key} className="flex items-center gap-1.5 text-xs">
                <div className={`w-2.5 h-2.5 rounded-full ${CATEGORY_COLORS[key]}`} />
                <span className="text-gray-400">{label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Manual Cost Entry Form */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 mb-8">
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Plus className="w-5 h-5 text-green-400" />
          Log Manual Cost
        </h2>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-6 gap-4 items-end">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Date</label>
            <input
              type="date"
              value={formDate}
              onChange={(e) => setFormDate(e.target.value)}
              className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:border-red-500 focus:outline-none"
              required
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Category</label>
            <select
              value={formCategory}
              onChange={(e) => setFormCategory(e.target.value)}
              className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:border-red-500 focus:outline-none"
            >
              <option value="skip_trace">Skip Trace</option>
              <option value="ai_personalization">AI Personalization</option>
              <option value="email_outreach">Email Outreach</option>
              <option value="manual">Manual / Other</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Description</label>
            <input
              type="text"
              value={formDesc}
              onChange={(e) => setFormDesc(e.target.value)}
              placeholder="e.g. BatchData 500 records"
              className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm placeholder-gray-500 focus:border-red-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Total Amount ($)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={formAmount}
              onChange={(e) => setFormAmount(e.target.value)}
              placeholder="0.00"
              className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm placeholder-gray-500 focus:border-red-500 focus:outline-none"
              required
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Quantity</label>
            <input
              type="number"
              min="1"
              value={formQty}
              onChange={(e) => setFormQty(e.target.value)}
              className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:border-red-500 focus:outline-none"
            />
          </div>
          <div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors text-sm flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Log Cost
            </button>
          </div>
        </form>
      </div>

      {/* All Costs Table */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-700 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">All Cost Entries</h2>
          <span className="text-sm text-gray-400">{data.recentCosts.length} entries</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-900/50 text-gray-400 text-xs uppercase tracking-wider">
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-left">Category</th>
                <th className="px-4 py-3 text-left">Description</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3 text-center">Source</th>
                <th className="px-4 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700/50">
              {data.recentCosts.map((cost) => (
                <tr key={cost.id} className="hover:bg-gray-700/30 transition-colors">
                  <td className="px-4 py-3 text-gray-300 whitespace-nowrap">{cost.date}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium text-white ${CATEGORY_COLORS[cost.category] ?? 'bg-gray-600'}`}>
                      {CATEGORY_LABELS[cost.category] ?? cost.category}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-300 max-w-xs truncate">{cost.description || '-'}</td>
                  <td className="px-4 py-3 text-right font-medium text-white">{fmt(cost.amount_cents)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs ${cost.auto_tracked ? 'text-blue-400' : 'text-gray-400'}`}>
                      {cost.auto_tracked ? 'Auto' : 'Manual'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => handleDelete(cost.id)}
                      className="p-1.5 text-gray-500 hover:text-red-400 rounded transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {data.recentCosts.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    No cost entries yet. Refresh to sync Retell calls or add manual costs above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
