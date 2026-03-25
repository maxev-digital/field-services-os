'use client';

import { useState, useEffect } from 'react';
import { ArrowLeftRight, TrendingUp, TrendingDown, DollarSign, Clock, AlertCircle } from 'lucide-react';

interface CashflowData {
  cash_in: number;
  cash_out: number;
  net: number;
  outstanding_receivables: number;
  monthly_chart: { month: string; cash_in: number; cash_out: number }[];
  recurring_upcoming: { id: number; description: string; amount: number; due_date: string; category: string }[];
  outstanding_invoices: { id: number; job_address: string; customer_name: string; amount: number; due_date: string; days_overdue: number }[];
}

const fmt = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export default function CashflowPage() {
  const [data, setData] = useState<CashflowData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/finance/cashflow')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading || !data) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <ArrowLeftRight className="w-7 h-7 text-red-500" />
          <h1 className="text-2xl font-bold text-white">Cash Flow</h1>
        </div>
        <div className="text-center py-20 text-gray-500">Loading...</div>
      </div>
    );
  }

  const maxBar = Math.max(...data.monthly_chart.map(m => Math.max(m.cash_in, m.cash_out)), 1);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <ArrowLeftRight className="w-7 h-7 text-red-500" />
        <h1 className="text-2xl font-bold text-white">Cash Flow</h1>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-green-400" />
            <p className="text-xs text-gray-400 uppercase tracking-wider">Cash In (This Month)</p>
          </div>
          <p className="text-xl font-bold text-green-400">{fmt(data.cash_in)}</p>
        </div>
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-1">
            <TrendingDown className="w-4 h-4 text-red-400" />
            <p className="text-xs text-gray-400 uppercase tracking-wider">Cash Out</p>
          </div>
          <p className="text-xl font-bold text-red-400">{fmt(data.cash_out)}</p>
        </div>
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className="w-4 h-4 text-white" />
            <p className="text-xs text-gray-400 uppercase tracking-wider">Net</p>
          </div>
          <p className={`text-xl font-bold ${data.net >= 0 ? 'text-green-400' : 'text-red-400'}`}>{fmt(data.net)}</p>
        </div>
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-yellow-400" />
            <p className="text-xs text-gray-400 uppercase tracking-wider">Outstanding Receivables</p>
          </div>
          <p className="text-xl font-bold text-yellow-400">{fmt(data.outstanding_receivables)}</p>
        </div>
      </div>

      {/* 6-Month Bar Chart */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-6">6-Month Cash Flow</h2>
        <div className="flex items-end gap-4 justify-between h-52">
          {data.monthly_chart.map(m => (
            <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full flex gap-1 items-end justify-center h-40">
                {/* Cash In Bar */}
                <div className="flex-1 max-w-8 flex flex-col justify-end">
                  <div
                    className="bg-green-500 rounded-t w-full transition-all"
                    style={{ height: `${(m.cash_in / maxBar) * 160}px` }}
                    title={`In: ${fmt(m.cash_in)}`}
                  />
                </div>
                {/* Cash Out Bar */}
                <div className="flex-1 max-w-8 flex flex-col justify-end">
                  <div
                    className="bg-red-500 rounded-t w-full transition-all"
                    style={{ height: `${(m.cash_out / maxBar) * 160}px` }}
                    title={`Out: ${fmt(m.cash_out)}`}
                  />
                </div>
              </div>
              <span className="text-xs text-gray-400 mt-2">{m.month}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-6 mt-4 justify-center">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-green-500" />
            <span className="text-xs text-gray-400">Cash In</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-red-500" />
            <span className="text-xs text-gray-400">Cash Out</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upcoming Recurring Expenses */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-gray-400" /> Upcoming Recurring Expenses (30 days)
          </h2>
          {data.recurring_upcoming.length === 0 ? (
            <p className="text-gray-500 text-sm">No upcoming recurring expenses.</p>
          ) : (
            <div className="space-y-2">
              {data.recurring_upcoming.map(r => (
                <div key={r.id} className="flex items-center justify-between bg-gray-900 border border-gray-700 rounded-lg p-3">
                  <div>
                    <p className="text-sm text-white">{r.description}</p>
                    <p className="text-xs text-gray-400">{r.category.replace(/_/g, ' ')} &middot; Due {r.due_date}</p>
                  </div>
                  <span className="text-sm font-medium text-red-400">{fmt(r.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Outstanding Invoices */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-yellow-400" /> Outstanding Invoices
          </h2>
          {data.outstanding_invoices.length === 0 ? (
            <p className="text-gray-500 text-sm">All invoices paid.</p>
          ) : (
            <div className="space-y-2">
              {data.outstanding_invoices.map(inv => (
                <div key={inv.id} className="flex items-center justify-between bg-gray-900 border border-gray-700 rounded-lg p-3">
                  <div>
                    <p className="text-sm text-white">{inv.customer_name}</p>
                    <p className="text-xs text-gray-400">{inv.job_address} &middot; Due {inv.due_date}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-yellow-400">{fmt(inv.amount)}</p>
                    {inv.days_overdue > 0 && (
                      <p className="text-xs text-red-400">{inv.days_overdue}d overdue</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
