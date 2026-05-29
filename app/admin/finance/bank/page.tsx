'use client';

import { useState, useEffect, useCallback } from 'react';
import { Building2, RefreshCw, Trash2, CheckCircle, Tag, XCircle, AlertCircle, Wifi, WifiOff } from 'lucide-react';

interface PlaidAccount { account_id: string; name: string; type: string; subtype: string; mask: string }
interface PlaidItem { id: string; institution_name: string; accounts: PlaidAccount[]; last_synced_at: string | null; _count: { transactions: number } }
interface BankTx {
  id: string; date: string; amount: number; description: string; merchant_name: string | null;
  category: string | null; plaid_category: string | null; status: string;
  item: { institution_name: string | null };
}

const CATEGORIES = [
  { value: 'vehicle_fuel', label: 'Vehicle / Fuel' }, { value: 'tools_equipment', label: 'Tools & Equipment' },
  { value: 'insurance', label: 'Insurance' }, { value: 'office_rent', label: 'Office / Rent' },
  { value: 'marketing', label: 'Marketing' }, { value: 'subscriptions', label: 'Subscriptions' },
  { value: 'materials', label: 'Materials' }, { value: 'subcontractor', label: 'Subcontractor' },
  { value: 'payroll', label: 'Payroll' }, { value: 'taxes', label: 'Taxes' },
  { value: 'utilities', label: 'Utilities' }, { value: 'meals', label: 'Meals' },
  { value: 'travel', label: 'Travel' }, { value: 'misc', label: 'Miscellaneous' },
];

const STATUS_FILTER = ['pending', 'categorized', 'matched', 'ignored', 'all'];
const fmt = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export default function BankConnectPage() {
  const [status, setStatus] = useState<{ plaid_enabled: boolean; items: PlaidItem[]; pending_transactions: number } | null>(null);
  const [txs, setTxs] = useState<BankTx[]>([]);
  const [txFilter, setTxFilter] = useState('pending');
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [linkLoading, setLinkLoading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);

  const showToast = (msg: string, type: 'ok' | 'err' = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const loadStatus = useCallback(async () => {
    const r = await fetch('/api/admin/finance/plaid/status');
    const d = await r.json();
    setStatus(d);
    setLoading(false);
  }, []);

  const loadTxs = useCallback(async () => {
    const r = await fetch(`/api/admin/finance/plaid/transactions?status=${txFilter}&limit=150`);
    const d = await r.json();
    setTxs(d.transactions || []);
  }, [txFilter]);

  useEffect(() => { loadStatus(); }, [loadStatus]);
  useEffect(() => { if (status?.items?.length) loadTxs(); }, [loadTxs, status]);

  const openPlaidLink = async () => {
    setLinkLoading(true);
    try {
      const r = await fetch('/api/admin/finance/plaid/link-token', { method: 'POST' });
      const d = await r.json();
      if (!r.ok) { showToast(d.error || 'Failed to start bank connection', 'err'); setLinkLoading(false); return; }

      const handler = (window as any).Plaid.create({
        token: d.link_token,
        onSuccess: async (public_token: string, metadata: any) => {
          const ex = await fetch('/api/admin/finance/plaid/exchange', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ public_token, institution: metadata.institution }),
          });
          const exd = await ex.json();
          if (ex.ok) {
            showToast(`Connected ${exd.institution || 'bank'} — syncing transactions...`);
            await handleSync();
            await loadStatus();
          } else {
            showToast(exd.error || 'Connection failed', 'err');
          }
        },
        onExit: () => setLinkLoading(false),
      });
      handler.open();
    } catch (e: any) {
      showToast(e.message, 'err');
      setLinkLoading(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    const r = await fetch('/api/admin/finance/plaid/sync', { method: 'POST' });
    const d = await r.json();
    setSyncing(false);
    if (r.ok) {
      const total = (d.results || []).reduce((s: number, i: any) => s + (i.added || 0), 0);
      showToast(`Synced — ${total} new transaction(s)`);
      loadStatus(); loadTxs();
    } else {
      showToast(d.error || 'Sync failed', 'err');
    }
  };

  const handleDisconnect = async (itemId: string, name: string) => {
    if (!confirm(`Disconnect ${name}? This will remove all imported transactions.`)) return;
    const r = await fetch('/api/admin/finance/plaid/disconnect', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ item_id: itemId }),
    });
    if (r.ok) { showToast(`${name} disconnected`); loadStatus(); setTxs([]); }
    else showToast('Disconnect failed', 'err');
  };

  const updateTx = async (id: string, patch: { category?: string; status?: string }) => {
    const r = await fetch('/api/admin/finance/plaid/transactions', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...patch }),
    });
    if (r.ok) {
      if (patch.status === 'matched') showToast('Added to expenses');
      setTxs(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t));
    } else showToast('Update failed', 'err');
  };

  if (loading) return <div className="p-6 text-center text-gray-500">Loading...</div>;

  const connected = status?.items?.length > 0;

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium flex items-center gap-2 ${toast.type === 'ok' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.type === 'ok' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-700 rounded-xl"><Building2 className="w-5 h-5 text-white" /></div>
          <div>
            <h1 className="text-xl font-black text-white tracking-tight leading-none">Bank Connect</h1>
            <p className="text-gray-500 text-xs mt-0.5">Import transactions from your bank &middot; auto-categorize as expenses</p>
          </div>
        </div>
        {connected && (
          <button onClick={handleSync} disabled={syncing}
            className="flex items-center gap-2 bg-blue-700 hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing...' : 'Sync Now'}
          </button>
        )}
      </div>

      {/* Plaid not configured warning */}
      {!status?.plaid_enabled && (
        <div className="bg-amber-950 border border-amber-800 rounded-xl p-5 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-amber-300 font-semibold text-sm">Plaid API Keys Required</p>
            <p className="text-amber-400 text-xs mt-1">Add <code className="bg-amber-900 px-1 rounded">PLAID_CLIENT_ID</code>, <code className="bg-amber-900 px-1 rounded">PLAID_SECRET</code>, and <code className="bg-amber-900 px-1 rounded">PLAID_ENV=sandbox</code> to your .env file on the VPS, then restart.</p>
            <p className="text-amber-500 text-xs mt-1">Get your keys at <strong>dashboard.plaid.com</strong></p>
          </div>
        </div>
      )}

      {/* Connected accounts */}
      {connected ? (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
          <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4">Connected Accounts</h2>
          <div className="space-y-3">
            {status!.items.map(item => (
              <div key={item.id} className="flex items-center justify-between bg-gray-900 border border-gray-700 rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <Wifi className="w-5 h-5 text-green-400" />
                  <div>
                    <p className="text-white font-semibold text-sm">{item.institution_name || 'Bank'}</p>
                    <p className="text-gray-400 text-xs">
                      {(item.accounts as any[])?.map(a => `${a.name} (...${a.mask})`).join(', ')}
                      &nbsp;&middot;&nbsp;{item._count.transactions} transactions
                      {item.last_synced_at && ` &middot; Synced ${new Date(item.last_synced_at).toLocaleDateString()}`}
                    </p>
                  </div>
                </div>
                <button onClick={() => handleDisconnect(item.id, item.institution_name || 'Bank')}
                  className="text-gray-600 hover:text-red-400 transition-colors p-1">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
          {status!.pending_transactions > 0 && (
            <div className="mt-3 flex items-center gap-2 text-amber-400 text-sm">
              <AlertCircle className="w-4 h-4" /> {status!.pending_transactions} transaction(s) need categorization
            </div>
          )}
        </div>
      ) : (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-10 text-center">
          <WifiOff className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-white mb-2">No Bank Connected</h2>
          <p className="text-gray-400 text-sm mb-6 max-w-md mx-auto">Connect your business bank account or credit card to automatically import and categorize transactions as expenses.</p>
          <button onClick={openPlaidLink} disabled={linkLoading || !status?.plaid_enabled}
            className="inline-flex items-center gap-2 bg-blue-700 hover:bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold transition-colors disabled:opacity-50">
            <Building2 className="w-5 h-5" />
            {linkLoading ? 'Connecting...' : 'Connect Bank Account'}
          </button>
          <p className="text-gray-600 text-xs mt-3">Secured by Plaid &middot; Bank-level encryption &middot; Read-only access</p>
        </div>
      )}

      {/* Add another account */}
      {connected && (
        <button onClick={openPlaidLink} disabled={linkLoading || !status?.plaid_enabled}
          className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors disabled:opacity-50">
          <Building2 className="w-4 h-4" /> Add Another Account
        </button>
      )}

      {/* Transaction table */}
      {connected && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-gray-700 flex items-center justify-between gap-4">
            <h2 className="text-sm font-bold text-white">Transactions</h2>
            <div className="flex bg-gray-900 rounded-lg p-1">
              {STATUS_FILTER.map(s => (
                <button key={s} onClick={() => setTxFilter(s)}
                  className={`px-3 py-1 rounded-md text-xs font-medium capitalize transition-colors ${txFilter === s ? 'bg-blue-700 text-white' : 'text-gray-400 hover:text-white'}`}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          {txs.length === 0 ? (
            <p className="p-8 text-center text-gray-500 text-sm">No {txFilter} transactions.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-900/50 border-b border-gray-700">
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Description</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Bank</th>
                    <th className="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Amount</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider w-44">Category</th>
                    <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {txs.map((tx, i) => (
                    <tr key={tx.id} className={`border-t border-gray-700/50 ${i % 2 === 0 ? '' : 'bg-gray-900/20'} ${tx.status === 'ignored' ? 'opacity-40' : ''}`}>
                      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{fmtDate(tx.date)}</td>
                      <td className="px-4 py-3 max-w-xs">
                        <p className="text-gray-200 text-sm truncate">{tx.merchant_name || tx.description}</p>
                        {tx.merchant_name && <p className="text-xs text-gray-600 truncate">{tx.description}</p>}
                        {tx.plaid_category && <p className="text-xs text-gray-600 truncate">{tx.plaid_category}</p>}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">{tx.item?.institution_name || '—'}</td>
                      <td className="px-4 py-3 text-right font-mono font-semibold text-red-400">{fmt(tx.amount)}</td>
                      <td className="px-4 py-3">
                        <select
                          value={tx.category || ''}
                          onChange={e => updateTx(tx.id, { category: e.target.value })}
                          className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1 text-xs text-white focus:border-blue-500 focus:outline-none"
                          disabled={tx.status === 'matched' || tx.status === 'ignored'}
                        >
                          <option value="">Uncategorized</option>
                          {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          {tx.status === 'pending' || tx.status === 'categorized' ? (
                            <>
                              <button onClick={() => updateTx(tx.id, { status: 'matched', category: tx.category || 'misc' })}
                                title="Add to Expenses"
                                className="p-1.5 text-gray-500 hover:text-green-400 transition-colors">
                                <CheckCircle className="w-4 h-4" />
                              </button>
                              <button onClick={() => updateTx(tx.id, { status: 'ignored' })}
                                title="Ignore"
                                className="p-1.5 text-gray-500 hover:text-gray-300 transition-colors">
                                <XCircle className="w-4 h-4" />
                              </button>
                            </>
                          ) : (
                            <span className={`text-xs px-2 py-0.5 rounded-full ${tx.status === 'matched' ? 'bg-green-900 text-green-400' : 'bg-gray-700 text-gray-400'}`}>
                              {tx.status}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Plaid Link script */}
      <script src="https://cdn.plaid.com/link/v2/stable/link-initialize.js" async />
    </div>
  );
}
