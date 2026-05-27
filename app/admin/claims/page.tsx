'use client';

import { useEffect, useState } from 'react';
import { ShieldCheck, Phone, DollarSign } from 'lucide-react';

type ClaimStatus = 'FILED' | 'ADJUSTER_ASSIGNED' | 'INSPECTION_DONE' | 'APPROVED' | 'SUPPLEMENTED' | 'CLOSED';

interface Claim {
  id: string;
  insurer: string | null;
  claim_no: string | null;
  adjuster_name: string | null;
  adjuster_phone: string | null;
  adjuster_email: string | null;
  date_filed: string | null;
  deductible: number | null;
  acv_amount: number | null;
  rcv_amount: number | null;
  approved_amount: number | null;
  depreciation: number | null;
  supplement_no: string | null;
  supplement_status: string | null;
  final_settlement: number | null;
  mortgage_company: string | null;
  mortgage_loan_no: string | null;
  status: ClaimStatus;
  notes: string | null;
  created_at: string;
  job: {
    id: string;
    address: string;
    customer: { id: string; name: string; phone: string };
  };
}

const STATUS_STYLES: Record<ClaimStatus, string> = {
  FILED:             'bg-blue-900 text-blue-300',
  ADJUSTER_ASSIGNED: 'bg-yellow-900 text-yellow-300',
  INSPECTION_DONE:   'bg-purple-900 text-purple-300',
  APPROVED:          'bg-green-900 text-green-300',
  SUPPLEMENTED:      'bg-orange-900 text-orange-300',
  CLOSED:            'bg-gray-700 text-gray-300',
};

const STATUS_LABELS: Record<ClaimStatus, string> = {
  FILED:             'Filed',
  ADJUSTER_ASSIGNED: 'Adjuster Assigned',
  INSPECTION_DONE:   'Inspection Done',
  APPROVED:          'Approved',
  SUPPLEMENTED:      'Supplemented',
  CLOSED:            'Closed',
};

const ALL_STATUSES: ClaimStatus[] = ['FILED', 'ADJUSTER_ASSIGNED', 'INSPECTION_DONE', 'APPROVED', 'SUPPLEMENTED', 'CLOSED'];

function fmt(n: number | null) {
  if (n === null) return '—';
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}
function fmtDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ClaimsPage() {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [editId, setEditId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<Claim>>({});
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const res = await fetch('/api/admin/claims');
    const data = await res.json();
    setClaims(data.claims || []);
    setTotal(data.total || 0);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = statusFilter === 'ALL' ? claims : claims.filter(c => c.status === statusFilter);

  const totalApproved = claims
    .filter(c => c.approved_amount)
    .reduce((s, c) => s + (c.approved_amount || 0), 0);

  const save = async () => {
    if (!editId) return;
    setSaving(true);
    await fetch(`/api/admin/claims/${editId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editData),
    });
    setSaving(false);
    setEditId(null);
    load();
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Insurance Claims</h1>
          <p className="text-gray-400 text-sm mt-1">{total} active claims</p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Claims',    value: total,                                    color: 'text-white' },
          { label: 'Approved',        value: claims.filter(c => c.status === 'APPROVED').length, color: 'text-green-400' },
          { label: 'In Progress',     value: claims.filter(c => !['CLOSED','APPROVED'].includes(c.status)).length, color: 'text-yellow-400' },
          { label: 'Total Approved $', value: fmt(totalApproved),                       color: 'text-emerald-400' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-gray-800 border border-gray-700 rounded-xl p-4">
            <div className="text-xs text-gray-400 mb-1">{label}</div>
            <div className={`text-2xl font-black ${color}`}>{value}</div>
          </div>
        ))}
      </div>

      {/* Status filter */}
      <div className="flex gap-1.5 flex-wrap mb-4">
        {['ALL', ...ALL_STATUSES].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              statusFilter === s ? 'bg-red-700 text-white' : 'bg-gray-800 text-gray-400 border border-gray-700 hover:text-white'
            }`}>
            {s === 'ALL' ? 'All' : STATUS_LABELS[s as ClaimStatus]}
          </button>
        ))}
      </div>

      {/* Edit drawer */}
      {editId && (
        <div className="bg-gray-800 border border-red-700/40 rounded-xl p-5 mb-4">
          <h3 className="font-semibold text-white mb-4">Edit Claim</h3>
          <div className="grid grid-cols-3 gap-4">
            {[
              { key: 'insurer',          label: 'Insurer' },
              { key: 'claim_no',         label: 'Claim #' },
              { key: 'adjuster_name',    label: 'Adjuster Name' },
              { key: 'adjuster_phone',   label: 'Adjuster Phone' },
              { key: 'adjuster_email',   label: 'Adjuster Email' },
              { key: 'mortgage_company', label: 'Mortgage Company' },
              { key: 'mortgage_loan_no', label: 'Mortgage Loan #' },
              { key: 'supplement_no',    label: 'Supplement #' },
              { key: 'supplement_status',label: 'Supplement Status' },
            ].map(({ key, label }) => (
              <div key={key}>
                <label className="text-xs text-gray-400 mb-1 block">{label}</label>
                <input
                  value={(editData as any)[key] ?? ''}
                  onChange={e => setEditData({ ...editData, [key]: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white focus:outline-none focus:border-red-500" />
              </div>
            ))}
            {[
              { key: 'deductible',      label: 'Deductible' },
              { key: 'acv_amount',      label: 'ACV (Actual Cash Value)' },
              { key: 'rcv_amount',      label: 'RCV (Replacement Cost)' },
              { key: 'approved_amount', label: 'Approved Amount' },
              { key: 'depreciation',    label: 'Depreciation' },
              { key: 'final_settlement',label: 'Final Settlement' },
            ].map(({ key, label }) => (
              <div key={key}>
                <label className="text-xs text-gray-400 mb-1 block">{label}</label>
                <input type="number"
                  value={(editData as any)[key] ?? ''}
                  onChange={e => setEditData({ ...editData, [key]: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white focus:outline-none focus:border-red-500" />
              </div>
            ))}
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Status</label>
              <select value={(editData as any).status ?? ''}
                onChange={e => setEditData({ ...editData, status: e.target.value as ClaimStatus })}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white focus:outline-none focus:border-red-500">
                {ALL_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </select>
            </div>
            <div className="col-span-3">
              <label className="text-xs text-gray-400 mb-1 block">Notes</label>
              <textarea value={(editData as any).notes ?? ''} rows={2}
                onChange={e => setEditData({ ...editData, notes: e.target.value })}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white focus:outline-none focus:border-red-500 resize-none" />
            </div>
          </div>
          <div className="flex gap-3 mt-4 justify-end">
            <button onClick={() => setEditId(null)} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm rounded-lg">Cancel</button>
            <button onClick={save} disabled={saving}
              className="px-4 py-2 bg-red-700 hover:bg-red-600 text-white text-sm font-semibold rounded-lg disabled:opacity-50">
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-700 text-left">
              <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Customer / Address</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Insurer / Claim</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Adjuster</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider text-right">Approved</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider text-right">Settlement</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Status</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Filed</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [...Array(6)].map((_, i) => (
                <tr key={i} className="border-b border-gray-700/50">
                  {[...Array(8)].map((_, j) => (
                    <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-700 rounded animate-pulse" /></td>
                  ))}
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-gray-500">
                  No claims found. Claims are created when jobs have insurance involvement.
                </td>
              </tr>
            ) : filtered.map(claim => (
              <tr key={claim.id} className="border-b border-gray-700/50 hover:bg-gray-700/30 transition-colors">
                <td className="px-4 py-3">
                  <div className="font-medium text-white">{claim.job.customer.name}</div>
                  <div className="text-gray-400 text-xs flex items-center gap-1">
                    <Phone className="w-3 h-3" />{claim.job.customer.phone}
                  </div>
                  <div className="text-gray-500 text-xs truncate max-w-36">{claim.job.address}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="text-gray-300 text-xs">{claim.insurer || '—'}</div>
                  <div className="text-gray-500 text-xs">{claim.claim_no || ''}</div>
                  {claim.supplement_no && (
                    <div className="text-orange-400 text-xs">Suppl: {claim.supplement_no}</div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="text-gray-300 text-xs">{claim.adjuster_name || '—'}</div>
                  {claim.adjuster_phone && (
                    <div className="text-gray-500 text-xs">{claim.adjuster_phone}</div>
                  )}
                </td>
                <td className="px-4 py-3 text-right font-mono">
                  <span className={claim.approved_amount ? 'text-green-400 font-semibold' : 'text-gray-500'}>
                    {fmt(claim.approved_amount)}
                  </span>
                  {claim.depreciation && (
                    <div className="text-xs text-gray-500">Depr: {fmt(claim.depreciation)}</div>
                  )}
                </td>
                <td className="px-4 py-3 text-right font-mono">
                  <span className={claim.final_settlement ? 'text-emerald-400 font-semibold' : 'text-gray-500'}>
                    {fmt(claim.final_settlement)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-semibold ${STATUS_STYLES[claim.status]}`}>
                    {STATUS_LABELS[claim.status]}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-400 text-xs">{fmtDate(claim.date_filed)}</td>
                <td className="px-4 py-3">
                  <button onClick={() => { setEditId(claim.id); setEditData({ ...claim }); }}
                    className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs rounded transition-colors">
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
