'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Receipt, Plus, ChevronDown, ChevronUp, Upload, Search, X,
  Fuel, Wrench, Shield, Building, Megaphone, CreditCard, Package,
  HardHat, Users, Landmark, Zap, UtensilsCrossed, Plane, MoreHorizontal,
  FileText, CheckCircle, Pencil, Trash2,
} from 'lucide-react';

/* ── types ── */
interface Expense {
  id: number;
  date: string;
  category: string;
  description: string;
  amount: number;
  vendor: string;
  payment_method: string;
  reference_no?: string;
  receipt_url?: string;
  subcontractor_id?: number;
  is_recurring: boolean;
  is_tax_deductible: boolean;
  notes?: string;
}

interface Stats {
  total_this_month: number;
  total_this_year: number;
  count: number;
  top_category: string;
}

interface SubOption { id: number; name: string; company: string }

/* ── constants ── */
const CATEGORIES = [
  'vehicle_fuel','tools_equipment','insurance','office_rent','marketing',
  'subscriptions','materials','subcontractor','payroll','taxes',
  'utilities','meals','travel','misc',
] as const;

const CATEGORY_LABELS: Record<string, string> = {
  vehicle_fuel: 'Vehicle / Fuel', tools_equipment: 'Tools & Equipment', insurance: 'Insurance',
  office_rent: 'Office / Rent', marketing: 'Marketing', subscriptions: 'Subscriptions',
  materials: 'Materials', subcontractor: 'Subcontractor', payroll: 'Payroll', taxes: 'Taxes',
  utilities: 'Utilities', meals: 'Meals', travel: 'Travel', misc: 'Miscellaneous',
};

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  vehicle_fuel: Fuel, tools_equipment: Wrench, insurance: Shield,
  office_rent: Building, marketing: Megaphone, subscriptions: CreditCard,
  materials: Package, subcontractor: HardHat, payroll: Users, taxes: Landmark,
  utilities: Zap, meals: UtensilsCrossed, travel: Plane, misc: MoreHorizontal,
};

const PAYMENT_METHODS = ['cash','check','credit_card','debit_card','ach','zelle','venmo','other'];

const fmt = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

/* ── component ── */
export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [stats, setStats] = useState<Stats>({ total_this_month: 0, total_this_year: 0, count: 0, top_category: '' });
  const [loading, setLoading] = useState(true);

  // filters
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [vendorSearch, setVendorSearch] = useState('');

  // form
  const [showForm, setShowForm] = useState(false);
  const [subs, setSubs] = useState<SubOption[]>([]);
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    category: '' as string,
    description: '',
    amount: '',
    vendor: '',
    payment_method: 'credit_card',
    reference_no: '',
    receipt_base64: '',
    receipt_name: '',
    subcontractor_id: '',
    is_recurring: false,
    is_tax_deductible: false,
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  /* ── fetch ── */
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set('from', dateFrom);
      if (dateTo) params.set('to', dateTo);
      if (filterCat) params.set('category', filterCat);
      if (vendorSearch) params.set('vendor', vendorSearch);
      const r = await fetch(`/api/admin/expenses?${params}`);
      const d = await r.json();
      setExpenses(d.expenses ?? []);
      const sum = d.summary ?? {};
      const bycat: { category: string; total: number }[] = sum.byCategory ?? [];
      const topCat = [...bycat].sort((a, b) => b.total - a.total)[0]?.category ?? '';
      setStats({
        total_this_month: sum.totalThisMonth ?? 0,
        total_this_year:  sum.totalThisYear  ?? 0,
        count:            d.total            ?? 0,
        top_category:     topCat,
      });
    } catch { /* noop */ }
    setLoading(false);
  }, [dateFrom, dateTo, filterCat, vendorSearch]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetch('/api/admin/subcontractors?limit=200').then(r => r.json()).then(d => setSubs(d.subcontractors ?? [])).catch(() => {});
  }, []);

  /* ── receipt upload ── */
  const handleReceipt = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setForm(f => ({ ...f, receipt_base64: reader.result as string, receipt_name: file.name }));
    reader.readAsDataURL(file);
  };

  /* ── submit ── */
  const submit = async () => {
    if (editingId) return saveEdit();
    setSaving(true);
    try {
      await fetch('/api/admin/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          amount: parseFloat(form.amount),
          subcontractor_id: form.subcontractor_id || null,
        }),
      });
      setShowForm(false);
      setEditingId(null);
      setForm({
        date: new Date().toISOString().slice(0, 10), category: '', description: '', amount: '',
        vendor: '', payment_method: 'credit_card', reference_no: '', receipt_base64: '', receipt_name: '',
        subcontractor_id: '', is_recurring: false, is_tax_deductible: false, notes: '',
      });
      load();
    } catch { /* noop */ }
    setSaving(false);
  };

  /* ── edit ── */
  const startEdit = (e: Expense) => {
    setEditingId(e.id as any);
    setForm({
      date: e.date?.slice(0, 10) || '',
      category: e.category,
      description: e.description,
      amount: String(e.amount),
      vendor: e.vendor || '',
      payment_method: e.payment_method || 'credit_card',
      reference_no: e.reference_no || '',
      receipt_base64: '',
      receipt_name: '',
      subcontractor_id: e.subcontractor_id || '',
      is_recurring: e.is_recurring,
      is_tax_deductible: e.is_tax_deductible,
      notes: e.notes || '',
    });
    setShowForm(true);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    setSaving(true);
    try {
      await fetch(`/api/admin/expenses/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          amount: parseFloat(form.amount),
          subcontractor_id: form.subcontractor_id || null,
        }),
      });
      setShowForm(false);
      setEditingId(null);
      load();
    } catch { /* noop */ }
    setSaving(false);
  };

  /* ── delete ── */
  const handleDelete = async (id: string) => {
    if (!confirm('Delete this expense?')) return;
    setDeletingId(id);
    try {
      await fetch(`/api/admin/expenses/${id}`, { method: 'DELETE' });
      load();
    } catch { /* noop */ }
    setDeletingId(null);
  };

  /* ── category chart ── */
  const catTotals: Record<string, number> = {};
  expenses.forEach(e => { catTotals[e.category] = (catTotals[e.category] || 0) + e.amount; });
  const sortedCats = Object.entries(catTotals).sort((a, b) => b[1] - a[1]);
  const maxCat = sortedCats[0]?.[1] || 1;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Receipt className="w-7 h-7 text-red-500" />
          <h1 className="text-2xl font-bold text-white">Expenses</h1>
        </div>
        <button onClick={() => { setEditingId(null); setForm({ date: new Date().toISOString().slice(0, 10), category: '', description: '', amount: '', vendor: '', payment_method: 'credit_card', reference_no: '', receipt_base64: '', receipt_name: '', subcontractor_id: '', is_recurring: false, is_tax_deductible: false, notes: '' }); setShowForm(!showForm); }} className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          {showForm ? <ChevronUp className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showForm ? 'Close' : 'Add Expense'}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total This Month', value: fmt(stats.total_this_month) },
          { label: 'Total This Year', value: fmt(stats.total_this_year) },
          { label: '# Expenses', value: stats.count.toLocaleString() },
          { label: 'Top Category', value: CATEGORY_LABELS[stats.top_category] || stats.top_category || '—' },
        ].map(s => (
          <div key={s.label} className="bg-gray-800 border border-gray-700 rounded-xl p-5">
            <p className="text-xs text-gray-400 uppercase tracking-wider">{s.label}</p>
            <p className="text-xl font-bold text-white mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Add Expense Form */}
      {showForm && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white">New Expense</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Date *</label>
              <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Category *</label>
              <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white">
                <option value="">— Select Category —</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Amount *</label>
              <input type="number" step="0.01" placeholder="0.00" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs text-gray-400 mb-1">Description *</label>
              <input type="text" placeholder="What was this expense for?" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Vendor</label>
              <input type="text" placeholder="Company / store name" value={form.vendor} onChange={e => setForm({ ...form, vendor: e.target.value })} className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Payment Method</label>
              <select value={form.payment_method} onChange={e => setForm({ ...form, payment_method: e.target.value })} className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white">
                {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Reference #</label>
              <input type="text" placeholder="Check #, receipt #" value={form.reference_no} onChange={e => setForm({ ...form, reference_no: e.target.value })} className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Subcontractor</label>
              <select value={form.subcontractor_id} onChange={e => setForm({ ...form, subcontractor_id: e.target.value })} className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white">
                <option value="">— None —</option>
                {subs.map(s => <option key={s.id} value={s.id}>{s.name} ({s.company})</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Receipt</label>
              <label className="flex items-center gap-2 cursor-pointer bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-300 hover:border-gray-500 transition-colors">
                <Upload className="w-4 h-4" />
                {form.receipt_name || 'Upload file'}
                <input type="file" accept="image/*,.pdf" className="hidden" onChange={handleReceipt} />
              </label>
            </div>
            <div className="flex items-center gap-6 md:col-span-2">
              <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                <input type="checkbox" checked={form.is_recurring} onChange={e => setForm({ ...form, is_recurring: e.target.checked })} className="rounded bg-gray-900 border-gray-600 text-red-600 focus:ring-red-500" />
                Recurring Expense
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                <input type="checkbox" checked={form.is_tax_deductible} onChange={e => setForm({ ...form, is_tax_deductible: e.target.checked })} className="rounded bg-gray-900 border-gray-600 text-red-600 focus:ring-red-500" />
                Tax Deductible
              </label>
            </div>
            <div className="md:col-span-3">
              <label className="block text-xs text-gray-400 mb-1">Notes</label>
              <textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white" />
            </div>
          </div>
          <div className="flex justify-end">
            <button onClick={submit} disabled={saving || !form.description || !form.amount || !form.category} className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors">
              {saving ? 'Saving...' : editingId ? 'Update Expense' : 'Save Expense'}
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-xs text-gray-400 mb-1">From</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">To</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Category</label>
            <select value={filterCat} onChange={e => setFilterCat(e.target.value)} className="bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white">
              <option value="">All Categories</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
            </select>
          </div>
          <div className="relative">
            <label className="block text-xs text-gray-400 mb-1">Vendor</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input type="text" placeholder="Search vendor..." value={vendorSearch} onChange={e => setVendorSearch(e.target.value)} className="bg-gray-900 border border-gray-600 rounded-lg pl-9 pr-3 py-2 text-sm text-white w-48" />
            </div>
          </div>
          {(dateFrom || dateTo || filterCat || vendorSearch) && (
            <button onClick={() => { setDateFrom(''); setDateTo(''); setFilterCat(''); setVendorSearch(''); }} className="flex items-center gap-1 text-red-400 hover:text-red-300 text-sm">
              <X className="w-4 h-4" /> Clear
            </button>
          )}
        </div>
      </div>

      {/* Monthly Category Chart */}
      {sortedCats.length > 0 && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Expenses by Category</h2>
          <div className="space-y-3">
            {sortedCats.map(([cat, total]) => {
              const Icon = CATEGORY_ICONS[cat] || MoreHorizontal;
              return (
                <div key={cat} className="flex items-center gap-3">
                  <Icon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <span className="text-sm text-gray-300 w-36 truncate">{CATEGORY_LABELS[cat] || cat}</span>
                  <div className="flex-1 bg-gray-700 rounded-full h-5 overflow-hidden">
                    <div className="bg-red-600 h-full rounded-full transition-all" style={{ width: `${(total / maxCat) * 100}%` }} />
                  </div>
                  <span className="text-sm font-medium text-white w-24 text-right">{fmt(total)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700 text-gray-400 text-xs uppercase tracking-wider">
                <th className="text-left px-4 py-3">Date</th>
                <th className="text-left px-4 py-3">Category</th>
                <th className="text-left px-4 py-3">Description</th>
                <th className="text-left px-4 py-3">Vendor</th>
                <th className="text-right px-4 py-3">Amount</th>
                <th className="text-left px-4 py-3">Payment</th>
                <th className="text-center px-4 py-3">Receipt</th>
                <th className="text-center px-4 py-3">Tax Ded.</th>
                <th className="text-right px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="text-center py-12 text-gray-500">Loading...</td></tr>
              ) : expenses.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-12 text-gray-500">No expenses found</td></tr>
              ) : expenses.map(e => {
                const Icon = CATEGORY_ICONS[e.category] || MoreHorizontal;
                return (
                  <tr key={e.id} className="border-b border-gray-700/50 hover:bg-gray-700/30 transition-colors">
                    <td className="px-4 py-3 text-gray-300 whitespace-nowrap">{e.date}</td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-2 text-gray-300">
                        <Icon className="w-4 h-4 text-gray-500" />
                        {CATEGORY_LABELS[e.category] || e.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-white">{e.description}</td>
                    <td className="px-4 py-3 text-gray-300">{e.vendor || '—'}</td>
                    <td className="px-4 py-3 text-right font-medium text-white">{fmt(e.amount)}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{e.payment_method?.replace(/_/g, ' ')}</td>
                    <td className="px-4 py-3 text-center">
                      {e.receipt_url ? <FileText className="w-4 h-4 text-green-400 mx-auto" /> : <span className="text-gray-600">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {e.is_tax_deductible && <span className="inline-flex items-center gap-1 text-xs bg-green-900/40 text-green-400 border border-green-700 px-2 py-0.5 rounded-full"><CheckCircle className="w-3 h-3" /> Yes</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => startEdit(e)} className="p-1.5 rounded text-gray-500 hover:text-blue-400 hover:bg-blue-950 transition-colors" title="Edit">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDelete(String(e.id))} disabled={deletingId === String(e.id)} className="p-1.5 rounded text-gray-500 hover:text-red-400 hover:bg-red-950 transition-colors disabled:opacity-40" title="Delete">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
