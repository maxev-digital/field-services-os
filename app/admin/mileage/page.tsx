'use client';

import { useState, useEffect, useCallback } from 'react';
import { Car, Plus, ChevronUp, ArrowRight, X } from 'lucide-react';

interface Trip {
  id: number;
  date: string;
  from_location: string;
  to_location: string;
  miles: number;
  purpose: string;
  job_address?: string;
  notes?: string;
  deduction: number;
}

interface Stats {
  total_miles_ytd: number;
  total_deduction: number;
  avg_miles_per_day: number;
  irs_rate: number;
}

interface MonthlySummary {
  month: string;
  miles: number;
  deduction: number;
}

const PURPOSES = ['job_site', 'material_pickup', 'client_meeting', 'office', 'other'];
const PURPOSE_LABELS: Record<string, string> = {
  job_site: 'Job Site', material_pickup: 'Material Pickup', client_meeting: 'Client Meeting',
  office: 'Office', other: 'Other',
};

const fmt = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export default function MileagePage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [stats, setStats] = useState<Stats>({ total_miles_ytd: 0, total_deduction: 0, avg_miles_per_day: 0, irs_rate: 0.70 });
  const [monthly, setMonthly] = useState<MonthlySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    from_location: '',
    to_location: '',
    miles: '',
    purpose: 'job_site',
    job_address: '',
    notes: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/admin/mileage');
      const d = await r.json();
      setTrips(d.trips ?? []);
      setStats(d.stats ?? { total_miles_ytd: 0, total_deduction: 0, avg_miles_per_day: 0, irs_rate: 0.70 });
      setMonthly(d.monthly_summary ?? []);
    } catch { /* noop */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    setSaving(true);
    try {
      await fetch('/api/admin/mileage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, miles: parseFloat(form.miles) }),
      });
      setShowForm(false);
      setForm({ date: new Date().toISOString().slice(0, 10), from_location: '', to_location: '', miles: '', purpose: 'job_site', job_address: '', notes: '' });
      load();
    } catch { /* noop */ }
    setSaving(false);
  };

  const maxMonthMiles = Math.max(...monthly.map(m => m.miles), 1);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Car className="w-7 h-7 text-red-500" />
          <h1 className="text-2xl font-bold text-white">Mileage Log</h1>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          {showForm ? <ChevronUp className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showForm ? 'Close' : 'Log Trip'}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Miles (YTD)', value: stats.total_miles_ytd.toLocaleString() },
          { label: 'Total Deduction', value: fmt(stats.total_deduction) },
          { label: 'Avg Miles / Day', value: stats.avg_miles_per_day.toFixed(1) },
          { label: 'IRS Rate (per mile)', value: `$${stats.irs_rate.toFixed(2)}` },
        ].map(s => (
          <div key={s.label} className="bg-gray-800 border border-gray-700 rounded-xl p-5">
            <p className="text-xs text-gray-400 uppercase tracking-wider">{s.label}</p>
            <p className="text-xl font-bold text-white mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Monthly Summary Chart */}
      {monthly.length > 0 && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Monthly Summary</h2>
          <div className="space-y-3">
            {monthly.map(m => (
              <div key={m.month} className="flex items-center gap-3">
                <span className="text-sm text-gray-300 w-20">{m.month}</span>
                <div className="flex-1 bg-gray-700 rounded-full h-5 overflow-hidden">
                  <div className="bg-red-600 h-full rounded-full transition-all" style={{ width: `${(m.miles / maxMonthMiles) * 100}%` }} />
                </div>
                <span className="text-sm text-white w-20 text-right">{m.miles.toLocaleString()} mi</span>
                <span className="text-sm text-gray-400 w-24 text-right">{fmt(m.deduction)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Log Trip Form */}
      {showForm && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white">Log a Trip</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Date *</label>
              <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">From *</label>
              <input type="text" placeholder="Starting location" value={form.from_location} onChange={e => setForm({ ...form, from_location: e.target.value })} className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">To *</label>
              <input type="text" placeholder="Destination" value={form.to_location} onChange={e => setForm({ ...form, to_location: e.target.value })} className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Miles *</label>
              <input type="number" step="0.1" placeholder="0.0" value={form.miles} onChange={e => setForm({ ...form, miles: e.target.value })} className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Purpose *</label>
              <select value={form.purpose} onChange={e => setForm({ ...form, purpose: e.target.value })} className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white">
                {PURPOSES.map(p => <option key={p} value={p}>{PURPOSE_LABELS[p]}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Job Address (optional)</label>
              <input type="text" placeholder="If visiting a job site" value={form.job_address} onChange={e => setForm({ ...form, job_address: e.target.value })} className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white" />
            </div>
            <div className="md:col-span-3">
              <label className="block text-xs text-gray-400 mb-1">Notes</label>
              <textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white" />
            </div>
          </div>
          <div className="flex justify-end">
            <button onClick={submit} disabled={saving || !form.from_location || !form.to_location || !form.miles} className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors">
              {saving ? 'Saving...' : 'Save Trip'}
            </button>
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
                <th className="text-left px-4 py-3">Route</th>
                <th className="text-right px-4 py-3">Miles</th>
                <th className="text-left px-4 py-3">Purpose</th>
                <th className="text-right px-4 py-3">Deduction</th>
                <th className="text-left px-4 py-3">Notes</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-12 text-gray-500">Loading...</td></tr>
              ) : trips.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-gray-500">No trips logged</td></tr>
              ) : trips.map(t => (
                <tr key={t.id} className="border-b border-gray-700/50 hover:bg-gray-700/30 transition-colors">
                  <td className="px-4 py-3 text-gray-300 whitespace-nowrap">{t.date}</td>
                  <td className="px-4 py-3 text-white">
                    <span className="flex items-center gap-2">
                      {t.from_location} <ArrowRight className="w-3 h-3 text-gray-500" /> {t.to_location}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-white font-medium">{t.miles.toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs bg-gray-700 text-gray-300 border border-gray-600 px-2 py-0.5 rounded-full">
                      {PURPOSE_LABELS[t.purpose] || t.purpose}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-green-400 font-medium">{fmt(t.deduction)}</td>
                  <td className="px-4 py-3 text-gray-400 max-w-xs truncate">{t.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
