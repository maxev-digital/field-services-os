'use client'
import EvOrderWidget from '@/components/EvOrderWidget'

import { Fragment, useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft, User, Phone, Mail, MapPin, FileText, Briefcase,
  Edit2, Check, X, ExternalLink, Upload, Download, Trash2,
  MessageSquare, PhoneCall, AtSign, Calendar, AlertCircle,
  ChevronRight, Image, Shield, DollarSign, Plus, Eye,
  Clock, Home, Activity, ClipboardList, BookOpen, Send, ToggleRight, ToggleLeft,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type EstimateStatus = 'DRAFT' | 'SENT' | 'APPROVED' | 'DECLINED' | 'INVOICED' | 'PAID'
type JobStatus = 'LEAD' | 'ESTIMATE_SENT' | 'INSURANCE_APPROVED' | 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETE' | 'INVOICED' | 'PAID'
type ActivityType = 'NOTE' | 'CALL' | 'EMAIL' | 'MEETING' | 'STATUS_CHANGE' | 'DOCUMENT_UPLOADED'

interface Customer {
  id: string
  name: string
  phone: string
  email?: string
  address?: string
  notes?: string
  created_at: string
  estimates: Estimate[]
  jobs: Job[]
  inspection_reports: InspectionReport[]
}

interface Estimate {
  id: string
  address: string
  insurance_total: number
  our_total: number
  status: EstimateStatus
  created_at: string
}

interface Job {
  id: string
  address: string
  status: JobStatus
  material?: string
  squares?: number
  scheduled_date?: string
  completed_date?: string
  photos?: { id: string; url: string; type: string; caption?: string }[]
  claim?: InsuranceClaim
  created_at: string
}

interface InspectionReport {
  id: string
  address: string
  inspector: string | null
  inspection_date: string | null
  weather: string | null
  status: 'DRAFT' | 'COMPLETE'
  created_at: string
  _count: { items: number }
}

interface InsuranceClaim {
  id: string
  insurer?: string
  claim_no?: string
  adjuster_name?: string
  adjuster_phone?: string
  date_filed?: string
  approved_amount?: number
  depreciation?: number
  supplement_no?: string
  supplement_status?: string
  final_settlement?: number
  status: string
  notes?: string
}

interface CustomerDocument {
  id: string
  display_name: string
  filename: string
  doc_type: string
  file_path: string
  size_bytes: number
  uploaded_at: string
}

interface ActivityEntry {
  id: string
  type: ActivityType
  note?: string
  created_by?: string
  created_at: string
}

interface MfrDoc {
  id: string
  manufacturer: string
  name: string
  filename: string
  description: string | null
  size_bytes: number
  active: boolean
}

const MFR_BADGE_COLORS: Record<string, string> = {
  GAF: 'bg-green-900 text-green-300',
  'Owens Corning': 'bg-red-900 text-red-300',
  OC: 'bg-red-900 text-red-300',
  CertainTeed: 'bg-blue-900 text-blue-300',
  Atlas: 'bg-orange-900 text-orange-300',
  IKO: 'bg-purple-900 text-purple-300',
}
const mfrBadge = (m: string) => MFR_BADGE_COLORS[m] || 'bg-gray-700 text-gray-300'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n?: number | null) =>
  n == null ? '—' : '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const fmtDate = (s?: string | null) =>
  s ? new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

const fmtSize = (bytes: number) => {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1048576).toFixed(1) + ' MB'
}

const ESTIMATE_STATUS_COLORS: Record<EstimateStatus, string> = {
  DRAFT:    'bg-gray-700 text-gray-300',
  SENT:     'bg-blue-900 text-blue-300',
  APPROVED: 'bg-green-900 text-green-300',
  DECLINED: 'bg-red-900 text-red-300',
  INVOICED: 'bg-purple-900 text-purple-300',
  PAID:     'bg-emerald-900 text-emerald-300',
}

const JOB_STATUS_COLORS: Record<JobStatus, string> = {
  LEAD:               'bg-gray-700 text-gray-300',
  ESTIMATE_SENT:      'bg-blue-900 text-blue-300',
  INSURANCE_APPROVED: 'bg-indigo-900 text-indigo-300',
  SCHEDULED:          'bg-yellow-900 text-yellow-300',
  IN_PROGRESS:        'bg-orange-900 text-orange-300',
  COMPLETE:           'bg-green-900 text-green-300',
  INVOICED:           'bg-purple-900 text-purple-300',
  PAID:               'bg-emerald-900 text-emerald-300',
}

const ACTIVITY_ICONS: Record<ActivityType, React.ReactNode> = {
  NOTE:              <MessageSquare className="w-4 h-4 text-gray-400" />,
  CALL:              <PhoneCall className="w-4 h-4 text-green-400" />,
  EMAIL:             <AtSign className="w-4 h-4 text-blue-400" />,
  MEETING:           <Calendar className="w-4 h-4 text-purple-400" />,
  STATUS_CHANGE:     <AlertCircle className="w-4 h-4 text-yellow-400" />,
  DOCUMENT_UPLOADED: <Upload className="w-4 h-4 text-teal-400" />,
}

const TABS = ['Overview', 'Documents', 'Activity', 'Estimates', 'Jobs', 'Insurance', 'Inspections', 'Product Catalogs'] as const
type Tab = (typeof TABS)[number]

const DOC_TYPES = ['contract', 'estimate', 'invoice', 'insurance', 'photo', 'other']
const PHOTO_TYPES = ['all', 'before', 'during', 'after', 'damage']

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [customer, setCustomer] = useState<Customer | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('Overview')

  // Edit mode
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({ name: '', phone: '', email: '', address: '', notes: '' })
  const [saving, setSaving] = useState(false)

  // Documents
  const [documents, setDocuments] = useState<CustomerDocument[]>([])
  const [docsLoaded, setDocsLoaded] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadName, setUploadName] = useState('')
  const [uploadType, setUploadType] = useState('other')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Activity
  const [activity, setActivity] = useState<ActivityEntry[]>([])
  const [activityLoaded, setActivityLoaded] = useState(false)
  const [logType, setLogType] = useState<ActivityType>('NOTE')
  const [logNote, setLogNote] = useState('')
  const [logging, setLogging] = useState(false)

  // Inspections
  const [creatingInspection, setCreatingInspection] = useState(false)

  // Product Catalogs
  const [mfrDocs, setMfrDocs] = useState<MfrDoc[]>([])
  const [mfrDocsLoaded, setMfrDocsLoaded] = useState(false)
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set())
  const [sendingDocs, setSendingDocs] = useState(false)
  const [docsSent, setDocsSent] = useState(false)

  // Photos
  const [photoFilter, setPhotoFilter] = useState('all')
  const [lightbox, setLightbox] = useState<string | null>(null)

  // Send Email modal
  const [emailModalOpen, setEmailModalOpen] = useState(false)
  const [emailSubject, setEmailSubject] = useState('')
  const [emailBody, setEmailBody] = useState('')
  const [emailSending, setEmailSending] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const [emailError, setEmailError] = useState('')

  // ── Load customer ──

  useEffect(() => {
    fetch(`/api/admin/customers/${id}`)
      .then(r => r.json())
      .then(d => {
        setCustomer(d.customer)
        if (d.customer) {
          setEditForm({
            name: d.customer.name,
            phone: d.customer.phone,
            email: d.customer.email || '',
            address: d.customer.address || '',
            notes: d.customer.notes || '',
          })
        }
      })
      .finally(() => setLoading(false))
  }, [id])

  // ── Lazy-load on tab switch ──

  useEffect(() => {
    if (activeTab === 'Documents' && !docsLoaded) loadDocuments()
    if (activeTab === 'Activity' && !activityLoaded) loadActivity()
    if (activeTab === 'Product Catalogs' && !mfrDocsLoaded) loadMfrDocs()
  }, [activeTab]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadDocuments = async () => {
    const d = await fetch(`/api/admin/customers/${id}/documents`).then(r => r.json())
    setDocuments(d.documents || [])
    setDocsLoaded(true)
  }

  const loadActivity = async () => {
    const d = await fetch(`/api/admin/customers/${id}/activity`).then(r => r.json())
    setActivity(d.activity || [])
    setActivityLoaded(true)
  }

  const loadMfrDocs = async () => {
    const d = await fetch('/api/admin/manufacturer-docs').then(r => r.json())
    setMfrDocs((d.docs || []).filter((doc: MfrDoc) => doc.active))
    setMfrDocsLoaded(true)
  }

  const toggleDocSelection = (docId: string) => {
    setSelectedDocIds(prev => {
      const next = new Set(prev)
      if (next.has(docId)) next.delete(docId)
      else next.add(docId)
      return next
    })
    setDocsSent(false)
  }

  const sendSelectedDocs = async () => {
    if (!customer?.email || selectedDocIds.size === 0) return
    setSendingDocs(true)
    // Use first doc id as the route param (the handler uses body docIds, not the param)
    const firstId = Array.from(selectedDocIds)[0]
    await fetch(`/api/admin/manufacturer-docs/${firstId}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerEmail: customer.email,
        customerName: customer.name,
        docIds: Array.from(selectedDocIds),
      }),
    })
    setDocsSent(true)
    setSendingDocs(false)
  }

  // ── Save edits ──

  const saveCustomer = async () => {
    setSaving(true)
    await fetch(`/api/admin/customers/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm),
    })
    setCustomer(c => c ? { ...c, ...editForm } : c)
    setEditing(false)
    setSaving(false)
  }

  // ── Upload document ──

  const uploadDocument = async () => {
    if (!uploadFile) return
    setUploading(true)
    const fd = new FormData()
    fd.append('file', uploadFile)
    fd.append('display_name', uploadName || uploadFile.name)
    fd.append('doc_type', uploadType)
    const d = await fetch(`/api/admin/customers/${id}/documents`, { method: 'POST', body: fd }).then(r => r.json())
    if (d.document) {
      setDocuments(prev => [d.document, ...prev])
      setUploadFile(null)
      setUploadName('')
      setUploadType('other')
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
    setUploading(false)
  }

  const deleteDocument = async (docId: string) => {
    if (!confirm('Delete this document?')) return
    await fetch(`/api/admin/customers/${id}/documents/${docId}`, { method: 'DELETE' })
    setDocuments(prev => prev.filter(d => d.id !== docId))
  }

  // ── Log activity ──

  const logActivity = async () => {
    if (!logNote.trim() && logType === 'NOTE') return
    setLogging(true)
    const d = await fetch(`/api/admin/customers/${id}/activity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: logType, note: logNote, created_by: 'Admin' }),
    }).then(r => r.json())
    if (d.entry) {
      setActivity(prev => [d.entry, ...prev])
      setLogNote('')
    }
    setLogging(false)
  }

  // ── Create inspection ──

  const createInspection = async () => {
    setCreatingInspection(true)
    try {
      const res = await fetch('/api/admin/inspections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: id,
          address: customer?.address || customer?.name || '',
        }),
      })
      const data = await res.json()
      if (data.report?.id) {
        router.push(`/admin/inspections/${data.report.id}`)
      }
    } finally {
      setCreatingInspection(false)
    }
  }

  // ── Derived ──

  const allPhotos = customer?.jobs.flatMap(j => j.photos || []) ?? []
  const filteredPhotos = photoFilter === 'all' ? allPhotos : allPhotos.filter(p => p.type === photoFilter)

  const totalContracted = customer?.estimates.filter(e => ['APPROVED','INVOICED','PAID'].includes(e.status)).reduce((s, e) => s + e.our_total, 0) ?? 0
  const totalInsurance = customer?.estimates.filter(e => ['APPROVED','INVOICED','PAID'].includes(e.status)).reduce((s, e) => s + e.insurance_total, 0) ?? 0
  const activeJob = customer?.jobs.find(j => !['COMPLETE','INVOICED','PAID'].includes(j.status))
  const allClaims = customer?.jobs.flatMap(j => j.claim ? [j.claim] : []) ?? []

  if (loading) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <p className="text-gray-400">Loading…</p>
    </div>
  )

  if (!customer) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <p className="text-gray-400">Customer not found.</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Header */}
      <div className="bg-gray-900 border-b border-gray-800 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => router.back()} className="text-gray-400 hover:text-white transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-xl font-semibold text-white">{customer.name}</h1>
              <p className="text-sm text-gray-400">Customer since {fmtDate(customer.created_at)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {editing ? (
              <>
                <button onClick={() => setEditing(false)} className="px-3 py-1.5 text-sm text-gray-400 hover:text-white border border-gray-700 rounded-lg transition-colors flex items-center gap-1">
                  <X className="w-3.5 h-3.5" /> Cancel
                </button>
                <button onClick={saveCustomer} disabled={saving} className="px-3 py-1.5 text-sm bg-green-600 hover:bg-green-500 text-white rounded-lg transition-colors flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" /> {saving ? 'Saving…' : 'Save'}
                </button>
              </>
            ) : (
              <button onClick={() => setEditing(true)} className="px-3 py-1.5 text-sm text-gray-400 hover:text-white border border-gray-700 rounded-lg transition-colors flex items-center gap-1">
                <Edit2 className="w-3.5 h-3.5" /> Edit
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-gray-900 border-b border-gray-800 px-6">
        <div className="max-w-7xl mx-auto flex gap-0">
          {TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-yellow-400 text-yellow-400'
                  : 'border-transparent text-gray-400 hover:text-white'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-6">

        {/* ── Overview ── */}
        {activeTab === 'Overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Contact card */}
            <div className="lg:col-span-1 bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <User className="w-4 h-4 text-gray-400" />
                <h2 className="font-medium text-white">Contact Info</h2>
              </div>
              {editing ? (
                <div className="space-y-3">
                  {[
                    { label: 'Name', field: 'name' as const },
                    { label: 'Phone', field: 'phone' as const },
                    { label: 'Email', field: 'email' as const },
                    { label: 'Address', field: 'address' as const },
                  ].map(({ label, field }) => (
                    <div key={field}>
                      <label className="text-xs text-gray-400 mb-1 block">{label}</label>
                      <input
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-400"
                        value={editForm[field]}
                        onChange={e => setEditForm(f => ({ ...f, [field]: e.target.value }))}
                      />
                    </div>
                  ))}
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Notes</label>
                    <textarea
                      rows={3}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-400 resize-none"
                      value={editForm.notes}
                      onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="w-4 h-4 text-gray-500 flex-shrink-0" />
                    <a href={`tel:${customer.phone}`} className="text-blue-400 hover:underline">{customer.phone}</a>
                  </div>
                  {customer.email && (
                    <div className="flex items-center gap-2 text-sm">
                      <Mail className="w-4 h-4 text-gray-500 flex-shrink-0" />
                      <a href={`mailto:${customer.email}`} className="text-blue-400 hover:underline">{customer.email}</a>
                      <button onClick={() => setEmailModalOpen(true)} className="ml-2 px-2 py-0.5 bg-blue-800 hover:bg-blue-700 text-blue-300 text-xs font-semibold rounded transition-colors">
                        Send Email
                      </button>
                    </div>
                  )}
                  {customer.address && (
                    <div className="flex items-start gap-2 text-sm">
                      <MapPin className="w-4 h-4 text-gray-500 flex-shrink-0 mt-0.5" />
                      <span className="text-gray-300">{customer.address}</span>
                    </div>
                  )}
                  {customer.notes && (
                    <div className="mt-3 pt-3 border-t border-gray-800">
                      <p className="text-xs text-gray-500 mb-1">Notes</p>
                      <p className="text-sm text-gray-300">{customer.notes}</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Right column */}
            <div className="lg:col-span-2 space-y-4">
              {/* Stat cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Contracted', value: fmt(totalContracted), icon: <DollarSign className="w-4 h-4" />, color: 'text-green-400' },
                  { label: 'Insurance Approved', value: fmt(totalInsurance), icon: <Shield className="w-4 h-4" />, color: 'text-blue-400' },
                  { label: 'Estimates', value: String(customer.estimates.length), icon: <FileText className="w-4 h-4" />, color: 'text-yellow-400' },
                  { label: 'Jobs', value: String(customer.jobs.length), icon: <Briefcase className="w-4 h-4" />, color: 'text-purple-400' },
                ].map(c => (
                  <div key={c.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                    <div className={`${c.color} mb-2`}>{c.icon}</div>
                    <p className="text-xl font-bold text-white">{c.value}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{c.label}</p>
                  </div>
                ))}
              </div>

              {/* Active job */}
              {activeJob && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Activity className="w-4 h-4 text-orange-400" />
                      <h3 className="font-medium text-white">Active Job</h3>
                    </div>
                    <button
                      onClick={() => router.push(`/admin/jobs/${activeJob.id}`)}
                      className="text-xs text-gray-400 hover:text-white flex items-center gap-1"
                    >
                      View <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-gray-500 text-xs mb-0.5">Address</p>
                      <p className="text-gray-200">{activeJob.address}</p>
                    </div>
                    <div>
                      <p className="text-gray-500 text-xs mb-0.5">Status</p>
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${JOB_STATUS_COLORS[activeJob.status]}`}>
                        {activeJob.status.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <div>
                      <p className="text-gray-500 text-xs mb-0.5">Scheduled</p>
                      <p className="text-gray-200">{fmtDate(activeJob.scheduled_date)}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Photo preview */}
              {allPhotos.length > 0 && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Image className="w-4 h-4 text-teal-400" />
                      <h3 className="font-medium text-white">Photos ({allPhotos.length})</h3>
                    </div>
                    <button onClick={() => setActiveTab('Documents')} className="text-xs text-gray-400 hover:text-white">View all</button>
                  </div>
                  <div className="grid grid-cols-5 gap-2">
                    {allPhotos.slice(0, 10).map(p => (
                      <button
                        key={p.id}
                        onClick={() => setLightbox(p.url)}
                        className="aspect-square bg-gray-800 rounded-lg overflow-hidden hover:ring-2 ring-yellow-400 transition-all"
                      >
                        <img src={p.url} alt={p.caption || ''} className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Documents ── */}
        {activeTab === 'Documents' && (
          <div className="space-y-6">
            {/* Upload form */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h2 className="font-medium text-white mb-4 flex items-center gap-2">
                <Upload className="w-4 h-4 text-teal-400" /> Upload Document
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="sm:col-span-2">
                  <label className="text-xs text-gray-400 mb-1 block">File</label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    onChange={e => {
                      const f = e.target.files?.[0] || null
                      setUploadFile(f)
                      if (f && !uploadName) setUploadName(f.name.replace(/\.[^.]+$/, ''))
                    }}
                    className="w-full text-sm text-gray-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:bg-gray-700 file:text-gray-200 hover:file:bg-gray-600 cursor-pointer"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Display Name</label>
                  <input
                    value={uploadName}
                    onChange={e => setUploadName(e.target.value)}
                    placeholder="e.g. Signed Contract"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-400"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Type</label>
                  <select
                    value={uploadType}
                    onChange={e => setUploadType(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-400"
                  >
                    {DOC_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                  </select>
                </div>
              </div>
              <div className="mt-3">
                <button
                  onClick={uploadDocument}
                  disabled={!uploadFile || uploading}
                  className="px-4 py-2 bg-teal-600 hover:bg-teal-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm rounded-lg transition-colors flex items-center gap-2"
                >
                  <Upload className="w-3.5 h-3.5" />
                  {uploading ? 'Uploading…' : 'Upload'}
                </button>
              </div>
            </div>

            {/* Document list */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-800">
                <h2 className="font-medium text-white flex items-center gap-2">
                  <FileText className="w-4 h-4 text-gray-400" />
                  Documents ({documents.length})
                </h2>
              </div>
              {documents.length === 0 ? (
                <div className="px-5 py-10 text-center text-gray-500 text-sm">No documents uploaded yet.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800">
                      <th className="text-left px-5 py-3 text-gray-400 font-medium">Name</th>
                      <th className="text-left px-4 py-3 text-gray-400 font-medium">Type</th>
                      <th className="text-left px-4 py-3 text-gray-400 font-medium">Size</th>
                      <th className="text-left px-4 py-3 text-gray-400 font-medium">Uploaded</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {documents.map(doc => (
                      <Fragment key={doc.id}>
                        <tr className="border-b border-gray-800 hover:bg-gray-800/50">
                          <td className="px-5 py-3 text-gray-200">{doc.display_name}</td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-0.5 bg-gray-700 text-gray-300 text-xs rounded">{doc.doc_type}</span>
                          </td>
                          <td className="px-4 py-3 text-gray-400">{fmtSize(doc.size_bytes)}</td>
                          <td className="px-4 py-3 text-gray-400">{fmtDate(doc.uploaded_at)}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2 justify-end">
                              <a
                                href={`/api/admin/customers/${id}/documents/${doc.id}`}
                                download={doc.filename}
                                className="p-1.5 text-gray-400 hover:text-blue-400 hover:bg-gray-700 rounded transition-colors"
                                title="Download"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </a>
                              <button
                                onClick={() => deleteDocument(doc.id)}
                                className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-gray-700 rounded transition-colors"
                                title="Delete"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Photo gallery */}
            {allPhotos.length > 0 && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-medium text-white flex items-center gap-2">
                    <Image className="w-4 h-4 text-teal-400" /> Job Photos ({allPhotos.length})
                  </h2>
                  <div className="flex gap-1">
                    {PHOTO_TYPES.map(t => (
                      <button
                        key={t}
                        onClick={() => setPhotoFilter(t)}
                        className={`px-2.5 py-1 text-xs rounded-lg capitalize transition-colors ${photoFilter === t ? 'bg-yellow-400 text-black font-medium' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
                {filteredPhotos.length === 0 ? (
                  <p className="text-gray-500 text-sm">No photos for this filter.</p>
                ) : (
                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                    {filteredPhotos.map(p => (
                      <button
                        key={p.id}
                        onClick={() => setLightbox(p.url)}
                        className="aspect-square bg-gray-800 rounded-lg overflow-hidden hover:ring-2 ring-yellow-400 transition-all group relative"
                      >
                        <img src={p.url} alt={p.caption || ''} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <Eye className="w-5 h-5 text-white" />
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Activity ── */}
        {activeTab === 'Activity' && (
          <div className="space-y-5">
            {/* Log form */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h2 className="font-medium text-white mb-4 flex items-center gap-2">
                <Plus className="w-4 h-4 text-yellow-400" /> Log Activity
              </h2>
              <div className="flex gap-3">
                <select
                  value={logType}
                  onChange={e => setLogType(e.target.value as ActivityType)}
                  className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-400"
                >
                  {(['NOTE', 'CALL', 'EMAIL', 'MEETING', 'STATUS_CHANGE'] as ActivityType[]).map(t => (
                    <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
                  ))}
                </select>
                <input
                  value={logNote}
                  onChange={e => setLogNote(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && logActivity()}
                  placeholder="Add a note…"
                  className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-400"
                />
                <button
                  onClick={logActivity}
                  disabled={logging}
                  className="px-4 py-2 bg-yellow-500 hover:bg-yellow-400 text-black text-sm font-medium rounded-lg transition-colors"
                >
                  {logging ? '…' : 'Log'}
                </button>
              </div>
            </div>

            {/* Timeline */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-800">
                <h2 className="font-medium text-white">Activity Log</h2>
              </div>
              {activity.length === 0 ? (
                <div className="px-5 py-10 text-center text-gray-500 text-sm">No activity recorded yet.</div>
              ) : (
                <div className="divide-y divide-gray-800">
                  {activity.map(entry => (
                    <div key={entry.id} className="px-5 py-4 flex gap-3">
                      <div className="mt-0.5 flex-shrink-0">{ACTIVITY_ICONS[entry.type]}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-medium text-gray-300 uppercase tracking-wide">{entry.type.replace(/_/g, ' ')}</span>
                          {entry.created_by && <span className="text-xs text-gray-500">by {entry.created_by}</span>}
                          <span className="text-xs text-gray-600 ml-auto">{fmtDate(entry.created_at)}</span>
                        </div>
                        {entry.note && <p className="text-sm text-gray-300 mt-1">{entry.note}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Estimates ── */}
        {activeTab === 'Estimates' && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
              <h2 className="font-medium text-white">Estimates ({customer.estimates.length})</h2>
              <button
                onClick={() => router.push(`/admin/estimates/new?customer=${id}`)}
                className="px-3 py-1.5 text-sm bg-yellow-500 hover:bg-yellow-400 text-black font-medium rounded-lg transition-colors flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> New Estimate
              </button>
            </div>
            {/* EagleView — order by customer address before creating an estimate */}
            {customer.address && (
              <div className="px-5 py-4 border-b border-gray-800">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">EagleView Measurement</p>
                <p className="text-xs text-gray-600 mb-2">{customer.address}</p>
                <EvOrderWidget
                  address={customer.address}
                  customerId={id}
                  compact={true}
                />
              </div>
            )}
            {customer.estimates.length === 0 ? (
              <div className="px-5 py-10 text-center text-gray-500 text-sm">No estimates yet.</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="text-left px-5 py-3 text-gray-400 font-medium">Address</th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">Insurance Total</th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">Our Total</th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">Status</th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">Date</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {customer.estimates.map(e => (
                    <Fragment key={e.id}>
                      <tr className="border-b border-gray-800 hover:bg-gray-800/50">
                        <td className="px-5 py-3 text-gray-200">{e.address}</td>
                        <td className="px-4 py-3 text-gray-300">{fmt(e.insurance_total)}</td>
                        <td className="px-4 py-3 text-gray-300">{fmt(e.our_total)}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${ESTIMATE_STATUS_COLORS[e.status]}`}>
                            {e.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-400">{fmtDate(e.created_at)}</td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => router.push(`/admin/estimates/${e.id}`)}
                            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    </Fragment>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ── Jobs ── */}
        {activeTab === 'Jobs' && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
              <h2 className="font-medium text-white">Jobs ({customer.jobs.length})</h2>
              <button
                onClick={() => router.push(`/admin/jobs/new?customer=${id}`)}
                className="px-3 py-1.5 text-sm bg-yellow-500 hover:bg-yellow-400 text-black font-medium rounded-lg transition-colors flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> New Job
              </button>
            </div>
            {customer.jobs.length === 0 ? (
              <div className="px-5 py-10 text-center text-gray-500 text-sm">No jobs yet.</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="text-left px-5 py-3 text-gray-400 font-medium">Address</th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">Status</th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">Material</th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">Squares</th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">Scheduled</th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">Photos</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {customer.jobs.map(j => (
                    <Fragment key={j.id}>
                      <tr className="border-b border-gray-800 hover:bg-gray-800/50">
                        <td className="px-5 py-3 text-gray-200">{j.address}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${JOB_STATUS_COLORS[j.status]}`}>
                            {j.status.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-300">{j.material || '—'}</td>
                        <td className="px-4 py-3 text-gray-300">{j.squares ?? '—'}</td>
                        <td className="px-4 py-3 text-gray-400">{fmtDate(j.scheduled_date)}</td>
                        <td className="px-4 py-3 text-gray-400">{j.photos?.length ?? 0}</td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => router.push(`/admin/jobs/${j.id}`)}
                            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    </Fragment>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ── Insurance ── */}
        {activeTab === 'Insurance' && (
          <div className="space-y-4">
            {allClaims.length === 0 ? (
              <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-10 text-center text-gray-500 text-sm">
                No insurance claims on record.
              </div>
            ) : (
              allClaims.map(claim => (
                <div key={claim.id} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <Shield className="w-4 h-4 text-blue-400" />
                    <h3 className="font-medium text-white">{claim.insurer || 'Insurance Claim'}</h3>
                    <span className={`ml-auto px-2 py-0.5 rounded text-xs font-medium ${
                      claim.status === 'APPROVED' ? 'bg-green-900 text-green-300' :
                      claim.status === 'CLOSED' ? 'bg-gray-700 text-gray-300' :
                      'bg-blue-900 text-blue-300'
                    }`}>
                      {claim.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                    {[
                      { label: 'Claim #', value: claim.claim_no },
                      { label: 'Adjuster', value: claim.adjuster_name },
                      { label: 'Adjuster Phone', value: claim.adjuster_phone },
                      { label: 'Date Filed', value: fmtDate(claim.date_filed) },
                      { label: 'Approved Amount', value: fmt(claim.approved_amount) },
                      { label: 'Depreciation', value: fmt(claim.depreciation) },
                      { label: 'Supplement #', value: claim.supplement_no },
                      { label: 'Supplement Status', value: claim.supplement_status },
                      { label: 'Final Settlement', value: fmt(claim.final_settlement) },
                    ].map(({ label, value }) => (
                      <div key={label}>
                        <p className="text-gray-500 text-xs mb-0.5">{label}</p>
                        <p className="text-gray-200">{value || '—'}</p>
                      </div>
                    ))}
                  </div>
                  {claim.notes && (
                    <div className="mt-4 pt-4 border-t border-gray-800">
                      <p className="text-xs text-gray-500 mb-1">Notes</p>
                      <p className="text-sm text-gray-300">{claim.notes}</p>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
        {/* ── Inspections ── */}
        {activeTab === 'Inspections' && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
              <h2 className="font-medium text-white flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-red-400" />
                Inspections ({customer.inspection_reports.length})
              </h2>
              <button
                onClick={createInspection}
                disabled={creatingInspection}
                className="px-3 py-1.5 text-sm bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white font-medium rounded-lg transition-colors flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                {creatingInspection ? 'Creating…' : 'New Inspection'}
              </button>
            </div>
            {customer.inspection_reports.length === 0 ? (
              <div className="px-5 py-10 text-center text-gray-500 text-sm">
                No inspections yet.
                <button
                  onClick={createInspection}
                  disabled={creatingInspection}
                  className="block mx-auto mt-3 px-4 py-2 bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white text-sm rounded-lg transition-colors"
                >
                  {creatingInspection ? 'Creating…' : '+ Start First Inspection'}
                </button>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="text-left px-5 py-3 text-gray-400 font-medium">Address</th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">Date</th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">Inspector</th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">Damaged</th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {customer.inspection_reports.map(r => (
                    <Fragment key={r.id}>
                      <tr className="border-b border-gray-800 hover:bg-gray-800/50">
                        <td className="px-5 py-3 text-gray-200">{r.address}</td>
                        <td className="px-4 py-3 text-gray-400">{fmtDate(r.inspection_date)}</td>
                        <td className="px-4 py-3 text-gray-300">{r.inspector || '—'}</td>
                        <td className="px-4 py-3">
                          {r._count.items > 0 ? (
                            <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-900 text-red-300">
                              {r._count.items} section{r._count.items !== 1 ? 's' : ''}
                            </span>
                          ) : (
                            <span className="text-gray-500">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            r.status === 'COMPLETE' ? 'bg-green-900 text-green-300' : 'bg-gray-700 text-gray-300'
                          }`}>
                            {r.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => router.push(`/admin/inspections/${r.id}`)}
                            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    </Fragment>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ── Product Catalogs ── */}
        {activeTab === 'Product Catalogs' && (
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 mb-4">
              <BookOpen className="w-5 h-5 text-red-400" />
              <div>
                <h2 className="font-semibold text-white">Product Catalogs</h2>
                <p className="text-sm text-gray-400">Share manufacturer guides with this customer</p>
              </div>
            </div>

            {!customer.email && (
              <div className="mb-4 p-3 bg-yellow-900/30 border border-yellow-700 rounded-lg text-yellow-300 text-sm flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                Customer has no email on file — add an email address to send docs.
              </div>
            )}

            {!mfrDocsLoaded ? (
              <div className="space-y-3">
                {[...Array(2)].map((_, i) => <div key={i} className="h-16 bg-gray-800 rounded-xl animate-pulse" />)}
              </div>
            ) : mfrDocs.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <FileText className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p>No active product docs in the library yet.</p>
              </div>
            ) : (
              <div className="space-y-2 mb-4">
                {mfrDocs.map(doc => (
                  <label
                    key={doc.id}
                    className="flex items-center gap-3 bg-gray-800 border border-gray-700 rounded-xl p-4 cursor-pointer hover:border-gray-600 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={selectedDocIds.has(doc.id)}
                      onChange={() => toggleDocSelection(doc.id)}
                      className="w-4 h-4 rounded accent-red-600 flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wide ${mfrBadge(doc.manufacturer)}`}>
                          {doc.manufacturer}
                        </span>
                        <span className="text-sm font-medium text-white">{doc.name}</span>
                      </div>
                      {doc.description && (
                        <p className="text-xs text-gray-400 mt-0.5 truncate">{doc.description}</p>
                      )}
                    </div>
                    <a
                      href={`/docs/manufacturers/${doc.filename}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 flex-shrink-0"
                    >
                      <Eye className="w-3.5 h-3.5" /> View PDF
                    </a>
                  </label>
                ))}
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={sendSelectedDocs}
                disabled={sendingDocs || selectedDocIds.size === 0 || !customer.email}
                className="flex items-center gap-2 px-5 py-2.5 bg-red-700 hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
              >
                <Send className="w-4 h-4" />
                {sendingDocs ? 'Sending...' : `Send Selected to ${customer.name.split(' ')[0]}`}
              </button>
              {docsSent && customer.email && (
                <span className="text-green-400 text-sm font-medium flex items-center gap-1">
                  <Check className="w-4 h-4" /> Docs sent to {customer.email}
                </span>
              )}
            </div>
          </div>
        )}

      </div>

      {/* Send Email Modal */}
      {emailModalOpen && customer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setEmailModalOpen(false)}>
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-700 flex items-center justify-between">
              <h2 className="text-base font-bold text-white">Send Email to {customer.name}</h2>
              <button onClick={() => setEmailModalOpen(false)} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Subject</label>
                <input
                  type="text"
                  value={emailSubject}
                  onChange={e => setEmailSubject(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500"
                  placeholder="Subject"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Message</label>
                <textarea
                  rows={6}
                  value={emailBody}
                  onChange={e => setEmailBody(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none"
                  placeholder="Write your message..."
                />
              </div>
              {emailError && <p className="text-red-400 text-sm">{emailError}</p>}
              {emailSent && <p className="text-green-400 text-sm font-medium">Sent!</p>}
            </div>
            <div className="px-6 pb-5 flex justify-end gap-3">
              <button
                onClick={() => { setEmailModalOpen(false); setEmailSubject(''); setEmailBody(''); setEmailSent(false); setEmailError('') }}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                disabled={emailSending || !emailSubject || !emailBody}
                onClick={async () => {
                  setEmailSending(true)
                  setEmailError('')
                  try {
                    const res = await fetch(`/api/admin/customers/${id}/send-email`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ subject: emailSubject, body: emailBody }),
                    })
                    if (res.ok) {
                      setEmailSent(true)
                      setTimeout(() => { setEmailModalOpen(false); setEmailSubject(''); setEmailBody(''); setEmailSent(false) }, 1500)
                    } else {
                      const d = await res.json()
                      setEmailError(d.error || 'Failed to send')
                    }
                  } catch (e: any) {
                    setEmailError(e.message || 'Network error')
                  } finally {
                    setEmailSending(false)
                  }
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                {emailSending ? 'Sending...' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <button className="absolute top-4 right-4 text-white/60 hover:text-white">
            <X className="w-6 h-6" />
          </button>
          <img
            src={lightbox}
            alt=""
            className="max-w-full max-h-full rounded-xl object-contain"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  )
}
