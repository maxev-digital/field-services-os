'use client';

import { useState } from 'react';
import { Settings, Phone, Mail, Globe, MapPin, Shield, Save, Star } from 'lucide-react';

export default function SettingsPage() {
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

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
            {[
              { label: 'Business Name', value: 'Roof Works of Texas', key: 'name' },
              { label: 'Phone', value: '214-795-3905', key: 'phone' },
              { label: 'Email', value: 'info@roofworksoftexas.com', key: 'email' },
              { label: 'Website', value: 'roofworksoftexas.com', key: 'website' },
              { label: 'Service Area', value: 'DFW Metroplex', key: 'service_area' },
              { label: 'License #', value: '', key: 'license' },
            ].map(({ label, value, key }) => (
              <div key={key}>
                <label className="text-xs text-gray-400 mb-1 block">{label}</label>
                <input defaultValue={value}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white focus:outline-none focus:border-red-500" />
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
              defaultValue=""
              placeholder="https://g.page/r/YOUR_REVIEW_LINK"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white focus:outline-none focus:border-red-500" />
            <p className="text-xs text-gray-500 mt-1.5">Find this in Google Business Profile → Share review form</p>
          </div>
        </div>

        {/* Notifications */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
            <Mail className="w-3.5 h-3.5" /> Notification Settings
          </h2>
          <div className="space-y-3">
            {[
              { label: 'New estimate submitted', desc: 'Get notified when a customer submits an estimate via the website tool' },
              { label: 'Job status changed', desc: 'Alert when a job moves through pipeline stages' },
              { label: 'Insurance claim updated', desc: 'Alert when claim status changes' },
            ].map(({ label, desc }) => (
              <div key={label} className="flex items-start justify-between gap-4 py-2 border-b border-gray-700/50 last:border-0">
                <div>
                  <div className="text-sm text-white">{label}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{desc}</div>
                </div>
                <label className="flex-shrink-0 relative inline-flex items-center cursor-pointer mt-0.5">
                  <input type="checkbox" defaultChecked className="sr-only peer" />
                  <div className="w-9 h-5 bg-gray-600 peer-checked:bg-red-600 rounded-full transition-colors" />
                  <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-4" />
                </label>
              </div>
            ))}
          </div>
        </div>

        {/* Admin Accounts */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
            <Shield className="w-3.5 h-3.5" /> Admin Account
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">New Password</label>
              <input type="password" placeholder="Leave blank to keep current"
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white focus:outline-none focus:border-red-500" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Confirm Password</label>
              <input type="password"
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white focus:outline-none focus:border-red-500" />
            </div>
          </div>
        </div>

        {/* System Info */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
            <Settings className="w-3.5 h-3.5" /> System Info
          </h2>
          <div className="grid grid-cols-2 gap-3 text-sm">
            {[
              { label: 'Platform', value: 'Roof Works Admin v1.0' },
              { label: 'Database', value: 'PostgreSQL (Docker)' },
              { label: 'Server', value: 'VPS — 72.60.43.168' },
              { label: 'Port', value: '3020 (PM2: roof-works-admin)' },
              { label: 'Domain', value: 'admin.roofworksoftexas.com' },
              { label: 'Public API', value: '/api/estimates — connected to estimator tool' },
            ].map(({ label, value }) => (
              <div key={label} className="flex gap-3">
                <span className="text-gray-500 w-28 flex-shrink-0">{label}</span>
                <span className="text-gray-300">{value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end">
          <button onClick={handleSave}
            className={`flex items-center gap-2 px-6 py-2.5 text-sm font-semibold rounded-lg transition-colors ${
              saved ? 'bg-green-700 text-white' : 'bg-red-700 hover:bg-red-600 text-white'
            }`}>
            <Save className="w-4 h-4" />
            {saved ? 'Saved!' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}
