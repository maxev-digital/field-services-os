'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  HardHat, Plus, ChevronDown, ChevronUp, X, Upload, Download, Trash2,
  Phone, Mail, MapPin, AlertTriangle, CheckCircle, FileText, ArrowLeft, Search,
} from 'lucide-react';

/* ── types ── */
interface Sub {
  id: number;
  name: string;
  company: string;
  trade: string;
  phone: string;
  email: string;
  address?: string;
  city?: string;
  tax_id?: string;
  insurance_exp?: string;
  license_no?: string;
  hourly_rate?: number;
  notes?: string;
  status: string;
  total_paid: number;
  doc_count: number;
}

interface SubDoc {
  id: number;
  type: string;
  name: string;
  expiry?: string;
  url: string;
}

interface SubExpense {
  id: number;
  date: string;
  description: string;
  amount: number;
}

interface Stats {
  total: number;
  active: number;
  insurance_expiring_soon: number;
  total_paid_ytd: number;
}

const TRADES = ['roofing','siding','gutters','windows','painting','drywall','framing','electrical','plumbing','hvac','concrete','fencing','general_labor','other'];
const DOC_TYPES = ['w9','insurance_cert','id','license','contract','other'];
const DOC_LABELS: Record<string, string> = { w9: 'W-9', insurance_cert: 'Insurance Cert', id: 'ID', license: 'License', contract: 'Contract', other: 'Other' };

const fmt = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export default function SubcontractorsPage() {
  const [subs, setSubs] = useState<Sub[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, active: 0, insurance_expiring_soon: 0, total_paid_ytd: 0 });
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  // detail view
  const [selectedSub, setSelectedSub] = useState<Sub | null>(null);
  const [docs, setDocs] = useState<SubDoc[]>([]);
  const [subExpenses, setSubExpenses] = useState<SubExpense[]>([]);
  const [editForm, setEditForm] = useState<Partial<Sub>>({});
  const [docUpload, setDocUpload] = useState({ type: 'w9', name: '', expiry: '', base64: '' });

  const blankForm = {
    name: '', company: '', trade: 'roofing', phone: '', email: '', address: '', city: '',
    tax_id: '', insurance_exp: '', license_no: '', hourly_rate: '', notes: '',
  };
  const [form, setForm] = useState<any>(blankForm);

  /* ── fetch list ── */
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      const r = await fetch(`/api/admin/subcontractors?${params}`);
      const d = await r.json();
      setSubs(d.subcontractors ?? []);
      setStats(d.stats ?? { total: 0, active: 0, insurance_expiring_soon: 0, total_paid_ytd: 0 });
    } catch { /* noop */ }
    setLoading(false);
  }, [search]);

  useEffect(() => { load(); }, [load]);

  /* ── fetch detail ── */
  const loadDetail = async (sub: Sub) => {
    setSelectedSub(sub);
    setEditForm(sub);
    try {
      const [docR, expR] = await Promise.all([
        fetch(`/api/admin/subcontractors/${sub.id}/documents`),
        fetch(`/api/admin/subcontractors/${sub.id}?include=expenses`),
      ]);
      const docD = await docR.json();
      const expD = await expR.json();
      setDocs(docD.documents ?? []);
      setSubExpenses(expD.expenses ?? []);
    } catch { /* noop */ }
  };

  /* ── submit new ── */
  const submit = async () => {
    setSaving(true);
    try {
      await fetch('/api/admin/subcontractors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, hourly_rate: form.hourly_rate ? parseFloat(form.hourly_rate) : null }),
      });
      setShowForm(false);
      setForm(blankForm);
      load();
    } catch { /* noop */ }
    setSaving(false);
  };

  /* ── update sub ── */
  const updateSub = async () => {
    if (!selectedSub) return;
    setSaving(true);
    try {
      await fetch(`/api/admin/subcontractors/${selectedSub.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      load();
      setSelectedSub({ ...selectedSub, ...editForm } as Sub);
    } catch { /* noop */ }
    setSaving(false);
  };

  /* ── doc upload ── */
  const handleDocFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setDocUpload(d => ({ ...d, base64: reader.result as string, name: file.name }));
    reader.readAsDataURL(file);
  };

  const uploadDoc = async () => {
    if (!selectedSub || !docUpload.base64) return;
    await fetch(`/api/admin/subcontractors/${selectedSub.id}/documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(docUpload),
    });
    setDocUpload({ type: 'w9', name: '', expiry: '', base64: '' });
    const r = await fetch(`/api/admin/subcontractors/${selectedSub.id}/documents`);
    const d = await r.json();
    setDocs(d.documents ?? []);
  };

  const deleteDoc = async (docId: number) => {
    if (!selectedSub || !confirm('Delete this document?')) return;
    await fetch(`/api/admin/subcontractors/${selectedSub.id}/documents/${docId}`, { method: 'DELETE' });
    setDocs(docs.filter(d => d.id !== docId));
  };

  /* ── insurance status helper ── */
  const insuranceStatus = (date?: string) => {
    if (!date) return 'unknown';
    const exp = new Date(date);
    const now = new Date();
    const diff = (exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    if (diff < 0) return 'expired';
    if (diff < 30) return 'expiring';
    return 'valid';
  };

  /* ── detail view ── */
  if (selectedSub) {
    const insStatus = insuranceStatus(selectedSub.insurance_exp);
    const is1099 = selectedSub.total_paid >= 600;
    return (
      <div className="p-6 space-y-6">
        <button onClick={() => setSelectedSub(null)} className="flex items-center gap-2 text-gray-400 hover:text-white text-sm mb-2">
          <ArrowLeft className="w-4 h-4" /> Back to Subcontractors
        </button>

        <div className="flex items-center gap-4">
          <HardHat className="w-7 h-7 text-red-500" />
          <div>
            <h1 className="text-2xl font-bold text-white">{selectedSub.name}</h1>
            <p className="text-gray-400 text-sm">{selectedSub.company} &middot; {selectedSub.trade.replace(/_/g, ' ')}</p>
          </div>
          {is1099 && <span className="ml-auto bg-yellow-900/40 text-yellow-400 border border-yellow-700 text-xs px-3 py-1 rounded-full font-medium">1099 Required</span>}
        </div>

        {/* Editable Info */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white">Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { key: 'name', label: 'Name', type: 'text' },
              { key: 'company', label: 'Company', type: 'text' },
              { key: 'trade', label: 'Trade', type: 'select', options: TRADES },
              { key: 'phone', label: 'Phone', type: 'tel' },
              { key: 'email', label: 'Email', type: 'email' },
              { key: 'address', label: 'Address', type: 'text' },
              { key: 'city', label: 'City', type: 'text' },
              { key: 'tax_id', label: 'Tax ID (EIN/SSN)', type: 'text' },
              { key: 'insurance_exp', label: 'Insurance Expiry', type: 'date' },
              { key: 'license_no', label: 'License #', type: 'text' },
              { key: 'hourly_rate', label: 'Hourly Rate ($)', type: 'number' },
            ].map(f => (
              <div key={f.key}>
                <label className="block text-xs text-gray-400 mb-1">{f.label}</label>
                {f.type === 'select' ? (
                  <select value={(editForm as any)[f.key] || ''} onChange={e => setEditForm({ ...editForm, [f.key]: e.target.value })} className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white">
                    {f.options!.map((o: string) => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
                  </select>
                ) : (
                  <input type={f.type} value={(editForm as any)[f.key] || ''} onChange={e => setEditForm({ ...editForm, [f.key]: e.target.value })} className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white" />
                )}
              </div>
            ))}
            <div className="md:col-span-3">
              <label className="block text-xs text-gray-400 mb-1">Notes</label>
              <textarea rows={2} value={editForm.notes || ''} onChange={e => setEditForm({ ...editForm, notes: e.target.value })} className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white" />
            </div>
          </div>
          <div className="flex justify-end">
            <button onClick={updateSub} disabled={saving} className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors">
              {saving ? 'Saving...' : 'Update Info'}
            </button>
          </div>
        </div>

        {/* Documents */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white">Documents</h2>
          {docs.length > 0 && (
            <div className="space-y-2">
              {docs.map(d => (
                <div key={d.id} className="flex items-center gap-3 bg-gray-900 border border-gray-700 rounded-lg p-3">
                  <FileText className="w-4 h-4 text-gray-400" />
                  <span className="bg-red-900/30 text-red-400 border border-red-800 text-xs px-2 py-0.5 rounded">{DOC_LABELS[d.type] || d.type}</span>
                  <span className="text-sm text-white flex-1">{d.name}</span>
                  {d.expiry && <span className="text-xs text-gray-400">Expires: {d.expiry}</span>}
                  <a href={d.url} target="_blank" className="text-gray-400 hover:text-white"><Download className="w-4 h-4" /></a>
                  <button onClick={() => deleteDoc(d.id)} className="text-gray-400 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-3 items-end border-t border-gray-700 pt-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Type</label>
              <select value={docUpload.type} onChange={e => setDocUpload({ ...docUpload, type: e.target.value })} className="bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white">
                {DOC_TYPES.map(t => <option key={t} value={t}>{DOC_LABELS[t]}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Expiry (optional)</label>
              <input type="date" value={docUpload.expiry} onChange={e => setDocUpload({ ...docUpload, expiry: e.target.value })} className="bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white" />
            </div>
            <label className="flex items-center gap-2 cursor-pointer bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-300 hover:border-gray-500">
              <Upload className="w-4 h-4" />
              {docUpload.name || 'Choose file'}
              <input type="file" className="hidden" onChange={handleDocFile} />
            </label>
            <button onClick={uploadDoc} disabled={!docUpload.base64} className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
              Upload
            </button>
          </div>
        </div>

        {/* Recent Expenses */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Recent Expenses</h2>
          {subExpenses.length === 0 ? (
            <p className="text-gray-500 text-sm">No expenses linked to this subcontractor.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700 text-gray-400 text-xs uppercase">
                  <th className="text-left px-3 py-2">Date</th>
                  <th className="text-left px-3 py-2">Description</th>
                  <th className="text-right px-3 py-2">Amount</th>
                </tr>
              </thead>
              <tbody>
                {subExpenses.map(e => (
                  <tr key={e.id} className="border-b border-gray-700/50">
                    <td className="px-3 py-2 text-gray-300">{e.date}</td>
                    <td className="px-3 py-2 text-white">{e.description}</td>
                    <td className="px-3 py-2 text-right text-white font-medium">{fmt(e.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    );
  }

  /* ── list view ── */
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <HardHat className="w-7 h-7 text-red-500" />
          <h1 className="text-2xl font-bold text-white">Subcontractors</h1>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          {showForm ? <ChevronUp className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showForm ? 'Close' : 'Add Subcontractor'}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Subs', value: stats.total },
          { label: 'Active', value: stats.active },
          { label: 'Insurance Expiring Soon', value: stats.insurance_expiring_soon, warn: stats.insurance_expiring_soon > 0 },
          { label: 'Total Paid YTD', value: fmt(stats.total_paid_ytd) },
        ].map(s => (
          <div key={s.label} className="bg-gray-800 border border-gray-700 rounded-xl p-5">
            <p className="text-xs text-gray-400 uppercase tracking-wider">{s.label}</p>
            <p className={`text-xl font-bold mt-1 ${(s as any).warn ? 'text-yellow-400' : 'text-white'}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Add Form */}
      {showForm && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white">New Subcontractor</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { key: 'name', label: 'Name *', type: 'text', ph: 'Full name' },
              { key: 'company', label: 'Company *', type: 'text', ph: 'Company name' },
              { key: 'trade', label: 'Trade *', type: 'select' },
              { key: 'phone', label: 'Phone', type: 'tel', ph: '(555) 555-5555' },
              { key: 'email', label: 'Email', type: 'email', ph: 'email@example.com' },
              { key: 'address', label: 'Address', type: 'text', ph: 'Street address' },
              { key: 'city', label: 'City', type: 'text', ph: 'City' },
              { key: 'tax_id', label: 'Tax ID (EIN/SSN)', type: 'text', ph: 'XX-XXXXXXX' },
              { key: 'insurance_exp', label: 'Insurance Expiry', type: 'date' },
              { key: 'license_no', label: 'License #', type: 'text', ph: 'License number' },
              { key: 'hourly_rate', label: 'Hourly Rate ($)', type: 'number', ph: '0.00' },
            ].map(f => (
              <div key={f.key}>
                <label className="block text-xs text-gray-400 mb-1">{f.label}</label>
                {f.type === 'select' ? (
                  <select value={form[f.key]} onChange={e => setForm({ ...form, [f.key]: e.target.value })} className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white">
                    {TRADES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                  </select>
                ) : (
                  <input type={f.type} placeholder={f.ph} value={form[f.key]} onChange={e => setForm({ ...form, [f.key]: e.target.value })} className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white" />
                )}
              </div>
            ))}
            <div className="md:col-span-3">
              <label className="block text-xs text-gray-400 mb-1">Notes</label>
              <textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white" />
            </div>
          </div>
          <div className="flex justify-end">
            <button onClick={submit} disabled={saving || !form.name || !form.company} className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors">
              {saving ? 'Saving...' : 'Save Subcontractor'}
            </button>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative w-72">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input type="text" placeholder="Search subcontractors..." value={search} onChange={e => setSearch(e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white" />
      </div>

      {/* Table */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700 text-gray-400 text-xs uppercase tracking-wider">
                <th className="text-left px-4 py-3">Name</th>
                <th className="text-left px-4 py-3">Company</th>
                <th className="text-left px-4 py-3">Trade</th>
                <th className="text-left px-4 py-3">Phone</th>
                <th className="text-left px-4 py-3">Email</th>
                <th className="text-left px-4 py-3">Insurance Exp.</th>
                <th className="text-right px-4 py-3">Total Paid</th>
                <th className="text-center px-4 py-3">Status</th>
                <th className="text-center px-4 py-3">Docs</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="text-center py-12 text-gray-500">Loading...</td></tr>
              ) : subs.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-12 text-gray-500">No subcontractors found</td></tr>
              ) : subs.map(s => {
                const ins = insuranceStatus(s.insurance_exp);
                return (
                  <tr key={s.id} onClick={() => loadDetail(s)} className="border-b border-gray-700/50 hover:bg-gray-700/30 cursor-pointer transition-colors">
                    <td className="px-4 py-3 text-white font-medium">{s.name}</td>
                    <td className="px-4 py-3 text-gray-300">{s.company}</td>
                    <td className="px-4 py-3 text-gray-300 capitalize">{s.trade.replace(/_/g, ' ')}</td>
                    <td className="px-4 py-3 text-gray-300">{s.phone || '—'}</td>
                    <td className="px-4 py-3 text-gray-300">{s.email || '—'}</td>
                    <td className="px-4 py-3">
                      {s.insurance_exp ? (
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${
                          ins === 'expired' ? 'bg-red-900/40 text-red-400 border-red-700' :
                          ins === 'expiring' ? 'bg-yellow-900/40 text-yellow-400 border-yellow-700' :
                          'bg-green-900/40 text-green-400 border-green-700'
                        }`}>
                          {s.insurance_exp}
                        </span>
                      ) : <span className="text-gray-600">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-white">{fmt(s.total_paid)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${
                        s.status === 'active' ? 'bg-green-900/40 text-green-400 border-green-700' : 'bg-gray-700 text-gray-400 border-gray-600'
                      }`}>{s.status}</span>
                    </td>
                    <td className="px-4 py-3 text-center text-gray-400">{s.doc_count}</td>
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
