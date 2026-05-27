'use client';

import { useEffect, useState } from 'react';
import { Users, Search, Phone, Mail, FileText, Briefcase, Plus } from 'lucide-react';
import Link from 'next/link';

interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  address: string | null;
  created_at: string;
  _count: { estimates: number; jobs: number };
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', email: '', address: '' });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    const res = await fetch(`/api/admin/customers?${params}`);
    const data = await res.json();
    setCustomers(data.customers || []);
    setTotal(data.total || 0);
    setLoading(false);
  };

  useEffect(() => { load(); }, [search]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.phone) return;
    setSaving(true);
    await fetch('/api/admin/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    setSaving(false);
    setShowAdd(false);
    setForm({ name: '', phone: '', email: '', address: '' });
    load();
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Customers</h1>
          <p className="text-gray-400 text-sm mt-1">{total} total customers</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/leads/new"
            className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm font-semibold rounded-lg transition-colors">
            <Plus className="w-4 h-4" /> New Lead
          </Link>
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-4 py-2 bg-red-700 hover:bg-red-600 text-white text-sm font-semibold rounded-lg transition-colors">
            <Plus className="w-4 h-4" /> Quick Add
          </button>
        </div>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 mb-6">
          <h3 className="font-semibold text-white mb-4">New Customer</h3>
          <form onSubmit={handleAdd} className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Full Name *</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white focus:outline-none focus:border-red-500" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Phone *</label>
              <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} required
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white focus:outline-none focus:border-red-500" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Email</label>
              <input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} type="email"
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white focus:outline-none focus:border-red-500" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Address</label>
              <input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white focus:outline-none focus:border-red-500" />
            </div>
            <div className="col-span-2 flex gap-3 justify-end">
              <button type="button" onClick={() => setShowAdd(false)}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm rounded-lg">Cancel</button>
              <button type="submit" disabled={saving}
                className="px-4 py-2 bg-red-700 hover:bg-red-600 text-white text-sm font-semibold rounded-lg disabled:opacity-50">
                {saving ? 'Saving...' : 'Create Customer'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, phone, email, address..."
          className="w-full pl-9 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-400 focus:outline-none focus:border-red-500" />
      </div>

      {/* Table */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-700 text-left">
              <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Name</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Contact</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Address</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider text-center">Estimates</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider text-center">Jobs</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Since</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [...Array(8)].map((_, i) => (
                <tr key={i} className="border-b border-gray-700/50">
                  {[...Array(6)].map((_, j) => (
                    <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-700 rounded animate-pulse" /></td>
                  ))}
                </tr>
              ))
            ) : customers.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-gray-500">
                  No customers found.
                </td>
              </tr>
            ) : customers.map(c => (
              <tr key={c.id} onClick={() => window.location.href = `/admin/customers/${c.id}`}
                className="border-b border-gray-700/50 hover:bg-gray-700/50 cursor-pointer transition-colors">
                <td className="px-4 py-3 font-medium text-white">{c.name}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5 text-gray-300 text-xs mb-1">
                    <Phone className="w-3 h-3 text-gray-500" />{c.phone}
                  </div>
                  {c.email && (
                    <div className="flex items-center gap-1.5 text-gray-400 text-xs">
                      <Mail className="w-3 h-3 text-gray-500" />{c.email}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-400 text-xs max-w-48 truncate">{c.address || '—'}</td>
                <td className="px-4 py-3 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <FileText className="w-3.5 h-3.5 text-gray-500" />
                    <span className="font-semibold text-white">{c._count.estimates}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <Briefcase className="w-3.5 h-3.5 text-gray-500" />
                    <span className="font-semibold text-white">{c._count.jobs}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-400 text-xs">{fmtDate(c.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
