'use client';

import { useState, useEffect, useCallback } from 'react';

interface EvReport {
  id:           string;
  ev_report_id: number | null;
  status:       string;
  product_name: string | null;
  address:      string;
  measurements: {
    status:       string;
    area:         string | null;
    pitch:        string | null;
    lengthRidge:  string | null;
    lengthHip:    string | null;
    lengthValley: string | null;
    lengthEave:   string | null;
    lengthRake:   string | null;
    totalFacets:  string | null;
    pdfUrl:       string | null;
  } | null;
  pdf_url:     string | null;
  created_at:  string;
}

interface Props {
  estimateId: string;
}

const PRODUCTS = [
  { id: 110, name: 'Bid Perfect',           price: '$18–49', turnaround: 'Instant (AI)' },
  { id: 1,   name: 'Premium - Residential', price: '$30–75', turnaround: '3–6 hours'    },
  { id: 106, name: 'Roof',                  price: '$33–90', turnaround: '3–6 hours'    },
] as const;

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending:    { label: 'Pending',      color: '#6b7280' },
  processing: { label: 'Processing',  color: '#d97706' },
  complete:   { label: 'Complete',    color: '#16a34a' },
  failed:     { label: 'Failed',      color: '#dc2626' },
  needs_id:   { label: 'Needs Address Confirm', color: '#7c3aed' },
};

function sqFromArea(areaSqFt: string | null | undefined): string {
  if (!areaSqFt) return '—';
  const n = parseFloat(areaSqFt.replace(/,/g, ''));
  if (isNaN(n)) return areaSqFt;
  return (n / 100).toFixed(2) + ' SQ';
}

function fmt(val: string | null | undefined, unit = 'LF') {
  if (!val) return '—';
  const n = parseFloat(val.replace(/,/g, ''));
  if (isNaN(n)) return val;
  return n.toFixed(0) + ' ' + unit;
}

export default function MeasurementPanel({ estimateId }: Props) {
  const [report, setReport]       = useState<EvReport | null>(null);
  const [loading, setLoading]     = useState(true);
  const [ordering, setOrdering]   = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<number>(PRODUCTS[0].id);
  const [error, setError]         = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/estimates/${estimateId}/ev-report`);
      const data = await res.json();
      setReport(data.report ?? null);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [estimateId]);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh while processing
  useEffect(() => {
    if (report?.status !== 'processing') return;
    const t = setInterval(load, 30_000); // poll every 30s
    return () => clearInterval(t);
  }, [report?.status, load]);

  async function placeOrder() {
    setOrdering(true);
    setError('');
    const product = PRODUCTS.find(p => p.id === selectedProduct)!;
    try {
      const res = await fetch(`/api/admin/estimates/${estimateId}/ev-report`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ productId: product.id, productName: product.name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Order failed');
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setOrdering(false);
    }
  }

  async function refreshStatus() {
    setRefreshing(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/estimates/${estimateId}/ev-report`, { method: 'PATCH' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Refresh failed');
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setRefreshing(false);
    }
  }

  const m = report?.measurements;
  const statusInfo = STATUS_LABELS[report?.status ?? ''] ?? { label: report?.status ?? '', color: '#6b7280' };

  return (
    <div style={{ background: '#111827', border: '1px solid #374151', borderRadius: 12, padding: 24, marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <span style={{ fontSize: 20 }}>📐</span>
        <h3 style={{ margin: 0, color: '#f9fafb', fontSize: 16, fontWeight: 600 }}>
          EagleView Measurement Report
        </h3>
        {report && (
          <span style={{
            marginLeft: 'auto', fontSize: 12, fontWeight: 700, padding: '3px 10px',
            borderRadius: 20, background: statusInfo.color + '22', color: statusInfo.color,
          }}>
            {statusInfo.label}
          </span>
        )}
      </div>

      {loading ? (
        <p style={{ color: '#6b7280', fontSize: 14, margin: 0 }}>Loading…</p>

      ) : !report ? (
        // ── Order form ───────────────────────────────────────────────────
        <div>
          <p style={{ color: '#9ca3af', fontSize: 13, marginBottom: 16 }}>
            Order a precise roof measurement report. EagleView uses aerial imagery and AI/photogrammetry
            to return area (squares), pitch, ridge, hip, valley, eave, and rake lengths.
          </p>

          <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            {PRODUCTS.map(p => (
              <button
                key={p.id}
                onClick={() => setSelectedProduct(p.id)}
                style={{
                  flex: 1, padding: '10px 14px', borderRadius: 8, cursor: 'pointer',
                  border: `2px solid ${selectedProduct === p.id ? '#ca8a04' : '#374151'}`,
                  background: selectedProduct === p.id ? '#78350f' : '#1f2937',
                  color: selectedProduct === p.id ? '#fbbf24' : '#9ca3af',
                  textAlign: 'left',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 14 }}>{p.name}</div>
                <div style={{ fontSize: 12, marginTop: 2 }}>{p.price} · {p.turnaround}</div>
              </button>
            ))}
          </div>

          {error && (
            <div style={{ background: '#7f1d1d', color: '#fca5a5', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 12 }}>
              {error}
            </div>
          )}

          <button
            onClick={placeOrder}
            disabled={ordering}
            style={{
              background: ordering ? '#374151' : '#ca8a04', color: '#fff',
              border: 'none', borderRadius: 8, padding: '10px 20px',
              fontWeight: 700, fontSize: 14, cursor: ordering ? 'not-allowed' : 'pointer',
            }}
          >
            {ordering ? 'Ordering…' : 'Order Measurement Report'}
          </button>
        </div>

      ) : (
        // ── Report status / results ───────────────────────────────────────
        <div>
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 16 }}>
            {report.product_name} · Ordered {new Date(report.created_at).toLocaleDateString()}
            {report.ev_report_id && <span> · Report #{report.ev_report_id}</span>}
          </div>

          {report.status === 'processing' && (
            <div style={{ background: '#1f2937', borderRadius: 8, padding: '12px 16px', marginBottom: 16, color: '#d97706', fontSize: 14 }}>
              EagleView is processing this report. This page will auto-refresh every 30 seconds.
              You will also receive a webhook notification when complete.
            </div>
          )}

          {report.status === 'needs_id' && (
            <div style={{ background: '#3b0764', borderRadius: 8, padding: '12px 16px', marginBottom: 16, color: '#d8b4fe', fontSize: 14 }}>
              EagleView needs you to confirm the exact structure. Check your EagleView portal for an address disambiguation link.
            </div>
          )}

          {report.status === 'failed' && (
            <div style={{ background: '#7f1d1d', borderRadius: 8, padding: '12px 16px', marginBottom: 16, color: '#fca5a5', fontSize: 14 }}>
              Report failed. Check EagleView portal or re-order below.
            </div>
          )}

          {m && report.status === 'complete' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              {[
                { label: 'Roof Area',    value: sqFromArea(m.area) },
                { label: 'Primary Pitch', value: m.pitch ? m.pitch + '/12' : '—' },
                { label: 'Ridge',        value: fmt(m.lengthRidge) },
                { label: 'Hip',          value: fmt(m.lengthHip) },
                { label: 'Valley',       value: fmt(m.lengthValley) },
                { label: 'Eave',         value: fmt(m.lengthEave) },
                { label: 'Rake',         value: fmt(m.lengthRake) },
                { label: 'Facets',       value: m.totalFacets ?? '—' },
              ].map(row => (
                <div key={row.label} style={{ background: '#1f2937', borderRadius: 8, padding: '10px 14px' }}>
                  <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                    {row.label}
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#f9fafb' }}>
                    {row.value}
                  </div>
                </div>
              ))}
            </div>
          )}

          {error && (
            <div style={{ background: '#7f1d1d', color: '#fca5a5', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 12 }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {report.status !== 'complete' && (
              <button
                onClick={refreshStatus}
                disabled={refreshing}
                style={{
                  background: refreshing ? '#374151' : '#1f2937', color: '#e5e7eb',
                  border: '1px solid #374151', borderRadius: 8, padding: '8px 16px',
                  fontWeight: 600, fontSize: 13, cursor: refreshing ? 'not-allowed' : 'pointer',
                }}
              >
                {refreshing ? 'Checking…' : '↻ Check Status'}
              </button>
            )}

            {(report.pdf_url || m?.pdfUrl) && (
              <a
                href={report.pdf_url ?? m?.pdfUrl ?? '#'}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  background: '#1e40af', color: '#fff', borderRadius: 8,
                  padding: '8px 16px', fontWeight: 600, fontSize: 13,
                  textDecoration: 'none', display: 'inline-block',
                }}
              >
                Download PDF Report
              </a>
            )}

            <button
              onClick={load}
              style={{
                background: 'transparent', color: '#6b7280',
                border: '1px solid #374151', borderRadius: 8, padding: '8px 16px',
                fontWeight: 600, fontSize: 13, cursor: 'pointer',
              }}
            >
              Refresh
            </button>
          </div>

          {report.status === 'failed' && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #374151' }}>
              <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 10 }}>Re-order a new report:</p>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                {PRODUCTS.map(p => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedProduct(p.id)}
                    style={{
                      padding: '8px 14px', borderRadius: 8, cursor: 'pointer',
                      border: `2px solid ${selectedProduct === p.id ? '#ca8a04' : '#374151'}`,
                      background: selectedProduct === p.id ? '#78350f' : '#1f2937',
                      color: selectedProduct === p.id ? '#fbbf24' : '#9ca3af',
                      fontSize: 13, fontWeight: 600,
                    }}
                  >
                    {p.name} ({p.price})
                  </button>
                ))}
                <button
                  onClick={placeOrder}
                  disabled={ordering}
                  style={{
                    background: '#ca8a04', color: '#fff', border: 'none',
                    borderRadius: 8, padding: '8px 16px', fontWeight: 700,
                    fontSize: 13, cursor: 'pointer',
                  }}
                >
                  {ordering ? 'Ordering…' : 'Re-Order'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
