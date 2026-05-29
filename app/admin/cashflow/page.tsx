'use client';

import { useState, useEffect } from 'react';
import { ArrowLeftRight, TrendingUp, TrendingDown, DollarSign, Clock, AlertCircle, Send, CheckCircle } from 'lucide-react';

interface OutstandingInvoice {
  id: string; job_address: string; customer_name: string; amount: number;
  due_date: string; days_overdue: number; invoice_type: string;
  can_remind: boolean; last_reminded: string | null; reminder_count: number;
}
interface CashflowData {
  cash_in: number; cash_out: number; net: number; outstanding_receivables: number;
  monthly_chart: { month: string; cash_in: number; cash_out: number }[];
  recurring_upcoming: { id: string; description: string; amount: number; due_date: string; category: string }[];
  outstanding_invoices: OutstandingInvoice[];
  alert_summary: { recurring_due_7d: number; low_cash_warning: boolean; missing_costs_count: number };
}

const fmt = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export default function CashflowPage() {
  const [data, setData] = useState<CashflowData | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState<string | null>(null);
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  useEffect(() => {
    fetch('/api/admin/finance/cashflow').then(r => r.json()).then(d => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const showToast = (msg: string, ok = true) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 3000); };

  const sendReminder = async (inv: OutstandingInvoice) => {
    setSending(inv.id);
    const r = await fetch('/api/admin/finance/reminders/send', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoice_id: inv.id, invoice_type: inv.invoice_type }),
    });
    const d = await r.json();
    setSending(null);
    if (r.ok) { setSent(s => new Set([...s, inv.id])); showToast(`Reminder sent to ${d.sent_to}`); }
    else showToast(d.error || 'Send failed', false);
  };

  if (loading || !data) return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6"><ArrowLeftRight className="w-7 h-7 text-red-500" /><h1 className="text-2xl font-bold text-white">Cash Flow</h1></div>
      <div className="text-center py-20 text-gray-500">Loading...</div>
    </div>
  );

  const maxBar = Math.max(...data.monthly_chart.map(m => Math.max(m.cash_in, m.cash_out)), 1);

  return (
    <div className="p-6 space-y-6">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium flex items-center gap-2 ${toast.ok ? 'bg-green-600' : 'bg-red-600'} text-white`}>
          <CheckCircle className="w-4 h-4" />{toast.msg}
        </div>
      )}

      <div className="flex items-center gap-3">
        <ArrowLeftRight className="w-7 h-7 text-red-500" />
        <h1 className="text-2xl font-bold text-white">Cash Flow</h1>
      </div>

      {/* Financial health alerts */}
      {(data.alert_summary.low_cash_warning || data.alert_summary.recurring_due_7d > 0 || data.alert_summary.missing_costs_count > 0) && (
        <div className="bg-amber-950 border border-amber-800 rounded-xl p-4 space-y-1.5">
          <p className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-2">Financial Health Alerts</p>
          {data.alert_summary.low_cash_warning && (
            <div className="flex items-center gap-2 text-amber-300 text-sm"><AlertCircle className="w-4 h-4 flex-shrink-0" /> Projected outflows this month may exceed recent cash in — monitor closely.</div>
          )}
          {data.alert_summary.recurring_due_7d > 0 && (
            <div className="flex items-center gap-2 text-amber-300 text-sm"><Clock className="w-4 h-4 flex-shrink-0" /> {data.alert_summary.recurring_due_7d} recurring expense(s) due in the next 7 days.</div>
          )}
          {data.alert_summary.missing_costs_count > 0 && (
            <div className="flex items-center gap-2 text-amber-300 text-sm"><AlertCircle className="w-4 h-4 flex-shrink-0" /> {data.alert_summary.missing_costs_count} completed job(s) missing cost entries — P&L may be incomplete.</div>
          )}
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { icon: TrendingUp, label: 'Cash In (This Month)', value: fmt(data.cash_in), color: 'text-green-400', ic: 'text-green-400' },
          { icon: TrendingDown, label: 'Cash Out', value: fmt(data.cash_out), color: 'text-red-400', ic: 'text-red-400' },
          { icon: DollarSign, label: 'Net', value: fmt(data.net), color: data.net >= 0 ? 'text-green-400' : 'text-red-400', ic: 'text-white' },
          { icon: Clock, label: 'Outstanding Receivables', value: fmt(data.outstanding_receivables), color: 'text-yellow-400', ic: 'text-yellow-400' },
        ].map(card => (
          <div key={card.label} className="bg-gray-800 border border-gray-700 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-1">
              <card.icon className={`w-4 h-4 ${card.ic}`} />
              <p className="text-xs text-gray-400 uppercase tracking-wider">{card.label}</p>
            </div>
            <p className={`text-xl font-bold ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* 6-Month Bar Chart */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-6">6-Month Cash Flow</h2>
        <div className="flex items-end gap-4 justify-between h-52">
          {data.monthly_chart.map(m => (
            <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full flex gap-1 items-end justify-center h-40">
                <div className="flex-1 max-w-8 flex flex-col justify-end">
                  <div className="bg-green-500 rounded-t w-full transition-all" style={{ height: `${(m.cash_in / maxBar) * 160}px` }} title={`In: ${fmt(m.cash_in)}`} />
                </div>
                <div className="flex-1 max-w-8 flex flex-col justify-end">
                  <div className="bg-red-500 rounded-t w-full transition-all" style={{ height: `${(m.cash_out / maxBar) * 160}px` }} title={`Out: ${fmt(m.cash_out)}`} />
                </div>
              </div>
              <span className="text-xs text-gray-400 mt-2">{m.month}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-6 mt-4 justify-center">
          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-green-500" /><span className="text-xs text-gray-400">Cash In</span></div>
          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-red-500" /><span className="text-xs text-gray-400">Cash Out</span></div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upcoming Recurring */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-gray-400" /> Upcoming Recurring (30 days)
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

        {/* Outstanding Invoices with Send Reminder */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-yellow-400" /> Outstanding Invoices
          </h2>
          {data.outstanding_invoices.length === 0 ? (
            <p className="text-gray-500 text-sm">All invoices paid.</p>
          ) : (
            <div className="space-y-2">
              {data.outstanding_invoices.map(inv => (
                <div key={inv.id} className="bg-gray-900 border border-gray-700 rounded-lg p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm text-white truncate">{inv.customer_name}</p>
                      <p className="text-xs text-gray-400 truncate">{inv.job_address || 'No address'} &middot; Due {inv.due_date}</p>
                      {inv.last_reminded && (
                        <p className="text-xs text-blue-400 mt-0.5">Reminded {inv.reminder_count}x &middot; Last {new Date(inv.last_reminded).toLocaleDateString()}</p>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-medium text-yellow-400">{fmt(inv.amount)}</p>
                      {inv.days_overdue > 0 && <p className="text-xs text-red-400">{inv.days_overdue}d overdue</p>}
                    </div>
                  </div>
                  <div className="mt-2 flex justify-end">
                    {sent.has(inv.id) ? (
                      <span className="text-xs text-green-400 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Sent</span>
                    ) : inv.can_remind ? (
                      <button onClick={() => sendReminder(inv)} disabled={sending === inv.id}
                        className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors disabled:opacity-50">
                        <Send className="w-3 h-3" />
                        {sending === inv.id ? 'Sending...' : 'Send Reminder'}
                      </button>
                    ) : (
                      <span className="text-xs text-gray-600">No email on file</span>
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
