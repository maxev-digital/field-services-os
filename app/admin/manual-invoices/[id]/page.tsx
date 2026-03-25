'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

interface LineItem {
  id?:         string;
  description: string;
  qty:         number | string;
  unit:        string;
  unit_price:  number | string;
  amount:      number | string;
  sort_order?: number;
}

interface Payment {
  id:          string;
  amount:      number;
  method:      string;
  reference_no: string | null;
  notes:       string | null;
  paid_at:     string;
}

interface Invoice {
  id:               string;
  invoice_no:       string;
  customer_name:    string;
  customer_phone:   string | null;
  customer_email:   string | null;
  customer_address: string | null;
  property_address: string | null;
  insurer:          string | null;
  claim_no:         string | null;
  notes:            string | null;
  payment_terms:    string | null;
  amount_due:       number;
  amount_paid:      number;
  status:           string;
  issued_at:        string;
  due_at:           string | null;
  line_items:       (LineItem & { id: string; qty: number; unit_price: number; amount: number })[];
  payments:         Payment[];
}

const METHODS = ['CHECK', 'CASH', 'ZELLE', 'CREDIT_CARD', 'ACH', 'OTHER'];

const STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  UNPAID:  { bg: '#451a03', text: '#fb923c' },
  PARTIAL: { bg: '#1c1917', text: '#fbbf24' },
  PAID:    { bg: '#052e16', text: '#4ade80' },
};

function fmt(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
}
function dFmt(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function toDateInput(d: string | null) {
  if (!d) return '';
  return new Date(d).toISOString().split('T')[0];
}
function calcAmt(qty: string | number, price: string | number) {
  const q = parseFloat(String(qty))  || 0;
  const p = parseFloat(String(price)) || 0;
  return +(q * p).toFixed(2);
}

export default function ManualInvoiceDetailPage() {
  const { id }  = useParams<{ id: string }>();
  const router  = useRouter();

  const [invoice,  setInvoice]  = useState<Invoice | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [editing,  setEditing]  = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');
  const [deleting, setDeleting] = useState(false);

  // Edit state mirrors invoice fields
  const [editFields, setEditFields] = useState<Partial<Invoice>>({});
  const [editItems,  setEditItems]  = useState<LineItem[]>([]);

  // Payment form
  const [payAmt,  setPayAmt]  = useState('');
  const [payMethod, setPayMethod] = useState('CHECK');
  const [payRef,  setPayRef]  = useState('');
  const [payNotes, setPayNotes] = useState('');
  const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0]);
  const [addingPay, setAddingPay] = useState(false);
  const [payError,  setPayError]  = useState('');

  const load = useCallback(async () => {
    const res  = await fetch(`/api/admin/manual-invoices/${id}`);
    const data = await res.json();
    if (data.invoice) setInvoice(data.invoice);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  function startEdit() {
    if (!invoice) return;
    setEditFields({
      customer_name:    invoice.customer_name,
      customer_phone:   invoice.customer_phone   ?? '',
      customer_email:   invoice.customer_email   ?? '',
      customer_address: invoice.customer_address ?? '',
      property_address: invoice.property_address ?? '',
      insurer:          invoice.insurer          ?? '',
      claim_no:         invoice.claim_no         ?? '',
      notes:            invoice.notes            ?? '',
      payment_terms:    invoice.payment_terms    ?? '',
      issued_at:        toDateInput(invoice.issued_at),
      due_at:           toDateInput(invoice.due_at),
    });
    setEditItems(invoice.line_items.map(li => ({
      id:          li.id,
      description: li.description,
      qty:         String(li.qty),
      unit:        li.unit ?? '',
      unit_price:  String(li.unit_price),
      amount:      String(li.amount),
    })));
    setEditing(true);
  }

  function updateEditItem(i: number, field: keyof LineItem, value: string) {
    setEditItems(prev => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: value };
      if (field === 'qty' || field === 'unit_price') {
        const qty   = field === 'qty'        ? value : String(next[i].qty);
        const price = field === 'unit_price' ? value : String(next[i].unit_price);
        next[i].amount = String(calcAmt(qty, price));
      }
      return next;
    });
  }

  async function saveEdit() {
    if (!invoice) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/manual-invoices/${id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...editFields,
          issued_at: editFields.issued_at || undefined,
          due_at:    editFields.due_at    || null,
          line_items: editItems.filter(li => String(li.description).trim()),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setInvoice(data.invoice);
      setEditing(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function recordPayment() {
    if (!payAmt || parseFloat(payAmt) <= 0) { setPayError('Enter a valid amount'); return; }
    setAddingPay(true);
    setPayError('');
    try {
      const res = await fetch(`/api/admin/manual-invoices/${id}/payments`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount:      parseFloat(payAmt),
          method:      payMethod,
          reference_no: payRef  || null,
          notes:       payNotes || null,
          paid_at:     payDate,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setInvoice(data.invoice);
      setPayAmt(''); setPayRef(''); setPayNotes('');
      setPayDate(new Date().toISOString().split('T')[0]);
    } catch (err: any) {
      setPayError(err.message);
    } finally {
      setAddingPay(false);
    }
  }

  async function deletePayment(payId: string) {
    const res  = await fetch(`/api/admin/manual-invoices/${id}/payments/${payId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.invoice) setInvoice(data.invoice);
  }

  async function deleteInvoice() {
    if (!confirm(`Delete invoice ${invoice?.invoice_no}? This cannot be undone.`)) return;
    setDeleting(true);
    await fetch(`/api/admin/manual-invoices/${id}`, { method: 'DELETE' });
    router.push('/admin/manual-invoices');
  }

  if (loading) return <div style={{ padding: 48, color: '#6b7280', textAlign: 'center' }}>Loading…</div>;
  if (!invoice) return <div style={{ padding: 48, color: '#f87171', textAlign: 'center' }}>Invoice not found.</div>;

  const balance  = invoice.amount_due - invoice.amount_paid;
  const statusStyle = STATUS_STYLE[invoice.status] ?? STATUS_STYLE.UNPAID;
  const editSubtotal = editItems.reduce((s, li) => s + (parseFloat(String(li.amount)) || 0), 0);

  const inputStyle: React.CSSProperties = {
    background: '#111827', border: '1px solid #374151', borderRadius: 8,
    color: '#f9fafb', padding: '8px 12px', fontSize: 14,
    width: '100%', boxSizing: 'border-box',
  };

  const field = (label: string, key: keyof Invoice, opts?: { type?: string; textarea?: boolean; span?: number }) => (
    <div style={{ gridColumn: opts?.span ? `span ${opts.span}` : undefined }}>
      <label style={{ display: 'block', fontSize: 11, color: '#6b7280', fontWeight: 600,
        textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>
        {label}
      </label>
      {opts?.textarea ? (
        <textarea
          value={String(editFields[key] ?? '')}
          onChange={e => setEditFields(f => ({ ...f, [key]: e.target.value }))}
          rows={2}
          style={{ ...inputStyle, resize: 'vertical' }}
        />
      ) : (
        <input
          type={opts?.type ?? 'text'}
          value={String(editFields[key] ?? '')}
          onChange={e => setEditFields(f => ({ ...f, [key]: e.target.value }))}
          style={inputStyle}
        />
      )}
    </div>
  );

  return (
    <div style={{ padding: 32, maxWidth: 1000, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Link href="/admin/manual-invoices" style={{ color: '#6b7280', fontSize: 13, textDecoration: 'none' }}>
            ← Back
          </Link>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#f9fafb' }}>
                {invoice.invoice_no}
              </h1>
              <span style={{
                fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 10,
                background: statusStyle.bg, color: statusStyle.text,
              }}>
                {invoice.status}
              </span>
            </div>
            <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>
              {invoice.customer_name} · Issued {dFmt(invoice.issued_at)}
              {invoice.due_at && ` · Due ${dFmt(invoice.due_at)}`}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <a
            href={`/api/admin/manual-invoices/${id}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              background: '#1e40af', color: '#fff', borderRadius: 8,
              padding: '9px 16px', fontWeight: 600, fontSize: 13,
              textDecoration: 'none', display: 'inline-block',
            }}
          >
            ↓ PDF
          </a>
          {!editing && (
            <button
              onClick={startEdit}
              style={{
                background: '#1f2937', color: '#d1d5db', border: '1px solid #374151',
                borderRadius: 8, padding: '9px 16px', fontWeight: 600, fontSize: 13, cursor: 'pointer',
              }}
            >
              Edit
            </button>
          )}
          <button
            onClick={deleteInvoice}
            disabled={deleting}
            style={{
              background: '#7f1d1d', color: '#fca5a5', border: 'none',
              borderRadius: 8, padding: '9px 16px', fontWeight: 600, fontSize: 13, cursor: 'pointer',
            }}
          >
            Delete
          </button>
        </div>
      </div>

      {/* ── View / Edit mode ────────────────────────────────────────────── */}
      {editing ? (
        <>
          {/* Edit Customer */}
          <div style={{ background: '#111827', border: '1px solid #374151', borderRadius: 12, padding: 24, marginBottom: 16 }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 600, color: '#f9fafb' }}>Customer</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {field('Name *',           'customer_name',    { span: 2 })}
              {field('Phone',            'customer_phone'   )}
              {field('Email',            'customer_email',   { type: 'email' })}
              {field('Billing Address',  'customer_address', { span: 2 })}
              {field('Property Address', 'property_address', { span: 2 })}
              {field('Insurer',          'insurer'          )}
              {field('Claim #',          'claim_no'         )}
              {field('Invoice Date',     'issued_at',        { type: 'date' })}
              {field('Due Date',         'due_at',           { type: 'date' })}
              {field('Payment Terms',    'payment_terms',    { textarea: true, span: 2 })}
              {field('Notes',            'notes',            { textarea: true, span: 2 })}
            </div>
          </div>

          {/* Edit Line Items */}
          <div style={{ background: '#111827', border: '1px solid #374151', borderRadius: 12, padding: 24, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#f9fafb' }}>Line Items</h3>
              <button
                onClick={() => setEditItems(p => [...p, { description: '', qty: '1', unit: '', unit_price: '', amount: '' }])}
                style={{
                  background: '#1f2937', color: '#d1d5db', border: '1px solid #374151',
                  borderRadius: 7, padding: '5px 12px', fontSize: 13, cursor: 'pointer',
                }}
              >+ Add Line</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '3fr 70px 70px 110px 110px 32px', gap: 8, marginBottom: 8 }}>
              {['Description','Qty','Unit','Unit Price','Amount',''].map(h => (
                <div key={h} style={{ fontSize: 10, color: '#6b7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</div>
              ))}
            </div>

            {editItems.map((li, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '3fr 70px 70px 110px 110px 32px', gap: 8, marginBottom: 8 }}>
                {(['description','qty','unit','unit_price','amount'] as const).map(f => (
                  <input
                    key={f}
                    value={String(li[f])}
                    onChange={e => updateEditItem(i, f, e.target.value)}
                    type={f === 'description' || f === 'unit' ? 'text' : 'number'}
                    placeholder={f === 'description' ? 'Description' : f === 'unit' ? 'SQ, EA…' : '0.00'}
                    style={{
                      background: '#1f2937', border: '1px solid #374151', borderRadius: 6,
                      color: '#f9fafb', padding: '7px 9px', fontSize: 13,
                      width: '100%', boxSizing: 'border-box',
                      textAlign: f === 'unit_price' || f === 'amount' ? 'right' : f === 'qty' ? 'center' : 'left',
                      fontWeight: f === 'amount' ? 700 : 400,
                    }}
                  />
                ))}
                <button
                  onClick={() => setEditItems(p => p.filter((_, idx) => idx !== i))}
                  style={{ background: 'transparent', color: '#6b7280', border: 'none', cursor: 'pointer', fontSize: 15 }}
                >✕</button>
              </div>
            ))}

            <div style={{ borderTop: '1px solid #374151', marginTop: 10, paddingTop: 10,
              display: 'flex', justifyContent: 'flex-end', gap: 16, alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: '#6b7280' }}>Subtotal</span>
              <span style={{ fontSize: 18, fontWeight: 700, color: '#f9fafb' }}>
                ${editSubtotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {error && (
            <div style={{ background: '#7f1d1d', color: '#fca5a5', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 13 }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button
              onClick={() => { setEditing(false); setError(''); }}
              style={{
                background: '#1f2937', color: '#9ca3af', border: '1px solid #374151',
                borderRadius: 8, padding: '9px 18px', fontWeight: 600, fontSize: 13, cursor: 'pointer',
              }}
            >Cancel</button>
            <button
              onClick={saveEdit}
              disabled={saving}
              style={{
                background: saving ? '#374151' : '#dc2626', color: '#fff', border: 'none',
                borderRadius: 8, padding: '9px 22px', fontWeight: 700, fontSize: 13,
                cursor: saving ? 'not-allowed' : 'pointer',
              }}
            >{saving ? 'Saving…' : 'Save Changes'}</button>
          </div>
        </>
      ) : (
        <>
          {/* ── View mode ───────────────────────────────────────────────── */}

          {/* Customer / Job cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
            <div style={{ background: '#111827', border: '1px solid #374151', borderRadius: 12, padding: 20 }}>
              <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
                Bill To
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#f9fafb', marginBottom: 6 }}>{invoice.customer_name}</div>
              {invoice.customer_phone   && <div style={{ fontSize: 13, color: '#9ca3af' }}>{invoice.customer_phone}</div>}
              {invoice.customer_email   && <div style={{ fontSize: 13, color: '#9ca3af' }}>{invoice.customer_email}</div>}
              {invoice.customer_address && <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 4 }}>{invoice.customer_address}</div>}
            </div>
            <div style={{ background: '#111827', border: '1px solid #374151', borderRadius: 12, padding: 20 }}>
              <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
                Project
              </div>
              {invoice.property_address && (
                <div style={{ fontSize: 13, color: '#d1d5db', marginBottom: 4 }}>
                  <span style={{ color: '#6b7280' }}>Property: </span>{invoice.property_address}
                </div>
              )}
              {invoice.insurer && (
                <div style={{ fontSize: 13, color: '#d1d5db', marginBottom: 4 }}>
                  <span style={{ color: '#6b7280' }}>Insurer: </span>{invoice.insurer}
                </div>
              )}
              {invoice.claim_no && (
                <div style={{ fontSize: 13, color: '#d1d5db', marginBottom: 4 }}>
                  <span style={{ color: '#6b7280' }}>Claim #: </span>{invoice.claim_no}
                </div>
              )}
              {!invoice.property_address && !invoice.insurer && !invoice.claim_no && (
                <div style={{ fontSize: 13, color: '#374151' }}>No project info</div>
              )}
            </div>
          </div>

          {/* Line items table */}
          <div style={{ background: '#111827', border: '1px solid #374151', borderRadius: 12, overflow: 'hidden', marginBottom: 20 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#1f2937' }}>
                  <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, color: '#6b7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #374151' }}>Description</th>
                  <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: 11, color: '#6b7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #374151', width: 70 }}>Qty</th>
                  <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: 11, color: '#6b7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #374151', width: 70 }}>Unit</th>
                  <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: 11, color: '#6b7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #374151', width: 120 }}>Unit Price</th>
                  <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: 11, color: '#6b7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #374151', width: 120 }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {invoice.line_items.map((li, i) => (
                  <tr key={li.id} style={{ borderTop: i > 0 ? '1px solid #1f2937' : 'none' }}>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: '#e5e7eb' }}>{li.description}</td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: '#9ca3af', textAlign: 'right' }}>
                      {li.qty % 1 === 0 ? li.qty : li.qty.toFixed(2)}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: '#9ca3af', textAlign: 'right' }}>{li.unit ?? '—'}</td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: '#d1d5db', textAlign: 'right' }}>{fmt(li.unit_price)}</td>
                    <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700, color: '#f9fafb', textAlign: 'right' }}>{fmt(li.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: '#1f2937', borderTop: '2px solid #374151' }}>
                  <td colSpan={4} style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: '#9ca3af' }}>
                    Total
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 16, fontWeight: 700, color: '#f9fafb' }}>
                    {fmt(invoice.amount_due)}
                  </td>
                </tr>
                {invoice.amount_paid > 0 && (
                  <>
                    <tr>
                      <td colSpan={4} style={{ padding: '8px 16px', textAlign: 'right', fontSize: 13, color: '#9ca3af' }}>Paid</td>
                      <td style={{ padding: '8px 16px', textAlign: 'right', fontSize: 13, color: '#4ade80', fontWeight: 600 }}>
                        {fmt(invoice.amount_paid)}
                      </td>
                    </tr>
                    <tr>
                      <td colSpan={4} style={{ padding: '8px 16px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: '#9ca3af' }}>Balance Due</td>
                      <td style={{ padding: '8px 16px', textAlign: 'right', fontSize: 15, fontWeight: 700,
                        color: balance > 0 ? '#fb923c' : '#4ade80' }}>
                        {fmt(balance)}
                      </td>
                    </tr>
                  </>
                )}
              </tfoot>
            </table>
          </div>

          {/* Notes / Payment Terms */}
          {(invoice.notes || invoice.payment_terms) && (
            <div style={{ display: 'grid', gridTemplateColumns: invoice.notes && invoice.payment_terms ? '1fr 1fr' : '1fr', gap: 16, marginBottom: 20 }}>
              {invoice.payment_terms && (
                <div style={{ background: '#111827', border: '1px solid #374151', borderRadius: 12, padding: 16 }}>
                  <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Payment Terms</div>
                  <div style={{ fontSize: 13, color: '#d1d5db' }}>{invoice.payment_terms}</div>
                </div>
              )}
              {invoice.notes && (
                <div style={{ background: '#111827', border: '1px solid #374151', borderRadius: 12, padding: 16 }}>
                  <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Notes</div>
                  <div style={{ fontSize: 13, color: '#d1d5db' }}>{invoice.notes}</div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Payments Section (always visible) ─────────────────────────── */}
      <div style={{ background: '#111827', border: '1px solid #374151', borderRadius: 12, padding: 24, marginTop: editing ? 20 : 0 }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 600, color: '#f9fafb' }}>
          Payments
          {invoice.amount_paid > 0 && (
            <span style={{ marginLeft: 10, fontSize: 13, fontWeight: 400, color: '#4ade80' }}>
              {fmt(invoice.amount_paid)} received
            </span>
          )}
        </h3>

        {/* Existing payments */}
        {invoice.payments.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            {invoice.payments.map(p => (
              <div key={p.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 14px', background: '#1f2937', borderRadius: 8, marginBottom: 6,
              }}>
                <div>
                  <span style={{ fontSize: 13, color: '#4ade80', fontWeight: 700, marginRight: 12 }}>{fmt(p.amount)}</span>
                  <span style={{ fontSize: 12, color: '#9ca3af' }}>
                    {p.method}{p.reference_no ? ` #${p.reference_no}` : ''} · {dFmt(p.paid_at)}
                  </span>
                  {p.notes && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{p.notes}</div>}
                </div>
                <button
                  onClick={() => deletePayment(p.id)}
                  style={{ background: 'transparent', color: '#6b7280', border: 'none', cursor: 'pointer', fontSize: 14 }}
                >✕</button>
              </div>
            ))}
          </div>
        )}

        {/* Add payment form */}
        {invoice.status !== 'PAID' && (
          <div style={{ background: '#1f2937', borderRadius: 10, padding: 16 }}>
            <div style={{ fontSize: 12, color: '#9ca3af', fontWeight: 600, marginBottom: 12 }}>Record Payment</div>
            <div style={{ display: 'grid', gridTemplateColumns: '120px 140px 1fr 120px 90px', gap: 10, alignItems: 'flex-end' }}>
              <div>
                <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>Amount</div>
                <input
                  value={payAmt}
                  onChange={e => setPayAmt(e.target.value)}
                  type="number" min="0" step="0.01" placeholder="0.00"
                  style={{
                    width: '100%', background: '#111827', border: '1px solid #374151',
                    borderRadius: 7, color: '#f9fafb', padding: '7px 10px', fontSize: 13,
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>Method</div>
                <select
                  value={payMethod}
                  onChange={e => setPayMethod(e.target.value)}
                  style={{
                    width: '100%', background: '#111827', border: '1px solid #374151',
                    borderRadius: 7, color: '#f9fafb', padding: '7px 10px', fontSize: 13,
                  }}
                >
                  {METHODS.map(m => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>Reference / Check #</div>
                <input
                  value={payRef}
                  onChange={e => setPayRef(e.target.value)}
                  placeholder="Optional"
                  style={{
                    width: '100%', background: '#111827', border: '1px solid #374151',
                    borderRadius: 7, color: '#f9fafb', padding: '7px 10px', fontSize: 13,
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>Date</div>
                <input
                  type="date"
                  value={payDate}
                  onChange={e => setPayDate(e.target.value)}
                  style={{
                    width: '100%', background: '#111827', border: '1px solid #374151',
                    borderRadius: 7, color: '#f9fafb', padding: '7px 10px', fontSize: 13,
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <button
                onClick={recordPayment}
                disabled={addingPay}
                style={{
                  background: addingPay ? '#374151' : '#16a34a', color: '#fff',
                  border: 'none', borderRadius: 7, padding: '7px 14px',
                  fontWeight: 700, fontSize: 13, cursor: addingPay ? 'not-allowed' : 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >{addingPay ? 'Saving…' : 'Record'}</button>
            </div>
            {payError && <div style={{ marginTop: 8, color: '#fca5a5', fontSize: 13 }}>{payError}</div>}
          </div>
        )}

        {invoice.status === 'PAID' && (
          <div style={{ background: '#052e16', borderRadius: 8, padding: '12px 16px', color: '#4ade80', fontSize: 14, fontWeight: 600 }}>
            ✓ Paid in full — {fmt(invoice.amount_paid)} received
          </div>
        )}
      </div>

    </div>
  );
}
