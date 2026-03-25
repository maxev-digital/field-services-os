'use client'

import { useState, useEffect, useCallback } from 'react'
import { Clock, Play, Pause, Save, RefreshCw, CheckCircle, XCircle, SkipForward } from 'lucide-react'

interface SchedulerConfig {
  id: string
  is_paused: boolean
  daily_cap: number
  contact_cooldown_days: number
  template_slug: string | null
  last_run_at: string | null
  last_run_sent: number
  last_run_failed: number
  last_run_skipped: number
  total_sent_alltime: number
}

interface OutreachRun {
  id: string
  run_at: string
  sent_count: number
  failed_count: number
  skipped_count: number
  duration_ms: number | null
  triggered_by: string
}

interface Template {
  id: string
  slug: string
  variant: string
}

export default function AutomationPage() {
  const [config, setConfig] = useState<SchedulerConfig | null>(null)
  const [runs, setRuns] = useState<OutreachRun[]>([])
  const [queueDepth, setQueueDepth] = useState(0)
  const [templates, setTemplates] = useState<Template[]>([])
  const [localConfig, setLocalConfig] = useState<Partial<SchedulerConfig>>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const load = useCallback(async () => {
    const [schedRes, tmplRes] = await Promise.all([
      fetch('/api/admin/outreach/scheduler'),
      fetch('/api/admin/templates'),
    ])
    const schedData = await schedRes.json()
    const tmplData = await tmplRes.json()
    setConfig(schedData.config)
    setRuns(schedData.recentRuns)
    setQueueDepth(schedData.queueDepth)
    setLocalConfig(schedData.config)
    setTemplates(tmplData.filter((t: Template & { is_active: boolean }) => t.is_active))
  }, [])

  useEffect(() => { load() }, [load])

  const handleSave = async () => {
    setSaving(true)
    await fetch('/api/admin/outreach/scheduler', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(localConfig),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    load()
  }

  const togglePause = async () => {
    if (!config) return
    await fetch('/api/admin/outreach/scheduler', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_paused: !config.is_paused }),
    })
    load()
  }

  const triggerManual = async () => {
    if (!confirm('Trigger a manual outreach run now?')) return
    const secret = process.env.NEXT_PUBLIC_CRON_SECRET || ''
    const res = await fetch(`/api/admin/outreach/cron?secret=${secret}`)
    const data = await res.json()
    alert(`Run complete: ${data.sent} sent, ${data.failed} failed, ${data.skipped} skipped`)
    load()
  }

  if (!config) return <div className="text-gray-400 py-12 text-center">Loading...</div>

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Clock className="h-7 w-7 text-red-600" />
            Outreach Automation
          </h1>
          <p className="text-sm text-gray-500 mt-1">Configure daily automated prospect emails</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={triggerManual}
            className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
          >
            <RefreshCw className="h-4 w-4" /> Run Now
          </button>
          <button
            onClick={togglePause}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${
              config.is_paused
                ? 'bg-green-600 text-white hover:bg-green-700'
                : 'bg-amber-500 text-white hover:bg-amber-600'
            }`}
          >
            {config.is_paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
            {config.is_paused ? 'Resume' : 'Pause'}
          </button>
        </div>
      </div>

      {/* Status banner */}
      <div className={`rounded-xl p-4 flex items-center gap-3 ${
        config.is_paused
          ? 'bg-amber-50 border border-amber-200'
          : 'bg-green-50 border border-green-200'
      }`}>
        <div className={`h-3 w-3 rounded-full ${config.is_paused ? 'bg-amber-400' : 'bg-green-500 animate-pulse'}`} />
        <div>
          <p className={`font-semibold ${config.is_paused ? 'text-amber-800' : 'text-green-800'}`}>
            {config.is_paused ? 'Automation Paused' : 'Automation Active'}
          </p>
          <p className={`text-sm ${config.is_paused ? 'text-amber-600' : 'text-green-600'}`}>
            {config.is_paused
              ? 'No emails will be sent until resumed.'
              : `Sending up to ${config.daily_cap} emails/day · ${queueDepth} in queue`}
          </p>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Total Sent (All Time)</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{config.total_sent_alltime.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Queue Depth</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{queueDepth.toLocaleString()}</p>
          <p className="text-xs text-gray-400 mt-0.5">NEW with email</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Last Run</p>
          <p className="text-lg font-bold text-gray-900 mt-1">
            {config.last_run_at ? new Date(config.last_run_at).toLocaleDateString() : '—'}
          </p>
          {config.last_run_at && (
            <p className="text-xs text-gray-400">{config.last_run_sent} sent · {config.last_run_failed} failed</p>
          )}
        </div>
      </div>

      {/* Config */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h2 className="font-semibold text-gray-900">Configuration</h2>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Daily Email Cap</label>
            <input
              type="number"
              min={1}
              max={500}
              value={localConfig.daily_cap ?? config.daily_cap}
              onChange={(e) => setLocalConfig((p) => ({ ...p, daily_cap: parseInt(e.target.value) }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            />
            <p className="text-xs text-gray-400 mt-1">Max emails to send per cron trigger</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Re-contact Cooldown (days)</label>
            <input
              type="number"
              min={1}
              max={90}
              value={localConfig.contact_cooldown_days ?? config.contact_cooldown_days}
              onChange={(e) => setLocalConfig((p) => ({ ...p, contact_cooldown_days: parseInt(e.target.value) }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            />
            <p className="text-xs text-gray-400 mt-1">Days before re-contacting a NO_RESPONSE prospect</p>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Default Template</label>
          <select
            value={localConfig.template_slug ?? config.template_slug ?? ''}
            onChange={(e) => setLocalConfig((p) => ({ ...p, template_slug: e.target.value || null }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
          >
            <option value="">— Use first active template —</option>
            {templates.map((t) => (
              <option key={t.slug} value={t.slug}>{t.variant} ({t.slug})</option>
            ))}
          </select>
        </div>

        <div className="flex justify-end pt-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {saved ? 'Saved!' : saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>

      {/* Cron setup instructions */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-900 mb-3">Cron Endpoint</h2>
        <p className="text-sm text-gray-600 mb-2">
          Point an external cron (cron-job.org, uptime robot, server cron) at this URL daily:
        </p>
        <code className="block bg-gray-100 rounded-lg p-3 text-sm font-mono text-gray-700 break-all">
          https://admin.roofworksoftexas.com/api/admin/outreach/cron?secret=YOUR_CRON_SECRET
        </code>
        <p className="text-xs text-gray-400 mt-2">Set CRON_SECRET in your VPS .env file.</p>
      </div>

      {/* Run history */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Run History</h2>
        </div>
        {runs.length === 0 ? (
          <div className="py-10 text-center text-gray-400">No runs yet. Trigger a run to see results here.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-5 py-3 text-left font-medium text-gray-700">Date</th>
                <th className="px-5 py-3 text-left font-medium text-gray-700">Triggered By</th>
                <th className="px-5 py-3 text-center font-medium text-gray-700">Sent</th>
                <th className="px-5 py-3 text-center font-medium text-gray-700">Failed</th>
                <th className="px-5 py-3 text-center font-medium text-gray-700">Skipped</th>
                <th className="px-5 py-3 text-right font-medium text-gray-700">Duration</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {runs.map((run) => (
                <tr key={run.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3 text-gray-900">
                    {new Date(run.run_at).toLocaleString()}
                  </td>
                  <td className="px-5 py-3 text-gray-500 capitalize">{run.triggered_by}</td>
                  <td className="px-5 py-3 text-center">
                    <span className="inline-flex items-center gap-1 text-green-700">
                      <CheckCircle className="h-3.5 w-3.5" />{run.sent_count}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-center">
                    {run.failed_count > 0 ? (
                      <span className="inline-flex items-center gap-1 text-red-600">
                        <XCircle className="h-3.5 w-3.5" />{run.failed_count}
                      </span>
                    ) : <span className="text-gray-400">0</span>}
                  </td>
                  <td className="px-5 py-3 text-center">
                    {run.skipped_count > 0 ? (
                      <span className="inline-flex items-center gap-1 text-gray-500">
                        <SkipForward className="h-3.5 w-3.5" />{run.skipped_count}
                      </span>
                    ) : <span className="text-gray-400">0</span>}
                  </td>
                  <td className="px-5 py-3 text-right text-gray-500">
                    {run.duration_ms != null ? `${(run.duration_ms / 1000).toFixed(1)}s` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
