'use client'

import { useState, useEffect, useCallback } from 'react'
import { FileText, Plus, Eye, Edit3, Trash2, Save, X, Copy, Check } from 'lucide-react'

interface Template {
  id: string
  slug: string
  category: string
  variant: string
  subject: string
  body: string
  body_text?: string
  is_active: boolean
  variables: string[]
  created_at: string
  updated_at: string
}

const CATEGORIES = ['roofing_outreach', 'storm_followup', 'estimate_followup', 'review_request', 'other']

export default function OutreachTemplatesPage() {
  const [templates, setTemplates]   = useState<Template[]>([])
  const [loading, setLoading]       = useState(true)
  const [activeCategory, setActiveCategory] = useState('all')
  const [editing, setEditing]       = useState<Template | null>(null)
  const [isNew, setIsNew]           = useState(false)
  const [bodyTab, setBodyTab]       = useState<'html' | 'text'>('html')
  const [previewHtml, setPreviewHtml] = useState('')
  const [showPreview, setShowPreview] = useState(false)
  const [saving, setSaving]         = useState(false)
  const [copied, setCopied]         = useState<string | null>(null)

  const fetchTemplates = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/admin/templates')
    const data = await res.json()
    setTemplates(data.templates || data)
    setLoading(false)
  }, [])

  useEffect(() => { fetchTemplates() }, [fetchTemplates])

  const filtered = activeCategory === 'all'
    ? templates
    : templates.filter((t) => t.category === activeCategory)

  const startEdit = (tmpl: Template) => {
    setEditing({ ...tmpl })
    setIsNew(false)
    setBodyTab('html')
    setPreviewHtml('')
    setShowPreview(false)
  }

  const startNew = () => {
    setEditing({
      id: '', slug: '', category: 'roofing_outreach', variant: 'v1',
      subject: '', body: '', body_text: '', is_active: true, variables: [],
      created_at: '', updated_at: '',
    })
    setIsNew(true)
    setBodyTab('html')
    setPreviewHtml('')
    setShowPreview(false)
  }

  const handlePreview = async () => {
    if (!editing || isNew) return
    const res = await fetch(`/api/admin/templates/${editing.id}/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        variables: { name: 'John Smith', first_name: 'John', address: '123 Oak Lane', city: 'Plano', phone: '(214) 555-1234', rep_name: 'Austin Peterson' },
      }),
    })
    const data = await res.json()
    setPreviewHtml(data.html)
    setShowPreview(true)
  }

  const handleSave = async () => {
    if (!editing) return
    setSaving(true)
    if (isNew) {
      await fetch('/api/admin/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: editing.slug, category: editing.category, variant: editing.variant,
          subject: editing.subject, emailBody: editing.body, bodyText: editing.body_text,
          variables: editing.variables,
        }),
      })
    } else {
      await fetch(`/api/admin/templates/${editing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: editing.subject, emailBody: editing.body, bodyText: editing.body_text,
          variant: editing.variant, category: editing.category,
          variables: editing.variables, is_active: editing.is_active,
        }),
      })
    }
    setSaving(false)
    setEditing(null)
    fetchTemplates()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this template? This cannot be undone.')) return
    await fetch(`/api/admin/templates/${id}`, { method: 'DELETE' })
    fetchTemplates()
  }

  const handleCopy = (v: string) => {
    navigator.clipboard.writeText(`{{${v}}}`)
    setCopied(v)
    setTimeout(() => setCopied(null), 1500)
  }

  const allCategories = ['all', ...CATEGORIES]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FileText className="h-7 w-7 text-red-600" />
            Email Templates
          </h1>
          <p className="text-sm text-gray-500 mt-1">{templates.length} templates</p>
        </div>
        <button
          onClick={startNew}
          className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700"
        >
          <Plus className="h-4 w-4" /> New Template
        </button>
      </div>

      {/* Category tabs */}
      <div className="flex gap-2 flex-wrap">
        {allCategories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              activeCategory === cat
                ? 'bg-red-600 text-white'
                : 'bg-white border border-gray-200 text-gray-700 hover:border-red-300'
            }`}
          >
            {cat === 'all' ? 'All' : cat.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
          </button>
        ))}
      </div>

      {/* Template list */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading...</div>
      ) : (
        <div className="grid gap-4">
          {filtered.map((tmpl) => (
            <div key={tmpl.id} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded text-gray-600">{tmpl.slug}</span>
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">{tmpl.category.replace(/_/g, ' ')}</span>
                    {tmpl.body_text
                      ? <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">HTML + Plain Text</span>
                      : <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded">HTML only</span>
                    }
                    {!tmpl.is_active && <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">Inactive</span>}
                  </div>
                  <p className="font-semibold text-gray-900">Subject: {tmpl.subject}</p>
                  <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                    {tmpl.body.replace(/<[^>]*>/g, '').substring(0, 160)}...
                  </p>
                  {tmpl.variables.length > 0 && (
                    <div className="flex gap-1 flex-wrap mt-2">
                      {tmpl.variables.map((v) => (
                        <button
                          key={v}
                          onClick={() => handleCopy(v)}
                          className="inline-flex items-center gap-1 text-xs bg-gray-50 border border-gray-200 text-gray-600 px-2 py-0.5 rounded hover:bg-gray-100"
                        >
                          {copied === v ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                          {`{{${v}}}`}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => startEdit(tmpl)}
                    className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                    title="Edit"
                  >
                    <Edit3 className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(tmpl.id)}
                    className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg"
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}

          {filtered.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <FileText className="h-10 w-10 mx-auto mb-3 text-gray-200" />
              <p>No templates in this category.</p>
            </div>
          )}
        </div>
      )}

      {/* Edit / New Modal */}
      {editing && (
        <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 overflow-y-auto py-8">
          <div className="bg-white rounded-2xl w-full max-w-4xl mx-4 shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-bold text-gray-900">
                {isNew ? 'New Template' : `Edit: ${editing.slug}`}
              </h2>
              <div className="flex gap-2">
                {!isNew && (
                  <button
                    onClick={handlePreview}
                    className="flex items-center gap-2 px-3 py-1.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
                  >
                    <Eye className="h-4 w-4" /> Preview HTML
                  </button>
                )}
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-2 px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
                >
                  <Save className="h-4 w-4" />{saving ? 'Saving...' : 'Save'}
                </button>
                <button onClick={() => { setEditing(null); setPreviewHtml(''); setShowPreview(false) }}>
                  <X className="h-5 w-5 text-gray-500 hover:text-gray-700" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-3 gap-3">
                {isNew && (
                  <div className="col-span-3">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Slug (unique identifier)</label>
                    <input
                      value={editing.slug}
                      onChange={(e) => setEditing((prev) => prev && ({ ...prev, slug: e.target.value }))}
                      placeholder="storm-followup-v1"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-red-500"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                  <select
                    value={editing.category}
                    onChange={(e) => setEditing((prev) => prev && ({ ...prev, category: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                  >
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Variant / Display Name</label>
                  <input
                    value={editing.variant}
                    onChange={(e) => setEditing((prev) => prev && ({ ...prev, variant: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select
                    value={editing.is_active ? 'active' : 'inactive'}
                    onChange={(e) => setEditing((prev) => prev && ({ ...prev, is_active: e.target.value === 'active' }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Subject Line</label>
                <input
                  value={editing.subject}
                  onChange={(e) => setEditing((prev) => prev && ({ ...prev, subject: e.target.value }))}
                  placeholder="Possible Storm Damage Alert: {{address}}"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>

              {/* Body editor with HTML / Plain Text tabs */}
              <div>
                <div className="flex border-b border-gray-200 mb-0">
                  <button
                    onClick={() => setBodyTab('html')}
                    className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${
                      bodyTab === 'html'
                        ? 'border-red-600 text-red-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    HTML Version
                  </button>
                  <button
                    onClick={() => setBodyTab('text')}
                    className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors flex items-center gap-1.5 ${
                      bodyTab === 'text'
                        ? 'border-red-600 text-red-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Plain Text Version
                    {!editing.body_text && (
                      <span className="text-[10px] bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded font-normal">missing</span>
                    )}
                  </button>
                  <span className="ml-auto self-center text-xs text-gray-400 pr-1">
                    Variables: {'{{name}}'} {'{{first_name}}'} {'{{address}}'} {'{{city}}'} {'{{rep_name}}'}
                  </span>
                </div>

                {bodyTab === 'html' ? (
                  <>
                    <textarea
                      value={editing.body}
                      onChange={(e) => setEditing((prev) => prev && ({ ...prev, body: e.target.value }))}
                      rows={16}
                      className="w-full border border-gray-300 border-t-0 rounded-b-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-red-500"
                      placeholder="HTML body — wrapped in branded template automatically on send."
                    />
                    <p className="text-xs text-gray-400 mt-1">Wrapped in the branded header/footer automatically when sent.</p>
                  </>
                ) : (
                  <>
                    <textarea
                      value={editing.body_text || ''}
                      onChange={(e) => setEditing((prev) => prev && ({ ...prev, body_text: e.target.value }))}
                      rows={16}
                      className="w-full border border-gray-300 border-t-0 rounded-b-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-red-500"
                      placeholder="Plain text version — no HTML tags. Sent alongside the HTML as a text/plain alternative. Improves deliverability."
                    />
                    <p className="text-xs text-gray-400 mt-1">Sent as text/plain alongside the HTML version. Include full signature here.</p>
                  </>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Variable Tags (comma-separated)</label>
                <input
                  value={editing.variables.join(', ')}
                  onChange={(e) => setEditing((prev) => prev && ({
                    ...prev,
                    variables: e.target.value.split(',').map((v) => v.trim()).filter(Boolean),
                  }))}
                  placeholder="name, address, city, phone"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>

              {showPreview && previewHtml && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-gray-700">HTML Preview</label>
                    <button onClick={() => setShowPreview(false)} className="text-xs text-gray-500 hover:text-gray-700">Close</button>
                  </div>
                  <div className="border border-gray-200 rounded-xl overflow-hidden" style={{ height: '500px' }}>
                    <iframe
                      srcDoc={previewHtml}
                      className="w-full h-full"
                      sandbox="allow-same-origin"
                      title="Email Preview"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
