'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Send, ChevronRight, CheckCircle, Users, FileText, Mail, AlertCircle } from 'lucide-react'

interface Prospect {
  id: string
  name: string | null
  address: string
  city: string
  email: string | null
  status: string
}

interface Template {
  id: string
  slug: string
  subject: string
  variant: string
  category: string
}

interface SendResult {
  sent: number
  failed: number
  skipped: number
  results: { id: string; status: string; error?: string }[]
}

function CampaignSenderInner() {
  const searchParams = useSearchParams()
  const idsParam = searchParams.get('ids')

  const [step, setStep] = useState(idsParam ? 2 : 1) // skip to step 2 if ids pre-loaded
  const [prospects, setProspects] = useState<Prospect[]>([])
  const [allProspects, setAllProspects] = useState<Prospect[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    idsParam ? new Set(idsParam.split(',')) : new Set()
  )
  const [templates, setTemplates] = useState<Template[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null)
  const [mailbox, setMailbox] = useState(1)
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<SendResult | null>(null)
  const [progress, setProgress] = useState(0)
  const [statusFilter, setStatusFilter] = useState('NEW')

  const loadProspects = useCallback(async () => {
    const params = new URLSearchParams({ limit: '200', status: statusFilter })
    const res = await fetch(`/api/admin/prospects?${params}`)
    const data = await res.json()
    const withEmail = (data.prospects || []).filter((p: Prospect) => p.email)
    setAllProspects(withEmail)
    if (idsParam) {
      setProspects(withEmail.filter((p: Prospect) => idsParam.split(',').includes(p.id)))
    } else {
      setProspects(withEmail)
    }
  }, [statusFilter, idsParam])

  const loadTemplates = useCallback(async () => {
    const res = await fetch('/api/admin/templates')
    const data = await res.json()
    setTemplates(data.filter((t: Template & { is_active: boolean }) => t.is_active))
  }, [])

  useEffect(() => { loadProspects(); loadTemplates() }, [loadProspects, loadTemplates])

  const toggleProspect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (selectedIds.size === prospects.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(prospects.map((p) => p.id)))
    }
  }

  const handleSend = async () => {
    if (!selectedTemplate) return
    setSending(true)
    setProgress(10)
    const interval = setInterval(() => setProgress((p) => Math.min(p + 5, 90)), 400)

    try {
      const res = await fetch('/api/admin/outreach/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prospect_ids: [...selectedIds],
          template_id: selectedTemplate.id,
          mailbox,
        }),
      })
      const data = await res.json()
      clearInterval(interval)
      setProgress(100)
      setResult(data)
      setStep(5)
    } catch {
      clearInterval(interval)
      setProgress(0)
      setSending(false)
    }
  }

  const steps = [
    { n: 1, label: 'Select Prospects' },
    { n: 2, label: 'Choose Template' },
    { n: 3, label: 'Sender' },
    { n: 4, label: 'Send' },
  ]

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Send className="h-7 w-7 text-red-600" />
          Campaign Sender
        </h1>
        <p className="text-sm text-gray-500 mt-1">Bulk email to storm prospects</p>
      </div>

      {/* Progress stepper */}
      {step < 5 && (
        <div className="flex items-center gap-2">
          {steps.map((s, i) => (
            <div key={s.n} className="flex items-center gap-2">
              <div className={`flex items-center justify-center w-7 h-7 rounded-full text-sm font-bold ${
                step > s.n ? 'bg-green-500 text-white' :
                step === s.n ? 'bg-red-600 text-white' : 'bg-gray-200 text-gray-500'
              }`}>
                {step > s.n ? <CheckCircle className="h-4 w-4" /> : s.n}
              </div>
              <span className={`text-sm ${step === s.n ? 'font-semibold text-gray-900' : 'text-gray-500'}`}>{s.label}</span>
              {i < steps.length - 1 && <ChevronRight className="h-4 w-4 text-gray-300 ml-1" />}
            </div>
          ))}
        </div>
      )}

      {/* Step 1: Select prospects */}
      {step === 1 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Users className="h-5 w-5 text-gray-500" />
              <span className="font-semibold text-gray-900">Prospects with email</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="text-sm border border-gray-300 rounded-lg px-2 py-1"
              >
                <option value="NEW">New Only</option>
                <option value="">All Statuses</option>
                <option value="NO_RESPONSE">No Response</option>
              </select>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500">{selectedIds.size} selected</span>
              <button onClick={toggleAll} className="text-sm text-red-600 hover:text-red-700 font-medium">
                {selectedIds.size === prospects.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>
          </div>
          <div className="max-h-96 overflow-y-auto divide-y divide-gray-100">
            {prospects.map((p) => (
              <label key={p.id} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedIds.has(p.id)}
                  onChange={() => toggleProspect(p.id)}
                  className="rounded border-gray-300 text-red-600 focus:ring-red-500"
                />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 text-sm">{p.name || '(No name)'}</p>
                  <p className="text-xs text-gray-500">{p.address}, {p.city} · {p.email}</p>
                </div>
                <span className="text-xs text-gray-400">{p.status}</span>
              </label>
            ))}
            {prospects.length === 0 && (
              <div className="py-12 text-center text-gray-400">No prospects with email found for this filter.</div>
            )}
          </div>
          <div className="px-5 py-4 border-t border-gray-100 flex justify-end">
            <button
              onClick={() => setStep(2)}
              disabled={selectedIds.size === 0}
              className="flex items-center gap-2 px-5 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
            >
              Next: Choose Template <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Choose template */}
      {step === 2 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
            <FileText className="h-5 w-5 text-gray-500" />
            <span className="font-semibold text-gray-900">Choose Email Template</span>
          </div>
          <div className="divide-y divide-gray-100">
            {templates.map((t) => (
              <label key={t.id} className="flex items-start gap-3 px-5 py-4 hover:bg-gray-50 cursor-pointer">
                <input
                  type="radio"
                  name="template"
                  checked={selectedTemplate?.id === t.id}
                  onChange={() => setSelectedTemplate(t)}
                  className="mt-0.5 text-red-600 focus:ring-red-500"
                />
                <div>
                  <p className="font-medium text-gray-900">{t.variant}</p>
                  <p className="text-sm text-gray-500">{t.subject}</p>
                  <span className="text-xs text-gray-400 font-mono">{t.slug}</span>
                </div>
              </label>
            ))}
            {templates.length === 0 && (
              <div className="py-12 text-center text-gray-400">No active templates. Create one in Email Templates.</div>
            )}
          </div>
          <div className="px-5 py-4 border-t border-gray-100 flex justify-between">
            <button onClick={() => setStep(1)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
              Back
            </button>
            <button
              onClick={() => setStep(3)}
              disabled={!selectedTemplate}
              className="flex items-center gap-2 px-5 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
            >
              Next: Sender <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Sender */}
      {step === 3 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div className="flex items-center gap-3 mb-2">
            <Mail className="h-5 w-5 text-gray-500" />
            <span className="font-semibold text-gray-900">Select Sender Mailbox</span>
          </div>
          <label className="flex items-center gap-3 p-4 border border-gray-200 rounded-xl cursor-pointer hover:border-red-300">
            <input
              type="radio"
              name="mailbox"
              value={1}
              checked={mailbox === 1}
              onChange={() => setMailbox(1)}
              className="text-red-600 focus:ring-red-500"
            />
            <div>
              <p className="font-medium text-gray-900">info@roofworksoftexas.com</p>
              <p className="text-sm text-gray-500">Primary mailbox · Hostinger SMTP</p>
            </div>
          </label>

          {/* Summary */}
          <div className="mt-4 p-4 bg-gray-50 rounded-xl text-sm space-y-1">
            <p className="font-medium text-gray-900 mb-2">Campaign Summary</p>
            <p className="text-gray-600"><span className="font-medium">{selectedIds.size}</span> prospects selected</p>
            <p className="text-gray-600">Template: <span className="font-medium">{selectedTemplate?.variant}</span></p>
            <p className="text-gray-600">Subject: <span className="font-medium">{selectedTemplate?.subject}</span></p>
            <p className="text-gray-600">From: <span className="font-medium">info@roofworksoftexas.com</span></p>
          </div>

          <div className="flex justify-between pt-2">
            <button onClick={() => setStep(2)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
              Back
            </button>
            <button
              onClick={() => setStep(4)}
              className="flex items-center gap-2 px-5 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700"
            >
              Review &amp; Send <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Confirm & Send */}
      {step === 4 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-amber-500" />
            <span className="font-semibold text-gray-900">Ready to Send</span>
          </div>
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
            You are about to send <strong>{selectedIds.size}</strong> emails using template{' '}
            <strong>{selectedTemplate?.variant}</strong> from <strong>info@roofworksoftexas.com</strong>.
            This action cannot be undone.
          </div>

          {sending && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm text-gray-600">
                <span>Sending emails...</span>
                <span>{progress}%</span>
              </div>
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-red-600 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          <div className="flex justify-between">
            <button onClick={() => setStep(3)} disabled={sending} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50">
              Back
            </button>
            <button
              onClick={handleSend}
              disabled={sending}
              className="flex items-center gap-2 px-6 py-2 bg-red-600 text-white rounded-lg text-sm font-bold hover:bg-red-700 disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              {sending ? 'Sending...' : `Send ${selectedIds.size} Emails`}
            </button>
          </div>
        </div>
      )}

      {/* Step 5: Results */}
      {step === 5 && result && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
          <div className="flex items-center gap-3">
            <CheckCircle className="h-6 w-6 text-green-500" />
            <span className="text-xl font-bold text-gray-900">Campaign Complete</span>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="p-4 bg-green-50 border border-green-200 rounded-xl text-center">
              <p className="text-3xl font-bold text-green-700">{result.sent}</p>
              <p className="text-sm text-green-600 mt-1">Sent</p>
            </div>
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-center">
              <p className="text-3xl font-bold text-red-700">{result.failed}</p>
              <p className="text-sm text-red-600 mt-1">Failed</p>
            </div>
            <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl text-center">
              <p className="text-3xl font-bold text-gray-700">{result.skipped}</p>
              <p className="text-sm text-gray-600 mt-1">Skipped (no email)</p>
            </div>
          </div>
          <div className="flex gap-3">
            <a href="/admin/prospects" className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
              View Prospects
            </a>
            <button
              onClick={() => { setStep(1); setResult(null); setSelectedIds(new Set()); setSelectedTemplate(null); setSending(false); setProgress(0) }}
              className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700"
            >
              Send Another Campaign
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function CampaignSenderPage() {
  return (
    <Suspense fallback={<div className="text-gray-400 py-12 text-center">Loading...</div>}>
      <CampaignSenderInner />
    </Suspense>
  )
}
