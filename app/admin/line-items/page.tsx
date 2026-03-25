'use client';

import { useEffect, useState } from 'react';
import { Wrench, Plus, Check, X, Pencil } from 'lucide-react';

interface LineItem {
  id: string;
  label: string;
  unit: string;
  xactimate: number;
  ours: number;
  category: string;
  sort_order: number;
  active: boolean;
}

function fmt(n: number) { return `$${n.toFixed(2)}`; }
function margin(x: number, o: number) {
  if (x === 0) return '—';
  return `${(((x - o) / x) * 100).toFixed(1)}%`;
}

export default function LineItemsPage() {
  const [items, setItems] = useState<LineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<LineItem>>({});
  const [showAdd, setShowAdd] = useState(false);
  const [newItem, setNewItem] = useState({ id: '', label: '', unit: '', xactimate: '', ours: '', category: '', sort_order: '0' });
  const [saving, setSaving] = useState(false);
  const [catFilter, setCatFilter] = useState('ALL');

  const load = async () => {
    setLoading(true);
    const res = await fetch('/api/admin/line-items');
    const data = await res.json();
    setItems(data.items || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const categories = Array.from(new Set(items.map(i => i.category)));
  const filtered = catFilter === 'ALL' ? items : items.filter(i => i.category === catFilter);

  const saveEdit = async () => {
    if (!editId) return;
    setSaving(true);
    await fetch(`/api/admin/line-items/${editId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editData),
    });
    setSaving(false);
    setEditId(null);
    load();
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await fetch('/api/admin/line-items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newItem),
    });
    setSaving(false);
    setShowAdd(false);
    setNewItem({ id: '', label: '', unit: '', xactimate: '', ours: '', category: '', sort_order: '0' });
    load();
  };

  const deactivate = async (id: string) => {
    await fetch(`/api/admin/line-items/${id}`, {
      method: 'DELETE',
    });
    load();
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Pricing / Line Items</h1>
          <p className="text-gray-400 text-sm mt-1">{items.filter(i => i.active).length} active items across {categories.length} categories</p>
        </div>
        <button onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-2 px-4 py-2 bg-red-700 hover:bg-red-600 text-white text-sm font-semibold rounded-lg transition-colors">
          <Plus className="w-4 h-4" /> Add Item
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 mb-6">
          <h3 className="font-semibold text-white mb-4">New Line Item</h3>
          <form onSubmit={handleAdd} className="grid grid-cols-4 gap-4">
            {[
              { key: 'id', label: 'ID (unique)', placeholder: 'tear-off-2-layer' },
              { key: 'label', label: 'Label', placeholder: '2-Layer Tear Off' },
              { key: 'unit', label: 'Unit', placeholder: 'SQ' },
              { key: 'category', label: 'Category', placeholder: 'Labor' },
              { key: 'xactimate', label: 'Xactimate Price', placeholder: '85.00', type: 'number' },
              { key: 'ours', label: 'Our Price', placeholder: '65.00', type: 'number' },
              { key: 'sort_order', label: 'Sort Order', placeholder: '10', type: 'number' },
            ].map(({ key, label, placeholder, type }) => (
              <div key={key}>
                <label className="text-xs text-gray-400 mb-1 block">{label}</label>
                <input
                  type={type || 'text'}
                  value={(newItem as any)[key]}
                  onChange={e => setNewItem({ ...newItem, [key]: e.target.value })}
                  placeholder={placeholder}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white focus:outline-none focus:border-red-500" />
              </div>
            ))}
            <div className="col-span-4 flex gap-3 justify-end">
              <button type="button" onClick={() => setShowAdd(false)}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm rounded-lg">Cancel</button>
              <button type="submit" disabled={saving}
                className="px-4 py-2 bg-red-700 hover:bg-red-600 text-white text-sm font-semibold rounded-lg disabled:opacity-50">
                {saving ? 'Saving...' : 'Add Item'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Category filter */}
      <div className="flex gap-1.5 flex-wrap mb-4">
        {['ALL', ...categories].map(c => (
          <button key={c} onClick={() => setCatFilter(c)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors capitalize ${
              catFilter === c ? 'bg-red-700 text-white' : 'bg-gray-800 text-gray-400 border border-gray-700 hover:text-white'
            }`}>
            {c}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-700 text-left">
              <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">ID</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Label</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Category</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Unit</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider text-right">Xactimate</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider text-right">Ours</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider text-right">Margin</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider text-center">Active</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [...Array(10)].map((_, i) => (
                <tr key={i} className="border-b border-gray-700/50">
                  {[...Array(9)].map((_, j) => <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-700 rounded animate-pulse" /></td>)}
                </tr>
              ))
            ) : filtered.map(item => (
              editId === item.id ? (
                <tr key={item.id} className="border-b border-gray-700/50 bg-gray-700/30">
                  <td className="px-4 py-2 text-gray-400 text-xs font-mono">{item.id}</td>
                  <td className="px-4 py-2">
                    <input value={editData.label ?? item.label} onChange={e => setEditData({ ...editData, label: e.target.value })}
                      className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm text-white" />
                  </td>
                  <td className="px-4 py-2">
                    <input value={editData.category ?? item.category} onChange={e => setEditData({ ...editData, category: e.target.value })}
                      className="w-24 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm text-white" />
                  </td>
                  <td className="px-4 py-2">
                    <input value={editData.unit ?? item.unit} onChange={e => setEditData({ ...editData, unit: e.target.value })}
                      className="w-16 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm text-white" />
                  </td>
                  <td className="px-4 py-2">
                    <input type="number" value={editData.xactimate ?? item.xactimate}
                      onChange={e => setEditData({ ...editData, xactimate: parseFloat(e.target.value) })}
                      className="w-24 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm text-white text-right" />
                  </td>
                  <td className="px-4 py-2">
                    <input type="number" value={editData.ours ?? item.ours}
                      onChange={e => setEditData({ ...editData, ours: parseFloat(e.target.value) })}
                      className="w-24 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm text-white text-right" />
                  </td>
                  <td className="px-4 py-2 text-right text-green-400 font-mono text-xs">
                    {margin(editData.xactimate ?? item.xactimate, editData.ours ?? item.ours)}
                  </td>
                  <td className="px-4 py-2 text-center">
                    <input type="checkbox" checked={editData.active ?? item.active}
                      onChange={e => setEditData({ ...editData, active: e.target.checked })}
                      className="accent-red-600" />
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex gap-1">
                      <button onClick={saveEdit} disabled={saving}
                        className="p-1.5 bg-green-700 hover:bg-green-600 text-white rounded disabled:opacity-50">
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setEditId(null)}
                        className="p-1.5 bg-gray-600 hover:bg-gray-500 text-gray-200 rounded">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={item.id} className={`border-b border-gray-700/50 hover:bg-gray-700/30 transition-colors ${!item.active ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3 text-gray-500 text-xs font-mono">{item.id}</td>
                  <td className="px-4 py-3 text-white font-medium">{item.label}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs capitalize">{item.category}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{item.unit}</td>
                  <td className="px-4 py-3 text-right font-mono text-gray-300 text-xs">{fmt(item.xactimate)}</td>
                  <td className="px-4 py-3 text-right font-mono text-white font-semibold text-xs">{fmt(item.ours)}</td>
                  <td className="px-4 py-3 text-right text-green-400 font-mono text-xs">{margin(item.xactimate, item.ours)}</td>
                  <td className="px-4 py-3 text-center">
                    {item.active
                      ? <Check className="w-4 h-4 text-green-400 mx-auto" />
                      : <X className="w-4 h-4 text-gray-600 mx-auto" />
                    }
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => { setEditId(item.id); setEditData({ ...item }); }}
                      className="p-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              )
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
