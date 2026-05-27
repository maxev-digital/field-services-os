'use client';

import { useState, useEffect, useCallback } from 'react';

const CATEGORIES = [
  { id: 'materials',  label: 'Materials'       },
  { id: 'labor',      label: 'Labor'            },
  { id: 'subs',       label: 'Subcontractors'   },
  { id: 'equipment',  label: 'Equipment/Rental' },
  { id: 'permits',    label: 'Permits'          },
  { id: 'eagleview',  label: 'EagleView Report' },
  { id: 'marketing',  label: 'Marketing'        },
  { id: 'other',      label: 'Other'            },
] as const;

type CategoryId = typeof CATEGORIES[number]['id'];

interface JobCost {
  id:          string;
  category:    string;
  description: string;
  amount:      number;
  created_at:  string;
}

interface Props {
  estimateId: string;
  revenue:    number;   // our_total or invoice amount_due
  collected:  number;   // amount_paid on invoice (0 if none)
}

function fmt(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function pct(n: number) {
  return (n >= 0 ? '' : '') + n.toFixed(1) + '%';
}

export default function PnLPanel({ estimateId, revenue, collected }: Props) {
  const [costs,    setCosts]    = useState<JobCost[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');

  // Form state
  const [category,    setCategory]    = useState<CategoryId>('materials');
  const [description, setDescription] = useState('');
  const [amount,      setAmount]      = useState('');

  // Inline edit state
  const [editId,   setEditId]   = useState<string | null>(null);
  const [editAmt,  setEditAmt]  = useState('');
  const [editDesc, setEditDesc] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch(`/api/admin/estimates/${estimateId}/costs`);
      const data = await res.json();
      setCosts(data.costs ?? []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [estimateId]);

  useEffect(() => { load(); }, [load]);

  async function addCost() {
    if (!description.trim() || !amount) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/estimates/${estimateId}/costs`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ category, description: description.trim(), amount: parseFloat(amount) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to save');
      setDescription('');
      setAmount('');
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteCost(id: string) {
    await fetch(`/api/admin/estimates/${estimateId}/costs/${id}`, { method: 'DELETE' });
    setCosts(prev => prev.filter(c => c.id !== id));
  }

  async function saveEdit(id: string) {
    await fetch(`/api/admin/estimates/${estimateId}/costs/${id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ description: editDesc, amount: parseFloat(editAmt) }),
    });
    setEditId(null);
    await load();
  }

  // ── Computed ──────────────────────────────────────────────────────────────
  const totalCosts  = costs.reduce((s, c) => s + c.amount, 0);
  const grossProfit = revenue - totalCosts;
  const margin      = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
  const cashLeft    = collected - totalCosts;

  // Group by category for breakdown
  const byCategory = CATEGORIES.map(cat => ({
    ...cat,
    total: costs.filter(c => c.category === cat.id).reduce((s, c) => s + c.amount, 0),
  })).filter(c => c.total > 0);

  return (
    <div style={{ background: '#111827', border: '1px solid #374151', borderRadius: 12, padding: 24, marginBottom: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <span style={{ fontSize: 20 }}>📊</span>
        <h3 style={{ margin: 0, color: '#f9fafb', fontSize: 16, fontWeight: 600 }}>
          Job P&amp;L
        </h3>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 24 }}>
        {[
          { label: 'Revenue',      value: fmt(revenue),      sub: 'contracted',     color: '#60a5fa' },
          { label: 'Total Costs',  value: fmt(totalCosts),   sub: costs.length + ' line items', color: '#f87171' },
          { label: 'Gross Profit', value: fmt(grossProfit),  sub: pct(margin) + ' margin',
            color: grossProfit >= 0 ? '#4ade80' : '#f87171' },
          { label: 'Collected',    value: fmt(collected),    sub: cashLeft >= 0 ? fmt(cashLeft) + ' net cash' : fmt(cashLeft) + ' shortfall',
            color: collected > 0 ? '#34d399' : '#6b7280' },
        ].map(card => (
          <div key={card.label} style={{ background: '#1f2937', borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
              {card.label}
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: card.color }}>
              {card.value}
            </div>
            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{card.sub}</div>
          </div>
        ))}
      </div>

      {/* Cost Breakdown by Category */}
      {byCategory.length > 0 && (
        <div style={{ marginBottom: 20, background: '#1f2937', borderRadius: 10, padding: '14px 16px' }}>
          <div style={{ fontSize: 12, color: '#9ca3af', fontWeight: 600, marginBottom: 10 }}>Cost Breakdown</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 20px' }}>
            {byCategory.map(cat => (
              <div key={cat.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: '#9ca3af' }}>{cat.label}</span>
                <span style={{ color: '#f9fafb', fontWeight: 600 }}>{fmt(cat.total)}</span>
              </div>
            ))}
          </div>
          <div style={{ borderTop: '1px solid #374151', marginTop: 10, paddingTop: 10,
            display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700 }}>
            <span style={{ color: '#9ca3af' }}>Total</span>
            <span style={{ color: '#f87171' }}>{fmt(totalCosts)}</span>
          </div>
        </div>
      )}

      {/* Cost Line Items */}
      {loading ? (
        <p style={{ color: '#6b7280', fontSize: 13 }}>Loading…</p>
      ) : (
        <>
          {costs.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: '#9ca3af', fontWeight: 600, marginBottom: 8 }}>Cost Line Items</div>
              <div style={{ border: '1px solid #374151', borderRadius: 8, overflow: 'hidden' }}>
                {costs.map((cost, i) => (
                  <div
                    key={cost.id}
                    style={{
                      display: 'grid', gridTemplateColumns: '1fr auto auto auto',
                      gap: 10, alignItems: 'center',
                      padding: '10px 14px',
                      borderTop: i > 0 ? '1px solid #374151' : 'none',
                      background: editId === cost.id ? '#1f2937' : 'transparent',
                    }}
                  >
                    <div>
                      <span style={{
                        fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 10,
                        background: '#374151', color: '#9ca3af', marginRight: 8,
                      }}>
                        {CATEGORIES.find(c => c.id === cost.category)?.label ?? cost.category}
                      </span>
                      {editId === cost.id ? (
                        <input
                          value={editDesc}
                          onChange={e => setEditDesc(e.target.value)}
                          style={{
                            background: '#111827', border: '1px solid #4b5563', borderRadius: 6,
                            color: '#f9fafb', padding: '4px 8px', fontSize: 13, width: 200,
                          }}
                        />
                      ) : (
                        <span style={{ fontSize: 13, color: '#e5e7eb' }}>{cost.description}</span>
                      )}
                    </div>

                    {editId === cost.id ? (
                      <input
                        value={editAmt}
                        onChange={e => setEditAmt(e.target.value)}
                        type="number"
                        style={{
                          background: '#111827', border: '1px solid #4b5563', borderRadius: 6,
                          color: '#f9fafb', padding: '4px 8px', fontSize: 13, width: 100, textAlign: 'right',
                        }}
                      />
                    ) : (
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#f87171' }}>
                        {fmt(cost.amount)}
                      </span>
                    )}

                    {editId === cost.id ? (
                      <>
                        <button
                          onClick={() => saveEdit(cost.id)}
                          style={{
                            background: '#16a34a', color: '#fff', border: 'none',
                            borderRadius: 6, padding: '4px 10px', fontSize: 12,
                            fontWeight: 600, cursor: 'pointer',
                          }}
                        >Save</button>
                        <button
                          onClick={() => setEditId(null)}
                          style={{
                            background: '#374151', color: '#9ca3af', border: 'none',
                            borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer',
                          }}
                        >Cancel</button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => { setEditId(cost.id); setEditAmt(String(cost.amount)); setEditDesc(cost.description); }}
                          style={{
                            background: 'transparent', color: '#6b7280', border: 'none',
                            cursor: 'pointer', fontSize: 14, padding: '2px 6px',
                          }}
                        >✎</button>
                        <button
                          onClick={() => deleteCost(cost.id)}
                          style={{
                            background: 'transparent', color: '#6b7280', border: 'none',
                            cursor: 'pointer', fontSize: 14, padding: '2px 6px',
                          }}
                        >✕</button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Add Cost Form */}
          <div style={{ background: '#1f2937', borderRadius: 10, padding: '16px' }}>
            <div style={{ fontSize: 12, color: '#9ca3af', fontWeight: 600, marginBottom: 12 }}>Add Cost</div>
            <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr 120px auto', gap: 10, alignItems: 'flex-end' }}>
              <div>
                <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>Category</div>
                <select
                  value={category}
                  onChange={e => setCategory(e.target.value as CategoryId)}
                  style={{
                    width: '100%', background: '#111827', border: '1px solid #374151',
                    borderRadius: 8, color: '#f9fafb', padding: '8px 10px', fontSize: 13,
                  }}
                >
                  {CATEGORIES.map(c => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>Description</div>
                <input
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="e.g. Owens Corning Duration shingles"
                  onKeyDown={e => e.key === 'Enter' && addCost()}
                  style={{
                    width: '100%', background: '#111827', border: '1px solid #374151',
                    borderRadius: 8, color: '#f9fafb', padding: '8px 10px', fontSize: 13,
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>Amount ($)</div>
                <input
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  type="number"
                  placeholder="0.00"
                  onKeyDown={e => e.key === 'Enter' && addCost()}
                  style={{
                    width: '100%', background: '#111827', border: '1px solid #374151',
                    borderRadius: 8, color: '#f9fafb', padding: '8px 10px', fontSize: 13,
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <button
                onClick={addCost}
                disabled={saving || !description.trim() || !amount}
                style={{
                  background: saving ? '#374151' : '#16a34a', color: '#fff',
                  border: 'none', borderRadius: 8, padding: '8px 18px',
                  fontWeight: 700, fontSize: 13, cursor: saving ? 'not-allowed' : 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {saving ? 'Saving…' : '+ Add'}
              </button>
            </div>

            {error && (
              <div style={{ marginTop: 10, color: '#fca5a5', fontSize: 13 }}>{error}</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
