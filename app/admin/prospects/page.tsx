'use client'

import { useState, useEffect, Fragment } from 'react'
import {
  ChevronDown, ChevronRight, Mail, Phone, Save, Send, MapPin, Download, UserPlus, X,
} from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────────────────

type ProspectStatus = 'NEW' | 'CONTACTED' | 'NO_RESPONSE' | 'INTERESTED' | 'CONVERTED' | 'DNC'

interface Prospect {
  id: string
  name: string
  address: string
  city: string
  zip: string | null
  email: string | null
  phone: string | null
  damage_type: string | null
  neighborhood: string | null
  source: string | null
  status: ProspectStatus
  notes: string | null
  last_contacted_at: string | null
  created_at: string
  _count?: { outreach_history: number }
}

interface Template {
  id: string
  slug: string
  name: string
  subject: string
  body: string
  category: string | null
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DFW_CITIES = [
  'Plano', 'Frisco', 'McKinney', 'Allen', 'Richardson', 'Garland', 'Mesquite',
  'Irving', 'Carrollton', 'Lewisville', 'Flower Mound', 'Denton', 'Grand Prairie',
  'Arlington', 'Euless', 'Bedford', 'Hurst', 'Grapevine', 'Coppell', 'Southlake',
  'Keller', 'North Richland Hills', 'Colleyville', 'Mansfield', 'Rowlett',
  'Wylie', 'Sachse', 'Murphy', 'Fate', 'Rockwall', 'Forney', 'Prosper', 'Celina',
]

const DAMAGE_TYPES = ['Hail', 'Wind', 'Fire', 'Water', 'Storm']

const NEIGHBORHOODS = [
  'Stonebriar', 'Legacy', 'Starwood', 'Willow Bend', 'Lakewood', 'Preston Hollow',
  'Bent Tree', 'Eldorado', 'Fairview', 'Twin Creeks',
]

const SOURCES = ['Storm Report', 'Door Knock', 'Referral', 'Permit Pull', 'Insurance Lead', 'Web Form', 'Other']

const OUTREACH_STATUSES: { value: ProspectStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All Statuses' },
  { value: 'NEW', label: 'New' },
  { value: 'CONTACTED', label: 'Contacted' },
  { value: 'NO_RESPONSE', label: 'No Response' },
  { value: 'INTERESTED', label: 'Interested' },
  { value: 'CONVERTED', label: 'Converted' },
  { value: 'DNC', label: 'Do Not Contact' },
]

function statusStyle(status: ProspectStatus) {
  switch (status) {
    case 'NEW': return 'bg-blue-900/60 text-blue-300 border border-blue-700'
    case 'CONTACTED': return 'bg-yellow-900/60 text-yellow-300 border border-yellow-700'
    case 'NO_RESPONSE': return 'bg-gray-700 text-gray-400 border border-gray-600'
    case 'INTERESTED': return 'bg-green-900/60 text-green-300 border border-green-700'
    case 'CONVERTED': return 'bg-emerald-900/60 text-emerald-300 border border-emerald-600'
    case 'DNC': return 'bg-red-900/60 text-red-400 border border-red-700'
    default: return 'bg-gray-700 text-gray-400'
  }
}

function formatPhone(p: string | null) {
  if (!p) return ''
  const d = p.replace(/\D/g, '')
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
  return p
}

// ── ExpandedRow ───────────────────────────────────────────────────────────────

function ExpandedRow({
  prospect,
  templates,
  onSave,
}: {
  prospect: Prospect
  templates: Template[]
  onSave: (updated: Partial<Prospect>) => void
}) {
  // CRM fields
  const [status, setStatus] = useState<ProspectStatus>(prospect.status)
  const [notes, setNotes] = useState(prospect.notes || '')
  const [email, setEmail] = useState(prospect.email || '')
  const [phone, setPhone] = useState(prospect.phone || '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Send panel
  const [sendTab, setSendTab] = useState<'email' | 'phone'>('email')
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [toEmail, setToEmail] = useState(prospect.email || '')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [copiedScript, setCopiedScript] = useState<number | null>(null)

  const firstName = prospect.name.trim().split(' ')[0]

  const PHONE_SCRIPTS = [
    {
      label: 'Initial Outreach',
      text: `Hi, may I speak with ${firstName}? ... Hi ${firstName}, my name is [Your Name] with Roof Works of Texas. We're reaching out to homeowners in ${prospect.city} whose properties may have suffered storm damage. I noticed your address at ${prospect.address} — have you had your roof inspected since the last storm? We offer free inspections with no obligation. Can I schedule one for you?`,
    },
    {
      label: 'Insurance Claim Angle',
      text: `Hi ${firstName}, this is [Your Name] from Roof Works of Texas. We specialize in helping homeowners navigate the insurance claims process for storm damage. Many homes in ${prospect.city} qualified for full roof replacements at no out-of-pocket cost. Would you like us to do a free inspection to see if you qualify?`,
    },
    {
      label: 'Follow-up Call',
      text: `Hi ${firstName}, this is [Your Name] calling from Roof Works of Texas — I'm following up from my earlier call. I wanted to check if you had a chance to think about that free roof inspection. Damage from the recent storms can worsen over time, and we'd hate for your home to develop leaks. Could we schedule even a quick 15-minute visit?`,
    },
    {
      label: 'Voicemail Script',
      text: `Hi, this message is for ${firstName} at ${prospect.address}. This is [Your Name] with Roof Works of Texas. We're offering free storm damage inspections for homeowners in ${prospect.city}. Please call us back at (214) 795-3905 to schedule yours — no obligation, completely free. Again, that's (214) 795-3905. Thank you!`,
    },
  ]

  const copyScript = (text: string, idx: number) => {
    navigator.clipboard.writeText(text)
    setCopiedScript(idx)
    setTimeout(() => setCopiedScript(null), 2000)
  }

  const loadTemplate = (id: string) => {
    setSelectedTemplateId(id)
    const t = templates.find(t => t.id === id)
    if (t) {
      const vars: Record<string, string> = {
        name: prospect.name || 'Homeowner',
        address: prospect.address,
        city: prospect.city,
        phone: prospect.phone || '',
      }
      const sub = (t.subject || '').replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '')
      const bd = (t.body || '').replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '')
      setSubject(sub)
      setBody(bd)
    }
  }

  const sendEmail = async () => {
    if (!toEmail || !subject || !body || !selectedTemplateId) return
    setSending(true)
    setSendResult(null)
    try {
      const res = await fetch('/api/admin/outreach/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prospect_ids: [prospect.id],
          template_id: selectedTemplateId,
          mailbox: 1,
          custom_subject: subject,
          custom_body: body,
        }),
      })
      const data = await res.json()
      if (data.sent > 0) {
        setSendResult({ ok: true, msg: `Sent to ${toEmail}` })
        onSave({ status: 'CONTACTED', last_contacted_at: new Date().toISOString() })
        setStatus('CONTACTED')
      } else {
        setSendResult({ ok: false, msg: data.results?.[0]?.error || 'Send failed' })
      }
    } catch (e: unknown) {
      setSendResult({ ok: false, msg: (e as Error).message })
    } finally {
      setSending(false)
    }
  }

  const save = async () => {
    setSaving(true)
    try {
      const payload: Partial<Prospect> = { status, notes }
      if (email !== (prospect.email || '')) payload.email = email
      if (phone !== (prospect.phone || '')) payload.phone = phone
      const res = await fetch(`/api/admin/prospects/${prospect.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        onSave({ status, notes, email, phone })
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <tr className="bg-gray-900 border-b border-gray-700">
      <td colSpan={8} className="px-6 py-6">

        {/* CRM Grid */}
        <div className="grid grid-cols-12 gap-6">

          {/* Left — Property info */}
          <div className="col-span-4 space-y-4">
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Property Address</p>
              <div className="flex items-center gap-2 bg-gray-800 rounded border border-gray-600 px-3 py-2.5">
                <span className="text-sm text-blue-400 break-all flex-1">{prospect.address}, {prospect.city}</span>
                <button
                  onClick={() => navigator.clipboard.writeText(`${prospect.address}, ${prospect.city}`)}
                  className="text-xs text-gray-500 hover:text-white shrink-0 font-bold transition-colors"
                >
                  Copy
                </button>
              </div>
            </div>
            {prospect.damage_type && (
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Damage Type</p>
                <p className="text-sm text-orange-400 font-semibold">{prospect.damage_type}</p>
              </div>
            )}
            {prospect.neighborhood && (
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Neighborhood</p>
                <p className="text-sm text-gray-300">{prospect.neighborhood}</p>
              </div>
            )}
            {prospect.source && (
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Source</p>
                <p className="text-sm text-gray-300">{prospect.source}</p>
              </div>
            )}
            {prospect.last_contacted_at && (
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Last Contacted</p>
                <p className="text-sm text-gray-300">{new Date(prospect.last_contacted_at).toLocaleDateString()}</p>
              </div>
            )}
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Emails Sent</p>
              <p className="text-sm text-gray-300">{prospect._count?.outreach_history ?? 0}</p>
            </div>
          </div>

          {/* Middle — Contact info */}
          <div className="col-span-4 space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Contact Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="homeowner@email.com"
                className="w-full text-sm px-3 py-2.5 bg-gray-800 border border-gray-600 rounded text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-yellow-400"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Phone Number</label>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="(214) 555-1234"
                className="w-full text-sm px-3 py-2.5 bg-gray-800 border border-gray-600 rounded text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-yellow-400"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Outreach Status</label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value as ProspectStatus)}
                className="w-full text-sm px-3 py-2.5 bg-gray-800 border border-gray-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-yellow-400"
              >
                {OUTREACH_STATUSES.filter(s => s.value !== 'all').map(s => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Right — Notes + Save */}
          <div className="col-span-4 flex flex-col gap-4">
            <div className="flex-1">
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Notes</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Left voicemail, spoke with spouse, call back Thursday..."
                rows={5}
                className="w-full text-sm px-3 py-2.5 bg-gray-800 border border-gray-600 rounded text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-yellow-400 resize-none"
              />
            </div>
            <button
              onClick={save}
              disabled={saving}
              className="flex items-center justify-center gap-2 px-4 py-3 bg-green-600 text-white text-sm font-black rounded hover:bg-green-500 transition-colors disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : saved ? 'Saved!' : 'Save'}
            </button>
          </div>
        </div>

        {/* Send Panel */}
        <div className="mt-6 pt-6 border-t border-gray-600">
          <div className="flex items-center gap-2 mb-5">
            <button
              onClick={() => setSendTab('email')}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-bold rounded transition-colors ${sendTab === 'email' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400 hover:text-white'}`}
            >
              <Mail className="w-4 h-4" /> Email
            </button>
            <button
              onClick={() => setSendTab('phone')}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-bold rounded transition-colors ${sendTab === 'phone' ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-400 hover:text-white'}`}
            >
              <Phone className="w-4 h-4" /> Phone Scripts
            </button>
            {prospect.phone && (
              <span className="ml-3 text-sm font-mono text-gray-400">{formatPhone(prospect.phone)}</span>
            )}
          </div>

          {/* Email Compose */}
          {sendTab === 'email' && (
            <div className="grid grid-cols-12 gap-5">
              <div className="col-span-4 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Template</label>
                  <select
                    value={selectedTemplateId}
                    onChange={e => loadTemplate(e.target.value)}
                    className="w-full text-sm px-3 py-2.5 bg-gray-800 border border-gray-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">-- Select template --</option>
                    {templates.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Send To</label>
                  <input
                    type="email"
                    value={toEmail}
                    onChange={e => setToEmail(e.target.value)}
                    placeholder="homeowner@email.com"
                    className="w-full text-sm px-3 py-2.5 bg-gray-800 border border-gray-600 rounded text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Send From</label>
                  <div className="w-full text-sm px-3 py-2.5 bg-gray-800 border border-gray-600 rounded text-gray-400">
                    info@roofworksoftexas.com
                  </div>
                </div>
                <div className="bg-gray-800 border border-gray-700 rounded p-3">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Available Variables</p>
                  <div className="space-y-1 text-xs font-mono text-gray-400">
                    <div>{'{{name}}'} — homeowner name</div>
                    <div>{'{{address}}'} — property address</div>
                    <div>{'{{city}}'} — city</div>
                    <div>{'{{phone}}'} — phone number</div>
                  </div>
                </div>
              </div>
              <div className="col-span-8 space-y-3">
                <input
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  placeholder="Subject line"
                  className="w-full text-sm px-3 py-2.5 bg-gray-800 border border-gray-600 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <textarea
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  rows={9}
                  placeholder="Email body (HTML supported)"
                  className="w-full text-base px-3 py-2.5 bg-gray-800 border border-gray-600 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none leading-relaxed font-mono"
                />
                <div className="flex items-center gap-3">
                  <button
                    onClick={sendEmail}
                    disabled={sending || !toEmail || !subject || !body || !selectedTemplateId}
                    className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-black rounded hover:bg-blue-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Send className="w-4 h-4" />
                    {sending ? 'Sending...' : 'Send Email'}
                  </button>
                  {sendResult && (
                    <span className={`text-sm font-semibold ${sendResult.ok ? 'text-green-400' : 'text-red-400'}`}>
                      {sendResult.msg}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Phone Scripts */}
          {sendTab === 'phone' && (
            <div>
              {prospect.phone ? (
                <div className="mb-4">
                  <a
                    href={`tel:${prospect.phone}`}
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white text-sm font-bold rounded hover:bg-green-500 transition-colors"
                  >
                    <Phone className="w-4 h-4" />
                    Call {formatPhone(prospect.phone)}
                  </a>
                </div>
              ) : (
                <p className="text-sm text-red-400 mb-4">No phone number on file</p>
              )}
              <div className="grid grid-cols-2 gap-4">
                {PHONE_SCRIPTS.map((script, idx) => (
                  <div key={idx} className="bg-gray-800 rounded border border-gray-700 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">{script.label}</span>
                      <button
                        onClick={() => copyScript(script.text, idx)}
                        className="text-xs font-bold text-blue-400 hover:text-blue-300 transition-colors"
                      >
                        {copiedScript === idx ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                    <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-line">{script.text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </td>
    </tr>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function StormProspects() {
  const [prospects, setProspects] = useState<Prospect[]>([])
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)

  // Filters
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [city, setCity] = useState('')
  const [damageType, setDamageType] = useState('')
  const [leadStatus, setLeadStatus] = useState('')
  const [hasEmail, setHasEmail] = useState(false)
  const [hasPhone, setHasPhone] = useState(false)
  const [neighborhood, setNeighborhood] = useState('')
  const [source, setSource] = useState('')

  // Table state
  const [expanded, setExpanded] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // Templates
  const [templates, setTemplates] = useState<Template[]>([])

  // Bulk send
  const [bulkTemplateId, setBulkTemplateId] = useState('')
  const [bulkSending, setBulkSending] = useState(false)
  const [bulkResult, setBulkResult] = useState<{ sent: number; failed: number; skipped: number } | null>(null)

  // Template editor
  const [templateEditorOpen, setTemplateEditorOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null)
  const [editSubject, setEditSubject] = useState('')
  const [editBody, setEditBody] = useState('')
  const [templateSaveResult, setTemplateSaveResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [templateSaving, setTemplateSaving] = useState(false)

  // Add/Import modals
  const [showAdd, setShowAdd] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [addForm, setAddForm] = useState({ name: '', address: '', city: 'Plano', zip: '', email: '', phone: '', damage_type: '', neighborhood: '', source: '' })
  const [importCsv, setImportCsv] = useState('')
  const [addSaving, setAddSaving] = useState(false)
  const [importSaving, setImportSaving] = useState(false)

  // Load templates on mount
  useEffect(() => {
    fetch('/api/admin/templates')
      .then(r => r.json())
      .then(d => {
        if (d.templates) {
          setTemplates(d.templates)
          if (d.templates.length > 0) setBulkTemplateId(d.templates[0].id)
        }
      })
      .catch(() => {})
  }, [])

  // Fetch prospects
  const fetchProspects = async (p = 1) => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(p), limit: '50' })
    if (search) params.set('search', search)
    if (city) params.set('city', city)
    if (damageType) params.set('damage_type', damageType)
    if (leadStatus && leadStatus !== 'all') params.set('status', leadStatus)
    if (hasEmail) params.set('has_email', '1')
    if (hasPhone) params.set('has_phone', '1')
    if (neighborhood) params.set('neighborhood', neighborhood)
    if (source) params.set('source', source)
    try {
      const res = await fetch(`/api/admin/prospects?${params}`)
      const d = await res.json()
      setProspects(d.prospects || [])
      setTotal(d.total || 0)
      setPages(d.pages || 1)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchProspects(page) }, [page]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleFind = () => {
    setSearch(searchInput)
    setPage(1)
    fetchProspects(1)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleFind()
  }

  // Selection
  const toggleAll = () => {
    if (selected.size === prospects.length && prospects.length > 0) {
      setSelected(new Set())
    } else {
      setSelected(new Set(prospects.map(p => p.id)))
    }
  }

  const toggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setSelected(prev => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  const toggleExpand = (id: string) => setExpanded(prev => prev === id ? null : id)

  const updateProspect = (id: string, updated: Partial<Prospect>) => {
    setProspects(prev => prev.map(p => p.id === id ? { ...p, ...updated } : p))
  }

  // CSV exports
  const dialerCsv = () => {
    const rows = prospects.filter(p => p.phone)
    if (!rows.length) { alert('No prospects with phone numbers'); return }
    const csv = ['Name,Phone,Address,City,Status', ...rows.map(p =>
      `"${p.name}","${formatPhone(p.phone)}","${p.address}","${p.city}","${p.status}"`
    )].join('\n')
    const a = document.createElement('a')
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv)
    a.download = `dialer-${Date.now()}.csv`
    a.click()
  }

  const emailCsv = () => {
    const rows = prospects.filter(p => p.email)
    if (!rows.length) { alert('No prospects with email addresses'); return }
    const csv = ['Name,Email,Address,City,Status', ...rows.map(p =>
      `"${p.name}","${p.email}","${p.address}","${p.city}","${p.status}"`
    )].join('\n')
    const a = document.createElement('a')
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv)
    a.download = `email-${Date.now()}.csv`
    a.click()
  }

  // Bulk send
  const sendAll = async () => {
    if (!bulkTemplateId) { alert('Select a template first'); return }
    const targets = selected.size > 0
      ? prospects.filter(p => selected.has(p.id))
      : prospects
    const emailTargets = targets.filter(p => p.email)
    if (!emailTargets.length) { alert('No prospects with email addresses'); return }
    if (!confirm(`Send template to ${emailTargets.length} prospects?`)) return
    setBulkSending(true)
    setBulkResult(null)
    try {
      const res = await fetch('/api/admin/outreach/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prospect_ids: emailTargets.map(p => p.id),
          template_id: bulkTemplateId,
          mailbox: 1,
        }),
      })
      const d = await res.json()
      setBulkResult({ sent: d.sent, failed: d.failed, skipped: d.skipped })
      fetchProspects(page)
    } catch {
      setBulkResult({ sent: 0, failed: emailTargets.length, skipped: 0 })
    } finally {
      setBulkSending(false)
    }
  }

  // Template editor
  const openTemplateEditor = (t: Template) => {
    setEditingTemplate(t)
    setEditSubject(t.subject)
    setEditBody(t.body)
  }

  const saveTemplate = async () => {
    if (!editingTemplate) return
    setTemplateSaving(true)
    try {
      const res = await fetch(`/api/admin/templates/${editingTemplate.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: editSubject, body: editBody }),
      })
      if (res.ok) {
        setTemplates(prev => prev.map(t => t.id === editingTemplate.id ? { ...t, subject: editSubject, body: editBody } : t))
        setEditingTemplate(prev => prev ? { ...prev, subject: editSubject, body: editBody } : null)
        setTemplateSaveResult({ ok: true, msg: `"${editingTemplate.name}" saved.` })
      } else {
        setTemplateSaveResult({ ok: false, msg: 'Save failed.' })
      }
    } catch {
      setTemplateSaveResult({ ok: false, msg: 'Network error.' })
    } finally {
      setTemplateSaving(false)
      setTimeout(() => setTemplateSaveResult(null), 3000)
    }
  }

  // Add prospect
  const addProspect = async () => {
    if (!addForm.name || !addForm.address) return
    setAddSaving(true)
    try {
      const res = await fetch('/api/admin/prospects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addForm),
      })
      if (res.ok) {
        setShowAdd(false)
        setAddForm({ name: '', address: '', city: 'Plano', zip: '', email: '', phone: '', damage_type: '', neighborhood: '', source: '' })
        fetchProspects(1)
        setPage(1)
      }
    } finally {
      setAddSaving(false)
    }
  }

  // Import CSV
  const importProspects = async () => {
    if (!importCsv.trim()) return
    setImportSaving(true)
    try {
      const res = await fetch('/api/admin/prospects/import', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: importCsv,
      })
      const d = await res.json()
      if (d.imported !== undefined) {
        setShowImport(false)
        setImportCsv('')
        fetchProspects(1)
        setPage(1)
        alert(`Imported ${d.imported} prospects.`)
      }
    } finally {
      setImportSaving(false)
    }
  }

  const emailCount = prospects.filter(p => p.email).length
  const phoneCount = prospects.filter(p => p.phone).length

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-950 p-6">
      <div className="max-w-screen-2xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-black text-white uppercase tracking-wide">Storm Prospects</h1>
            <p className="text-sm text-gray-500 mt-1">Homeowner outreach directory — DFW storm damage</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowImport(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-gray-700 text-white text-sm font-bold rounded hover:bg-gray-600 transition-colors"
            >
              <Download className="w-4 h-4" /> Import CSV
            </button>
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-red-600 text-white text-sm font-bold rounded hover:bg-red-500 transition-colors"
            >
              <UserPlus className="w-4 h-4" /> Add Prospect
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="bg-gray-900 border border-gray-700 rounded-lg px-5 py-4 mb-4">
          <div className="flex flex-wrap items-end gap-3">
            {/* Search */}
            <div className="flex-1 min-w-[220px]">
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Search</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={searchInput}
                  onChange={e => setSearchInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Name, address, email..."
                  className="flex-1 text-sm px-3 py-2.5 bg-gray-800 border border-gray-600 rounded text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-yellow-400"
                />
                <button
                  onClick={handleFind}
                  className="px-5 py-2.5 bg-yellow-500 text-black text-sm font-black rounded hover:bg-yellow-400 transition-colors"
                >
                  Find
                </button>
              </div>
            </div>

            {/* City */}
            <div className="w-44">
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">City</label>
              <select
                value={city}
                onChange={e => { setCity(e.target.value); setPage(1) }}
                className="w-full text-sm px-3 py-2.5 bg-gray-800 border border-gray-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-yellow-400"
              >
                <option value="">All Cities</option>
                {DFW_CITIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {/* Damage Type */}
            <div className="w-40">
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Damage Type</label>
              <select
                value={damageType}
                onChange={e => { setDamageType(e.target.value); setPage(1) }}
                className="w-full text-sm px-3 py-2.5 bg-gray-800 border border-gray-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-yellow-400"
              >
                <option value="">All Types</option>
                {DAMAGE_TYPES.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>

            {/* Lead Status */}
            <div className="w-44">
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Lead Status</label>
              <select
                value={leadStatus}
                onChange={e => { setLeadStatus(e.target.value); setPage(1) }}
                className="w-full text-sm px-3 py-2.5 bg-gray-800 border border-gray-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-yellow-400"
              >
                {OUTREACH_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>

            {/* Neighborhood */}
            <div className="w-44">
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Neighborhood</label>
              <select
                value={neighborhood}
                onChange={e => { setNeighborhood(e.target.value); setPage(1) }}
                className="w-full text-sm px-3 py-2.5 bg-gray-800 border border-gray-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-yellow-400"
              >
                <option value="">All</option>
                {NEIGHBORHOODS.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>

            {/* Source */}
            <div className="w-40">
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Source</label>
              <select
                value={source}
                onChange={e => { setSource(e.target.value); setPage(1) }}
                className="w-full text-sm px-3 py-2.5 bg-gray-800 border border-gray-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-yellow-400"
              >
                <option value="">All Sources</option>
                {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            {/* Checkboxes */}
            <div className="flex flex-col gap-2 pb-0.5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasEmail}
                  onChange={e => { setHasEmail(e.target.checked); setPage(1) }}
                  className="w-4 h-4 rounded accent-yellow-400"
                />
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">Has Email</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasPhone}
                  onChange={e => { setHasPhone(e.target.checked); setPage(1) }}
                  className="w-4 h-4 rounded accent-yellow-400"
                />
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">Has Phone</span>
              </label>
            </div>
          </div>
        </div>

        {/* Action Bar */}
        <div className="bg-gray-900 border border-gray-700 rounded-lg px-5 py-3 mb-4 flex items-center gap-5">
          <label className="flex items-center gap-2 cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={selected.size === prospects.length && prospects.length > 0}
              onChange={toggleAll}
              className="w-4 h-4 rounded accent-yellow-400"
            />
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">Select All</span>
          </label>
          <span className="text-sm text-gray-400">
            <span className="font-bold text-white">{prospects.length}</span> shown
            {' — '}
            <span className="font-bold text-white">{total.toLocaleString()}</span> total
            {selected.size > 0 && (
              <span className="ml-2 text-yellow-400 font-bold">({selected.size} selected)</span>
            )}
          </span>
          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={dialerCsv}
              className="flex items-center gap-2 px-4 py-2 bg-green-700 text-white text-sm font-bold rounded hover:bg-green-600 transition-colors"
            >
              <Phone className="w-4 h-4" />
              Dialer CSV ({phoneCount})
            </button>
            <button
              onClick={emailCsv}
              className="flex items-center gap-2 px-4 py-2 bg-blue-700 text-white text-sm font-bold rounded hover:bg-blue-600 transition-colors"
            >
              <Mail className="w-4 h-4" />
              Email CSV ({emailCount})
            </button>
          </div>
        </div>

        {/* Bulk Send Bar */}
        <div className="bg-gradient-to-r from-blue-900 to-blue-800 border border-blue-600 rounded-lg px-5 py-4 mb-4">
          <div className="flex items-center gap-4 flex-wrap">
            <span className="text-xs font-black text-blue-200 uppercase tracking-widest shrink-0">Bulk Email</span>

            {/* Template tabs */}
            <div className="flex items-center gap-1.5 flex-wrap flex-1">
              {templates.map(t => (
                <button
                  key={t.id}
                  onClick={() => setBulkTemplateId(t.id)}
                  className={`px-3 py-1.5 text-xs font-bold rounded transition-colors ${
                    bulkTemplateId === t.id
                      ? 'bg-white text-blue-900'
                      : 'bg-blue-700 text-blue-200 hover:bg-blue-600'
                  }`}
                >
                  {t.slug || t.name}
                </button>
              ))}
              {templates.length === 0 && (
                <span className="text-xs text-blue-400">No templates — create one in the Template Editor below</span>
              )}
            </div>

            {/* Channel */}
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-bold text-blue-300 uppercase tracking-wide">Channel</span>
              <span className="px-3 py-1.5 text-xs font-bold bg-blue-700 text-blue-200 rounded">Email</span>
            </div>

            {/* From */}
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-bold text-blue-300 uppercase tracking-wide">From</span>
              <span className="px-3 py-1.5 text-xs bg-blue-700 text-blue-200 rounded">info@roofworksoftexas.com</span>
            </div>

            {/* Send All button */}
            <button
              onClick={sendAll}
              disabled={bulkSending || !bulkTemplateId}
              className="flex items-center gap-2 px-5 py-2 bg-white text-blue-900 text-sm font-black rounded hover:bg-blue-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            >
              <Send className="w-4 h-4" />
              {bulkSending ? 'Sending...' : `Send All (${selected.size > 0 ? selected.size : emailCount})`}
            </button>
          </div>

          {bulkResult && (
            <div className="mt-3 text-sm text-blue-100">
              Done — <span className="text-green-300 font-bold">{bulkResult.sent} sent</span>
              {bulkResult.failed > 0 && <span className="text-red-300 font-bold ml-2">{bulkResult.failed} failed</span>}
              {bulkResult.skipped > 0 && <span className="text-gray-400 ml-2">{bulkResult.skipped} skipped (no email)</span>}
            </div>
          )}
        </div>

        {/* Master Template Editor */}
        <div className="bg-gradient-to-r from-teal-900 to-teal-800 rounded-lg border border-teal-600 px-5 py-4 mb-5">
          <button
            onClick={() => setTemplateEditorOpen(v => !v)}
            className="flex items-center justify-between w-full text-left"
          >
            <div className="flex items-center gap-3">
              <span className="text-lg font-black text-teal-100 uppercase tracking-wide">Master Template Editor</span>
              <span className="text-xs text-teal-300 font-medium">(Edit email templates)</span>
            </div>
            <ChevronDown className={`w-5 h-5 text-teal-200 transition-transform ${templateEditorOpen ? 'rotate-180' : ''}`} />
          </button>

          {templateEditorOpen && (
            <div className="mt-5 space-y-5">
              {/* Template tabs */}
              <div className="flex gap-2 flex-wrap">
                {templates.map(t => (
                  <button
                    key={t.id}
                    onClick={() => openTemplateEditor(t)}
                    className={`px-4 py-2 text-sm font-bold rounded transition-colors ${
                      editingTemplate?.id === t.id
                        ? 'bg-white text-teal-900'
                        : 'bg-teal-700 text-teal-200 hover:bg-teal-600'
                    }`}
                  >
                    {t.name}
                  </button>
                ))}
                {templates.length === 0 && (
                  <p className="text-sm text-teal-400">No templates found. Create templates via the Email Templates page.</p>
                )}
              </div>

              {editingTemplate && (
                <div className="bg-gray-900 rounded-lg border border-teal-600 p-5 space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-teal-300 uppercase tracking-wide mb-1">
                      {editingTemplate.name}
                      {editingTemplate.category && <span className="ml-2 text-teal-500">({editingTemplate.category})</span>}
                    </label>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Subject Line</label>
                    <input
                      type="text"
                      value={editSubject}
                      onChange={e => setEditSubject(e.target.value)}
                      className="w-full text-sm px-3 py-2.5 bg-gray-800 border border-gray-600 rounded text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-teal-500"
                      placeholder="Email subject..."
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Email Body (HTML supported)</label>
                    <textarea
                      value={editBody}
                      onChange={e => setEditBody(e.target.value)}
                      rows={12}
                      className="w-full text-sm px-3 py-2.5 bg-gray-800 border border-gray-600 rounded text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono resize-y"
                      placeholder="Email body HTML..."
                    />
                    <p className="text-xs text-teal-300 mt-2">
                      Variables: {'{{name}}'}, {'{{address}}'}, {'{{city}}'}, {'{{phone}}'}
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={saveTemplate}
                      disabled={templateSaving}
                      className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-bold rounded hover:bg-green-700 transition-colors disabled:opacity-50"
                    >
                      <Save className="w-4 h-4" />
                      {templateSaving ? 'Saving...' : `Save "${editingTemplate.name}"`}
                    </button>
                    <button
                      onClick={() => { setEditingTemplate(null); setEditSubject(''); setEditBody('') }}
                      className="px-4 py-2 bg-gray-700 text-gray-300 text-sm font-bold rounded hover:bg-gray-600 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {templateSaveResult && (
                <div className={`p-3 rounded text-sm ${templateSaveResult.ok ? 'bg-green-900/30 text-green-400 border border-green-700' : 'bg-red-900/30 text-red-400 border border-red-700'}`}>
                  {templateSaveResult.msg}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Table */}
        {loading && <div className="text-center py-20 text-gray-400 text-lg">Loading prospects...</div>}

        {!loading && prospects.length === 0 && (
          <div className="text-center py-20 text-gray-500 text-lg">No prospects found. Add some using the button above or import a CSV.</div>
        )}

        {!loading && prospects.length > 0 && (
          <div className="rounded-lg overflow-hidden border border-gray-700">
            <table className="w-full text-base">
              <thead className="bg-gray-900 border-b border-gray-700">
                <tr>
                  <th className="w-10 px-5 py-4">
                    <input
                      type="checkbox"
                      checked={selected.size === prospects.length && prospects.length > 0}
                      onChange={toggleAll}
                      className="w-4 h-4 rounded"
                    />
                  </th>
                  <th className="w-8 px-3 py-4"></th>
                  <th className="px-5 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-widest">Homeowner</th>
                  <th className="px-5 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-widest">City</th>
                  <th className="px-5 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-widest">Damage</th>
                  <th className="px-5 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-widest">Emails</th>
                  <th className="px-5 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-widest">Contact</th>
                  <th className="px-5 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-widest">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {prospects.map(p => {
                  const isOpen = expanded === p.id
                  const isSelected = selected.has(p.id)
                  return (
                    <Fragment key={p.id}>
                      <tr
                        onClick={() => toggleExpand(p.id)}
                        className={`cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-gray-600 ring-1 ring-inset ring-white/10'
                            : 'bg-gray-700 hover:bg-gray-650'
                        }`}
                      >
                        <td className="px-5 py-4" onClick={e => toggleSelect(p.id, e)}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}}
                            className="w-4 h-4 rounded pointer-events-none"
                          />
                        </td>
                        <td className="px-3 py-4 text-gray-400">
                          {isOpen ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                        </td>
                        <td className="px-5 py-4">
                          <div className="font-bold text-white text-base">{p.name}</div>
                          <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                            <MapPin className="w-3 h-3" />{p.address}
                          </div>
                        </td>
                        <td className="px-5 py-4 text-gray-300 text-base">{p.city}</td>
                        <td className="px-5 py-4 text-gray-300 text-base">{p.damage_type || '—'}</td>
                        <td className="px-5 py-4 text-gray-300 text-sm">{p._count?.outreach_history ?? 0}</td>
                        <td className="px-5 py-4">
                          {p.email ? (
                            <span className="flex items-center gap-1.5 text-green-400 font-medium text-sm">
                              <Mail className="w-4 h-4" />{p.email}
                            </span>
                          ) : p.phone ? (
                            <span className="flex items-center gap-1.5 text-gray-400 text-sm">
                              <Phone className="w-4 h-4" />{formatPhone(p.phone)}
                            </span>
                          ) : (
                            <span className="text-red-400 text-sm">No contact</span>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <span className={`text-xs px-2.5 py-1 rounded-full font-bold ${statusStyle(p.status)}`}>
                            {p.status.replace('_', ' ')}
                          </span>
                        </td>
                      </tr>
                      {isOpen && (
                        <ExpandedRow
                          key={`${p.id}-expanded`}
                          prospect={p}
                          templates={templates}
                          onSave={updated => updateProspect(p.id, updated)}
                        />
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {!loading && pages > 1 && (
          <div className="flex items-center justify-between mt-5 px-2">
            <span className="text-sm text-gray-500">
              Page {page} of {pages} &mdash; {total.toLocaleString()} total prospects
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-4 py-2 bg-gray-800 text-white text-sm font-bold rounded hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                Prev
              </button>
              {Array.from({ length: Math.min(7, pages) }, (_, i) => {
                const pg = page <= 4 ? i + 1 : page + i - 3
                if (pg < 1 || pg > pages) return null
                return (
                  <button
                    key={pg}
                    onClick={() => setPage(pg)}
                    className={`px-3 py-2 text-sm font-bold rounded transition-colors ${
                      pg === page ? 'bg-yellow-500 text-black' : 'bg-gray-800 text-white hover:bg-gray-700'
                    }`}
                  >
                    {pg}
                  </button>
                )
              })}
              <button
                onClick={() => setPage(p => Math.min(pages, p + 1))}
                disabled={page >= pages}
                className="px-4 py-2 bg-gray-800 text-white text-sm font-bold rounded hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}

      </div>

      {/* Add Prospect Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-black text-white">Add Prospect</h2>
              <button onClick={() => setShowAdd(false)} className="text-gray-500 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {([
                { label: 'Full Name *', key: 'name', placeholder: 'John Smith', full: true },
                { label: 'Address *', key: 'address', placeholder: '123 Oak St', full: true },
                { label: 'Email', key: 'email', placeholder: 'john@email.com' },
                { label: 'Phone', key: 'phone', placeholder: '(214) 555-1234' },
                { label: 'ZIP Code', key: 'zip', placeholder: '75024' },
              ] as { label: string; key: string; placeholder: string; full?: boolean }[]).map(({ label, key, placeholder, full }) => (
                <div key={key} className={full ? 'col-span-2' : ''}>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-1.5">{label}</label>
                  <input
                    type="text"
                    value={(addForm as Record<string, string>)[key]}
                    onChange={e => setAddForm(f => ({ ...f, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full text-sm px-3 py-2.5 bg-gray-800 border border-gray-600 rounded text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-yellow-400"
                  />
                </div>
              ))}
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-1.5">City</label>
                <select
                  value={addForm.city}
                  onChange={e => setAddForm(f => ({ ...f, city: e.target.value }))}
                  className="w-full text-sm px-3 py-2.5 bg-gray-800 border border-gray-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-yellow-400"
                >
                  {DFW_CITIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-1.5">Damage Type</label>
                <select
                  value={addForm.damage_type}
                  onChange={e => setAddForm(f => ({ ...f, damage_type: e.target.value }))}
                  className="w-full text-sm px-3 py-2.5 bg-gray-800 border border-gray-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-yellow-400"
                >
                  <option value="">Unknown</option>
                  {DAMAGE_TYPES.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-1.5">Source</label>
                <select
                  value={addForm.source}
                  onChange={e => setAddForm(f => ({ ...f, source: e.target.value }))}
                  className="w-full text-sm px-3 py-2.5 bg-gray-800 border border-gray-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-yellow-400"
                >
                  <option value="">Unknown</option>
                  {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-1.5">Neighborhood</label>
                <input
                  type="text"
                  value={addForm.neighborhood}
                  onChange={e => setAddForm(f => ({ ...f, neighborhood: e.target.value }))}
                  placeholder="Stonebriar, etc."
                  className="w-full text-sm px-3 py-2.5 bg-gray-800 border border-gray-600 rounded text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-yellow-400"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={addProspect}
                disabled={addSaving || !addForm.name || !addForm.address}
                className="flex-1 py-3 bg-red-600 text-white text-sm font-black rounded hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {addSaving ? 'Adding...' : 'Add Prospect'}
              </button>
              <button onClick={() => setShowAdd(false)} className="px-5 py-3 bg-gray-700 text-white text-sm font-bold rounded hover:bg-gray-600 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import CSV Modal */}
      {showImport && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-2xl p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-black text-white">Import Prospects CSV</h2>
              <button onClick={() => setShowImport(false)} className="text-gray-500 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-gray-400 mb-3">
              CSV format (header required): <span className="font-mono text-gray-300">name, address, city, zip, email, phone, damage_type, neighborhood, source</span>
            </p>
            <textarea
              value={importCsv}
              onChange={e => setImportCsv(e.target.value)}
              rows={12}
              placeholder={'name,address,city,zip,email,phone,damage_type\nJohn Smith,123 Oak St,Plano,75024,john@email.com,2145551234,Hail'}
              className="w-full text-sm px-3 py-2.5 bg-gray-800 border border-gray-600 rounded text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-yellow-400 font-mono resize-y"
            />
            <div className="flex gap-3 mt-4">
              <button
                onClick={importProspects}
                disabled={importSaving || !importCsv.trim()}
                className="flex-1 py-3 bg-yellow-500 text-black text-sm font-black rounded hover:bg-yellow-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {importSaving ? 'Importing...' : 'Import'}
              </button>
              <button onClick={() => setShowImport(false)} className="px-5 py-3 bg-gray-700 text-white text-sm font-bold rounded hover:bg-gray-600 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
