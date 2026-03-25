'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { TrendingUp, ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react';

interface JobRow {
  id:                string;
  address:           string;
  customer:          { id: string; name: string };
  status:            string;
  insurer:           string | null;
  claim_no:          string | null;
  created_at:        string;
  revenue:           number;
  collected:         number;
  our_total:         number;
  total_costs:       number;
  gross_profit:      number;
  margin_pct:        number;
  costs_entered:     boolean;
  costs_by_category: Record<string, number>;
  invoice_status:    string | null;
  invoice_no:        string | null;
}

interface Totals {
  revenue:      number;
  collected:    number;
  total_costs:  number;
  gross_profit: number;
}

function fmt(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function marginColor(pct: number): string {
  if (pct >= 35) return 'text-emerald-400';
  if (pct >= 20) return 'text-yellow-400';
  if (pct >= 0)  return 'text-orange-400';
  return 'text-red-400';
}

const CATEGORY_LABELS: Record<string, string> = {
  materials: 'Materials', labor: 'Labor', subs: 'Subs',
  equipment: 'Equipment', permits: 'Permits', eagleview: 'EagleView',
  marketing: 'Marketing', other: 'Other',
};

const STATUS_PILL: Record<string, string> = {
  PAID:     'bg-emerald-950 text-emerald-400',
  INVOICED: 'bg-amber-950 text-amber-400',
  APPROVED: 'bg-blue-950 text-blue-400',
};

type SortCol = keyof JobRow;

export default function AccountingPage() {
  const [rows,       setRows]       = useState<JobRow[]>([]);
  const [totals,     setTotals]     = useState<Totals | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [sort,       setSort]       = useState<{ col: SortCol; dir: 'asc' | 'desc' }>({ col: 'created_at', dir: 'desc' });
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/accounting')
      .then(r => r.json())
      .then(data => { setRows(data.rows ?? []); setTotals(data.totals); })
      .finally(() => setLoading(false));
  }, []);

  function toggleSort(col: SortCol) {
    setSort(s => s.col === col ? { col, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'desc' });
  }

  const sorted = [...rows].sort((a, b) => {
    const av = a[sort.col] as any, bv = b[sort.col] as any;
    if (av == null) return 1; if (bv == null) return -1;
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return sort.dir === 'asc' ? cmp : -cmp;
  });

  const withCosts    = rows.filter(r => r.costs_entered).length;
  const withoutCosts = rows.length - withCosts;

  function SortIcon({ col }: { col: SortCol }) {
    if (sort.col !== col) return <ChevronsUpDown className="w-3 h-3 text-gray-600 inline ml-1" />;
    return sort.dir === 'asc'
      ? <ChevronUp className="w-3 h-3 text-gray-300 inline ml-1" />
      : <ChevronDown className="w-3 h-3 text-gray-300 inline ml-1" />;
  }

  const thClass = 'px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider cursor-pointer select-none hover:text-gray-300 transition-colors whitespace-nowrap';

  return (
    <div className="p-6 max-w-screen-xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <div className="p-2.5 bg-red-700 rounded-xl"><TrendingUp className="w-5 h-5 text-white" /></div>
        <div>
          <h1 className="text-xl font-black text-white tracking-tight leading-none">Job P&amp;L</h1>
          <p className="text-gray-500 text-xs mt-0.5">Approved, invoiced &amp; paid jobs &middot; enter costs on estimate page</p>
        </div>
      </div>

      {/* Summary Cards */}
      {totals && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          {[
            { label: 'Total Jobs',    value: String(rows.length),     sub: `${withoutCosts} missing costs`,                                   accent: 'bg-gray-500',    vc: 'text-white' },
            { label: 'Revenue',       value: fmt(totals.revenue),     sub: 'contracted value',                                                accent: 'bg-blue-500',    vc: 'text-blue-400' },
            { label: 'Total Costs',   value: fmt(totals.total_costs), sub: `${withCosts} jobs w/ costs`,                                      accent: 'bg-red-500',     vc: 'text-red-400' },
            { label: 'Gross Profit',  value: fmt(totals.gross_profit),
              sub: totals.revenue > 0 ? `${((totals.gross_profit / totals.revenue) * 100).toFixed(1)}% margin` : '\u2014',
              accent: totals.gross_profit >= 0 ? 'bg-emerald-500' : 'bg-red-500',
              vc: totals.gross_profit >= 0 ? 'text-emerald-400' : 'text-red-400' },
            { label: 'Collected',     value: fmt(totals.collected),   sub: 'actual cash in',                                                  accent: 'bg-teal-500',    vc: 'text-teal-400' },
          ].map(card => (
            <div key={card.label} className="relative bg-gray-800 border border-gray-700 rounded-2xl p-5 overflow-hidden">
              <div className={`absolute top-0 left-0 right-0 h-0.5 ${card.accent}`} />
              <div className={`text-2xl font-black tracking-tight ${card.vc}`}>{card.value}</div>
              <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">{card.label}</div>
              <div className="text-xs text-gray-600 mt-0.5">{card.sub}</div>
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="bg-gray-800 border border-gray-700 rounded-2xl overflow-hidden">
        {loading ? (
          <p className="p-8 text-center text-gray-500">Loading\u2026</p>
        ) : rows.length === 0 ? (
          <p className="p-8 text-center text-gray-500">No approved/invoiced/paid jobs yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-900/50 border-b border-gray-700">
                  <th className={`${thClass} text-left`} onClick={() => toggleSort('created_at')}>Date <SortIcon col="created_at" /></th>
                  <th className={`${thClass} text-left`} onClick={() => toggleSort('address')}>Address <SortIcon col="address" /></th>
                  <th className={`${thClass} text-left`} onClick={() => toggleSort('address')}>Customer</th>
                  <th className={`${thClass} text-left`} onClick={() => toggleSort('insurer')}>Insurer</th>
                  <th className={`${thClass} text-left`} onClick={() => toggleSort('status')}>Status</th>
                  <th className={`${thClass} text-right`} onClick={() => toggleSort('revenue')}>Revenue <SortIcon col="revenue" /></th>
                  <th className={`${thClass} text-right`} onClick={() => toggleSort('total_costs')}>Costs <SortIcon col="total_costs" /></th>
                  <th className={`${thClass} text-right`} onClick={() => toggleSort('gross_profit')}>Gross Profit <SortIcon col="gross_profit" /></th>
                  <th className={`${thClass} text-right`} onClick={() => toggleSort('margin_pct')}>Margin <SortIcon col="margin_pct" /></th>
                  <th className={`${thClass} text-right`} onClick={() => toggleSort('collected')}>Collected <SortIcon col="collected" /></th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((row, i) => (
                  <>
                    <tr
                      key={row.id}
                      className={`border-t border-gray-700/50 cursor-pointer transition-colors ${
                        i % 2 === 0 ? 'hover:bg-gray-700/30' : 'bg-gray-900/20 hover:bg-gray-700/30'
                      } ${expandedId === row.id ? 'bg-gray-700/40' : ''}`}
                      onClick={() => setExpandedId(expandedId === row.id ? null : row.id)}
                    >
                      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                        {new Date(row.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
                      </td>
                      <td className="px-4 py-3 max-w-[180px]">
                        <div className="text-gray-200 text-sm truncate">{row.address}</div>
                        {row.invoice_no && <div className="text-xs text-gray-600">Inv {row.invoice_no}</div>}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-300 whitespace-nowrap">{row.customer.name}</td>
                      <td className="px-4 py-3 text-sm text-gray-400">
                        {row.insurer ?? '\u2014'}
                        {row.claim_no && <div className="text-xs text-gray-600">{row.claim_no}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${STATUS_PILL[row.invoice_status ?? row.status] || 'bg-gray-800 text-gray-400'}`}>
                          {row.invoice_status ?? row.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold text-blue-400 text-sm">{fmt(row.revenue)}</td>
                      <td className="px-4 py-3 text-right font-mono font-semibold text-red-400 text-sm">
                        {row.costs_entered ? fmt(row.total_costs) : <span className="text-gray-700">\u2014</span>}
                      </td>
                      <td className={`px-4 py-3 text-right font-mono font-bold text-sm ${row.costs_entered ? (row.gross_profit >= 0 ? 'text-emerald-400' : 'text-red-400') : 'text-gray-700'}`}>
                        {row.costs_entered ? fmt(row.gross_profit) : '\u2014'}
                      </td>
                      <td className={`px-4 py-3 text-right font-mono font-bold text-sm ${row.costs_entered ? marginColor(row.margin_pct) : 'text-gray-700'}`}>
                        {row.costs_entered ? `${row.margin_pct.toFixed(1)}%` : '\u2014'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-sm text-teal-400">
                        {row.collected > 0 ? fmt(row.collected) : <span className="text-gray-700">\u2014</span>}
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/admin/estimates/${row.id}`} onClick={e => e.stopPropagation()}
                          className="text-xs text-gray-600 hover:text-gray-300 transition-colors">
                          Open \u2192
                        </Link>
                      </td>
                    </tr>

                    {expandedId === row.id && (
                      <tr key={row.id + '-exp'} className="border-t border-gray-700/30">
                        <td colSpan={11} className="px-5 pb-4 pt-2 bg-gray-900/30">
                          {Object.keys(row.costs_by_category).length === 0 ? (
                            <div className="text-gray-500 text-sm">
                              No costs entered. <Link href={`/admin/estimates/${row.id}`} className="text-blue-400 hover:text-blue-300">Add costs \u2192</Link>
                            </div>
                          ) : (
                            <div>
                              <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Cost Breakdown</p>
                              <div className="flex gap-2 flex-wrap">
                                {Object.entries(row.costs_by_category).map(([cat, amt]) => (
                                  <div key={cat} className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2">
                                    <div className="text-xs text-gray-500">{CATEGORY_LABELS[cat] ?? cat}</div>
                                    <div className="text-sm font-bold text-red-400">{fmt(amt)}</div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>

              {totals && (
                <tfoot>
                  <tr className="border-t-2 border-gray-600 bg-gray-900/50">
                    <td colSpan={5} className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider">
                      Totals &middot; {rows.length} jobs
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-blue-400">{fmt(totals.revenue)}</td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-red-400">{fmt(totals.total_costs)}</td>
                    <td className={`px-4 py-3 text-right font-mono font-bold ${totals.gross_profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmt(totals.gross_profit)}</td>
                    <td className={`px-4 py-3 text-right font-mono font-bold ${totals.revenue > 0 ? marginColor((totals.gross_profit / totals.revenue) * 100) : 'text-gray-500'}`}>
                      {totals.revenue > 0 ? `${((totals.gross_profit / totals.revenue) * 100).toFixed(1)}%` : '\u2014'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-teal-400">{fmt(totals.collected)}</td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
