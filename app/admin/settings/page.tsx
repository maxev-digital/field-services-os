'use client';

import { useState, useEffect } from 'react';
import { Settings, Globe, Mail, Shield, Save, Star, Loader2 } from 'lucide-react';

interface AdminSettings {
  businessName: string;
  phone: string;
  email: string;
  website: string;
  serviceArea: string;
  license: string;
  googleReviewUrl: string;
  notifyNewEstimate: boolean;
  notifyJobStatus: boolean;
  notifyInsuranceClaim: boolean;
  zellePhone: string;
  cashAppHandle: string;
  checkPayableTo: string;
  monthlyRevenueGoal: number;
  repName: string;
}

const DEFAULTS: AdminSettings = {
  businessName: 'Roof Works of Texas',
  phone: '214-795-3905',
  email: 'info@roofworksoftexas.com',
  website: 'roofworksoftexas.com',
  serviceArea: 'DFW Metroplex',
  license: '',
  googleReviewUrl: '',
  notifyNewEstimate: true,
  notifyJobStatus: true,
  notifyInsuranceClaim: true,
  zellePhone: '214-795-3905',
  cashAppHandle: '',
  checkPayableTo: 'RWCR LLC',
  monthlyRevenueGoal: 0,
  repName: 'Will',
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<AdminSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/admin/settings')
      .then(r => r.json())
      .then(d => { setSettings({ ...DEFAULTS, ...d }); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  function set(key: keyof AdminSettings, val: any) {
    setSettings(s => ({ ...s, [key]: val }));
  }

  async function handleSave() {
    setSaving(true); setError(''); setSaved(false);
    try {
      const r = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (!r.ok) throw new Error((await r.json()).error);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: any) {
      setError(e.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  const inputClass = 'w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white focus:outline-none focus:border-red-500';

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
    </div>
  );

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-gray-400 text-sm mt-1">System configuration and business information</p>
      </div>

      <div className="space-y-6">
        {/* Business Info */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
            <Globe className="w-3.5 h-3.5" /> Business Information
          </h2>
          <div className="grid grid-cols-2 gap-4">
            {([
              ['Business Name', 'businessName'],
              ['Phone', 'phone'],
              ['Email', 'email'],
              ['Website', 'website'],
              ['Service Area', 'serviceArea'],
              ['License #', 'license'],
              ['Sender Name (emails)', 'repName'],
            ] as [string, keyof AdminSettings][]).map(([label, key]) => (
              <div key={key}>
                <label className="text-xs text-gray-400 mb-1 block">{label}</label>
                <input
                  value={settings[key] as string}
                  onChange={e => set(key, e.target.value)}
                  className={inputClass}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Google Review Link */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
            <Star className="w-3.5 h-3.5" /> Google Review Link
          </h2>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Google Review URL (used in review request messages)</label>
            <input
              value={settings.googleReviewUrl}
              onChange={e => set('googleReviewUrl', e.target.value)}
              placeholder="https://g.page/r/YOUR_REVIEW_LINK"
              className={inputClass}
            />
            <p className="text-xs text-gray-500 mt-1.5">Find this in Google Business Profile → Share review form</p>
          </div>
        </div>

        {/* Notifications */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
            <Mail className="w-3.5 h-3.5" /> Notification Settings
          </h2>
          <div className="space-y-3">
            {([
              ['notifyNewEstimate', 'New estimate submitted', 'Get notified when a customer submits an estimate via the website tool'],
              ['notifyJobStatus', 'Job status changed', 'Alert when a job moves through pipeline stages'],
              ['notifyInsuranceClaim', 'Insurance claim updated', 'Alert when claim status changes'],
            ] as [keyof AdminSettings, string, string][]).map(([key, label, desc]) => (
              <div key={key} className="flex items-start justify-between gap-4 py-2 border-b border-gray-700/50 last:border-0">
                <div>
                  <div className="text-sm text-white">{label}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{desc}</div>
                </div>
                <label className="flex-shrink-0 relative inline-flex items-center cursor-pointer mt-0.5">
                  <input
                    type="checkbox"
                    checked={settings[key] as boolean}
                    onChange={e => set(key, e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-gray-600 peer-checked:bg-red-600 rounded-full transition-colors" />
                  <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-4" />
                </label>
              </div>
            ))}
          </div>
        </div>

        {/* Payment Options */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
            <Star className="w-3.5 h-3.5 text-green-400" /> Payment Options (shown on invoices)
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Zelle Phone / Email</label>
              <input value={settings.zellePhone} onChange={e => set('zellePhone', e.target.value)}
                placeholder="214-795-3905" className={inputClass} />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">CashApp Handle</label>
              <input value={settings.cashAppHandle} onChange={e => set('cashAppHandle', e.target.value)}
                placeholder="$RoofWorksTX" className={inputClass} />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Check Payable To</label>
              <input value={settings.checkPayableTo} onChange={e => set('checkPayableTo', e.target.value)}
                placeholder="RWCR LLC" className={inputClass} />
            </div>
          </div>
        </div>

        {/* Admin Account */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
            <Shield className="w-3.5 h-3.5" /> Admin Account
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">New Password</label>
              <input type="password" placeholder="Leave blank to keep current" className={inputClass} />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Confirm Password</label>
              <input type="password" className={inputClass} />
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-3">Password changes not yet implemented — contact your developer.</p>
        </div>

        {/* System Info */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
            <Settings className="w-3.5 h-3.5" /> System Info
          </h2>
          <div className="grid grid-cols-2 gap-3 text-sm">
            {[
              ['Platform', 'Roof Works Admin v1.0'],
              ['Database', 'PostgreSQL (Docker)'],
              ['Server', 'VPS — 72.60.43.168'],
              ['Port', '3020 (PM2: roof-works-admin)'],
              ['Domain', 'admin.roofworksoftexas.com'],
              ['Public API', '/api/estimates — connected to estimator tool'],
            ].map(([label, value]) => (
              <div key={label} className="flex gap-3">
                <span className="text-gray-500 w-28 flex-shrink-0">{label}</span>
                <span className="text-gray-300">{value}</span>
              </div>
            ))}
          </div>
        </div>

        {error && (
          <div className="text-red-400 text-sm bg-red-900/30 border border-red-800 rounded-lg px-4 py-2">{error}</div>
        )}

        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className={`flex items-center gap-2 px-6 py-2.5 text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 ${
              saved ? 'bg-green-700 text-white' : 'bg-red-700 hover:bg-red-600 text-white'
            }`}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}
