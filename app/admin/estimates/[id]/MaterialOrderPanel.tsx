'use client';

import { useEffect, useState, useCallback } from 'react';
import { Printer, Save } from 'lucide-react';
import {
  SHINGLE_BRANDS,
  FIELD_SHINGLES,
  RIDGE_CAPS,
  STARTERS,
  UNDERLAYMENTS,
  ICE_WATER,
  ACCESSORIES,
  getDefaultForBrand,
  type ShingleBrand,
  type ProductType,
  type MaterialProduct,
  type AccessoryProduct,
} from '@/lib/materialProducts';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LineItemProp {
  line_item_id: string;
  label: string;
  category: string;
  unit: string;
  qty: number;
}

interface Props {
  estimateId: string;
  lineItems: LineItemProp[];
}

interface ExtractedQtys {
  sq: number;
  ridgeLf: number;
  starterLf: number;
  underlaymentSq: number;
  iwSq: number;
  dripLf: number;
  vents: number;
  pipes: number;
}

// Saved shape stored in DB / serialised to API
interface SavedItem {
  type: ProductType;
  productId: string;
  qty: number;
}

interface SavedOrder {
  brand: string;
  items: SavedItem[];
  notes: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtMoney(n: number): string {
  return '$' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function extractQtys(lineItems: LineItemProp[]): ExtractedQtys {
  let sq = 0, ridgeLf = 0, starterLf = 0, underlaymentSq = 0, iwSq = 0, dripLf = 0, vents = 0, pipes = 0;
  for (const li of lineItems) {
    const id  = li.line_item_id.toLowerCase();
    const lbl = li.label.toLowerCase();
    const cat = li.category.toLowerCase();
    if (li.unit === 'SQ') {
      if      (cat.includes('shingle') || lbl.includes('shingle'))                                        sq             += li.qty;
      else if (cat.includes('underlayment') || lbl.includes('underlayment') || lbl.includes('felt'))      underlaymentSq += li.qty;
      else if (lbl.includes('ice') || lbl.includes('water shield') || id.includes('ice'))                 iwSq           += li.qty;
    } else if (li.unit === 'LF') {
      if      (cat.includes('ridge') || lbl.includes('ridge cap') || lbl.includes('hip & ridge') || id.includes('ridge')) ridgeLf   += li.qty;
      else if (lbl.includes('starter') || id.includes('starter'))                                         starterLf += li.qty;
      else if (lbl.includes('drip') || id.includes('drip'))                                               dripLf    += li.qty;
    } else if (li.unit === 'EA') {
      if      (lbl.includes('vent') && !lbl.includes('prevent'))                                          vents += li.qty;
      else if (lbl.includes('pipe') || lbl.includes('boot') || lbl.includes('jack'))                     pipes += li.qty;
    }
  }
  return { sq, ridgeLf, starterLf, underlaymentSq, iwSq, dripLf, vents, pipes };
}

function calcDefaultQty(type: ProductType, product: MaterialProduct | AccessoryProduct, qtys: ExtractedQtys): number {
  const mp = product as MaterialProduct;
  switch (type) {
    case 'field_shingle':  return Math.ceil(qtys.sq * 1.1 * (mp.bundlesPerSq ?? 3));
    case 'ridge_cap':      return Math.ceil(qtys.ridgeLf / (mp.lfPerBoard ?? 25));
    case 'starter':        return Math.ceil((qtys.starterLf || qtys.dripLf) / (mp.lfPerBoard ?? 105));
    case 'underlayment':   return Math.ceil(qtys.underlaymentSq / (mp.sqPerRoll ?? 10));
    case 'ice_water':      return Math.ceil(qtys.iwSq / (mp.sqPerRoll ?? 2));
    case 'coil_nails':     return Math.max(1, Math.ceil(qtys.sq / 2));
    case 'cap_nails':      return Math.max(1, Math.ceil(qtys.sq / 2));
    case 'drip_edge':      return Math.ceil(qtys.dripLf / 10);
    case 'pipe_boot':      return qtys.pipes;
    case 'vent':           return qtys.vents;
    default:               return 1;
  }
}

// ─── Row configs ──────────────────────────────────────────────────────────────

interface BrandRow {
  kind: 'brand';
  type: 'field_shingle' | 'ridge_cap' | 'starter';
  label: string;
  products: MaterialProduct[];
}

interface MultiRow {
  kind: 'multi';
  type: 'underlayment' | 'ice_water';
  label: string;
  products: MaterialProduct[];
}

interface AccessoryMultiRow {
  kind: 'accessory_multi';
  type: 'drip_edge' | 'vent';
  label: string;
  products: AccessoryProduct[];
}

interface AccessoryFixedRow {
  kind: 'accessory_fixed';
  type: 'coil_nails' | 'cap_nails' | 'pipe_boot';
  label: string;
  product: AccessoryProduct;
}

type RowConfig = BrandRow | MultiRow | AccessoryMultiRow | AccessoryFixedRow;

const BRAND_ROWS: BrandRow[] = [
  { kind: 'brand', type: 'field_shingle', label: 'Field Shingle',  products: FIELD_SHINGLES },
  { kind: 'brand', type: 'ridge_cap',     label: 'Hip & Ridge',    products: RIDGE_CAPS     },
  { kind: 'brand', type: 'starter',       label: 'Starter Strip',  products: STARTERS       },
];

const OTHER_ROWS: (MultiRow | AccessoryMultiRow | AccessoryFixedRow)[] = [
  { kind: 'multi',          type: 'underlayment', label: 'Underlayment', products: UNDERLAYMENTS },
  { kind: 'multi',          type: 'ice_water',    label: 'Ice & Water',  products: ICE_WATER     },
  { kind: 'accessory_multi',type: 'drip_edge',    label: 'Drip Edge',    products: ACCESSORIES.filter(a => a.type === 'drip_edge') as AccessoryProduct[] },
  { kind: 'accessory_fixed',type: 'coil_nails',   label: 'Coil Nails',   product:  ACCESSORIES.find(a => a.id === 'coil_nails')! },
  { kind: 'accessory_fixed',type: 'cap_nails',    label: 'Cap Nails',    product:  ACCESSORIES.find(a => a.id === 'cap_nails')!  },
  { kind: 'accessory_fixed',type: 'pipe_boot',    label: 'Pipe Boots',   product:  ACCESSORIES.find(a => a.id === 'pipe_3n1')!  },
  { kind: 'accessory_multi',type: 'vent',         label: 'Vents',        products: ACCESSORIES.filter(a => a.type === 'vent') as AccessoryProduct[] },
];

const ALL_ROWS: RowConfig[] = [...BRAND_ROWS, ...OTHER_ROWS];

// ─── Component ────────────────────────────────────────────────────────────────

export default function MaterialOrderPanel({ estimateId, lineItems }: Props) {
  const qtys = extractQtys(lineItems);

  // Brand selection
  const [brand, setBrand] = useState<ShingleBrand | ''>('');

  // Product selections: keyed by ProductType → product id
  const getInitialSelections = (): Record<string, string> => {
    const sel: Record<string, string> = {};
    // Brand rows — default to GAF
    sel['field_shingle'] = FIELD_SHINGLES[0]?.id ?? '';
    sel['ridge_cap']     = RIDGE_CAPS[0]?.id     ?? '';
    sel['starter']       = STARTERS[0]?.id        ?? '';
    // Non-brand rows — default to first option
    sel['underlayment']  = UNDERLAYMENTS[0]?.id  ?? '';
    sel['ice_water']     = ICE_WATER[0]?.id       ?? '';
    sel['drip_edge']     = ACCESSORIES.find(a => a.type === 'drip_edge')?.id ?? '';
    sel['coil_nails']    = 'coil_nails';
    sel['cap_nails']     = 'cap_nails';
    sel['pipe_boot']     = 'pipe_3n1';
    sel['vent']          = ACCESSORIES.find(a => a.type === 'vent')?.id ?? '';
    return sel;
  };

  const [selections, setSelections] = useState<Record<string, string>>(getInitialSelections);

  // Qty overrides — keyed by ProductType, only set when user edits
  const [qtyOverrides, setQtyOverrides] = useState<Record<string, number>>({});

  const [notes, setNotes]   = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);
  const [loading, setLoading] = useState(true);

  // Resolve effective qty for a row
  const effectiveQty = useCallback((type: ProductType, product: MaterialProduct | AccessoryProduct): number => {
    if (qtyOverrides[type] !== undefined) return qtyOverrides[type];
    return calcDefaultQty(type, product, qtys);
  }, [qtyOverrides, qtys]);

  // Load saved order on mount
  useEffect(() => {
    fetch(`/api/admin/estimates/${estimateId}/material-order`)
      .then(r => r.json())
      .then((d: { order: SavedOrder | null }) => {
        if (d.order) {
          const o = d.order;
          if (o.brand && SHINGLE_BRANDS.includes(o.brand as ShingleBrand)) {
            setBrand(o.brand as ShingleBrand);
          }
          if (o.notes) setNotes(o.notes);
          if (Array.isArray(o.items) && o.items.length > 0) {
            const newSel = { ...getInitialSelections() };
            const newOverrides: Record<string, number> = {};
            for (const item of o.items) {
              if (item.productId) newSel[item.type] = item.productId;
              if (item.qty !== undefined) newOverrides[item.type] = item.qty;
            }
            setSelections(newSel);
            setQtyOverrides(newOverrides);
          }
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estimateId]);

  // When brand changes, update brand-matched selections
  const handleBrandChange = (newBrand: ShingleBrand | '') => {
    setBrand(newBrand);
    if (!newBrand) return;
    setSelections(prev => {
      const next = { ...prev };
      const shingle = getDefaultForBrand(newBrand, 'field_shingle');
      const ridge   = getDefaultForBrand(newBrand, 'ridge_cap');
      const starter = getDefaultForBrand(newBrand, 'starter');
      if (shingle) next['field_shingle'] = shingle.id;
      if (ridge)   next['ridge_cap']     = ridge.id;
      if (starter) next['starter']       = starter.id;
      return next;
    });
    setSaved(false);
  };

  // Build items payload for save
  const buildItems = (): SavedItem[] => {
    return ALL_ROWS.map(row => {
      const type = row.type as ProductType;
      const productId = selections[type] ?? '';
      // Resolve product for qty calculation
      let product: MaterialProduct | AccessoryProduct | undefined;
      if (row.kind === 'brand') {
        product = row.products.find(p => p.id === productId) ?? row.products[0];
      } else if (row.kind === 'multi') {
        product = row.products.find(p => p.id === productId) ?? row.products[0];
      } else if (row.kind === 'accessory_multi') {
        product = row.products.find(p => p.id === productId) ?? row.products[0];
      } else {
        product = row.product;
      }
      const qty = product ? effectiveQty(type, product) : 0;
      return { type, productId: productId || (product?.id ?? ''), qty };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch(`/api/admin/estimates/${estimateId}/material-order`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ brand, items: buildItems(), notes: notes || null }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  const handlePrint = () => window.print();

  // Compute row total for a given type + product
  const rowTotal = (type: ProductType, product: MaterialProduct | AccessoryProduct): number => {
    return effectiveQty(type, product) * product.price;
  };

  // Grand total across all visible rows
  const grandTotal = ALL_ROWS.reduce((sum, row) => {
    const type = row.type as ProductType;
    let product: MaterialProduct | AccessoryProduct | undefined;
    const productId = selections[type];
    if (row.kind === 'brand')           product = row.products.find(p => p.id === productId) ?? row.products[0];
    else if (row.kind === 'multi')      product = row.products.find(p => p.id === productId) ?? row.products[0];
    else if (row.kind === 'accessory_multi') product = row.products.find(p => p.id === productId) ?? row.products[0];
    else                                product = row.product;
    if (!product) return sum;
    return sum + rowTotal(type, product);
  }, 0);

  if (loading) return <div className="h-32 bg-gray-800 rounded-xl animate-pulse" />;

  // ─── Render helpers ──────────────────────────────────────────────────────────

  const renderBrandRow = (row: BrandRow) => {
    const type      = row.type;
    const available = brand ? row.products.filter(p => p.brand === brand) : row.products;
    const curId     = selections[type] ?? '';
    // If current selection not in available (brand changed), pick first
    const product   = available.find(p => p.id === curId) ?? available[0];
    if (!product) return null;
    const qty = effectiveQty(type, product);
    const isBrandHighlighted = !!brand;

    return (
      <div
        key={type}
        className={`flex items-center gap-3 px-3 py-2 rounded-lg ${
          isBrandHighlighted ? 'border border-red-800/60 bg-red-950/20' : 'bg-gray-700/40'
        }`}
      >
        <span className="w-28 text-sm text-gray-300 flex-shrink-0">{row.label}</span>
        <select
          value={product.id}
          onChange={e => { setSelections(prev => ({ ...prev, [type]: e.target.value })); setSaved(false); }}
          className="flex-1 min-w-0 px-2 py-1 bg-gray-700 border border-gray-600 text-white text-sm rounded focus:outline-none focus:border-red-500"
        >
          {available.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <input
          type="number"
          min="0"
          value={qty}
          onChange={e => { setQtyOverrides(prev => ({ ...prev, [type]: parseInt(e.target.value) || 0 })); setSaved(false); }}
          className="w-16 px-2 py-1 bg-gray-700 border border-gray-600 text-white text-sm text-right rounded focus:outline-none focus:border-red-500"
        />
        <span className="text-xs text-gray-500 w-6 flex-shrink-0">{product.priceUnit}</span>
        <span className="text-xs text-gray-400 w-16 text-right font-mono flex-shrink-0">{fmtMoney(product.price)}</span>
        <span className="text-xs text-white w-20 text-right font-mono flex-shrink-0">{fmtMoney(rowTotal(type, product))}</span>
      </div>
    );
  };

  const renderMultiRow = (row: MultiRow) => {
    const type    = row.type;
    const curId   = selections[type] ?? '';
    const product = row.products.find(p => p.id === curId) ?? row.products[0];
    if (!product) return null;
    const qty = effectiveQty(type, product);
    return (
      <div key={type} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-700/40">
        <span className="w-28 text-sm text-gray-300 flex-shrink-0">{row.label}</span>
        <select
          value={product.id}
          onChange={e => { setSelections(prev => ({ ...prev, [type]: e.target.value })); setSaved(false); }}
          className="flex-1 min-w-0 px-2 py-1 bg-gray-700 border border-gray-600 text-white text-sm rounded focus:outline-none focus:border-red-500"
        >
          {row.products.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <input
          type="number"
          min="0"
          value={qty}
          onChange={e => { setQtyOverrides(prev => ({ ...prev, [type]: parseInt(e.target.value) || 0 })); setSaved(false); }}
          className="w-16 px-2 py-1 bg-gray-700 border border-gray-600 text-white text-sm text-right rounded focus:outline-none focus:border-red-500"
        />
        <span className="text-xs text-gray-500 w-6 flex-shrink-0">{product.priceUnit}</span>
        <span className="text-xs text-gray-400 w-16 text-right font-mono flex-shrink-0">{fmtMoney(product.price)}</span>
        <span className="text-xs text-white w-20 text-right font-mono flex-shrink-0">{fmtMoney(rowTotal(type, product))}</span>
      </div>
    );
  };

  const renderAccessoryMultiRow = (row: AccessoryMultiRow) => {
    const type    = row.type as ProductType;
    const curId   = selections[type] ?? '';
    const product = row.products.find(p => p.id === curId) ?? row.products[0];
    if (!product) return null;
    const qty = effectiveQty(type, product);
    return (
      <div key={type} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-700/40">
        <span className="w-28 text-sm text-gray-300 flex-shrink-0">{row.label}</span>
        <select
          value={product.id}
          onChange={e => { setSelections(prev => ({ ...prev, [type]: e.target.value })); setSaved(false); }}
          className="flex-1 min-w-0 px-2 py-1 bg-gray-700 border border-gray-600 text-white text-sm rounded focus:outline-none focus:border-red-500"
        >
          {row.products.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <input
          type="number"
          min="0"
          value={qty}
          onChange={e => { setQtyOverrides(prev => ({ ...prev, [type]: parseInt(e.target.value) || 0 })); setSaved(false); }}
          className="w-16 px-2 py-1 bg-gray-700 border border-gray-600 text-white text-sm text-right rounded focus:outline-none focus:border-red-500"
        />
        <span className="text-xs text-gray-500 w-6 flex-shrink-0">{product.priceUnit}</span>
        <span className="text-xs text-gray-400 w-16 text-right font-mono flex-shrink-0">{fmtMoney(product.price)}</span>
        <span className="text-xs text-white w-20 text-right font-mono flex-shrink-0">{fmtMoney(rowTotal(type, product))}</span>
      </div>
    );
  };

  const renderAccessoryFixedRow = (row: AccessoryFixedRow) => {
    const type    = row.type as ProductType;
    const product = row.product;
    const qty     = effectiveQty(type, product);
    return (
      <div key={type} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-700/40">
        <span className="w-28 text-sm text-gray-300 flex-shrink-0">{row.label}</span>
        <span className="flex-1 min-w-0 text-sm text-gray-400 truncate px-2">{product.name}</span>
        <input
          type="number"
          min="0"
          value={qty}
          onChange={e => { setQtyOverrides(prev => ({ ...prev, [type]: parseInt(e.target.value) || 0 })); setSaved(false); }}
          className="w-16 px-2 py-1 bg-gray-700 border border-gray-600 text-white text-sm text-right rounded focus:outline-none focus:border-red-500"
        />
        <span className="text-xs text-gray-500 w-6 flex-shrink-0">{product.priceUnit}</span>
        <span className="text-xs text-gray-400 w-16 text-right font-mono flex-shrink-0">{fmtMoney(product.price)}</span>
        <span className="text-xs text-white w-20 text-right font-mono flex-shrink-0">{fmtMoney(rowTotal(type, product))}</span>
      </div>
    );
  };

  return (
    <>
      {/* Print styles — only the panel renders during print */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #material-order-print,
          #material-order-print * { visibility: visible; }
          #material-order-print { position: absolute; top: 0; left: 0; width: 100%; }
        }
      `}</style>

      <div id="material-order-print" className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">

        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Material Order</h2>
          <div className="flex gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors"
            >
              <Printer className="w-3.5 h-3.5" /> Print
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white rounded-lg transition-colors font-semibold"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? 'Saving...' : saved ? '✓ Saved' : 'Save Order'}
            </button>
          </div>
        </div>

        <div className="p-4 space-y-4">

          {/* Brand selector */}
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Select Brand</p>
            <div className="flex flex-wrap gap-2">
              {SHINGLE_BRANDS.map(b => (
                <button
                  key={b}
                  onClick={() => handleBrandChange(brand === b ? '' : b)}
                  className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                    brand === b
                      ? 'bg-red-700 text-white'
                      : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                  }`}
                >
                  {b === 'Owens Corning' ? 'OC' : b === 'CertainTeed' ? 'CT' : b}
                </button>
              ))}
            </div>
          </div>

          {/* Column headers */}
          <div className="flex items-center gap-3 px-3 text-xs text-gray-500 font-medium">
            <span className="w-28 flex-shrink-0">Item</span>
            <span className="flex-1">Product</span>
            <span className="w-16 text-right">Qty</span>
            <span className="w-6 flex-shrink-0">Unit</span>
            <span className="w-16 text-right flex-shrink-0">Unit $</span>
            <span className="w-20 text-right flex-shrink-0">Total</span>
          </div>

          {/* Brand-matched section */}
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 px-1">
              Brand-Matched Materials
            </p>
            <div className="space-y-1">
              {BRAND_ROWS.map(row => renderBrandRow(row))}
            </div>
          </div>

          {/* Other materials section */}
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 px-1">
              Other Materials
            </p>
            <div className="space-y-1">
              {OTHER_ROWS.map(row => {
                if (row.kind === 'multi')           return renderMultiRow(row);
                if (row.kind === 'accessory_multi') return renderAccessoryMultiRow(row);
                if (row.kind === 'accessory_fixed') return renderAccessoryFixedRow(row);
                return null;
              })}
            </div>
          </div>

          {/* Grand total */}
          <div className="flex justify-end pt-2 border-t border-gray-700">
            <span className="text-sm font-semibold text-white">
              Materials Total:{' '}
              <span className="font-mono text-green-400">{fmtMoney(grandTotal)}</span>
            </span>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Order Notes</label>
            <textarea
              value={notes}
              onChange={e => { setNotes(e.target.value); setSaved(false); }}
              rows={2}
              placeholder="Delivery instructions, color, special requests..."
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 text-sm focus:outline-none focus:border-red-500 resize-none"
            />
          </div>

        </div>
      </div>
    </>
  );
}
