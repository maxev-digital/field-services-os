'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserPlus, Phone, Mail, MapPin, AlertCircle, FileText, Loader2, ChevronLeft } from 'lucide-react';
import Link from 'next/link';

const DAMAGE_TYPES = ['Hail damage', 'Wind damage', 'Storm damage', 'Leak / water damage', 'Aging / wear', 'Tree damage', 'Other'];
const INSURERS = ['State Farm', 'Allstate', 'USAA', 'Farmers', 'Nationwide', 'Liberty Mutual', 'Progressive', 'Travelers', 'GEICO', 'Other', 'No insurance / cash'];

export default function NewLeadPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: '', phone: '', email: '', address: '',
    damageType: '', insurer: '', notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function set(key: string, val: string) {
    setForm(f => ({ ...f, [key]: val }));
  }

  function formatPhone(val: string) {
    const digits = val.replace(/\D/g, '').slice(0, 10);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0,3)}-${digits.slice(3)}`;
    return `${digits.slice(0,3)}-${digits.slice(3,6)}-${digits.slice(6)}`;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.phone.trim()) { setError('Name and phone are required'); return; }
    setSaving(true); setError('');
    try {
      const r = await fetch('/api/admin/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      router.push(`/admin/customers/${d.customer.id}`);
    } catch (e: any) {
      setError(e.message || 'Failed to create lead');
      setSaving(false);
    }
  }

  const inputClass = 'w-full px-3 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white focus:outline-none focus:border-red-500 placeholder-gray-500';
  const selectClass = inputClass + ' cursor-pointer';

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <Link href="/admin/customers" className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-white mb-3 transition-colors">
          <ChevronLeft className="w-3.5 h-3.5" /> Back to Customers
        </Link>
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-red-700 rounded-xl"><UserPlus className="w-5 h-5 text-white" /></div>
          <div>
            <h1 className="text-2xl font-bold text-white">New Lead</h1>
            <p className="text-sm text-gray-400">Manually add a roofing lead</p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Contact Info */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 space-y-4">
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
            <Phone className="w-3.5 h-3.5" /> Contact Information
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 sm:col-span-1">
              <label className="text-xs text-gray-400 mb-1.5 block">Full Name <span className="text-red-400">*</span></label>
              <input
                value={form.name}
                onChange={e => set('name', e.target.value)}
                placeholder="John Smith"
                required
                className={inputClass}
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="text-xs text-gray-400 mb-1.5 block">Phone <span className="text-red-400">*</span></label>
              <input
                value={form.phone}
                onChange={e => set('phone', formatPhone(e.target.value))}
                placeholder="214-555-1234"
                type="tel"
                required
                className={inputClass}
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="text-xs text-gray-400 mb-1.5 block">Email</label>
              <input
                value={form.email}
                onChange={e => set('email', e.target.value)}
                placeholder="john@email.com"
                type="email"
                className={inputClass}
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="text-xs text-gray-400 mb-1.5 block flex items-center gap-1">
                <MapPin className="w-3 h-3" /> Property Address
              </label>
              <input
                value={form.address}
                onChange={e => set('address', e.target.value)}
                placeholder="123 Oak St, Frisco, TX 75034"
                className={inputClass}
              />
            </div>
          </div>
        </div>

        {/* Job Details */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 space-y-4">
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5" /> Damage & Insurance
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">Damage Type</label>
              <select value={form.damageType} onChange={e => set('damageType', e.target.value)} className={selectClass}>
                <option value="">— Select —</option>
                {DAMAGE_TYPES.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">Insurance Carrier</label>
              <select value={form.insurer} onChange={e => set('insurer', e.target.value)} className={selectClass}>
                <option value="">— Select —</option>
                {INSURERS.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 space-y-3">
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
            <FileText className="w-3.5 h-3.5" /> Notes
          </h2>
          <textarea
            value={form.notes}
            onChange={e => set('notes', e.target.value)}
            rows={4}
            placeholder="How did they hear about us? Neighbor referral? Storm canvass? Any other details..."
            className={inputClass + ' resize-none'}
          />
        </div>

        {error && (
          <div className="flex items-center gap-2 bg-red-900/30 border border-red-800 text-red-300 rounded-lg px-4 py-2.5 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
          </div>
        )}

        <div className="flex justify-end gap-3">
          <Link href="/admin/customers"
            className="px-5 py-2.5 text-sm text-gray-400 hover:text-white border border-gray-600 rounded-lg transition-colors">
            Cancel
          </Link>
          <button type="submit" disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white font-semibold text-sm rounded-lg transition-colors">
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating...</> : <><UserPlus className="w-4 h-4" /> Create Lead</>}
          </button>
        </div>
      </form>
    </div>
  );
}
