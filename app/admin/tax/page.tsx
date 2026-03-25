'use client';

import { useState, useEffect } from 'react';
import { Calculator, AlertTriangle, CheckCircle, FileWarning, DollarSign, Car } from 'lucide-react';

interface TaxData {
  year: number;
  revenue_total: number;
  deductions_by_category: Record<string, number>;
  mileage_deduction: number;
  total_deductions: number;
  subs_needing_1099: { id: number; name: string; company: string; tax_id: string; total_paid: number }[];
  net_taxable_income: number;
  warnings: {
    subs_without_w9: { id: number; name: string }[];
    subs_without_tax_id: { id: number; name: string }[];
    missing_receipts_count: number;
  };
}

const fmt = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

const CATEGORY_LABELS: Record<string, string> = {
  vehicle_fuel: 'Vehicle / Fuel', tools_equipment: 'Tools & Equipment', insurance: 'Insurance',
  office_rent: 'Office / Rent', marketing: 'Marketing', subscriptions: 'Subscriptions',
  materials: 'Materials', subcontractor: 'Subcontractor', payroll: 'Payroll', taxes: 'Taxes',
  utilities: 'Utilities', meals: 'Meals', travel: 'Travel', misc: 'Miscellaneous',
  mileage: 'Mileage',
};

const maskTaxId = (id: string) => {
  if (!id) return '—';
  if (id.length <= 4) return id;
  return '***-**-' + id.slice(-4);
};

export default function TaxPage() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [data, setData] = useState<TaxData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/admin/finance/tax?year=${year}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [year]);

  const totalWarnings = data
    ? data.warnings.subs_without_w9.length + data.warnings.subs_without_tax_id.length + (data.warnings.missing_receipts_count > 0 ? 1 : 0)
    : 0;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Calculator className="w-7 h-7 text-red-500" />
          <h1 className="text-2xl font-bold text-white">Tax Prep Dashboard</h1>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-sm text-gray-400">Tax Year:</label>
          <select value={year} onChange={e => setYear(parseInt(e.target.value))} className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white">
            {Array.from({ length: 7 }, (_, i) => currentYear - i).map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {loading || !data ? (
        <div className="text-center py-20 text-gray-500">Loading...</div>
      ) : (
        <>
          {/* Missing Info Warnings */}
          {totalWarnings > 0 && (
            <div className="bg-yellow-900/20 border border-yellow-700 rounded-xl p-5 space-y-3">
              <h2 className="text-lg font-semibold text-yellow-400 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" /> Missing Information ({totalWarnings} issue{totalWarnings > 1 ? 's' : ''})
              </h2>
              {data.warnings.subs_without_w9.length > 0 && (
                <div className="flex items-start gap-2">
                  <FileWarning className="w-4 h-4 text-yellow-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm text-yellow-300">Subcontractors without W-9 on file:</p>
                    <p className="text-sm text-gray-300">{data.warnings.subs_without_w9.map(s => s.name).join(', ')}</p>
                  </div>
                </div>
              )}
              {data.warnings.subs_without_tax_id.length > 0 && (
                <div className="flex items-start gap-2">
                  <FileWarning className="w-4 h-4 text-yellow-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm text-yellow-300">Subcontractors without Tax ID:</p>
                    <p className="text-sm text-gray-300">{data.warnings.subs_without_tax_id.map(s => s.name).join(', ')}</p>
                  </div>
                </div>
              )}
              {data.warnings.missing_receipts_count > 0 && (
                <div className="flex items-start gap-2">
                  <FileWarning className="w-4 h-4 text-yellow-400 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-yellow-300">{data.warnings.missing_receipts_count} expense(s) missing receipts</p>
                </div>
              )}
            </div>
          )}

          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="w-4 h-4 text-green-400" />
                <p className="text-xs text-gray-400 uppercase tracking-wider">Revenue</p>
              </div>
              <p className="text-2xl font-bold text-green-400">{fmt(data.revenue_total)}</p>
            </div>
            <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
              <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Total Deductions</p>
              <p className="text-2xl font-bold text-red-400">{fmt(data.total_deductions)}</p>
            </div>
            <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
              <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Net Taxable Income</p>
              <p className={`text-2xl font-bold ${data.net_taxable_income >= 0 ? 'text-white' : 'text-red-400'}`}>
                {fmt(data.net_taxable_income)}
              </p>
            </div>
          </div>

          {/* Deductions by Category */}
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Deductions by Category</h2>
            <div className="space-y-2">
              {Object.entries(data.deductions_by_category)
                .sort((a, b) => b[1] - a[1])
                .map(([cat, amt]) => (
                  <div key={cat} className="flex items-center justify-between bg-gray-900 border border-gray-700 rounded-lg px-4 py-3">
                    <span className="text-sm text-gray-300">{CATEGORY_LABELS[cat] || cat}</span>
                    <span className="text-sm font-medium text-white">{fmt(amt)}</span>
                  </div>
                ))}
              {/* Mileage */}
              <div className="flex items-center justify-between bg-gray-900 border border-gray-700 rounded-lg px-4 py-3">
                <span className="text-sm text-gray-300 flex items-center gap-2">
                  <Car className="w-4 h-4 text-gray-500" /> Mileage Deduction
                </span>
                <span className="text-sm font-medium text-white">{fmt(data.mileage_deduction)}</span>
              </div>
              <div className="flex items-center justify-between border-t border-gray-700 pt-3 mt-3">
                <span className="text-sm font-semibold text-gray-300">Total Deductions</span>
                <span className="text-lg font-bold text-red-400">{fmt(data.total_deductions)}</span>
              </div>
            </div>
          </div>

          {/* 1099 Subcontractors */}
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4">
              1099 Subcontractors (Paid &ge; $600)
            </h2>
            {data.subs_needing_1099.length === 0 ? (
              <p className="text-gray-500 text-sm flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-400" /> No subcontractors reached the $600 threshold.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-700 text-gray-400 text-xs uppercase tracking-wider">
                      <th className="text-left px-4 py-3">Name</th>
                      <th className="text-left px-4 py-3">Company</th>
                      <th className="text-left px-4 py-3">Tax ID</th>
                      <th className="text-right px-4 py-3">Total Paid</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.subs_needing_1099.map(s => (
                      <tr key={s.id} className="border-b border-gray-700/50 hover:bg-gray-700/30 transition-colors">
                        <td className="px-4 py-3 text-white font-medium">{s.name}</td>
                        <td className="px-4 py-3 text-gray-300">{s.company}</td>
                        <td className="px-4 py-3 text-gray-400 font-mono text-xs">
                          {s.tax_id ? maskTaxId(s.tax_id) : (
                            <span className="text-yellow-400 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" /> Missing
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-white font-medium">{fmt(s.total_paid)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
