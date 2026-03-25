'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ClipboardList, FileText, Plus, Download, ArrowRight } from 'lucide-react';

interface InspectionReport {
  id: string;
  address: string;
  inspector: string | null;
  inspection_date: string | null;
  status: 'DRAFT' | 'COMPLETE';
  created_at: string;
  customer: { id: string; name: string } | null;
  _count: { items: number };
}

function fmtDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function StatusBadge({ status }: { status: 'DRAFT' | 'COMPLETE' }) {
  if (status === 'COMPLETE') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-900 text-green-300 border border-green-700">
        Complete
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-700 text-gray-300 border border-gray-600">
      Draft
    </span>
  );
}

export default function InspectionsPage() {
  const router = useRouter();
  const [reports, setReports] = useState<InspectionReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [newAddress, setNewAddress] = useState('');
  const [newInspector, setNewInspector] = useState('');
  const [formError, setFormError] = useState('');

  useEffect(() => {
    fetch('/api/admin/inspections')
      .then((r) => r.json())
      .then((d) => {
        if (d.reports) setReports(d.reports);
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleCreate() {
    if (!newAddress.trim()) {
      setFormError('Address is required.');
      return;
    }
    setFormError('');
    setCreating(true);
    try {
      const res = await fetch('/api/admin/inspections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: newAddress.trim(), inspector: newInspector.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error || 'Failed to create report.');
        return;
      }
      router.push(`/admin/inspections/${data.report.id}`);
    } catch {
      setFormError('Network error.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-red-700 rounded">
            <ClipboardList className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Inspection Reports</h1>
            <p className="text-sm text-gray-400">Property damage inspection forms and PDFs</p>
          </div>
        </div>
        <button
          onClick={() => { setShowForm(!showForm); setFormError(''); }}
          className="flex items-center gap-2 px-4 py-2 bg-red-700 hover:bg-red-600 text-white text-sm font-medium rounded transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Inspection
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="mb-6 bg-gray-800 border border-gray-700 rounded-lg p-4">
          <h2 className="text-sm font-semibold text-white mb-3">New Inspection Report</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">
                Property Address <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={newAddress}
                onChange={(e) => setNewAddress(e.target.value)}
                placeholder="123 Main St, Dallas, TX 75201"
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-red-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Inspector Name</label>
              <input
                type="text"
                value={newInspector}
                onChange={(e) => setNewInspector(e.target.value)}
                placeholder="e.g. John Smith"
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-red-500"
              />
            </div>
          </div>
          {formError && <p className="text-red-400 text-xs mb-3">{formError}</p>}
          <div className="flex items-center gap-2">
            <button
              onClick={handleCreate}
              disabled={creating}
              className="px-4 py-2 bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white text-sm font-medium rounded transition-colors"
            >
              {creating ? 'Creating...' : 'Create Report'}
            </button>
            <button
              onClick={() => { setShowForm(false); setNewAddress(''); setNewInspector(''); setFormError(''); }}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="text-center py-16 text-gray-500">Loading...</div>
      ) : reports.length === 0 ? (
        <div className="text-center py-16 bg-gray-800 rounded-lg border border-gray-700">
          <ClipboardList className="w-10 h-10 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400 font-medium">No inspection reports yet</p>
          <p className="text-gray-500 text-sm mt-1">Click &ldquo;New Inspection&rdquo; to create your first report.</p>
        </div>
      ) : (
        <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Date</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Customer</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Address</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Inspector</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Items Damaged</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Status</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {reports.map((r) => (
                <tr key={r.id} className="hover:bg-gray-750 transition-colors">
                  <td className="px-4 py-3 text-gray-300 whitespace-nowrap">
                    {fmtDate(r.inspection_date || r.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    {r.customer ? (
                      <button
                        onClick={() => router.push(`/admin/customers/${r.customer!.id}`)}
                        className="text-blue-400 hover:underline text-sm"
                      >
                        {r.customer.name}
                      </button>
                    ) : (
                      <span className="text-gray-500">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-white font-medium max-w-xs truncate">
                    {r.address}
                  </td>
                  <td className="px-4 py-3 text-gray-300">{r.inspector || <span className="text-gray-500">—</span>}</td>
                  <td className="px-4 py-3 text-center">
                    {r._count.items > 0 ? (
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-red-900 text-red-300 text-xs font-bold border border-red-700">
                        {r._count.items}
                      </span>
                    ) : (
                      <span className="text-gray-500">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => router.push(`/admin/inspections/${r.id}`)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white text-xs font-medium rounded transition-colors"
                      >
                        <ArrowRight className="w-3.5 h-3.5" />
                        View
                      </button>
                      <button
                        onClick={() => window.open(`/api/admin/inspections/${r.id}/pdf`, '_blank')}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white text-xs font-medium rounded transition-colors"
                      >
                        <Download className="w-3.5 h-3.5" />
                        PDF
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
