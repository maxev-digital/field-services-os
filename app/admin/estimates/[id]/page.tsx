'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Phone, Mail, MapPin, Download,
  Plus, ChevronDown, ChevronRight, Edit2, Briefcase,
  Trash2, PenLine, CreditCard, X, FileSignature, FileText, BookOpen, Send, Eye, Check,
} from 'lucide-react';

type EstimateStatus = 'DRAFT' | 'SENT' | 'APPROVED' | 'DECLINED' | 'INVOICED' | 'PAID';

interface LineItem {
  id: string; label: string; category: string; unit: string;
  qty: number; xactimate_per_unit: number; our_per_unit: number;
  ins_amt: number; our_amt: number; delta: number;
  line_item_id: string;
}

interface ChangeOrderItem {
  line_item_id: string; label: string; unit: string;
  qty_before: number; qty_after: number; our_per_unit: number;
  our_amt_before: number; our_amt_after: number;
}

interface ChangeOrder {
  id: string; note: string | null; created_at: string;
  new_our_total: number; new_ins_total: number;
  items: ChangeOrderItem[];
}

interface Estimate {
  id: string; address: string; insurer: string | null; claim_no: string | null;
  adj_date: string | null; insurance_total: number; our_total: number;
  savings: number; savings_pct: number; status: EstimateStatus;
  created_at: string; sent_at: string | null; approved_at: string | null;
  job_id: string | null;
  customer: { id: string; name: string; phone: string; email: string | null; address: string | null };
  line_items: LineItem[];
  change_orders: ChangeOrder[];
  invoice: { id: string; invoice_no: string; amount_due: number; amount_paid: number; status: string; stripe_checkout_url?: string | null } | null;
}

interface ScheduleItem {
  id?: string; label: string; amount_type: 'FIXED' | 'PERCENT';
  amount_value: number; due_trigger: string;
}

interface Signature {
  id: string; signer_name: string; signature_data: string; signed_at: string;
}

interface Payment {
  id: string; amount: number; method: string;
  reference_no: string | null; notes: string | null; paid_at: string;
}

const STATUS_FLOW: EstimateStatus[] = ['DRAFT', 'SENT', 'APPROVED', 'DECLINED', 'INVOICED', 'PAID'];
const STATUS_STYLES: Record<EstimateStatus, string> = {
  DRAFT: 'bg-gray-700 text-gray-200', SENT: 'bg-blue-800 text-blue-200',
  APPROVED: 'bg-green-800 text-green-200', DECLINED: 'bg-red-900 text-red-300',
  INVOICED: 'bg-yellow-900 text-yellow-200', PAID: 'bg-emerald-900 text-emerald-200',
};

const PAYMENT_TEMPLATES = {
  insurance: {
    label: 'Insurance Job',
    items: [
      { label: 'Deductible',   amount_type: 'FIXED' as const, amount_value: 0, due_trigger: 'Due at signing' },
      { label: 'ACV Check',    amount_type: 'FIXED' as const, amount_value: 0, due_trigger: 'Upon receipt of ACV check' },
      { label: 'Depreciation', amount_type: 'FIXED' as const, amount_value: 0, due_trigger: 'Upon receipt of depreciation check' },
    ],
  },
  cash_small: {
    label: 'Cash – Small Job',
    items: [
      { label: '50% Deposit', amount_type: 'PERCENT' as const, amount_value: 50,    due_trigger: 'Due at signing' },
      { label: 'Balance',     amount_type: 'PERCENT' as const, amount_value: 50,    due_trigger: 'Due upon completion' },
    ],
  },
  cash_large: {
    label: 'Cash – Large Job',
    items: [
      { label: '1/3 Deposit',         amount_type: 'PERCENT' as const, amount_value: 33.33, due_trigger: 'Due at signing' },
      { label: '1/3 Upon Delivery',   amount_type: 'PERCENT' as const, amount_value: 33.33, due_trigger: 'Due upon material delivery' },
      { label: '1/3 Final Balance',   amount_type: 'PERCENT' as const, amount_value: 33.34, due_trigger: 'Due upon completion' },
    ],
  },
};

function fmt(n: number) { return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function fmtDate(d: string) { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
function fmtDateShort(d: string) { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }

function groupByCategory(items: LineItem[]) {
  const map = new Map<string, LineItem[]>();
  for (const item of items) {
    if (!map.has(item.category)) map.set(item.category, []);
    map.get(item.category)!.push(item);
  }
  return map;
}

// ─── Change Order Modal ───────────────────────────────────────────────────────
function ChangeOrderModal({ estimate, onClose, onSaved }: {
  estimate: Estimate; onClose: () => void; onSaved: () => void;
}) {
  const [note, setNote]     = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');
  const [overrides, setOverrides] = useState<Record<string, string>>({});

  const changedItems = estimate.line_items
    .filter(li => overrides[li.line_item_id] !== undefined && overrides[li.line_item_id] !== String(li.qty))
    .map(li => ({
      line_item_id: li.line_item_id,
      label:        li.label,
      unit:         li.unit,
      qty_before:   li.qty,
      qty_after:    parseFloat(overrides[li.line_item_id]) || 0,
      our_per_unit: li.our_per_unit,
    }));

  const save = async () => {
    if (!changedItems.length) { setError('No changes made.'); return; }
    setSaving(true);
    const res = await fetch(`/api/admin/estimates/${estimate.id}/change-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note, items: changedItems }),
    });
    setSaving(false);
    if (res.ok) { onSaved(); onClose(); }
    else { const d = await res.json(); setError(d.error || 'Failed to save'); }
  };

  const grouped = groupByCategory(estimate.line_items);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-gray-800 border border-gray-700 rounded-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-gray-700 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">Change Order</h2>
            <p className="text-gray-400 text-sm">{estimate.address}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">×</button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Reason / Note <span className="text-gray-500">(optional)</span></label>
            <input
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="e.g. Re-measured — added 3 squares, removed chimney flashing"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 text-sm focus:outline-none focus:border-red-500"
            />
          </div>
          {Array.from(grouped.entries()).map(([cat, items]) => (
            <div key={cat}>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">{cat}</p>
              <div className="space-y-1">
                {items.map(li => {
                  const val = overrides[li.line_item_id] ?? String(li.qty);
                  const changed = val !== String(li.qty);
                  return (
                    <div key={li.id} className={`flex items-center gap-3 px-3 py-2 rounded-lg ${changed ? 'bg-yellow-900/30 border border-yellow-700/50' : 'bg-gray-700/40'}`}>
                      <span className="flex-1 text-sm text-gray-300 truncate">{li.label}</span>
                      <span className="text-xs text-gray-500 w-8">{li.unit}</span>
                      <span className="text-xs text-gray-500 w-20 text-right">was: {li.qty}</span>
                      <input
                        type="number" min="0" step="0.25" value={val}
                        onChange={e => setOverrides(prev => ({ ...prev, [li.line_item_id]: e.target.value }))}
                        className="w-24 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm text-white text-right focus:outline-none focus:border-red-500"
                      />
                      <span className="text-xs text-gray-400 w-24 text-right">{fmt(li.our_per_unit)}/{li.unit}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {changedItems.length > 0 && (
            <div className="bg-yellow-900/20 border border-yellow-700/40 rounded-lg p-4">
              <p className="text-sm font-semibold text-yellow-300 mb-2">{changedItems.length} change{changedItems.length > 1 ? 's' : ''} pending</p>
              {changedItems.map(c => (
                <div key={c.line_item_id} className="flex justify-between text-xs text-gray-400 mb-1">
                  <span>{c.label}</span>
                  <span>{c.qty_before} → {c.qty_after} {c.unit}
                    {' '}({c.qty_after > c.qty_before ? '+' : ''}{fmt((c.qty_after - c.qty_before) * c.our_per_unit)})</span>
                </div>
              ))}
            </div>
          )}
          {error && <p className="text-red-400 text-sm">{error}</p>}
        </div>
        <div className="px-6 py-4 border-t border-gray-700 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">Cancel</button>
          <button
            onClick={save}
            disabled={saving || changedItems.length === 0}
            className="px-5 py-2 bg-red-700 hover:bg-red-600 disabled:opacity-40 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            {saving ? 'Saving...' : `Save Change Order (${changedItems.length} change${changedItems.length !== 1 ? 's' : ''})`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Payment Schedule Section ─────────────────────────────────────────────────
function PaymentScheduleSection({ estimateId, contractTotal }: {
  estimateId: string; contractTotal: number;
}) {
  const [items, setItems]   = useState<ScheduleItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/admin/estimates/${estimateId}/payment-schedule`)
      .then(r => r.json())
      .then(d => { setItems(d.items || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [estimateId]);

  const applyTemplate = (key: keyof typeof PAYMENT_TEMPLATES) => {
    setItems(PAYMENT_TEMPLATES[key].items.map(t => ({ ...t })));
    setSaved(false);
  };

  const addRow = () => {
    setItems(prev => [...prev, { label: '', amount_type: 'FIXED', amount_value: 0, due_trigger: '' }]);
    setSaved(false);
  };

  const updateRow = (i: number, field: keyof ScheduleItem, value: string | number) => {
    setItems(prev => prev.map((row, idx) => idx === i ? { ...row, [field]: value } : row));
    setSaved(false);
  };

  const removeRow = (i: number) => {
    setItems(prev => prev.filter((_, idx) => idx !== i));
    setSaved(false);
  };

  const save = async () => {
    setSaving(true);
    const res = await fetch(`/api/admin/estimates/${estimateId}/payment-schedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    });
    setSaving(false);
    if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 3000); }
  };

  const resolveAmount = (item: ScheduleItem) =>
    item.amount_type === 'PERCENT' ? (item.amount_value / 100) * contractTotal : item.amount_value;

  const scheduleTotal = items.reduce((s, it) => s + resolveAmount(it), 0);

  if (loading) return <div className="h-24 bg-gray-800 rounded-xl animate-pulse" />;

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white">Payment Schedule</h2>
        <div className="flex gap-2 items-center">
          {/* Template buttons */}
          {(Object.entries(PAYMENT_TEMPLATES) as [keyof typeof PAYMENT_TEMPLATES, { label: string }][]).map(([key, t]) => (
            <button
              key={key}
              onClick={() => applyTemplate(key)}
              className="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 space-y-2">
        {items.length === 0 && (
          <p className="text-xs text-gray-500 text-center py-4">No payment schedule set. Choose a template or add rows.</p>
        )}
        {items.map((item, i) => (
          <div key={i} className="flex gap-2 items-center">
            <input
              value={item.label}
              onChange={e => updateRow(i, 'label', e.target.value)}
              placeholder="Label (e.g. Deductible)"
              className="flex-1 px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:border-red-500"
            />
            <select
              value={item.amount_type}
              onChange={e => updateRow(i, 'amount_type', e.target.value)}
              className="px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-sm text-white focus:outline-none"
            >
              <option value="FIXED">$ Fixed</option>
              <option value="PERCENT">% of Total</option>
            </select>
            <input
              type="number"
              min="0"
              step="0.01"
              value={item.amount_value}
              onChange={e => updateRow(i, 'amount_value', parseFloat(e.target.value) || 0)}
              className="w-24 px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-sm text-white text-right focus:outline-none focus:border-red-500"
            />
            <input
              value={item.due_trigger}
              onChange={e => updateRow(i, 'due_trigger', e.target.value)}
              placeholder="When due"
              className="flex-1 px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:border-red-500"
            />
            <span className="text-xs text-gray-400 w-20 text-right font-mono">{fmt(resolveAmount(item))}</span>
            <button onClick={() => removeRow(i)} className="text-gray-600 hover:text-red-400 transition-colors">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}

        {/* Total row */}
        {items.length > 0 && (
          <div className="flex justify-end pt-1 border-t border-gray-700">
            <span className={`text-sm font-semibold font-mono ${Math.abs(scheduleTotal - contractTotal) < 0.02 ? 'text-green-400' : 'text-yellow-400'}`}>
              Schedule Total: {fmt(scheduleTotal)}
              {Math.abs(scheduleTotal - contractTotal) > 0.02 && (
                <span className="text-xs text-yellow-500 ml-2">
                  (contract: {fmt(contractTotal)}, diff: {fmt(scheduleTotal - contractTotal)})
                </span>
              )}
            </span>
          </div>
        )}

        <div className="flex justify-between pt-2">
          <button
            onClick={addRow}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Add Row
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="px-4 py-1.5 bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            {saving ? 'Saving...' : saved ? '✓ Saved' : 'Save Schedule'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Signature Pad Section ────────────────────────────────────────────────────
function SignaturePadSection({ estimateId }: { estimateId: string }) {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const isDrawing   = useRef(false);
  const lastPos     = useRef<{ x: number; y: number } | null>(null);

  const [signerName, setSignerName]       = useState('');
  const [hasStrokes, setHasStrokes]       = useState(false);
  const [saving, setSaving]               = useState(false);
  const [removing, setRemoving]           = useState(false);
  const [existing, setExisting]           = useState<Signature | null>(null);
  const [loading, setLoading]             = useState(true);
  const [showPad, setShowPad]             = useState(false);

  const loadSig = async () => {
    const res = await fetch(`/api/admin/estimates/${estimateId}/sign`);
    const d   = await res.json();
    setExisting(d.signature || null);
    setLoading(false);
  };

  useEffect(() => { loadSig(); }, [estimateId]);

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current!;
    const rect   = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    if ('touches' in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top)  * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top)  * scaleY,
    };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    isDrawing.current = true;
    lastPos.current   = getPos(e);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!isDrawing.current || !lastPos.current) return;
    const canvas = canvasRef.current!;
    const ctx    = canvas.getContext('2d')!;
    const pos    = getPos(e);
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth   = 2.5;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    ctx.stroke();
    lastPos.current = pos;
    setHasStrokes(true);
  };

  const stopDraw = () => { isDrawing.current = false; lastPos.current = null; };

  const clearCanvas = () => {
    const canvas = canvasRef.current!;
    const ctx    = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasStrokes(false);
  };

  const saveSig = async () => {
    if (!signerName.trim()) { alert('Enter signer name first.'); return; }
    if (!hasStrokes)        { alert('Please sign before saving.'); return; }
    const canvas        = canvasRef.current!;
    const signature_data = canvas.toDataURL('image/png');
    setSaving(true);
    const res = await fetch(`/api/admin/estimates/${estimateId}/sign`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ signer_name: signerName.trim(), signature_data }),
    });
    setSaving(false);
    if (res.ok) { setShowPad(false); clearCanvas(); setSignerName(''); await loadSig(); }
  };

  const removeSig = async () => {
    if (!confirm('Remove this signature?')) return;
    setRemoving(true);
    await fetch(`/api/admin/estimates/${estimateId}/sign`, { method: 'DELETE' });
    setRemoving(false);
    setExisting(null);
  };

  if (loading) return <div className="h-24 bg-gray-800 rounded-xl animate-pulse" />;

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2">
          <FileSignature className="w-4 h-4 text-gray-400" /> Contract Signature
        </h2>
        {!existing && !showPad && (
          <button
            onClick={() => setShowPad(true)}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-red-700 hover:bg-red-600 text-white rounded-lg transition-colors"
          >
            <PenLine className="w-3.5 h-3.5" /> Sign Now
          </button>
        )}
      </div>

      <div className="p-4">
        {/* Existing signature */}
        {existing && !showPad && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-white">{existing.signer_name}</p>
                <p className="text-xs text-gray-400">Signed {fmtDate(existing.signed_at)}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowPad(true)}
                  className="text-xs px-3 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
                >
                  Re-sign
                </button>
                <button
                  onClick={removeSig}
                  disabled={removing}
                  className="text-xs px-3 py-1 bg-red-900 hover:bg-red-800 text-red-300 rounded transition-colors"
                >
                  {removing ? '...' : 'Remove'}
                </button>
              </div>
            </div>
            <div className="bg-gray-900 rounded-lg p-2 border border-gray-700">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={existing.signature_data} alt="Signature" className="max-h-24 w-auto mx-auto" />
            </div>
            <p className="text-xs text-gray-500 text-center">
              Option B: <a href={`/api/admin/estimates/${estimateId}/contract`} target="_blank" rel="noopener noreferrer" className="text-red-400 hover:text-red-300">Download contract PDF</a> to print for manual signing
            </p>
          </div>
        )}

        {/* Signature pad */}
        {showPad && (
          <div className="space-y-3">
            <input
              value={signerName}
              onChange={e => setSignerName(e.target.value)}
              placeholder="Signer full name"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 text-sm focus:outline-none focus:border-red-500"
            />
            <div className="relative bg-gray-900 rounded-lg border border-gray-600 overflow-hidden touch-none">
              {!hasStrokes && (
                <p className="absolute inset-0 flex items-center justify-center text-gray-600 text-sm pointer-events-none select-none">
                  Sign here
                </p>
              )}
              <canvas
                ref={canvasRef}
                width={700}
                height={200}
                className="w-full cursor-crosshair"
                style={{ touchAction: 'none' }}
                onMouseDown={startDraw}
                onMouseMove={draw}
                onMouseUp={stopDraw}
                onMouseLeave={stopDraw}
                onTouchStart={startDraw}
                onTouchMove={draw}
                onTouchEnd={stopDraw}
              />
            </div>
            <div className="flex justify-between">
              <div className="flex gap-2">
                <button
                  onClick={clearCanvas}
                  className="text-xs px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
                >
                  Clear
                </button>
                <button
                  onClick={() => { setShowPad(false); clearCanvas(); setSignerName(''); }}
                  className="text-xs px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
                >
                  Cancel
                </button>
              </div>
              <button
                onClick={saveSig}
                disabled={saving || !hasStrokes || !signerName.trim()}
                className="px-4 py-1.5 bg-red-700 hover:bg-red-600 disabled:opacity-40 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                {saving ? 'Saving...' : 'Save Signature'}
              </button>
            </div>
            <p className="text-xs text-gray-500 text-center">
              Option B: <a href={`/api/admin/estimates/${estimateId}/contract`} target="_blank" rel="noopener noreferrer" className="text-red-400 hover:text-red-300">Download contract PDF</a> to print for manual wet signature
            </p>
          </div>
        )}

        {/* Neither — prompt */}
        {!existing && !showPad && (
          <p className="text-xs text-gray-500 text-center py-2">
            No signature on file. Use tablet to sign directly or print contract for manual signing.
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Record Payment Modal ─────────────────────────────────────────────────────
function RecordPaymentModal({ invoiceId, amountDue, amountPaid, onClose, onSaved }: {
  invoiceId: string; amountDue: number; amountPaid: number;
  onClose: () => void; onSaved: () => void;
}) {
  const balance = amountDue - amountPaid;
  const [amount, setAmount]       = useState(balance > 0 ? balance.toFixed(2) : '');
  const [method, setMethod]       = useState('CHECK');
  const [reference_no, setRef]    = useState('');
  const [notes, setNotes]         = useState('');
  const [paid_at, setPaidAt]      = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');
  const [deleting, setDeleting]   = useState(false);

  const save = async () => {
    if (!amount || parseFloat(amount) <= 0) { setError('Enter a valid amount.'); return; }
    setSaving(true);
    const res = await fetch(`/api/admin/invoices/${invoiceId}/payments`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ amount, method, reference_no, notes, paid_at }),
    });
    setSaving(false);
    if (res.ok) { onSaved(); onClose(); }
    else { const d = await res.json(); setError(d.error || 'Failed to save'); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-gray-800 border border-gray-700 rounded-xl w-full max-w-md">
        <div className="px-5 py-4 border-b border-gray-700 flex items-center justify-between">
          <h2 className="text-base font-bold text-white">Record Payment</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex gap-3 text-xs text-gray-400 bg-gray-700/50 rounded-lg px-3 py-2">
            <span>Due: <span className="text-white font-mono">{fmt(amountDue)}</span></span>
            <span>Paid: <span className="text-green-400 font-mono">{fmt(amountPaid)}</span></span>
            <span>Balance: <span className={`font-mono ${balance > 0 ? 'text-red-400' : 'text-green-400'}`}>{fmt(balance)}</span></span>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Amount *</label>
            <input
              type="number" min="0.01" step="0.01" value={amount}
              onChange={e => setAmount(e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-red-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Method</label>
              <select
                value={method} onChange={e => setMethod(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none"
              >
                {['CHECK', 'CASH', 'CARD', 'WIRE', 'ZELLE', 'VENMO', 'OTHER'].map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Date</label>
              <input
                type="date" value={paid_at} onChange={e => setPaidAt(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Reference # <span className="text-gray-600">(check #, transaction ID, etc.)</span></label>
            <input
              value={reference_no} onChange={e => setRef(e.target.value)}
              placeholder="Optional"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-red-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Notes</label>
            <input
              value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Optional"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-red-500"
            />
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
        </div>
        <div className="px-5 py-4 border-t border-gray-700 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">Cancel</button>
          <button
            onClick={save}
            disabled={saving}
            className="px-5 py-2 bg-red-700 hover:bg-red-600 disabled:opacity-40 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            {saving ? 'Saving...' : 'Record Payment'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Payments Section (sidebar) ───────────────────────────────────────────────
function PaymentsSection({ invoice, onInvoiceRefresh }: {
  invoice: { id: string; invoice_no: string; amount_due: number; amount_paid: number; status: string; stripe_checkout_url?: string | null };
  onInvoiceRefresh: () => void;
}) {
  const [payments, setPayments]     = useState<Payment[]>([]);
  const [loading, setLoading]       = useState(true);
  const [showModal, setShowModal]   = useState(false);
  const [sendingLink, setSendingLink] = useState(false);
  const [linkCopied, setLinkCopied]   = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(invoice.stripe_checkout_url ?? null);

  const load = async () => {
    const res = await fetch(`/api/admin/invoices/${invoice.id}/payments`);
    const d   = await res.json();
    setPayments(d.payments || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [invoice.id]);

  const balance = invoice.amount_due - invoice.amount_paid;

  if (loading) return <div className="h-20 bg-gray-700/40 rounded-lg animate-pulse" />;

  return (
    <div className="space-y-2">
      {showModal && (
        <RecordPaymentModal
          invoiceId={invoice.id}
          amountDue={invoice.amount_due}
          amountPaid={invoice.amount_paid}
          onClose={() => setShowModal(false)}
          onSaved={() => { load(); onInvoiceRefresh(); }}
        />
      )}

      {/* Payment list */}
      {payments.length > 0 && (
        <div className="space-y-1">
          {payments.map(p => (
            <div key={p.id} className="flex items-center justify-between bg-gray-700/40 rounded-lg px-3 py-2">
              <div>
                <div className="text-xs text-white font-medium">{fmt(p.amount)}</div>
                <div className="text-xs text-gray-400">{p.method} · {fmtDateShort(p.paid_at)}</div>
                {p.reference_no && <div className="text-xs text-gray-500">Ref: {p.reference_no}</div>}
              </div>
              <a
                href={`/api/admin/invoices/${invoice.id}/payments/${p.id}/receipt`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1"
              >
                <Download className="w-3 h-3" /> Receipt
              </a>
            </div>
          ))}
        </div>
      )}

      {/* Balance line */}
      <div className="flex justify-between text-xs px-1">
        <span className="text-gray-400">Balance remaining</span>
        <span className={`font-mono font-semibold ${balance <= 0 ? 'text-green-400' : 'text-yellow-400'}`}>
          {balance <= 0 ? 'PAID IN FULL' : fmt(balance)}
        </span>
      </div>

      {/* Stripe payment link */}
      {balance > 0 && (
        <button
          onClick={async () => {
            setSendingLink(true);
            try {
              const res = await fetch(`/api/admin/invoices/${invoice.id}/payment-link`, { method: 'POST' });
              const d = await res.json();
              if (d.url) {
                setCheckoutUrl(d.url);
                await navigator.clipboard.writeText(d.url);
                setLinkCopied(true);
                setTimeout(() => setLinkCopied(false), 3000);
              }
            } finally {
              setSendingLink(false);
            }
          }}
          disabled={sendingLink}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-700 hover:bg-blue-600 disabled:bg-gray-700 text-white text-sm font-semibold rounded-lg transition-colors"
        >
          <CreditCard className="w-4 h-4" />
          {sendingLink ? 'Creating link...' : linkCopied ? '✓ Link copied!' : 'Send Payment Link (ACH / Card)'}
        </button>
      )}
      {checkoutUrl && balance > 0 && (
        <div className="bg-gray-700/40 rounded-lg p-2">
          <div className="text-xs text-gray-400 mb-1">Payment link</div>
          <div className="flex items-center gap-2">
            <input readOnly value={checkoutUrl} className="flex-1 bg-transparent text-xs text-blue-300 truncate outline-none" />
            <button
              onClick={() => { navigator.clipboard.writeText(checkoutUrl); setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000); }}
              className="text-xs text-gray-400 hover:text-white shrink-0"
            >{linkCopied ? '✓' : 'Copy'}</button>
          </div>
        </div>
      )}

      {/* Record payment button */}
      {balance > 0 && (
        <button
          onClick={() => setShowModal(true)}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-700 hover:bg-green-600 text-white text-sm font-semibold rounded-lg transition-colors"
        >
          <CreditCard className="w-4 h-4" /> Record Payment Manually
        </button>
      )}
    </div>
  );
}

// ─── Material Order Panel (imported from separate file) ───────────────────────
import MaterialOrderPanel from './MaterialOrderPanel';
import MeasurementPanel from './MeasurementPanel';
import PnLPanel from './PnLPanel';

// ─── Manufacturer Docs Types ──────────────────────────────────────────────────
interface MfrDoc {
  id: string;
  manufacturer: string;
  name: string;
  filename: string;
  description: string | null;
  size_bytes: number;
  active: boolean;
}

const MFR_BADGE_COLORS: Record<string, string> = {
  GAF: 'bg-green-900 text-green-300',
  'Owens Corning': 'bg-red-900 text-red-300',
  OC: 'bg-red-900 text-red-300',
  CertainTeed: 'bg-blue-900 text-blue-300',
  Atlas: 'bg-orange-900 text-orange-300',
  IKO: 'bg-purple-900 text-purple-300',
};
const mfrBadge = (m: string) => MFR_BADGE_COLORS[m] || 'bg-gray-700 text-gray-300';

// ─── Send Docs Panel ──────────────────────────────────────────────────────────
function SendDocsPanel({
  customerEmail,
  customerName,
}: {
  estimateId: string;
  customerEmail?: string | null;
  customerName: string;
}) {
  const [docs, setDocs] = useState<MfrDoc[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch('/api/admin/manufacturer-docs')
      .then(r => r.json())
      .then(d => {
        setDocs((d.docs || []).filter((doc: MfrDoc) => doc.active));
        setLoaded(true);
      });
  }, []);

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setSent(false);
  };

  const send = async () => {
    if (!customerEmail || selected.size === 0) return;
    setSending(true);
    const firstId = Array.from(selected)[0];
    await fetch(`/api/admin/manufacturer-docs/${firstId}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerEmail,
        customerName,
        docIds: Array.from(selected),
      }),
    });
    setSent(true);
    setSending(false);
  };

  if (!loaded) return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
      <div className="h-4 bg-gray-700 rounded animate-pulse w-1/2 mb-2" />
      <div className="h-3 bg-gray-700 rounded animate-pulse w-3/4" />
    </div>
  );

  if (docs.length === 0) return null;

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <BookOpen className="w-4 h-4 text-red-400" />
        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Product Docs</h3>
      </div>

      {!customerEmail && (
        <p className="text-xs text-yellow-400 mb-3">No customer email — add one to send docs.</p>
      )}

      <div className="space-y-2 mb-3">
        {docs.map(doc => (
          <label key={doc.id} className="flex items-start gap-2 cursor-pointer group">
            <input
              type="checkbox"
              checked={selected.has(doc.id)}
              onChange={() => toggle(doc.id)}
              className="mt-0.5 w-3.5 h-3.5 rounded accent-red-600 flex-shrink-0"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className={`px-1.5 py-0.5 rounded text-xs font-bold uppercase ${mfrBadge(doc.manufacturer)}`}>
                  {doc.manufacturer}
                </span>
                <span className="text-xs text-gray-300 truncate">{doc.name}</span>
              </div>
            </div>
            <a
              href={`/docs/manufacturers/${doc.filename}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="text-gray-500 hover:text-blue-400 flex-shrink-0"
            >
              <Eye className="w-3.5 h-3.5" />
            </a>
          </label>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={send}
          disabled={sending || selected.size === 0 || !customerEmail}
          className="flex items-center gap-1.5 w-full justify-center px-3 py-1.5 bg-red-700 hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-lg transition-colors"
        >
          <Send className="w-3.5 h-3.5" />
          {sending ? 'Sending...' : 'Send to Customer'}
        </button>
      </div>
      {sent && (
        <p className="mt-2 text-xs text-green-400 flex items-center gap-1">
          <Check className="w-3.5 h-3.5" /> Sent to {customerEmail}
        </p>
      )}
    </div>
  );
}

function SignaturePad({ onSave, onCancel }: { onSave: (dataUrl: string) => void; onCancel: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const lastPos = useRef({ x: 0, y: 0 })

  const getPos = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect()
    if ('touches' in e) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top }
    }
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top }
  }

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    const canvas = canvasRef.current; if (!canvas) return
    drawing.current = true
    lastPos.current = getPos(e, canvas)
  }
  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    if (!drawing.current) return
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d'); if (!ctx) return
    const pos = getPos(e, canvas)
    ctx.beginPath()
    ctx.moveTo(lastPos.current.x, lastPos.current.y)
    ctx.lineTo(pos.x, pos.y)
    ctx.strokeStyle = '#1e3a5f'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.stroke()
    lastPos.current = pos
  }
  const stopDraw = () => { drawing.current = false }
  const clear = () => {
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d'); if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }
  const save = () => {
    const canvas = canvasRef.current; if (!canvas) return
    onSave(canvas.toDataURL('image/png'))
  }

  return (
    <div className="space-y-2">
      <div className="border-2 border-gray-300 rounded-lg overflow-hidden bg-white" style={{ touchAction: 'none' }}>
        <canvas ref={canvasRef} width={440} height={120}
          className="w-full cursor-crosshair"
          onMouseDown={startDraw} onMouseMove={draw} onMouseUp={stopDraw} onMouseLeave={stopDraw}
          onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={stopDraw}
        />
      </div>
      <div className="flex gap-2">
        <button onClick={save} className="flex-1 bg-blue-800 text-white text-sm rounded-lg px-3 py-2 hover:bg-blue-900">Use This Signature</button>
        <button onClick={clear} className="text-sm border border-gray-300 text-gray-600 rounded-lg px-3 py-2 hover:bg-gray-50">Clear</button>
        <button onClick={onCancel} className="text-sm border border-gray-300 text-gray-600 rounded-lg px-3 py-2 hover:bg-gray-50">Cancel</button>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────────────────────
export default function EstimateDetailPage() {
  const { id }    = useParams<{ id: string }>();
  const router    = useRouter();
  const [estimate, setEstimate]         = useState<Estimate | null>(null);
  const [loading, setLoading]           = useState(true);
  const [showCO, setShowCO]             = useState(false);
  const [updatingStatus, setUpdStatus]  = useState(false);
  const [converting, setConverting]     = useState(false);
  const [generatingInv, setGenInv]      = useState(false);
  const [expandedCOs, setExpandedCOs]   = useState<Record<string, boolean>>({});
  const [deleting, setDeleting]         = useState(false);

  // Send Email modal
  const [estEmailOpen, setEstEmailOpen]       = useState(false);
  const [estEmailSubject, setEstEmailSubject] = useState('');
  const [estEmailBody, setEstEmailBody]       = useState('');
  const [estEmailSending, setEstEmailSending] = useState(false);
  const [estEmailSent, setEstEmailSent]       = useState(false);
  const [estEmailError, setEstEmailError]     = useState('');

  const [packetOpen, setPacketOpen] = useState(false)
  const [packetDocs, setPacketDocs] = useState(['lien-waiver','checklist','guidelines','certificate'])
  const [packetProductDocs, setPacketProductDocs] = useState<string[]>([])
  const [packetMfrDocs, setPacketMfrDocs] = useState<MfrDoc[]>([])
  const [includeEstimatePdf, setIncludeEstimatePdf] = useState(false)
  const [includeInvoicePdf, setIncludeInvoicePdf] = useState(false)
  const [packetDate, setPacketDate] = useState('')
  const [packetNotes, setPacketNotes] = useState('')
  const [packetSig, setPacketSig] = useState('')
  const [packetSending, setPacketSending] = useState(false)
  const [packetSent, setPacketSent] = useState(false)
  const [packetError, setPacketError] = useState('')
  const [sigDrawing, setSigDrawing] = useState(false)
  const [sigSaved, setSigSaved] = useState(false)

  const load = async () => {
    const res = await fetch(`/api/admin/estimates/${id}`);
    const data = await res.json();
    setEstimate(data.estimate);
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  useEffect(() => {
    fetch("/api/admin/settings/signature", { credentials: "include" })
      .then(r => r.json())
      .then(d => { if (d.contractorSig) setPacketSig(d.contractorSig) })
      .catch(() => {})
  }, [])

  const updateStatus = async (status: string) => {
    setUpdStatus(true);
    await fetch(`/api/admin/estimates/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    await load();
    setUpdStatus(false);
  };

  const convertToJob = async () => {
    setConverting(true);
    const res = await fetch(`/api/admin/estimates/${id}/convert-to-job`, { method: 'POST' });
    const data = await res.json();
    setConverting(false);
    if (data.job) router.push(`/admin/jobs/${data.job.id}`);
  };

  const sendPacket = async () => {
    if (packetDocs.length === 0) return
    setPacketSending(true); setPacketError("")
    try {
      const res = await fetch(`/api/admin/estimates/${id}/send-packet`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docs: packetDocs, productDocIds: packetProductDocs, includeEstimatePdf, includeInvoicePdf, completionDate: packetDate, notes: packetNotes, contractorSig: packetSig }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Send failed")
      setPacketSent(true)
      setTimeout(() => { setPacketOpen(false); setPacketSent(false) }, 2000)
    } catch (e: any) { setPacketError(e.message) }
    finally { setPacketSending(false) }
  }

  const deleteEstimate = async () => {
    if (!confirm('Delete this estimate and all associated data? This cannot be undone.')) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/estimates/${id}`, { method: 'DELETE' });
      if (res.ok) { router.push('/admin/estimates'); return; }
      const data = await res.json();
      alert(data.error ?? 'Delete failed');
    } catch {
      alert('Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  const generateInvoice = async () => {
    if (estimate?.invoice) {
      window.open(`/api/admin/invoices/${estimate.invoice.id}/pdf`, '_blank');
      return;
    }
    setGenInv(true);
    const res = await fetch(`/api/admin/estimates/${id}/generate-invoice`, { method: 'POST' });
    const data = await res.json();
    setGenInv(false);
    if (data.invoice) { await load(); window.open(`/api/admin/invoices/${data.invoice.id}/pdf`, '_blank'); }
  };

  if (loading) return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="animate-pulse space-y-4">
        {[...Array(6)].map((_, i) => <div key={i} className="h-16 bg-gray-800 rounded-xl" />)}
      </div>
    </div>
  );

  if (!estimate) return <div className="p-6 text-center text-gray-400">Estimate not found.</div>;

  const grouped = groupByCategory(estimate.line_items);
  // Use latest change order total if available
  const contractTotal = estimate.change_orders.length > 0
    ? estimate.change_orders[0].new_our_total
    : estimate.our_total;

  return (<>
    <div className="p-6 max-w-5xl mx-auto">
      {showCO && (
        <ChangeOrderModal estimate={estimate} onClose={() => setShowCO(false)} onSaved={load} />
      )}

      {/* Back + Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <button onClick={() => router.push('/admin/estimates')} className="flex items-center gap-1.5 text-gray-400 hover:text-white text-sm mb-2 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back to Estimates
          </button>
          <h1 className="text-2xl font-bold text-white">{estimate.address}</h1>
          <p className="text-gray-400 text-sm mt-1">Created {fmtDate(estimate.created_at)}</p>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          <button onClick={() => setShowCO(true)} className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded-lg transition-colors">
            <Edit2 className="w-4 h-4" /> Change Order
          </button>
          {estimate.line_items.length > 0 && (
            <button
              onClick={generateInvoice}
              disabled={generatingInv}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 ${
                estimate.invoice
                  ? 'bg-emerald-800 hover:bg-emerald-700 text-emerald-100'
                  : 'bg-red-700 hover:bg-red-600 text-white'
              }`}
            >
              <Download className="w-4 h-4" />
              {generatingInv ? 'Generating...' : estimate.invoice ? `Invoice ${estimate.invoice.invoice_no}` : 'Generate Invoice'}
            </button>
          )}
          {!estimate.job_id && estimate.status === 'APPROVED' && (
            <button onClick={convertToJob} disabled={converting} className="flex items-center gap-2 px-4 py-2 bg-orange-700 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors">
              <Briefcase className="w-4 h-4" /> {converting ? 'Converting...' : 'Convert to Job'}
            </button>
          )}
          {estimate.job_id && (
            <a href={`/admin/jobs/${estimate.job_id}`} className="flex items-center gap-2 px-4 py-2 bg-orange-900 hover:bg-orange-800 text-orange-200 text-sm font-medium rounded-lg transition-colors">
              <Briefcase className="w-4 h-4" /> View Job
            </a>
          )}
          <button
            onClick={deleteEstimate}
            disabled={deleting}
            className="flex items-center gap-2 px-3 py-2 bg-red-950 hover:bg-red-900 text-red-400 text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left — main content */}
        <div className="lg:col-span-2 space-y-6">

          {/* Totals */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { label: 'Insurance Allowance', value: fmt(estimate.insurance_total), color: 'text-gray-300' },
              { label: 'Roof Works Price',    value: fmt(estimate.our_total),        color: 'text-white font-bold' },
              { label: `Savings (${estimate.savings_pct.toFixed(1)}%)`, value: fmt(estimate.savings), color: 'text-green-400 font-bold' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-gray-800 border border-gray-700 rounded-xl p-4 text-center">
                <div className="text-xs text-gray-400 mb-1">{label}</div>
                <div className={`text-lg ${color}`}>{value}</div>
              </div>
            ))}
          </div>

          {/* Line Items */}
          <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-700">
              <h2 className="text-sm font-semibold text-white">Line Items</h2>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="px-4 py-2 text-left text-gray-400 font-medium">Item</th>
                  <th className="px-4 py-2 text-right text-gray-400 font-medium">Qty</th>
                  <th className="px-4 py-2 text-right text-gray-400 font-medium">Unit</th>
                  <th className="px-4 py-2 text-right text-gray-400 font-medium">Insurance</th>
                  <th className="px-4 py-2 text-right text-gray-400 font-medium">Ours</th>
                  <th className="px-4 py-2 text-right text-gray-400 font-medium">Delta</th>
                </tr>
              </thead>
              <tbody>
                {Array.from(grouped.entries()).map(([cat, items]) => (
                  <>
                    <tr key={`cat-${cat}`} className="bg-gray-700/30">
                      <td colSpan={6} className="px-4 py-1.5 text-xs font-bold text-gray-400 uppercase tracking-wider">{cat}</td>
                    </tr>
                    {items.map(li => (
                      <tr key={li.id} className="border-b border-gray-700/40 hover:bg-gray-700/20">
                        <td className="px-4 py-2 text-gray-300">{li.label}</td>
                        <td className="px-4 py-2 text-right text-gray-300">{li.qty}</td>
                        <td className="px-4 py-2 text-right text-gray-400">{li.unit}</td>
                        <td className="px-4 py-2 text-right text-gray-400 font-mono">{fmt(li.ins_amt)}</td>
                        <td className="px-4 py-2 text-right text-white font-mono">{fmt(li.our_amt)}</td>
                        <td className="px-4 py-2 text-right text-green-400 font-mono">{fmt(li.delta)}</td>
                      </tr>
                    ))}
                  </>
                ))}
                <tr className="bg-gray-700/50 font-semibold">
                  <td colSpan={3} className="px-4 py-3 text-gray-300">Total</td>
                  <td className="px-4 py-3 text-right text-gray-300 font-mono">{fmt(estimate.insurance_total)}</td>
                  <td className="px-4 py-3 text-right text-white font-mono">{fmt(estimate.our_total)}</td>
                  <td className="px-4 py-3 text-right text-green-400 font-mono">{fmt(estimate.savings)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Change Orders */}
          {estimate.change_orders.length > 0 && (
            <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-700">
                <h2 className="text-sm font-semibold text-white">Change Orders ({estimate.change_orders.length})</h2>
              </div>
              <div className="divide-y divide-gray-700">
                {estimate.change_orders.map((co, i) => (
                  <div key={co.id} className="px-4 py-3">
                    <div className="flex items-center justify-between cursor-pointer"
                      onClick={() => setExpandedCOs(p => ({ ...p, [co.id]: !p[co.id] }))}>
                      <div>
                        <span className="text-sm text-white font-medium">CO #{estimate.change_orders.length - i}</span>
                        {co.note && <span className="text-gray-400 text-xs ml-2">— {co.note}</span>}
                        <span className="text-gray-500 text-xs ml-2">{fmtDate(co.created_at)}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-white font-mono">{fmt(co.new_our_total)}</span>
                        {expandedCOs[co.id] ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                      </div>
                    </div>
                    {expandedCOs[co.id] && (
                      <div className="mt-3 space-y-1">
                        {co.items.map((item, j) => (
                          <div key={j} className="flex justify-between text-xs text-gray-400 bg-gray-700/40 px-3 py-1.5 rounded">
                            <span>{item.label}</span>
                            <span>{item.qty_before} → {item.qty_after} {item.unit}
                              {' '}<span className={item.qty_after > item.qty_before ? 'text-red-400' : 'text-green-400'}>
                                ({item.qty_after > item.qty_before ? '+' : ''}{fmt(item.our_amt_after - item.our_amt_before)})
                              </span>
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* EagleView Measurement */}
          <MeasurementPanel estimateId={id} />

          {/* Material Order */}
          <MaterialOrderPanel estimateId={id} lineItems={estimate.line_items} />

          {/* Job P&L */}
          <PnLPanel
            estimateId={id}
            revenue={estimate.invoice?.amount_due ?? contractTotal}
            collected={estimate.invoice?.amount_paid ?? 0}
          />

          {/* Payment Schedule */}
          <PaymentScheduleSection estimateId={id} contractTotal={contractTotal} />

          {/* Signature */}
          <SignaturePadSection estimateId={id} />

        </div>

        {/* Right — sidebar */}
        <div className="space-y-4">

          {/* Status */}
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Status</h3>
            <div className={`inline-block px-3 py-1 rounded text-sm font-semibold mb-3 ${STATUS_STYLES[estimate.status]}`}>
              {estimate.status}
            </div>
            <div className="space-y-1">
              {STATUS_FLOW.filter(s => s !== estimate.status).map(s => (
                <button
                  key={s}
                  disabled={updatingStatus}
                  onClick={() => updateStatus(s)}
                  className="w-full text-left px-3 py-1.5 text-xs text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
                >
                  → Mark as {s}
                </button>
              ))}
            </div>
          </div>

          {/* Customer */}
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Customer</h3>
            <div className="space-y-2">
              <div className="text-sm font-medium text-white">{estimate.customer.name}</div>
              <a href={`tel:${estimate.customer.phone}`} className="flex items-center gap-2 text-sm text-gray-400 hover:text-white">
                <Phone className="w-3.5 h-3.5" /> {estimate.customer.phone}
              </a>
              {estimate.customer.email && (
                <div className="flex items-center gap-2">
                  <a href={`mailto:${estimate.customer.email}`} className="flex items-center gap-2 text-sm text-gray-400 hover:text-white flex-1">
                    <Mail className="w-3.5 h-3.5" /> {estimate.customer.email}
                  </a>
                  <button
                    onClick={() => { setEstEmailOpen(true); setEstEmailSubject(`Regarding your roofing project at ${estimate.address}`); }}
                    className="px-2 py-0.5 bg-blue-800 hover:bg-blue-700 text-blue-300 text-xs font-semibold rounded transition-colors"
                  >
                    Email
                  </button>
                </div>
              )}
              <a href={`/admin/customers/${estimate.customer.id}`} className="text-xs text-red-400 hover:text-red-300">
                View full customer record →
              </a>
            </div>
          </div>

          {/* Project Info */}
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Project Info</h3>
            <div className="space-y-2 text-sm">
              <div className="flex gap-2"><MapPin className="w-3.5 h-3.5 text-gray-500 mt-0.5 flex-shrink-0" /><span className="text-gray-300">{estimate.address}</span></div>
              {estimate.insurer   && <div className="text-gray-300"><span className="text-gray-500">Insurer: </span>{estimate.insurer}</div>}
              {estimate.claim_no  && <div className="text-gray-300"><span className="text-gray-500">Claim #: </span>{estimate.claim_no}</div>}
              {estimate.adj_date  && <div className="text-gray-300"><span className="text-gray-500">Date of Loss: </span>{estimate.adj_date}</div>}
            </div>
          </div>

          {/* Downloads */}
          <a
            href={`/api/admin/estimates/${estimate.id}/pdf`}
            target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-gray-700 hover:bg-gray-600 text-white text-sm font-semibold rounded-xl text-center transition-colors"
          >
            <Download className="w-4 h-4" /> Download Estimate PDF
          </a>
          <a
            href={`/api/admin/estimates/${estimate.id}/contract`}
            target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-red-900 hover:bg-red-800 text-white text-sm font-semibold rounded-xl text-center transition-colors"
          >
            <FileSignature className="w-4 h-4" /> Download Contract PDF
          </a>

          {/* Customer Packet Docs */}
          <div className="border border-gray-700 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 bg-gray-800 border-b border-gray-700 flex items-center justify-between">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Customer Packet</p>
              <button
                onClick={() => {
                  setPacketOpen(true); setPacketSent(false); setPacketError("");
                  fetch('/api/admin/manufacturer-docs').then(r => r.json()).then(d => setPacketMfrDocs((d.docs || []).filter((doc: MfrDoc) => doc.active))).catch(() => {});
                }}
                className="text-xs bg-blue-700 text-white px-2.5 py-1 rounded hover:bg-blue-600 flex items-center gap-1"
              >
                <Send size={12} /> Prepare &amp; Send
              </button>
            </div>
            <div className="divide-y divide-gray-700">
              {[
                { key: "lien-waiver",  label: "Lien Waiver",                href: `/api/admin/estimates/${estimate.id}/lien-waiver` },
                { key: "checklist",    label: "Post Construction Checklist", href: `/api/admin/estimates/${estimate.id}/post-construction-checklist` },
                { key: "guidelines",   label: "Customer Guideline Sheet",   href: `/api/admin/estimates/${estimate.id}/customer-guidelines` },
                { key: "certificate",  label: "Certificate of Completion",  href: `/api/admin/estimates/${estimate.id}/certificate-of-completion` },
              ].map(doc => (
                <a key={doc.key} href={doc.href} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-700 text-gray-300 hover:text-white text-sm transition-colors">
                  <FileText className="w-4 h-4 text-red-400 flex-shrink-0" />
                  <span>{doc.label}</span>
                </a>
              ))}
            </div>
          </div>

          {/* Product Docs */}
          <SendDocsPanel
            estimateId={estimate.id}
            customerEmail={estimate.customer.email}
            customerName={estimate.customer.name}
          />

          {/* Invoice + Payments */}
          {estimate.invoice ? (
            <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 space-y-3">
              <div>
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Invoice</h3>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-white font-mono">{estimate.invoice.invoice_no}</div>
                    <div className="text-lg font-bold text-white">{fmt(estimate.invoice.amount_due)}</div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                    estimate.invoice.status === 'PAID'    ? 'bg-emerald-900 text-emerald-300' :
                    estimate.invoice.status === 'PARTIAL' ? 'bg-yellow-900 text-yellow-300'  :
                    'bg-gray-700 text-gray-300'
                  }`}>{estimate.invoice.status}</span>
                </div>
              </div>
              <div className="border-t border-gray-700 pt-3">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Payments</h4>
                <PaymentsSection invoice={estimate.invoice} onInvoiceRefresh={load} />
              </div>
            </div>
          ) : (
            estimate.status === 'APPROVED' && (
              <button
                onClick={generateInvoice}
                disabled={generatingInv}
                className="w-full px-4 py-2.5 bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white text-sm font-semibold rounded-xl text-center transition-colors"
              >
                {generatingInv ? 'Generating...' : 'Generate Invoice'}
              </button>
            )
          )}
        </div>
      </div>
    </div>

      {/* Prepare & Send Packet Modal */}
      {packetOpen && estimate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setPacketOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="text-lg font-bold text-gray-900">Prepare &amp; Send Customer Packet</h3>
              <button onClick={() => setPacketOpen(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="px-6 py-4 space-y-5">

              <div className="bg-blue-50 rounded-lg p-3 text-sm">
                <div className="font-semibold text-blue-900">{estimate.customer?.name}</div>
                <div className="text-blue-700">{estimate.address}</div>
                <div className="text-blue-600">{estimate.customer?.email}</div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Documents to Include</label>
                <div className="space-y-2">
                  {[
                    { key: 'lien-waiver',   label: 'Lien Waiver' },
                    { key: 'checklist',     label: 'Post Construction Checklist' },
                    { key: 'guidelines',    label: 'Customer Guideline Sheet' },
                    { key: 'certificate',   label: 'Certificate of Completion' },
                  ].map(d => (
                    <label key={d.key} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={packetDocs.includes(d.key)}
                        onChange={e => setPacketDocs(prev => e.target.checked ? [...prev, d.key] : prev.filter(x => x !== d.key))}
                        className="rounded border-gray-300 text-blue-600" />
                      <span className="text-sm text-gray-700">{d.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Product / Manufacturer Docs */}
              {packetMfrDocs.length > 0 && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Product Documents</label>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {packetMfrDocs.map(doc => (
                      <label key={doc.id} className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={packetProductDocs.includes(doc.id)}
                          onChange={e => setPacketProductDocs(prev => e.target.checked ? [...prev, doc.id] : prev.filter(x => x !== doc.id))}
                          className="rounded border-gray-300 text-blue-600" />
                        <span className="text-xs px-1.5 py-0.5 rounded font-bold uppercase bg-gray-100 text-gray-600">{doc.manufacturer}</span>
                        <span className="text-sm text-gray-700">{doc.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Include PDFs */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Attach PDFs</label>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={includeEstimatePdf} onChange={e => setIncludeEstimatePdf(e.target.checked)}
                      className="rounded border-gray-300 text-blue-600" />
                    <span className="text-sm text-gray-700">Estimate PDF</span>
                  </label>
                  {estimate.invoice && (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={includeInvoicePdf} onChange={e => setIncludeInvoicePdf(e.target.checked)}
                        className="rounded border-gray-300 text-blue-600" />
                      <span className="text-sm text-gray-700">Invoice PDF</span>
                    </label>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Completion Date</label>
                <input type="date" value={packetDate} onChange={e => setPacketDate(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                <p className="text-xs text-gray-500 mt-1">Defaults to today if blank.</p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Checklist Comments / Notes</label>
                <textarea rows={3} value={packetNotes} onChange={e => setPacketNotes(e.target.value)} placeholder="Any notes for the checklist..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none resize-none" />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Contractor Signature</label>
                {!sigDrawing ? (
                  <div className="space-y-2">
                    {packetSig ? (
                      <div className="border border-gray-200 rounded-lg p-2 bg-gray-50">
                        <img src={packetSig} alt="Contractor signature" className="h-16 object-contain" />
                      </div>
                    ) : (
                      <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center text-sm text-gray-500">
                        No signature saved — draw one below
                      </div>
                    )}
                    <button onClick={() => setSigDrawing(true)} className="text-sm text-blue-600 hover:underline">
                      {packetSig ? 'Redraw signature' : 'Draw signature'}
                    </button>
                  </div>
                ) : (
                  <SignaturePad
                    onSave={(dataUrl: string) => {
                      setPacketSig(dataUrl)
                      setSigDrawing(false)
                      setSigSaved(false)
                      fetch('/api/admin/settings/signature', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contractorSig: dataUrl }) }).catch(() => {})
                    }}
                    onCancel={() => setSigDrawing(false)}
                  />
                )}
              </div>

              {packetError && <div className="text-sm text-red-600 bg-red-50 rounded p-2">{packetError}</div>}

              <div className="flex gap-3 pt-2">
                <button onClick={sendPacket} disabled={packetSending || packetDocs.length === 0 || !estimate.customer?.email}
                  className="flex-1 bg-blue-800 text-white rounded-lg px-4 py-2.5 text-sm font-semibold hover:bg-blue-900 disabled:opacity-50 flex items-center justify-center gap-2">
                  {packetSent ? '✓ Sent!' : packetSending ? 'Sending…' : `Send to ${estimate.customer?.email}`}
                </button>
                <button onClick={() => setPacketOpen(false)} className="px-4 py-2.5 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Send Email Modal */}
      {estEmailOpen && estimate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setEstEmailOpen(false)}>
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-700 flex items-center justify-between">
              <h2 className="text-base font-bold text-white">Send Email to {estimate.customer.name}</h2>
              <button onClick={() => setEstEmailOpen(false)} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Subject</label>
                <input
                  type="text"
                  value={estEmailSubject}
                  onChange={e => setEstEmailSubject(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500"
                  placeholder="Subject"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Message</label>
                <textarea
                  rows={6}
                  value={estEmailBody}
                  onChange={e => setEstEmailBody(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none"
                  placeholder="Write your message..."
                />
              </div>
              {estEmailError && <p className="text-red-400 text-sm">{estEmailError}</p>}
              {estEmailSent && <p className="text-green-400 text-sm font-medium">Sent!</p>}
            </div>
            <div className="px-6 pb-5 flex justify-end gap-3">
              <button
                onClick={() => { setEstEmailOpen(false); setEstEmailSubject(''); setEstEmailBody(''); setEstEmailSent(false); setEstEmailError(''); }}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                disabled={estEmailSending || !estEmailSubject || !estEmailBody}
                onClick={async () => {
                  setEstEmailSending(true);
                  setEstEmailError('');
                  try {
                    const res = await fetch(`/api/admin/customers/${estimate.customer.id}/send-email`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ subject: estEmailSubject, body: estEmailBody }),
                    });
                    if (res.ok) {
                      setEstEmailSent(true);
                      setTimeout(() => { setEstEmailOpen(false); setEstEmailSubject(''); setEstEmailBody(''); setEstEmailSent(false); }, 1500);
                    } else {
                      const d = await res.json();
                      setEstEmailError(d.error || 'Failed to send');
                    }
                  } catch (e: any) {
                    setEstEmailError(e.message || 'Network error');
                  } finally {
                    setEstEmailSending(false);
                  }
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                {estEmailSending ? 'Sending...' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}
  </>
  );
}
