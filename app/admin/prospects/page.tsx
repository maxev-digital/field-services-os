'use client'
import EvOrderWidget from '@/components/EvOrderWidget'

import { Suspense, useState, useEffect, useCallback, Fragment, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  ChevronDown, ChevronRight, Mail, MessageSquare, Phone, Save, Send, MapPin, Download, UserPlus, X, Search, Zap, MailCheck,
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

const DAMAGE_TYPES = ['Hail', 'Wind', 'Fire', 'Water', 'Storm']

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
  const [markingReplied, setMarkingReplied] = useState(false)
  const [repliedDone, setRepliedDone] = useState(false)

  const firstName = (prospect.name || "Homeowner").trim().split(" ")[0]

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
          mailbox: 3,
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

  const markAsReplied = async () => {
    setMarkingReplied(true)
    const note = `Email reply flagged ${new Date().toLocaleDateString('en-US')}`
    const newNotes = notes ? `${notes}\n${note}` : note
    await fetch(`/api/admin/prospects/${prospect.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'PENDING_CONFIRMATION', notes: newNotes }),
    })
    onSave({ status: 'PENDING_CONFIRMATION', notes: newNotes })
    setStatus('PENDING_CONFIRMATION' as any)
    setNotes(newNotes)
    setMarkingReplied(false)
    setRepliedDone(true)
    setTimeout(() => setRepliedDone(false), 3000)
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

            {/* EagleView Report */}
            <EvOrderWidget
              address={prospect.address}
              city={prospect.city}
              zip={prospect.zip || ''}
              prospectId={prospect.id}
              compact={true}
            />
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
                    noreply@roofworksoftexas.com
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
                <div className="flex items-center gap-3 flex-wrap">
                  <button
                    onClick={sendEmail}
                    disabled={sending || !toEmail || !subject || !body || !selectedTemplateId}
                    className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-black rounded hover:bg-blue-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Send className="w-4 h-4" />
                    {sending ? 'Sending...' : 'Send Email'}
                  </button>
                  <button
                    onClick={markAsReplied}
                    disabled={markingReplied}
                    title="They replied to your email — flags them as a pending lead for manual confirmation"
                    className="flex items-center gap-2 px-4 py-2.5 bg-purple-700 text-white text-sm font-bold rounded hover:bg-purple-600 transition-colors disabled:opacity-50"
                  >
                    <MailCheck className="w-4 h-4" />
                    {markingReplied ? 'Flagging...' : repliedDone ? 'Flagged!' : 'Mark as Replied'}
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

function StormProspectsInner() {
  const searchParamsHook = useSearchParams()
  const [prospects, setProspects] = useState<Prospect[]>([])
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(100)

  // Filters
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [city, setCity] = useState('')
  const [damageType, setDamageType] = useState('')
  const [leadStatus, setLeadStatus] = useState('')
  const [hasEmail, setHasEmail] = useState(false)
  const [hasPhone, setHasPhone] = useState(false)
  const [noPhone, setNoPhone] = useState(false)
  const [neighborhood, setNeighborhood] = useState('')
  const [source, setSource] = useState('')

  // Dynamic filter options — loaded from DB
  const [filterCities, setFilterCities] = useState<string[]>([])
  const [filterNeighborhoods, setFilterNeighborhoods] = useState<string[]>([])
  const [filterSources, setFilterSources] = useState<string[]>([])
  const [stormDate, setStormDate] = useState('')

  // Zone proximity filter (from storm zones page)
  const [zoneFilter, setZoneFilter] = useState<{ lat: number; lon: number; radius_miles: number; storm_date: string; label: string } | null>(null)

  // Table state
  const [expanded, setExpanded] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // Templates
  const [templates, setTemplates] = useState<Template[]>([])

  // Bulk send
  const [bulkTemplateId, setBulkTemplateId] = useState('')
  const [bulkSending, setBulkSending] = useState(false)
  const [bulkResult, setBulkResult] = useState<{ sent: number; failed: number; skipped: number } | null>(null)

  // Skip trace
  const [skipTracing, setSkipTracing] = useState(false)
  const [skipResult, setSkipResult] = useState<{ found: number; updated: number; already_had_phone: number; error?: string } | null>(null)

  // Voice campaign
  const [voiceSending, setVoiceSending] = useState(false)
  const [voiceResult, setVoiceResult] = useState<{ dispatched: number; skipped: number; errors: number } | null>(null)
  const [ivrSending, setIvrSending] = useState(false)
  const [ivrResult, setIvrResult] = useState<{ dispatched: number; skipped: number; errors: number; script?: string } | null>(null)
  // Multi-Channel Campaign
  const [multiSending, setMultiSending] = useState(false)
  const [multiResult, setMultiResult] = useState<{ ivr_dispatched: number; ivr_skipped: number; email_sent: number; email_skipped: number } | null>(null)
  const [ivrScripts, setIvrScripts] = useState<{ id: string; name: string; filename: string }[]>([])
  const [ivrScriptFile, setIvrScriptFile] = useState('script-new.mp3')
  const [segments, setSegments] = useState<{ city: string; total: number; callable: number }[]>([])
  const [cityLaunching, setCityLaunching] = useState<string | null>(null)
  const [cityResult, setCityResult] = useState<{ city: string; dispatched: number } | null>(null)
  const [testPhone, setTestPhone] = useState('')
  const [testCalling, setTestCalling] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)

  // IVR script upload
  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploadName, setUploadName] = useState('')
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const uploadInputRef = useRef<HTMLInputElement>(null)


  // Convert to Lead
  const [converting, setConverting] = useState(false)
  const [convertResult, setConvertResult] = useState<{ converted: number; already_existed: number; failed: number } | null>(null)
  // SMS campaign
  const [smsModalOpen, setSmsModalOpen] = useState(false)
  const [smsSending, setSmsSending] = useState(false)
  const [smsMessage, setSmsMessage] = useState(`Hi {{name}}, this is Roof Works of Texas. Your neighborhood was recently hit by hail and we're offering FREE roof inspections this week. Reply YES to schedule yours — no pressure, no obligation. Reply STOP to opt out.`)
  const [smsResult, setSmsResult] = useState<{ sent: number; failed: number; total: number } | null>(null)

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

  // Read zone filter from URL on mount
  useEffect(() => {
    const lat = searchParamsHook.get('lat')
    const lon = searchParamsHook.get('lon')
    const radius = searchParamsHook.get('radius_miles')
    const sd = searchParamsHook.get('storm_date')
    const label = searchParamsHook.get('label') || 'Storm Zone'
    if (lat && lon && radius) {
      setZoneFilter({ lat: parseFloat(lat), lon: parseFloat(lon), radius_miles: parseFloat(radius), storm_date: sd || '', label })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Load test phone from localStorage (default = Nash's number)
  useEffect(() => {
    const saved = localStorage.getItem('ivr_test_phone')
    setTestPhone(saved || '2142320222')
  }, [])

  // Load templates on mount
  useEffect(() => {
    fetch('/api/admin/prospects/segments').then(r => r.json()).then(d => { if (d.segments) setSegments(d.segments) }).catch(() => {})
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

  // Load IVR scripts
  useEffect(() => {
    fetch('/api/admin/ivr-scripts')
      .then(r => r.json())
      .then(d => {
        if (d.scripts?.length) {
          setIvrScripts(d.scripts)
          setIvrScriptFile(d.scripts[0].filename)
        }
      })
      .catch(() => {})
  }, [])

  // Load dynamic filter options from DB
  useEffect(() => {
    fetch('/api/admin/prospects/filters')
      .then(r => r.json())
      .then(d => {
        if (d.cities)        setFilterCities(d.cities)
        if (d.neighborhoods) setFilterNeighborhoods(d.neighborhoods)
        if (d.sources)       setFilterSources(d.sources)
      })
      .catch(() => {})
  }, [])

  // Fetch prospects
  const fetchProspects = async (p = 1) => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(p), limit: String(pageSize) })
    if (search) params.set('search', search)
    if (city) params.set('city', city)
    if (damageType) params.set('damage_type', damageType)
    if (leadStatus && leadStatus !== 'all') params.set('status', leadStatus)
    if (hasEmail) params.set('has_email', '1')
    if (hasPhone) params.set('has_phone', '1')
    if (noPhone)  params.set('no_phone',  '1')
    if (neighborhood) params.set('neighborhood', neighborhood)
    if (source) params.set('source', source)
    if (stormDate) params.set('storm_date', stormDate)
    // Use zoneFilter state or fall back to URL params directly (handles first-render timing)
    const activeGeo = zoneFilter || (() => {
      const _lat    = searchParamsHook.get('lat')
      const _lon    = searchParamsHook.get('lon')
      const _radius = searchParamsHook.get('radius_miles')
      const _sd     = searchParamsHook.get('storm_date')
      if (_lat && _lon && _radius) {
        return { lat: parseFloat(_lat), lon: parseFloat(_lon), radius_miles: parseFloat(_radius), storm_date: _sd || '' }
      }
      return null
    })()
    if (activeGeo) {
      params.set('lat', String(activeGeo.lat))
      params.set('lon', String(activeGeo.lon))
      params.set('radius_miles', String(activeGeo.radius_miles))
      if (activeGeo.storm_date) params.set('storm_date', activeGeo.storm_date)
    }
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

  const filterKey = `${search}|${city}|${damageType}|${leadStatus}|${hasEmail}|${hasPhone}|${noPhone}|${neighborhood}|${source}|${stormDate}|${pageSize}|${JSON.stringify(zoneFilter)}`
  useEffect(() => { fetchProspects(page) }, [page, filterKey]) // eslint-disable-line react-hooks/exhaustive-deps

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
          mailbox: 3,
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

  // Skip trace
  const runSkipTrace = async () => {
    const targets = selected.size > 0
      ? prospects.filter(p => selected.has(p.id))
      : prospects.filter(p => !p.phone)
    if (!targets.length) { alert('No prospects without phone numbers in selection'); return }
    if (!confirm(`Run skip trace on ${targets.length} prospects?\n\nThis will charge ~$${(targets.length * 0.10).toFixed(2)} from your BatchData account.`)) return
    setSkipTracing(true)
    setSkipResult(null)
    try {
      const res = await fetch('/api/admin/prospects/skip-trace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prospect_ids: targets.map(p => p.id) }),
      })
      const d = await res.json()
      if (d.error) {
        setSkipResult({ found: d.found ?? 0, updated: d.updated ?? 0, already_had_phone: 0, error: d.error })
      } else {
        setSkipResult({ found: d.found ?? 0, updated: d.updated ?? 0, already_had_phone: d.already_had_phone ?? 0 })
        fetchProspects(page)
      }
    } catch {
      setSkipResult({ found: 0, updated: 0, already_had_phone: 0, error: 'Network error — check console' })
    } finally {
      setSkipTracing(false)
    }
  }

  const [enrichingAll, setEnrichingAll] = useState(false)
  const [enrichAllResult, setEnrichAllResult] = useState<{ found: number; updated: number; total: number } | null>(null)

  const enrichAllFiltered = async () => {
    // Fetch ALL IDs matching current filters (no pagination)
    const params = new URLSearchParams({ page: '1', limit: '9999' })
    if (search)      params.set('search', search)
    if (city)        params.set('city', city)
    if (stormDate)   params.set('storm_date', stormDate)
    if (leadStatus)  params.set('status', leadStatus)
    if (source)      params.set('source', source)
    if (neighborhood) params.set('neighborhood', neighborhood)
    params.set('has_phone', 'false')

    setEnrichingAll(true)
    setEnrichAllResult(null)
    try {
      const res  = await fetch(`/api/admin/prospects?${params}`)
      const data = await res.json()
      const ids: string[] = (data.prospects || []).filter((p: any) => !p.phone).map((p: any) => p.id)

      if (!ids.length) { alert('No unenriched prospects match current filters'); setEnrichingAll(false); return }
      if (!confirm(`Enrich ALL ${ids.length} prospects matching current filters?\n\nEstimated cost: ~$${(ids.length * 0.12).toFixed(2)} from BatchData.`)) { setEnrichingAll(false); return }

      // Send in chunks of 200
      const CHUNK = 200
      let totalFound = 0, totalUpdated = 0
      for (let i = 0; i < ids.length; i += CHUNK) {
        const chunk = ids.slice(i, i + CHUNK)
        const r = await fetch('/api/admin/prospects/skip-trace', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prospect_ids: chunk }),
        })
        const d = await r.json()
        totalFound   += d.found   ?? 0
        totalUpdated += d.updated ?? 0
      }
      setEnrichAllResult({ found: totalFound, updated: totalUpdated, total: ids.length })
      fetchProspects(page)
    } catch (e) {
      alert('Enrichment failed — check console')
    } finally {
      setEnrichingAll(false)
    }
  }

  // Voice campaign
  const launchVoiceCampaign = async () => {
    const targets = selected.size > 0
      ? prospects.filter(p => selected.has(p.id))
      : prospects.filter(p => p.phone)
    const phoneTargets = targets.filter(p => p.phone)
    if (!phoneTargets.length) { alert('No prospects with phone numbers in selection'); return }
    if (!confirm(`Launch AI voice calls to ${phoneTargets.length} prospects?

Calling from (214) 491-5254 via Retell AI.`)) return
    setVoiceSending(true)
    setVoiceResult(null)
    try {
      const res = await fetch('/api/admin/outreach/voice-campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prospect_ids: phoneTargets.map(p => p.id) }),
      })
      const d = await res.json()
      setVoiceResult({
        dispatched: d.dispatched ?? 0,
        skipped: d.skipped ?? 0,
        errors: d.errors?.length ?? 0,
      })
      fetchProspects(page)
    } catch {
      setVoiceResult({ dispatched: 0, skipped: 0, errors: phoneTargets.length })
    } finally {
      setVoiceSending(false)
    }
  }


  const launchMultiChannel = async () => {
    if (!bulkTemplateId) { alert('Select an email template first'); return }
    const base = selected.size > 0 ? prospects.filter(p => selected.has(p.id)) : prospects
    const phoneTargets = base.filter(p => p.phone)
    const emailTargets = base.filter(p => p.email)
    if (!phoneTargets.length && !emailTargets.length) { alert('No prospects with phones or emails in selection'); return }
    const ivrCount   = phoneTargets.length
    const emailCount = emailTargets.length
    if (!confirm(`Launch multi-channel campaign?\n\n📞 IVR calls: ${ivrCount} prospects\n📧 Emails: ${emailCount} prospects\n\nBoth will fire simultaneously.`)) return
    setMultiSending(true)
    setMultiResult(null)
    const [ivrRes, emailRes] = await Promise.allSettled([
      ivrCount > 0
        ? fetch('/api/admin/outreach/ivr-campaign', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prospect_ids: phoneTargets.map(p => p.id), script_filename: ivrScriptFile }),
          }).then(r => r.json())
        : Promise.resolve({ dispatched: 0, skipped: 0, errors: [] }),
      emailCount > 0
        ? fetch('/api/admin/outreach/send', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prospect_ids: emailTargets.map(p => p.id), template_id: bulkTemplateId, mailbox: 3 }),
          }).then(r => r.json())
        : Promise.resolve({ sent: 0, skipped: 0 }),
    ])
    const ivr   = ivrRes.status   === 'fulfilled' ? ivrRes.value   : { dispatched: 0, skipped: ivrCount,   errors: [] }
    const email = emailRes.status === 'fulfilled' ? emailRes.value : { sent: 0,        skipped: emailCount }
    setMultiResult({
      ivr_dispatched:  ivr.dispatched   ?? 0,
      ivr_skipped:     ivr.skipped      ?? 0,
      email_sent:      email.sent       ?? 0,
      email_skipped:   email.skipped    ?? 0,
    })
    setMultiSending(false)
    fetchProspects(page)
  }

  const launchIvrCampaign = async () => {
    const targets = selected.size > 0
      ? prospects.filter(p => selected.has(p.id))
      : prospects.filter(p => p.phone)
    const phoneTargets = targets.filter(p => p.phone)
    if (!phoneTargets.length) { alert('No prospects with phone numbers in selection'); return }
    if (!confirm()) return
    setIvrSending(true)
    setIvrResult(null)
    try {
      const res = await fetch('/api/admin/outreach/ivr-campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prospect_ids: phoneTargets.map(p => p.id), script_filename: ivrScriptFile }),
      })
      const d = await res.json()
      setIvrResult({
        dispatched: d.dispatched ?? 0,
        skipped: d.skipped ?? 0,
        errors: d.errors?.length ?? 0,
        script: d.script,
      })
      fetchProspects(page)
    } catch {
      setIvrResult({ dispatched: 0, skipped: 0, errors: phoneTargets.length })
    } finally {
      setIvrSending(false)
    }
  }

  const handleScriptUpload = async () => {
    if (!uploadName.trim() || !uploadFile) return
    setUploading(true)
    try {
      const form = new FormData()
      form.append('name', uploadName.trim())
      form.append('file', uploadFile)
      const res = await fetch('/api/admin/ivr-scripts', { method: 'POST', body: form })
      const d = await res.json()
      if (!res.ok) { alert(d.error || 'Upload failed'); return }
      setIvrScripts(prev => [...prev, d.script])
      setIvrScriptFile(d.script.filename)
      setUploadOpen(false)
      setUploadName('')
      setUploadFile(null)
    } catch { alert('Upload failed') }
    finally { setUploading(false) }
  }

  const fireTestCall = async () => {
    const phone = testPhone.trim()
    if (!phone) { alert('Enter your test phone number first'); return }
    localStorage.setItem('ivr_test_phone', phone)
    setTestCalling(true)
    setTestResult(null)
    try {
      const res = await fetch('/api/admin/outreach/ivr-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, script_filename: ivrScriptFile }),
      })
      const d = await res.json()
      if (!res.ok) { setTestResult(`Error: ${d.error}`); return }
      setTestResult(`Calling ${d.to} — SID: ${d.call_sid}`)
    } catch (e: any) {
      setTestResult(`Error: ${e.message}`)
    } finally {
      setTestCalling(false)
    }
  }

  // Convert prospects to leads
  const convertToLead = async () => {
    const targets = selected.size > 0
      ? prospects.filter(p => selected.has(p.id))
      : prospects.filter(p => p.status === 'INTERESTED')
    const interestedTargets = targets.filter(p => p.status === 'INTERESTED' || p.status === 'CONTACTED')
    if (!interestedTargets.length) { alert('No INTERESTED or CONTACTED prospects in selection'); return }
    if (!confirm(`Convert ${interestedTargets.length} prospect(s) to customer + job lead?`)) return
    setConverting(true)
    setConvertResult(null)
    try {
      const res = await fetch('/api/admin/prospects/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prospect_ids: interestedTargets.map(p => p.id) }),
      })
      const d = await res.json()
      setConvertResult({ converted: d.converted ?? 0, already_existed: d.already_existed ?? 0, failed: d.failed ?? 0 })
      fetchProspects(page)
    } catch {
      setConvertResult({ converted: 0, already_existed: 0, failed: interestedTargets.length })
    } finally {
      setConverting(false)
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

  const launchCityIvr = async (city: string, callable: number) => {
    if (!confirm(`Launch IVR for all ${callable} callable prospects in ${city.split('(')[0].trim()}?\n\nScript: ${ivrScriptFile}`)) return
    setCityLaunching(city)
    setCityResult(null)
    try {
      const res = await fetch('/api/admin/outreach/ivr-campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ city, script_filename: ivrScriptFile }),
      })
      const d = await res.json()
      setCityResult({ city, dispatched: d.dispatched ?? 0 })
      fetch('/api/admin/prospects/segments').then(r => r.json()).then(d => { if (d.segments) setSegments(d.segments) }).catch(() => {})
    } finally {
      setCityLaunching(null)
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

        {/* Zone Filter Banner */}
        {zoneFilter && (
          <div className="flex items-center justify-between bg-blue-900/30 border border-blue-500/40 rounded-lg px-4 py-3 mb-4">
            <div className="flex items-center gap-3">
              <MapPin className="w-4 h-4 text-blue-400 shrink-0" />
              <div>
                <span className="text-sm font-semibold text-white">{zoneFilter.label}</span>
                <span className="text-xs text-gray-400 ml-2">
                  {zoneFilter.radius_miles} mi radius · {zoneFilter.storm_date}
                </span>
              </div>
            </div>
            <button
              onClick={() => { setZoneFilter(null); fetchProspects(1) }}
              className="text-gray-400 hover:text-white p-1 transition-colors"
              title="Clear zone filter"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* City Segments Panel */}
        {segments.length > 0 && (
          <div className="mb-5 bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-black text-gray-400 uppercase tracking-widest">City Campaign Segments</p>
              <p className="text-xs text-gray-600">Click IVR to launch the full city — no page limit</p>
            </div>
            {cityResult && (
              <div className="mb-3 text-xs text-green-400 bg-green-900/20 border border-green-800 rounded px-3 py-2">
                IVR launched for {cityResult.city.split('(')[0].trim()} — {cityResult.dispatched} calls dispatched
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {segments.map(seg => {
                const label = seg.city.split('(')[0].trim()
                const isLaunching = cityLaunching === seg.city
                return (
                  <div key={seg.city} className="flex items-center gap-2 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2">
                    <div>
                      <p className="text-xs font-bold text-white">{label}</p>
                      <p className="text-[10px] text-gray-500">{seg.callable} callable</p>
                    </div>
                    <button
                      onClick={() => launchCityIvr(seg.city, seg.callable)}
                      disabled={!!cityLaunching}
                      className="ml-1 px-2 py-1 bg-green-700 hover:bg-green-600 text-white text-[10px] font-bold rounded disabled:opacity-40 transition-colors"
                    >
                      {isLaunching ? '...' : 'IVR'}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

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
                {filterCities.map(c => <option key={c} value={c}>{c}</option>)}
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

            {/* Campaign / Neighborhood */}
            <div className="w-52">
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Campaign</label>
              <select
                value={neighborhood}
                onChange={e => { setNeighborhood(e.target.value); setPage(1) }}
                className="w-full text-sm px-3 py-2.5 bg-gray-800 border border-gray-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-yellow-400"
              >
                <option value="">All Campaigns</option>
                {filterNeighborhoods.map(n => <option key={n} value={n}>{n}</option>)}
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
                {filterSources.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            {/* Storm Date */}
            <div className="w-36">
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Storm Date</label>
              <input
                type="date"
                value={stormDate}
                onChange={e => { setStormDate(e.target.value); setPage(1) }}
                className="w-full text-sm px-3 py-2.5 bg-gray-800 border border-gray-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-yellow-400"
              />
            </div>

            {/* Per Page */}
            <div className="w-24">
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Per Page</label>
              <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1) }}
                className="w-full text-sm px-3 py-2.5 bg-gray-800 border border-gray-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-yellow-400"
              >
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={250}>250</option>
                <option value={500}>500</option>
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
                  onChange={e => { setHasPhone(e.target.checked); if (e.target.checked) setNoPhone(false); setPage(1) }}
                  className="w-4 h-4 rounded accent-yellow-400"
                />
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">Has Phone</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={noPhone}
                  onChange={e => { setNoPhone(e.target.checked); if (e.target.checked) setHasPhone(false); setPage(1) }}
                  className="w-4 h-4 rounded accent-orange-400"
                />
                <span className="text-xs font-bold text-orange-400 uppercase tracking-wide">Unenriched</span>
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

        {/* ── Multi-Channel Campaign Bar ────────────────────────────────── */}
        <div className="bg-gradient-to-r from-red-950 to-orange-950 border border-red-700 rounded-lg px-5 py-4 mb-4 ring-1 ring-red-800/50">
          <div className="flex items-center gap-3 mb-3">
            <Zap className="w-4 h-4 text-red-400 shrink-0" />
            <span className="text-xs font-black text-red-200 uppercase tracking-widest">Multi-Channel Campaign</span>
            <span className="text-xs text-gray-400">IVR call + email simultaneously to the same list</span>
            <div className="ml-auto flex items-center gap-3 text-xs text-gray-400 shrink-0">
              <span>📞 <strong className="text-orange-300">{selected.size > 0 ? prospects.filter(p=>selected.has(p.id)&&p.phone).length : phoneCount}</strong> IVR</span>
              <span>📧 <strong className="text-blue-300">{selected.size > 0 ? prospects.filter(p=>selected.has(p.id)&&p.email).length : emailCount}</strong> Email</span>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {/* IVR Script */}
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-orange-400 font-bold uppercase tracking-wide">Script</span>
              <select
                value={ivrScriptFile}
                onChange={e => setIvrScriptFile(e.target.value)}
                className="text-xs bg-red-900/60 border border-red-700 text-orange-200 rounded px-2 py-1.5 focus:outline-none"
              >
                {ivrScripts.map(s => <option key={s.id} value={s.filename}>{s.name}</option>)}
                {ivrScripts.length === 0 && <option value="script-new.mp3">script-new.mp3</option>}
              </select>
            </div>
            {/* Email Template */}
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="text-xs text-blue-400 font-bold uppercase tracking-wide shrink-0">Template</span>
              <div className="flex items-center gap-1.5 flex-wrap">
                {templates.filter(t => t.category?.includes('residential') || t.category?.includes('storm')).map(t => (
                  <button key={t.id} onClick={() => setBulkTemplateId(t.id)}
                    className={`px-2.5 py-1 text-[11px] font-bold rounded transition-colors ${bulkTemplateId === t.id ? 'bg-white text-red-900' : 'bg-red-900/60 border border-red-700 text-red-200 hover:bg-red-800'}`}>
                    {t.variant?.replace(/Residential: /,'').replace(/Storm Follow-Up /,'') || t.slug}
                  </button>
                ))}
                {templates.filter(t => !t.category?.includes('residential') && !t.category?.includes('storm')).length > 0 && (
                  <select value={bulkTemplateId} onChange={e => setBulkTemplateId(e.target.value)}
                    className="text-[11px] bg-red-900/60 border border-red-700 text-red-200 rounded px-2 py-1 focus:outline-none">
                    <option value="">Other templates…</option>
                    {templates.filter(t => !t.category?.includes('residential') && !t.category?.includes('storm')).map(t => (
                      <option key={t.id} value={t.id}>{t.variant || t.slug}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>
            {/* Launch Button */}
            <button
              onClick={launchMultiChannel}
              disabled={multiSending || !bulkTemplateId}
              className="flex items-center gap-2 px-6 py-2.5 bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-black rounded transition-colors shrink-0"
            >
              <Zap className="w-4 h-4" />
              {multiSending ? 'Launching...' : '🚀 Launch Campaign'}
            </button>
          </div>
          {multiResult && (
            <div className="mt-3 text-sm flex flex-wrap gap-4">
              <span>📞 IVR: <span className="text-green-300 font-bold">{multiResult.ivr_dispatched} dispatched</span>{multiResult.ivr_skipped > 0 && <span className="text-yellow-400 ml-1">{multiResult.ivr_skipped} skipped</span>}</span>
              <span>📧 Email: <span className="text-green-300 font-bold">{multiResult.email_sent} sent</span>{multiResult.email_skipped > 0 && <span className="text-yellow-400 ml-1">{multiResult.email_skipped} skipped</span>}</span>
            </div>
          )}
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
              <span className="px-3 py-1.5 text-xs bg-blue-700 text-blue-200 rounded">noreply@roofworksoftexas.com</span>
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

        {/* Skip Trace Bar */}
        <div className="bg-gradient-to-r from-purple-900 to-purple-800 border border-purple-700 rounded-lg px-5 py-4 mb-4">
          <div className="flex items-center gap-4 flex-wrap">
            <span className="text-xs font-black text-purple-200 uppercase tracking-widest shrink-0">Skip Trace</span>
            <span className="text-xs text-purple-300 shrink-0">BatchData · ~$0.10/record · finds mobile numbers</span>
            <div className="flex items-center gap-2 ml-auto shrink-0">
              <button
                onClick={runSkipTrace}
                disabled={skipTracing}
                className="flex items-center gap-2 px-5 py-2 bg-white text-purple-900 text-sm font-black rounded hover:bg-purple-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Search className="w-4 h-4" />
                {skipTracing ? 'Running...' : `Skip Trace (${selected.size > 0 ? selected.size : prospects.filter(p => !p.phone).length} without phone)`}
              </button>
            </div>
          </div>
          {skipResult && (
            <div className="mt-3 text-sm text-purple-100">
              {skipResult.error
                ? <span className="text-red-400 font-bold">⚠ {skipResult.error}</span>
                : <>Done — <span className="text-green-300 font-bold">{skipResult.found} phones found</span>
                  {skipResult.already_had_phone > 0 && <span className="text-gray-400 ml-2">{skipResult.already_had_phone} already had phone</span>}</>
              }
            </div>
          )}
          <div className="mt-3 flex items-center gap-3 flex-wrap">
            <button
              onClick={enrichAllFiltered}
              disabled={enrichingAll || skipTracing}
              className="flex items-center gap-2 px-4 py-2 bg-purple-400 text-purple-950 text-xs font-black rounded hover:bg-purple-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {enrichingAll ? 'Enriching...' : 'Enrich All Filtered (no phone)'}
            </button>
            <span className="text-xs text-purple-400">Enriches all pages matching current filters in 200-record chunks</span>
          </div>
          {enrichAllResult && (
            <div className="mt-2 text-sm text-purple-100">
              Done — <span className="text-green-300 font-bold">{enrichAllResult.found} phones found</span>
              <span className="text-purple-300 ml-2">from {enrichAllResult.total} records processed</span>
            </div>
          )}
        </div>

        {/* AI Voice Campaign Bar */}
        <div className="bg-gradient-to-r from-red-900 to-red-800 border border-red-700 rounded-lg px-5 py-4 mb-4">
          <div className="flex items-center gap-4 flex-wrap">
            <span className="text-xs font-black text-red-200 uppercase tracking-widest shrink-0">AI Voice Campaign</span>
            <span className="text-xs text-red-300 shrink-0">From: (214) 491-5254 via Retell AI</span>
            <div className="flex items-center gap-2 ml-auto shrink-0">
              <button
                onClick={launchVoiceCampaign}
                disabled={voiceSending}
                className="flex items-center gap-2 px-5 py-2 bg-white text-red-900 text-sm font-black rounded hover:bg-red-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Phone className="w-4 h-4" />
                {voiceSending ? 'Launching...' : `Launch AI Calls (${selected.size > 0 ? selected.size : phoneCount})`}
              </button>
            </div>
          </div>
          {voiceResult && (
            <div className="mt-3 text-sm text-red-100">
              Done— <span className="text-green-300 font-bold">{voiceResult.dispatched} dispatched</span>
              {voiceResult.skipped > 0 && <span className="text-yellow-300 font-bold ml-2">{voiceResult.skipped} skipped (no phone / DNC)</span>}
              {voiceResult.errors > 0 && <span className="text-red-300 font-bold ml-2">{voiceResult.errors} errors</span>}
            </div>
          )}
        </div>

        {/* IVR Robocall Campaign Bar */}
        <div className="bg-gradient-to-r from-orange-900 to-orange-800 border border-orange-700 rounded-lg px-5 py-4 mb-4">
          <div className="flex items-center gap-4 flex-wrap">
            <span className="text-xs font-black text-orange-200 uppercase tracking-widest shrink-0">IVR Robocall</span>
            <span className="text-xs text-orange-300 shrink-0">~$0.007/call · Press 1=Inspection · Press 2=Estimate · Press 3=Opt Out</span>
            <div className="flex items-center gap-3 ml-auto shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-xs text-orange-300 font-bold shrink-0">Script:</span>
                <select
                  value={ivrScriptFile}
                  onChange={e => setIvrScriptFile(e.target.value)}
                  className="text-xs px-2 py-1.5 bg-orange-800 border border-orange-600 rounded text-orange-100 focus:outline-none focus:ring-1 focus:ring-orange-400 max-w-[180px]"
                >
                  {ivrScripts.map(s => (
                    <option key={s.id} value={s.filename}>{s.name}</option>
                  ))}
                  {ivrScripts.length === 0 && (
                    <option value="script-new.mp3">script-new.mp3</option>
                  )}
                </select>
                <button
                  onClick={() => setUploadOpen(true)}
                  className="text-xs px-2 py-1.5 bg-orange-700 text-orange-200 rounded hover:bg-orange-600 transition-colors font-bold"
                  title="Upload new script MP3"
                >
                  + Upload
                </button>
              </div>
              <button
                onClick={launchIvrCampaign}
                disabled={ivrSending}
                className="flex items-center gap-2 px-5 py-2 bg-white text-orange-900 text-sm font-black rounded hover:bg-orange-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Phone className="w-4 h-4" />
                {ivrSending ? 'Launching...' : `Launch IVR (${selected.size > 0 ? selected.size : phoneCount})`}
              </button>
            </div>
          </div>
          {ivrResult && (
            <div className="mt-3 text-sm text-orange-100">
              Done — <span className="text-orange-300">{ivrResult.script || ivrScriptFile}</span>: <span className="text-green-300 font-bold">{ivrResult.dispatched} dispatched</span>
              {ivrResult.skipped > 0 && <span className="text-yellow-300 font-bold ml-2">{ivrResult.skipped} skipped (no phone / DNC)</span>}
              {ivrResult.errors > 0 && <span className="text-red-300 font-bold ml-2">{ivrResult.errors} errors</span>}
            </div>
          )}
          <div className="mt-3 flex items-center gap-2 border-t border-orange-800 pt-3">
            <span className="text-xs text-orange-400 font-bold shrink-0">Test Fire:</span>
            <input
              type="tel"
              value={testPhone}
              onChange={e => setTestPhone(e.target.value)}
              onBlur={() => testPhone && localStorage.setItem('ivr_test_phone', testPhone)}
              placeholder="Your number"
              className="text-xs px-2 py-1.5 bg-orange-950 border border-orange-700 rounded text-orange-100 w-36 focus:outline-none focus:ring-1 focus:ring-orange-400"
            />
            <button
              onClick={fireTestCall}
              disabled={testCalling}
              className="text-xs px-3 py-1.5 bg-orange-600 text-white font-black rounded hover:bg-orange-500 transition-colors disabled:opacity-40"
            >
              {testCalling ? 'Calling...' : '📞 Test Call'}
            </button>
            {testResult && <span className={`text-xs font-bold ${testResult.startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}>{testResult}</span>}
          </div>
        </div>

        {/* SMS Campaign Bar */}
        <div className="bg-gradient-to-r from-blue-900 to-blue-800 border border-blue-700 rounded-lg px-5 py-4 mb-4">
          <div className="flex items-center gap-4 flex-wrap">
            <span className="text-xs font-black text-blue-200 uppercase tracking-widest shrink-0">SMS Campaign</span>
            <span className="text-xs text-blue-300 shrink-0">Twilio 10DLC · ~$0.008/msg</span>
            <div className="flex items-center gap-2 ml-auto shrink-0">
              <button
                onClick={() => setSmsModalOpen(true)}
                disabled={smsSending}
                className="flex items-center gap-2 px-5 py-2 bg-white text-blue-900 text-sm font-black rounded hover:bg-blue-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <MessageSquare className="w-4 h-4" />
                {smsSending ? 'Sending...' : `Send SMS (${selected.size > 0 ? selected.size : phoneCount})`}
              </button>
            </div>
          </div>
          {smsResult && (
            <div className="mt-3 text-sm text-blue-100">
              Done — <span className="text-green-300 font-bold">{smsResult.sent} sent</span>
              {smsResult.failed > 0 && <span className="text-yellow-300 font-bold ml-2">{smsResult.failed} failed</span>}
            </div>
          )}
        </div>


        {/* Convert to Lead Bar */}
        <div className="bg-gradient-to-r from-green-900 to-green-800 border border-green-700 rounded-lg px-5 py-4 mb-4">
          <div className="flex items-center gap-4 flex-wrap">
            <span className="text-xs font-black text-green-200 uppercase tracking-widest shrink-0">Convert to Lead</span>
            <span className="text-xs text-green-300 shrink-0">Creates customer + job from INTERESTED prospects</span>
            <div className="flex items-center gap-2 ml-auto shrink-0">
              <button
                onClick={convertToLead}
                disabled={converting}
                className="flex items-center gap-2 px-5 py-2 bg-white text-green-900 text-sm font-black rounded hover:bg-green-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <UserPlus className="w-4 h-4" />
                {converting ? 'Converting...' : `Convert to Lead (${selected.size > 0 ? selected.size : prospects.filter(p => p.status === 'INTERESTED').length})`}
              </button>
            </div>
          </div>
          {convertResult && (
            <div className="mt-3 text-sm text-green-100">
              Done — <span className="text-green-300 font-bold">{convertResult.converted} converted</span>
              {convertResult.already_existed > 0 && <span className="text-yellow-300 font-bold ml-2">{convertResult.already_existed} already existed</span>}
              {convertResult.failed > 0 && <span className="text-red-300 font-bold ml-2">{convertResult.failed} failed</span>}
            </div>
          )}
        </div>
        {/* SMS Modal */}
        {smsModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="bg-gray-900 border border-blue-700 rounded-xl w-full max-w-lg mx-4 p-6 shadow-2xl">
              <h2 className="text-lg font-bold text-white mb-1">Compose SMS</h2>
              <p className="text-xs text-gray-400 mb-4">
                Sending to <span className="text-blue-300 font-semibold">{selected.size > 0 ? selected.size : phoneCount}</span> prospects with phone numbers.
                Use <code className="bg-gray-700 px-1 rounded">{'{{name}}'}</code> to personalize.
              </p>
              <textarea
                value={smsMessage}
                onChange={e => setSmsMessage(e.target.value)}
                rows={5}
                maxLength={320}
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none"
              />
              <div className="flex justify-between items-center mt-1 mb-4">
                <span className="text-xs text-gray-500">{smsMessage.length}/320 chars</span>
                <span className="text-xs text-gray-500">Est. cost: ~${((selected.size > 0 ? selected.size : phoneCount) * 0.008).toFixed(2)}</span>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={launchSmsCampaign}
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-lg transition-colors"
                >
                  Send Now
                </button>
                <button
                  onClick={() => setSmsModalOpen(false)}
                  className="px-5 py-2.5 bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm font-semibold rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

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
                  <th className="px-5 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-widest">City / ZIP</th>
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
                        <td className="px-5 py-4 text-gray-300 text-base">
                          <div>{p.city || '—'}</div>
                          {p.zip && <div className="text-xs text-gray-500 mt-0.5">{p.zip}</div>}
                        </td>
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
                  {filterCities.map(c => <option key={c} value={c}>{c}</option>)}
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
                  {filterSources.map(s => <option key={s} value={s}>{s}</option>)}
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

      {/* Upload IVR Script Modal */}
      {uploadOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-orange-700 rounded-xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-black text-white">Upload IVR Script</h2>
              <button onClick={() => { setUploadOpen(false); setUploadName(''); setUploadFile(null) }} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-gray-400 mb-4">Upload an MP3 from ElevenLabs or any source. Once uploaded it appears in the script dropdown — no rebuild needed.</p>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-1.5">Script Name</label>
                <input
                  type="text"
                  value={uploadName}
                  onChange={e => setUploadName(e.target.value)}
                  placeholder="e.g. ElevenLabs Jessica — Insurance Angle v2"
                  className="w-full text-sm px-3 py-2.5 bg-gray-800 border border-gray-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-1.5">MP3 File</label>
                <input
                  ref={uploadInputRef}
                  type="file"
                  accept=".mp3,audio/mpeg"
                  onChange={e => setUploadFile(e.target.files?.[0] || null)}
                  className="hidden"
                />
                <button
                  onClick={() => uploadInputRef.current?.click()}
                  className="w-full text-sm px-3 py-2.5 bg-gray-800 border border-dashed border-gray-600 rounded text-gray-400 hover:border-orange-500 hover:text-orange-300 transition-colors text-left"
                >
                  {uploadFile ? `✓ ${uploadFile.name} (${(uploadFile.size / 1024).toFixed(0)}KB)` : 'Click to select MP3 file...'}
                </button>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={handleScriptUpload}
                disabled={uploading || !uploadName.trim() || !uploadFile}
                className="flex-1 px-5 py-3 bg-orange-600 text-white text-sm font-black rounded hover:bg-orange-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {uploading ? 'Uploading...' : 'Upload Script'}
              </button>
              <button onClick={() => { setUploadOpen(false); setUploadName(''); setUploadFile(null) }} className="px-5 py-3 bg-gray-700 text-white text-sm font-bold rounded hover:bg-gray-600 transition-colors">
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

export default function StormProspects() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-950 flex items-center justify-center text-gray-400">Loading...</div>}>
      <StormProspectsInner />
    </Suspense>
  );
}
