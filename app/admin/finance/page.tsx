'use client';

import { useState, useEffect } from 'react';
import { BarChart3, TrendingUp, TrendingDown, Download, ArrowUp, ArrowDown } from 'lucide-react';

interface PnlData {
  period_label: string;
  revenue: { invoiced: number; collected: number; outstanding: number };
  costs: {
    job_costs: number;
    general_expenses: number;
    expense_breakdown: Record<string, number>;
  };
  net_profit: number;
  margin_pct: number;
  prior_period: {
    net_profit: number;
    revenue_collected: number;
    total_costs: number;
  };
}

const fmt = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const pct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;

const CATEGORY_LABELS: Record<string, string> = {
  vehicle_fuel: 'Vehicle / Fuel', tools_equipment: 'Tools & Equipment', insurance: 'Insurance',
  office_rent: 'Office / Rent', marketing: 'Marketing', subscriptions: 'Subscriptions',
  materials: 'Materials', subcontractor: 'Subcontractor', payroll: 'Payroll', taxes: 'Taxes',
  utilities: 'Utilities', meals: 'Meals', travel: 'Travel', misc: 'Miscellaneous',
};

export default function PnlPage() {
  const [data, setData] = useState<PnlData | null>(null);
  const [loading, setLoading] = useState(true);
  const [periodType, setPeriodType] = useState<'monthly' | 'quarterly' | 'annual'>('monthly');
  const [periodDate, setPeriodDate] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ type: periodType, date: periodDate });
    fetch(`/api/admin/finance/pnl?${params}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [periodType, periodDate]);

  const revenueChange = data && data.prior_period.revenue_collected > 0
    ? ((data.revenue.collected - data.prior_period.revenue_collected) / data.prior_period.revenue_collected) * 100 : 0;
  const costTotal = data ? data.costs.job_costs + data.costs.general_expenses : 0;
  const priorCostTotal = data ? data.prior_period.total_costs : 0;
  const costChange = priorCostTotal > 0 && data ? ((costTotal - priorCostTotal) / priorCostTotal) * 100 : 0;
  const profitChange = data && data.prior_period.net_profit !== 0
    ? ((data.net_profit - data.prior_period.net_profit) / Math.abs(data.prior_period.net_profit)) * 100 : 0;

  function exportCSV() {
    if (!data) return;
    const rows: string[][] = [
      ['Roof Works of Texas — P&L Report', data.period_label],
      [],
      ['REVENUE'],
      ['Invoiced', data.revenue.invoiced.toFixed(2)],
      ['Collected', data.revenue.collected.toFixed(2)],
      ['Outstanding', data.revenue.outstanding.toFixed(2)],
      [],
      ['COSTS'],
      ['Job Costs', data.costs.job_costs.toFixed(2)],
      ['General Expenses', data.costs.general_expenses.toFixed(2)],
      ...Object.entries(data.costs.expense_breakdown).map(([k, v]) => [
        `  ${CATEGORY_LABELS[k] || k}`, (v as number).toFixed(2)
      ]),
      [],
      ['NET PROFIT', data.net_profit.toFixed(2)],
      ['MARGIN', data.margin_pct.toFixed(1) + '%'],
    ];
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pnl-${data.period_label.replace(/\s/g, '-').toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const ChangeArrow = ({ value }: { value: number }) => {
    if (Math.abs(value) < 0.1) return null;
    return (
      <span className={`inline-flex items-center gap-1 text-xs ${value > 0 ? 'text-green-400' : 'text-red-400'}`}>
        {value > 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
        {pct(value)}
      </span>
    );
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BarChart3 className="w-7 h-7 text-red-500" />
          <h1 className="text-2xl font-bold text-white">Profit & Loss Report</h1>
        </div>
        <button onClick={exportCSV} disabled={!data}
          className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          <Download className="w-4 h-4" /> Export CSV
        </button>
      </div>

      {/* Period Selector */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex bg-gray-900 rounded-lg p-1">
            {(['monthly', 'quarterly', 'annual'] as const).map(t => (
              <button key={t} onClick={() => setPeriodType(t)} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${periodType === t ? 'bg-red-600 text-white' : 'text-gray-400 hover:text-white'}`}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
          <input
            type={periodType === 'annual' ? 'number' : 'month'}
            value={periodType === 'annual' ? periodDate.slice(0, 4) : periodDate}
            onChange={e => setPeriodDate(periodType === 'annual' ? `${e.target.value}-01` : e.target.value)}
            min={periodType === 'annual' ? 2020 : undefined}
            max={periodType === 'annual' ? 2030 : undefined}
            className="bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white"
          />
        </div>
      </div>

      {loading || !data ? (
        <div className="text-center py-20 text-gray-500">Loading...</div>
      ) : (
        <>
          {/* Net Profit Hero */}
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-8 text-center">
            <p className="text-sm text-gray-400 uppercase tracking-wider mb-2">Net Profit — {data.period_label}</p>
            <p className={`text-5xl font-bold ${data.net_profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {fmt(data.net_profit)}
            </p>
            <p className={`text-xl mt-2 ${data.margin_pct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {data.margin_pct.toFixed(1)}% margin
            </p>
            <div className="mt-2">
              <ChangeArrow value={profitChange} />
              <span className="text-xs text-gray-500 ml-2">vs prior period</span>
            </div>
          </div>

          {/* Revenue */}
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-green-400" /> Revenue
              </h2>
              <ChangeArrow value={revenueChange} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
                <p className="text-xs text-gray-400">Invoiced</p>
                <p className="text-xl font-bold text-white mt-1">{fmt(data.revenue.invoiced)}</p>
              </div>
              <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
                <p className="text-xs text-gray-400">Collected</p>
                <p className="text-xl font-bold text-green-400 mt-1">{fmt(data.revenue.collected)}</p>
              </div>
              <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
                <p className="text-xs text-gray-400">Outstanding</p>
                <p className="text-xl font-bold text-yellow-400 mt-1">{fmt(data.revenue.outstanding)}</p>
              </div>
            </div>
          </div>

          {/* Costs */}
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <TrendingDown className="w-5 h-5 text-red-400" /> Costs
              </h2>
              <ChangeArrow value={costChange} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
                <p className="text-xs text-gray-400">Job Costs</p>
                <p className="text-xl font-bold text-white mt-1">{fmt(data.costs.job_costs)}</p>
              </div>
              <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
                <p className="text-xs text-gray-400">General Expenses</p>
                <p className="text-xl font-bold text-white mt-1">{fmt(data.costs.general_expenses)}</p>
              </div>
            </div>
            {Object.keys(data.costs.expense_breakdown).length > 0 && (
              <div className="border-t border-gray-700 pt-4">
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-3">Expense Breakdown</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {Object.entries(data.costs.expense_breakdown)
                    .sort((a, b) => b[1] - a[1])
                    .map(([cat, amt]) => (
                      <div key={cat} className="flex justify-between bg-gray-900 border border-gray-700 rounded px-3 py-2">
                        <span className="text-sm text-gray-300">{CATEGORY_LABELS[cat] || cat}</span>
                        <span className="text-sm text-white font-medium">{fmt(amt)}</span>
                      </div>
                    ))}
                </div>
              </div>
            )}
            <div className="border-t border-gray-700 mt-4 pt-4 flex justify-between">
              <span className="text-sm font-semibold text-gray-300">Total Costs</span>
              <span className="text-lg font-bold text-white">{fmt(costTotal)}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
