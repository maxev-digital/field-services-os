'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface LineItem {
  description: string;
  qty:         string;
  unit:        string;
  unit_price:  string;
  amount:      string;
}

const METHODS = ['CHECK', 'CASH', 'ZELLE', 'CREDIT_CARD', 'ACH', 'OTHER'];

function calcAmount(qty: string, unit_price: string) {
  const q = parseFloat(qty) || 0;
  const p = parseFloat(unit_price) || 0;
  return (q * p).toFixed(2);
}

export default function NewManualInvoicePage() {
  const router = useRouter();

  // Customer / job info
  const [customerName,    setCustomerName]    = useState('');
  const [customerPhone,   setCustomerPhone]   = useState('');
  const [customerEmail,   setCustomerEmail]   = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [propertyAddress, setPropertyAddress] = useState('');
  const [insurer,         setInsurer]         = useState('');
  const [claimNo,         setClaimNo]         = useState('');
  const [issuedAt,        setIssuedAt]        = useState(new Date().toISOString().split('T')[0]);
  const [notes,           setNotes]           = useState('');
  const [paymentTerms,    setPaymentTerms]    = useState('Payment due within 30 days of invoice date. We accept check, cash, Zelle, and credit card.');

  // Line items
  const [items, setItems] = useState<LineItem[]>([
    { description: '', qty: '1', unit: '', unit_price: '', amount: '' },
  ]);

  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  function updateItem(i: number, field: keyof LineItem, value: string) {
    setItems(prev => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: value };
      // Auto-calculate amount when qty or unit_price change
      if (field === 'qty' || field === 'unit_price') {
        const qty   = field === 'qty'        ? value : next[i].qty;
        const price = field === 'unit_price' ? value : next[i].unit_price;
        next[i].amount = calcAmount(qty, price);
      }
      return next;
    });
  }

  function addItem() {
    setItems(prev => [...prev, { description: '', qty: '1', unit: '', unit_price: '', amount: '' }]);
  }

  function removeItem(i: number) {
    setItems(prev => prev.filter((_, idx) => idx !== i));
  }

  const subtotal = items.reduce((s, li) => s + (parseFloat(li.amount) || 0), 0);

  async function save() {
    if (!customerName.trim()) { setError('Customer name is required'); return; }
    if (items.every(li => !li.description.trim())) { setError('Add at least one line item'); return; }

    setSaving(true);
    setError('');

    try {
      const res = await fetch('/api/admin/manual-invoices', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name:    customerName.trim(),
          customer_phone:   customerPhone   || null,
          customer_email:   customerEmail   || null,
          customer_address: customerAddress || null,
          property_address: propertyAddress || null,
          insurer:          insurer         || null,
          claim_no:         claimNo         || null,
          issued_at:        issuedAt,
          notes:            notes           || null,
          payment_terms:    paymentTerms    || null,
          line_items: items.filter(li => li.description.trim()),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to create invoice');
      router.push(`/admin/manual-invoices/${data.invoice.id}`);
    } catch (err: any) {
      setError(err.message);
      setSaving(false);
    }
  }

  const input = (label: string, value: string, onChange: (v: string) => void, opts?: { type?: string; placeholder?: string; span?: number }) => (
    <div style={{ gridColumn: opts?.span ? `span ${opts.span}` : undefined }}>
      <label style={{ display: 'block', fontSize: 11, color: '#6b7280', fontWeight: 600,
        textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
        {label}
      </label>
      <input
        type={opts?.type ?? 'text'}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={opts?.placeholder}
        style={{
          width: '100%', background: '#111827', border: '1px solid #374151',
          borderRadius: 8, color: '#f9fafb', padding: '9px 12px', fontSize: 14,
          boxSizing: 'border-box',
        }}
      />
    </div>
  );

  return (
    <div style={{ padding: 32, maxWidth: 960, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28 }}>
        <Link href="/admin/manual-invoices" style={{ color: '#6b7280', fontSize: 13, textDecoration: 'none' }}>
          ← Back
        </Link>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#f9fafb' }}>New Manual Invoice</h1>
      </div>

      {/* Customer Info */}
      <div style={{ background: '#111827', border: '1px solid #374151', borderRadius: 12, padding: 24, marginBottom: 20 }}>
        <h3 style={{ margin: '0 0 18px', fontSize: 14, fontWeight: 600, color: '#f9fafb' }}>Customer Information</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {input('Customer Name *', customerName, setCustomerName, { span: 2, placeholder: 'Full name' })}
          {input('Phone', customerPhone, setCustomerPhone, { type: 'tel', placeholder: '(214) 000-0000' })}
          {input('Email', customerEmail, setCustomerEmail, { type: 'email', placeholder: 'customer@email.com' })}
          {input('Billing Address', customerAddress, setCustomerAddress, { span: 2, placeholder: '123 Main St, Dallas TX 75201' })}
        </div>
      </div>

      {/* Job / Property Info */}
      <div style={{ background: '#111827', border: '1px solid #374151', borderRadius: 12, padding: 24, marginBottom: 20 }}>
        <h3 style={{ margin: '0 0 18px', fontSize: 14, fontWeight: 600, color: '#f9fafb' }}>Job / Property</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {input('Property Address', propertyAddress, setPropertyAddress, { span: 2, placeholder: 'If different from billing address' })}
          {input('Insurance Company', insurer, setInsurer, { placeholder: 'State Farm, Allstate…' })}
          {input('Claim Number', claimNo, setClaimNo)}
        </div>
      </div>

      {/* Invoice Details */}
      <div style={{ background: '#111827', border: '1px solid #374151', borderRadius: 12, padding: 24, marginBottom: 20 }}>
        <h3 style={{ margin: '0 0 18px', fontSize: 14, fontWeight: 600, color: '#f9fafb' }}>Invoice Details</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {input('Invoice Date', issuedAt, setIssuedAt, { type: 'date' })}
          <div /> {/* spacer */}
          <div style={{ gridColumn: 'span 2' }}>
            <label style={{ display: 'block', fontSize: 11, color: '#6b7280', fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
              Payment Terms
            </label>
            <textarea
              value={paymentTerms}
              onChange={e => setPaymentTerms(e.target.value)}
              rows={2}
              style={{
                width: '100%', background: '#111827', border: '1px solid #374151',
                borderRadius: 8, color: '#f9fafb', padding: '9px 12px', fontSize: 14,
                boxSizing: 'border-box', resize: 'vertical',
              }}
            />
          </div>
          <div style={{ gridColumn: 'span 2' }}>
            <label style={{ display: 'block', fontSize: 11, color: '#6b7280', fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
              Notes (printed on invoice)
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="Optional notes visible to customer"
              style={{
                width: '100%', background: '#111827', border: '1px solid #374151',
                borderRadius: 8, color: '#f9fafb', padding: '9px 12px', fontSize: 14,
                boxSizing: 'border-box', resize: 'vertical',
              }}
            />
          </div>
        </div>
      </div>

      {/* Line Items */}
      <div style={{ background: '#111827', border: '1px solid #374151', borderRadius: 12, padding: 24, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#f9fafb' }}>Line Items</h3>
          <button
            onClick={addItem}
            style={{
              background: '#1f2937', color: '#d1d5db', border: '1px solid #374151',
              borderRadius: 8, padding: '6px 14px', fontSize: 13, cursor: 'pointer',
            }}
          >
            + Add Line
          </button>
        </div>

        {/* Column headers */}
        <div style={{ display: 'grid', gridTemplateColumns: '3fr 70px 70px 110px 110px 36px', gap: 8, marginBottom: 8 }}>
          {['Description', 'Qty', 'Unit', 'Unit Price', 'Amount', ''].map(h => (
            <div key={h} style={{ fontSize: 10, color: '#6b7280', fontWeight: 700,
              textTransform: 'uppercase', letterSpacing: '0.05em',
              textAlign: h === 'Unit Price' || h === 'Amount' ? 'right' : 'left' }}>
              {h}
            </div>
          ))}
        </div>

        {items.map((li, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '3fr 70px 70px 110px 110px 36px', gap: 8, marginBottom: 8 }}>
            <input
              value={li.description}
              onChange={e => updateItem(i, 'description', e.target.value)}
              placeholder="Description of work or materials"
              style={{
                background: '#1f2937', border: '1px solid #374151', borderRadius: 6,
                color: '#f9fafb', padding: '8px 10px', fontSize: 13, width: '100%', boxSizing: 'border-box',
              }}
            />
            <input
              value={li.qty}
              onChange={e => updateItem(i, 'qty', e.target.value)}
              type="number" min="0" step="0.01"
              style={{
                background: '#1f2937', border: '1px solid #374151', borderRadius: 6,
                color: '#f9fafb', padding: '8px 10px', fontSize: 13, width: '100%',
                boxSizing: 'border-box', textAlign: 'center',
              }}
            />
            <input
              value={li.unit}
              onChange={e => updateItem(i, 'unit', e.target.value)}
              placeholder="SQ, EA…"
              style={{
                background: '#1f2937', border: '1px solid #374151', borderRadius: 6,
                color: '#f9fafb', padding: '8px 10px', fontSize: 13, width: '100%',
                boxSizing: 'border-box', textAlign: 'center',
              }}
            />
            <input
              value={li.unit_price}
              onChange={e => updateItem(i, 'unit_price', e.target.value)}
              type="number" min="0" step="0.01" placeholder="0.00"
              style={{
                background: '#1f2937', border: '1px solid #374151', borderRadius: 6,
                color: '#f9fafb', padding: '8px 10px', fontSize: 13, width: '100%',
                boxSizing: 'border-box', textAlign: 'right',
              }}
            />
            <input
              value={li.amount}
              onChange={e => updateItem(i, 'amount', e.target.value)}
              type="number" min="0" step="0.01" placeholder="0.00"
              style={{
                background: '#1f2937', border: '1px solid #374151', borderRadius: 6,
                color: '#f9fafb', padding: '8px 10px', fontSize: 13, fontWeight: 700,
                width: '100%', boxSizing: 'border-box', textAlign: 'right',
              }}
            />
            <button
              onClick={() => removeItem(i)}
              disabled={items.length === 1}
              style={{
                background: 'transparent', color: items.length === 1 ? '#374151' : '#6b7280',
                border: 'none', cursor: items.length === 1 ? 'not-allowed' : 'pointer',
                fontSize: 16, padding: 0,
              }}
            >✕</button>
          </div>
        ))}

        {/* Subtotal */}
        <div style={{ borderTop: '1px solid #374151', marginTop: 12, paddingTop: 12,
          display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 20 }}>
          <span style={{ fontSize: 13, color: '#6b7280' }}>Subtotal</span>
          <span style={{ fontSize: 20, fontWeight: 700, color: '#f9fafb', fontFamily: 'monospace' }}>
            ${subtotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{ background: '#7f1d1d', color: '#fca5a5', borderRadius: 8, padding: '12px 16px', marginBottom: 16, fontSize: 14 }}>
          {error}
        </div>
      )}

      {/* Save */}
      <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
        <Link href="/admin/manual-invoices" style={{
          background: '#1f2937', color: '#9ca3af', border: '1px solid #374151',
          borderRadius: 8, padding: '10px 20px', fontWeight: 600, fontSize: 14,
          textDecoration: 'none',
        }}>
          Cancel
        </Link>
        <button
          onClick={save}
          disabled={saving}
          style={{
            background: saving ? '#374151' : '#dc2626', color: '#fff',
            border: 'none', borderRadius: 8, padding: '10px 28px',
            fontWeight: 700, fontSize: 14, cursor: saving ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? 'Creating…' : 'Create Invoice'}
        </button>
      </div>
    </div>
  );
}
