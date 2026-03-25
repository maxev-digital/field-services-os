// app/admin/business-outreach/page.tsx
'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Search, ChevronDown, ChevronUp, ExternalLink, Star,
  Mail, Phone, Building2, MapPin, Filter, X, Check,
  ChevronLeft, ChevronRight, Megaphone, PhoneOff,
  Send, FileText, Plus, Trash2, Eye, Edit3, Save,
  AlertTriangle, CheckCircle, XCircle, Loader2, Copy,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Business {
  id: string;
  name: string;
  category: string | null;
  address: string | null;
  city: string | null;
  zip: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  rating: number | null;
  review_count: number;
  source: string;
  status: string;
  last_contacted_at: string | null;
  notes: string | null;
  created_at: string;
}

interface Template {
  id: string;
  slug: string;
  category: string;
  variant: string;
  subject: string;
  body: string;
  is_active: boolean;
  variables: string[];
  created_at: string;
  updated_at: string;
  _count?: { outreach_history: number };
}

interface SendResult {
  id: string;
  name: string;
  email: string | null;
  status: 'sent' | 'failed' | 'skipped';
  error?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUSES = ['NEW', 'CONTACTED', 'NO_RESPONSE', 'INTERESTED', 'CONVERTED', 'DNC'] as const;
const STATUS_COLORS: Record<string, string> = {
  NEW: 'bg-gray-600 text-gray-200',
  CONTACTED: 'bg-blue-900 text-blue-300',
  NO_RESPONSE: 'bg-yellow-900 text-yellow-300',
  INTERESTED: 'bg-green-900 text-green-300',
  CONVERTED: 'bg-emerald-900 text-emerald-300',
  DNC: 'bg-red-900 text-red-300',
};

const DFW_CITIES = [
  'Dallas', 'Fort Worth', 'Arlington', 'Plano', 'Irving', 'Garland',
  'Frisco', 'McKinney', 'Grand Prairie', 'Denton', 'Mesquite', 'Carrollton',
  'Richardson', 'Lewisville', 'Allen', 'Flower Mound', 'Mansfield', 'Euless',
  'Bedford', 'Grapevine', 'Cedar Hill', 'Wylie', 'Keller', 'Southlake',
  'Colleyville', 'Coppell', 'Prosper', 'Rowlett', 'DeSoto', 'Rockwall',
  'Burleson', 'Haltom City', 'The Colony', 'Little Elm', 'Sachse',
  'Duncanville', 'Waxahachie', 'Weatherford', 'Midlothian', 'Cleburne',
];

const SAMPLE_VARS: Record<string, string> = {
  name: 'Acme Roofing Co.',
  address: '1234 Main St',
  city: 'Frisco',
  phone: '(214) 555-0100',
  category: 'Roofing Contractor',
  website: 'acmeroofing.com',
};

type TabId = 'directory' | 'campaign' | 'templates';

// ─── Main Page Component ──────────────────────────────────────────────────────

export default function BusinessOutreachPage() {
  const [activeTab, setActiveTab] = useState<TabId>('directory');

  // ─── Directory State ──────────────────────────────────────────────────────
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [city, setCity] = useState('');
  const [status, setStatus] = useState('');
  const [hasEmail, setHasEmail] = useState(false);
  const [hasPhone, setHasPhone] = useState(false);

  // UI state
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  // Stats
  const [stats, setStats] = useState({ total: 0, withEmail: 0, withPhone: 0, contacted: 0 });

  // Debounced search
  const [searchInput, setSearchInput] = useState('');

  // ─── Templates State ──────────────────────────────────────────────────────
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [newTemplate, setNewTemplate] = useState(false);
  const [tplForm, setTplForm] = useState({
    slug: '', category: 'business_outreach', variant: 'default',
    subject: '', body: '', variables: 'name,address,city,phone,category,website',
    is_active: true,
  });
  const [tplSaving, setTplSaving] = useState(false);
  const [tplPreview, setTplPreview] = useState<string | null>(null);
  const [tplDeleteConfirm, setTplDeleteConfirm] = useState<string | null>(null);

  // ─── Campaign State ───────────────────────────────────────────────────────
  const [campaignStep, setCampaignStep] = useState(1);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [editBeforeSend, setEditBeforeSend] = useState(false);
  const [customSubject, setCustomSubject] = useState('');
  const [customBody, setCustomBody] = useState('');
  const [selectedMailbox, setSelectedMailbox] = useState(1);
  const [sending, setSending] = useState(false);
  const [sendProgress, setSendProgress] = useState(0);
  const [sendResults, setSendResults] = useState<{
    sent: number; failed: number; skipped: number; total: number; results: SendResult[];
  } | null>(null);

  // Cache selected businesses for campaign view
  const [selectedBusinesses, setSelectedBusinesses] = useState<Business[]>([]);

  // ─── Data Fetching ────────────────────────────────────────────────────────

  const fetchBusinesses = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set('page', String(page));
    if (search) params.set('search', search);
    if (category) params.set('category', category);
    if (city) params.set('city', city);
    if (status) params.set('status', status);
    if (hasEmail) params.set('has_email', 'true');
    if (hasPhone) params.set('has_phone', 'true');

    try {
      const res = await fetch(`/api/admin/business-directory?${params}`);
      const data = await res.json();
      setBusinesses(data.businesses || []);
      setTotal(data.total || 0);
      setPages(data.pages || 1);
      if (data.categories) setCategories(data.categories);
    } catch (err) {
      console.error('Failed to fetch businesses:', err);
    } finally {
      setLoading(false);
    }
  }, [page, search, category, city, status, hasEmail, hasPhone]);

  const fetchTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    try {
      const res = await fetch('/api/admin/templates');
      const data = await res.json();
      setTemplates(data.templates || []);
    } catch (err) {
      console.error('Failed to fetch templates:', err);
    } finally {
      setTemplatesLoading(false);
    }
  }, []);

  // Fetch stats once on mount
  useEffect(() => {
    (async () => {
      try {
        const [totalRes, emailRes, phoneRes, contactedRes] = await Promise.all([
          fetch('/api/admin/business-directory?limit=1'),
          fetch('/api/admin/business-directory?limit=1&has_email=true'),
          fetch('/api/admin/business-directory?limit=1&has_phone=true'),
          fetch('/api/admin/business-directory?limit=1&status=CONTACTED'),
        ]);
        const [t, e, p, c] = await Promise.all([
          totalRes.json(), emailRes.json(), phoneRes.json(), contactedRes.json(),
        ]);
        setStats({
          total: t.total || 0,
          withEmail: e.total || 0,
          withPhone: p.total || 0,
          contacted: c.total || 0,
        });
      } catch {}
    })();
  }, []);

  useEffect(() => { fetchBusinesses(); }, [fetchBusinesses]);

  useEffect(() => {
    if (activeTab === 'templates' || activeTab === 'campaign') {
      fetchTemplates();
    }
  }, [activeTab, fetchTemplates]);

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  // ─── Directory Helpers ────────────────────────────────────────────────────

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === businesses.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(businesses.map(b => b.id)));
    }
  };

  const updateStatus = async (id: string, newStatus: string) => {
    try {
      await fetch(`/api/admin/business-directory/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: newStatus,
          ...(newStatus === 'CONTACTED' ? { last_contacted_at: new Date().toISOString() } : {}),
        }),
      });
      setBusinesses(prev =>
        prev.map(b =>
          b.id === id
            ? { ...b, status: newStatus, ...(newStatus === 'CONTACTED' ? { last_contacted_at: new Date().toISOString() } : {}) }
            : b
        )
      );
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  };

  const bulkUpdateStatus = async (action: 'CONTACTED' | 'DNC') => {
    if (selected.size === 0) return;
    const ids = Array.from(selected);
    await Promise.all(
      ids.map(id =>
        fetch(`/api/admin/business-directory/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: action,
            ...(action === 'CONTACTED' ? { last_contacted_at: new Date().toISOString() } : {}),
          }),
        })
      )
    );
    setSelected(new Set());
    fetchBusinesses();
  };

  const openCampaign = () => {
    // Cache the selected businesses for campaign view
    const selBiz = businesses.filter(b => selected.has(b.id));
    setSelectedBusinesses(selBiz);
    setCampaignStep(1);
    setSelectedTemplate(null);
    setEditBeforeSend(false);
    setCustomSubject('');
    setCustomBody('');
    setSendResults(null);
    setSending(false);
    setActiveTab('campaign');
  };

  const renderStars = (rating: number | null) => {
    if (rating === null) return <span className="text-gray-600">--</span>;
    const full = Math.floor(rating);
    const half = rating - full >= 0.5;
    return (
      <span className="flex items-center gap-0.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star
            key={i}
            className={`w-3.5 h-3.5 ${
              i < full
                ? 'fill-yellow-400 text-yellow-400'
                : i === full && half
                ? 'fill-yellow-400/50 text-yellow-400'
                : 'text-gray-600'
            }`}
          />
        ))}
        <span className="ml-1 text-xs text-gray-400">{rating.toFixed(1)}</span>
      </span>
    );
  };

  const clearFilters = () => {
    setSearchInput(''); setSearch(''); setCategory(''); setCity('');
    setStatus(''); setHasEmail(false); setHasPhone(false); setPage(1);
  };

  const hasActiveFilters = search || category || city || status || hasEmail || hasPhone;

  // ─── Template Helpers ─────────────────────────────────────────────────────

  const resetTplForm = () => {
    setTplForm({
      slug: '', category: 'business_outreach', variant: 'default',
      subject: '', body: '', variables: 'name,address,city,phone,category,website',
      is_active: true,
    });
  };

  const startNewTemplate = () => {
    resetTplForm();
    setEditingTemplate(null);
    setNewTemplate(true);
  };

  const startEditTemplate = (tpl: Template) => {
    setTplForm({
      slug: tpl.slug,
      category: tpl.category,
      variant: tpl.variant,
      subject: tpl.subject,
      body: tpl.body,
      variables: tpl.variables.join(','),
      is_active: tpl.is_active,
    });
    setEditingTemplate(tpl);
    setNewTemplate(false);
  };

  const cancelEdit = () => {
    setEditingTemplate(null);
    setNewTemplate(false);
    resetTplForm();
  };

  const saveTemplate = async () => {
    setTplSaving(true);
    try {
      const payload = {
        slug: tplForm.slug,
        category: tplForm.category,
        variant: tplForm.variant,
        subject: tplForm.subject,
        body: tplForm.body,
        variables: tplForm.variables.split(',').map(v => v.trim()).filter(Boolean),
        is_active: tplForm.is_active,
      };

      if (editingTemplate) {
        // Update — use PATCH to templates/[id] if it exists, otherwise we re-create
        const res = await fetch(`/api/admin/templates/${editingTemplate.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to update template');
        }
      } else {
        const res = await fetch('/api/admin/templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to create template');
        }
      }

      cancelEdit();
      fetchTemplates();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setTplSaving(false);
    }
  };

  const deleteTemplate = async (id: string) => {
    try {
      await fetch(`/api/admin/templates/${id}`, { method: 'DELETE' });
      setTplDeleteConfirm(null);
      fetchTemplates();
    } catch (err) {
      console.error('Failed to delete template:', err);
    }
  };

  const previewBody = (body: string) => {
    let preview = body;
    for (const [key, value] of Object.entries(SAMPLE_VARS)) {
      const pattern = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
      preview = preview.replace(pattern, `<strong>${value}</strong>`);
    }
    return preview;
  };

  // ─── Campaign Helpers ─────────────────────────────────────────────────────

  const selectedWithEmail = selectedBusinesses.filter(b => b.email);
  const selectedWithoutEmail = selectedBusinesses.filter(b => !b.email);

  const handleSend = async () => {
    if (!selectedTemplate) return;
    setSending(true);
    setSendProgress(0);

    try {
      // Build IDs from all selected (including those in selected set but not in cached businesses)
      const ids = Array.from(selected);

      const res = await fetch('/api/admin/business-outreach/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_ids: ids,
          template_id: selectedTemplate.id,
          mailbox: selectedMailbox,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Send failed');

      setSendResults(data);
      setSendProgress(100);
      setCampaignStep(4); // results step
    } catch (err: any) {
      alert(`Send error: ${err.message}`);
    } finally {
      setSending(false);
    }
  };

  // ─── Render Tab Buttons ───────────────────────────────────────────────────

  const tabs: { id: TabId; label: string; icon: typeof Building2 }[] = [
    { id: 'directory', label: 'Directory', icon: Building2 },
    { id: 'campaign', label: 'Send Campaign', icon: Send },
    { id: 'templates', label: 'Templates', icon: FileText },
  ];

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <div className="p-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-bold text-white">Business Outreach</h1>
          <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-red-600 text-white uppercase tracking-wider">
            Cold Outreach
          </span>
        </div>
        <p className="text-gray-400 text-sm">
          DFW business directory — {stats.total.toLocaleString()} businesses available for outreach
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="flex items-center gap-1 mb-6 bg-gray-800 border border-gray-700 rounded-lg p-1 w-fit">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-red-600 text-white shadow-sm'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
            {tab.id === 'campaign' && selected.size > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-red-500 text-white">
                {selected.size}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* TAB 1: DIRECTORY                                                  */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'directory' && (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {[
              { label: 'Total Businesses', value: stats.total, icon: Building2 },
              { label: 'With Email', value: stats.withEmail, icon: Mail },
              { label: 'With Phone', value: stats.withPhone, icon: Phone },
              { label: 'Contacted', value: stats.contacted, icon: Megaphone },
            ].map(card => (
              <div key={card.label} className="bg-gray-800 border border-gray-700 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">{card.label}</span>
                  <card.icon className="w-4 h-4 text-red-500" />
                </div>
                <p className="text-2xl font-bold text-white">{card.value.toLocaleString()}</p>
              </div>
            ))}
          </div>

          {/* Filters */}
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-4">
            <div className="flex items-center gap-2 mb-3">
              <Filter className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-medium text-gray-300">Filters</span>
              {hasActiveFilters && (
                <button onClick={clearFilters} className="ml-auto text-xs text-red-400 hover:text-red-300 flex items-center gap-1">
                  <X className="w-3 h-3" /> Clear all
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {/* Search */}
              <div className="col-span-2 md:col-span-1 lg:col-span-2 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="text"
                  placeholder="Search name, address, phone, email..."
                  value={searchInput}
                  onChange={e => setSearchInput(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-gray-900 border border-gray-700 rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:border-red-600"
                />
              </div>

              {/* Category */}
              <select
                value={category}
                onChange={e => { setCategory(e.target.value); setPage(1); }}
                className="bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-red-600"
              >
                <option value="">All Categories</option>
                {categories.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>

              {/* City */}
              <select
                value={city}
                onChange={e => { setCity(e.target.value); setPage(1); }}
                className="bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-red-600"
              >
                <option value="">All Cities</option>
                {DFW_CITIES.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>

              {/* Status */}
              <select
                value={status}
                onChange={e => { setStatus(e.target.value); setPage(1); }}
                className="bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-red-600"
              >
                <option value="">All Statuses</option>
                {STATUSES.map(s => (
                  <option key={s} value={s}>{s.replace('_', ' ')}</option>
                ))}
              </select>

              {/* Toggle buttons */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setHasEmail(!hasEmail); setPage(1); }}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded text-xs font-medium border transition-colors ${
                    hasEmail
                      ? 'bg-red-700 border-red-600 text-white'
                      : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-600'
                  }`}
                >
                  <Mail className="w-3.5 h-3.5" /> Email
                </button>
                <button
                  onClick={() => { setHasPhone(!hasPhone); setPage(1); }}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded text-xs font-medium border transition-colors ${
                    hasPhone
                      ? 'bg-red-700 border-red-600 text-white'
                      : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-600'
                  }`}
                >
                  <Phone className="w-3.5 h-3.5" /> Phone
                </button>
              </div>
            </div>
          </div>

          {/* Floating Action Bar */}
          {selected.size > 0 && (
            <div className="bg-red-900/30 border border-red-700 rounded-lg px-4 py-3 mb-4 flex items-center gap-4">
              <span className="text-sm text-red-300 font-medium">
                {selected.size} selected
              </span>
              <div className="flex gap-2">
                <button
                  onClick={openCampaign}
                  className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded transition-colors flex items-center gap-1.5"
                >
                  <Mail className="w-3.5 h-3.5" /> Send Email to {selected.size} selected
                </button>
                <button
                  onClick={() => bulkUpdateStatus('CONTACTED')}
                  className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-xs font-medium rounded transition-colors flex items-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" /> Mark Contacted
                </button>
                <button
                  onClick={() => bulkUpdateStatus('DNC')}
                  className="px-3 py-1.5 bg-red-900 hover:bg-red-800 text-red-200 text-xs font-medium rounded transition-colors flex items-center gap-1.5"
                >
                  <PhoneOff className="w-3.5 h-3.5" /> Mark DNC
                </button>
              </div>
              <button
                onClick={() => setSelected(new Set())}
                className="ml-auto text-xs text-gray-400 hover:text-gray-300"
              >
                Clear selection
              </button>
            </div>
          )}

          {/* Table */}
          <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700 bg-gray-800/50">
                    <th className="px-3 py-3 text-left">
                      <input
                        type="checkbox"
                        checked={businesses.length > 0 && selected.size === businesses.length}
                        onChange={toggleSelectAll}
                        className="rounded border-gray-600 bg-gray-900 text-red-600 focus:ring-red-600"
                      />
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Name</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Category</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">City</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Phone</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Email</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Website</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Rating</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Status</th>
                    <th className="px-3 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={10} className="px-3 py-12 text-center text-gray-500">
                        <Loader2 className="w-5 h-5 animate-spin inline-block mr-2" />
                        Loading businesses...
                      </td>
                    </tr>
                  ) : businesses.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-3 py-12 text-center text-gray-500">
                        No businesses found matching your filters.
                      </td>
                    </tr>
                  ) : (
                    businesses.map(biz => (
                      <>
                        <tr
                          key={biz.id}
                          className={`border-b border-gray-700/50 hover:bg-gray-750 transition-colors ${
                            selected.has(biz.id) ? 'bg-red-900/10' : ''
                          }`}
                        >
                          <td className="px-3 py-2.5">
                            <input
                              type="checkbox"
                              checked={selected.has(biz.id)}
                              onChange={() => toggleSelect(biz.id)}
                              className="rounded border-gray-600 bg-gray-900 text-red-600 focus:ring-red-600"
                            />
                          </td>
                          <td className="px-3 py-2.5">
                            <span className="font-medium text-white">{biz.name}</span>
                          </td>
                          <td className="px-3 py-2.5 text-gray-400">{biz.category || '--'}</td>
                          <td className="px-3 py-2.5 text-gray-400">{biz.city || '--'}</td>
                          <td className="px-3 py-2.5">
                            {biz.phone ? (
                              <a href={`tel:${biz.phone}`} className="text-red-400 hover:text-red-300">{biz.phone}</a>
                            ) : (
                              <span className="text-gray-600">--</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5">
                            {biz.email ? (
                              <a href={`mailto:${biz.email}`} className="text-red-400 hover:text-red-300 truncate block max-w-[180px]">
                                {biz.email}
                              </a>
                            ) : (
                              <span className="text-gray-600">--</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5">
                            {biz.website ? (
                              <a
                                href={biz.website.startsWith('http') ? biz.website : `https://${biz.website}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-red-400 hover:text-red-300 flex items-center gap-1"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                                <span className="truncate max-w-[120px]">Link</span>
                              </a>
                            ) : (
                              <span className="text-gray-600">--</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5">{renderStars(biz.rating)}</td>
                          <td className="px-3 py-2.5">
                            <select
                              value={biz.status}
                              onChange={e => updateStatus(biz.id, e.target.value)}
                              className={`text-xs font-medium rounded px-2 py-1 border-0 focus:outline-none focus:ring-1 focus:ring-red-600 cursor-pointer ${
                                STATUS_COLORS[biz.status] || 'bg-gray-600 text-gray-200'
                              }`}
                            >
                              {STATUSES.map(s => (
                                <option key={s} value={s}>{s.replace('_', ' ')}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-3 py-2.5">
                            <button
                              onClick={() => setExpandedRow(expandedRow === biz.id ? null : biz.id)}
                              className="text-gray-500 hover:text-gray-300 transition-colors"
                            >
                              {expandedRow === biz.id ? (
                                <ChevronUp className="w-4 h-4" />
                              ) : (
                                <ChevronDown className="w-4 h-4" />
                              )}
                            </button>
                          </td>
                        </tr>
                        {expandedRow === biz.id && (
                          <tr key={`${biz.id}-detail`} className="border-b border-gray-700/50 bg-gray-900/50">
                            <td colSpan={10} className="px-6 py-4">
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                <div>
                                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Address</p>
                                  <p className="text-gray-300">{biz.address || 'N/A'}</p>
                                  {biz.zip && <p className="text-gray-400 text-xs">{biz.city}, TX {biz.zip}</p>}
                                </div>
                                <div>
                                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Reviews</p>
                                  <p className="text-gray-300">{biz.review_count} reviews</p>
                                  <p className="text-gray-400 text-xs">Source: {biz.source}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Last Contacted</p>
                                  <p className="text-gray-300">
                                    {biz.last_contacted_at
                                      ? new Date(biz.last_contacted_at).toLocaleDateString()
                                      : 'Never'}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Notes</p>
                                  <p className="text-gray-300">{biz.notes || 'No notes'}</p>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-700">
                <p className="text-sm text-gray-400">
                  Showing {((page - 1) * 50) + 1}–{Math.min(page * 50, total)} of {total.toLocaleString()}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage(Math.max(1, page - 1))}
                    disabled={page === 1}
                    className="p-1.5 rounded border border-gray-700 text-gray-400 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-sm text-gray-300">
                    Page {page} of {pages}
                  </span>
                  <button
                    onClick={() => setPage(Math.min(pages, page + 1))}
                    disabled={page === pages}
                    className="p-1.5 rounded border border-gray-700 text-gray-400 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* TAB 2: SEND CAMPAIGN                                              */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'campaign' && (
        <div className="space-y-6">
          {/* No selection warning */}
          {selected.size === 0 && !sendResults && (
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-8 text-center">
              <AlertTriangle className="w-8 h-8 text-yellow-500 mx-auto mb-3" />
              <p className="text-gray-300 text-lg font-medium mb-2">No businesses selected</p>
              <p className="text-gray-500 text-sm mb-4">
                Go to the Directory tab and select businesses to send emails to.
              </p>
              <button
                onClick={() => setActiveTab('directory')}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded transition-colors"
              >
                Go to Directory
              </button>
            </div>
          )}

          {selected.size > 0 && !sendResults && (
            <>
              {/* Step indicators */}
              <div className="flex items-center gap-2 mb-2">
                {[
                  { step: 1, label: 'Review Selection' },
                  { step: 2, label: 'Choose Template' },
                  { step: 3, label: 'Confirm & Send' },
                ].map((s, i) => (
                  <div key={s.step} className="flex items-center gap-2">
                    {i > 0 && <div className="w-8 h-px bg-gray-700" />}
                    <button
                      onClick={() => {
                        if (s.step <= campaignStep) setCampaignStep(s.step);
                      }}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                        campaignStep === s.step
                          ? 'bg-red-600 text-white'
                          : campaignStep > s.step
                          ? 'bg-red-900/40 text-red-300 cursor-pointer'
                          : 'bg-gray-800 text-gray-500 cursor-default'
                      }`}
                    >
                      <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border border-current">
                        {campaignStep > s.step ? <Check className="w-3 h-3" /> : s.step}
                      </span>
                      {s.label}
                    </button>
                  </div>
                ))}
              </div>

              {/* Step 1: Review Selection */}
              {campaignStep === 1 && (
                <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-white mb-4">Review Selected Businesses</h3>
                  <div className="grid grid-cols-3 gap-4 mb-6">
                    <div className="bg-gray-900 rounded-lg p-4 text-center">
                      <p className="text-2xl font-bold text-white">{selected.size}</p>
                      <p className="text-xs text-gray-400 mt-1">Total Selected</p>
                    </div>
                    <div className="bg-gray-900 rounded-lg p-4 text-center">
                      <p className="text-2xl font-bold text-green-400">{selectedWithEmail.length}</p>
                      <p className="text-xs text-gray-400 mt-1">With Email</p>
                    </div>
                    <div className="bg-gray-900 rounded-lg p-4 text-center">
                      <p className="text-2xl font-bold text-yellow-400">{selectedWithoutEmail.length}</p>
                      <p className="text-xs text-gray-400 mt-1">No Email (will skip)</p>
                    </div>
                  </div>

                  {/* Preview list */}
                  <div className="max-h-64 overflow-y-auto border border-gray-700 rounded-lg">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-gray-800">
                        <tr className="border-b border-gray-700">
                          <th className="px-3 py-2 text-left text-xs text-gray-400 font-medium">Name</th>
                          <th className="px-3 py-2 text-left text-xs text-gray-400 font-medium">Email</th>
                          <th className="px-3 py-2 text-left text-xs text-gray-400 font-medium">City</th>
                          <th className="px-3 py-2 text-left text-xs text-gray-400 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedBusinesses.map(biz => (
                          <tr key={biz.id} className="border-b border-gray-700/50">
                            <td className="px-3 py-2 text-white">{biz.name}</td>
                            <td className="px-3 py-2">
                              {biz.email ? (
                                <span className="text-green-400">{biz.email}</span>
                              ) : (
                                <span className="text-yellow-500 text-xs">No email</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-gray-400">{biz.city || '--'}</td>
                            <td className="px-3 py-2">
                              <span className={`text-xs px-2 py-0.5 rounded ${STATUS_COLORS[biz.status] || 'bg-gray-600 text-gray-200'}`}>
                                {biz.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                        {/* Note about any IDs selected but not in current page cache */}
                        {selected.size > selectedBusinesses.length && (
                          <tr className="border-b border-gray-700/50">
                            <td colSpan={4} className="px-3 py-2 text-gray-500 text-xs italic">
                              + {selected.size - selectedBusinesses.length} additional businesses selected from other pages
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex justify-end mt-4">
                    <button
                      onClick={() => setCampaignStep(2)}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded transition-colors flex items-center gap-2"
                    >
                      Next: Choose Template <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* Step 2: Choose Template */}
              {campaignStep === 2 && (
                <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-white mb-4">Choose Email Template</h3>

                  {/* Template selector */}
                  <div className="mb-4">
                    <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
                      Select Template
                    </label>
                    <select
                      value={selectedTemplate?.id || ''}
                      onChange={e => {
                        const tpl = templates.find(t => t.id === e.target.value);
                        setSelectedTemplate(tpl || null);
                        if (tpl) {
                          setCustomSubject(tpl.subject);
                          setCustomBody(tpl.body);
                        }
                      }}
                      className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2.5 text-sm text-white focus:outline-none focus:border-red-600"
                    >
                      <option value="">-- Select a template --</option>
                      {templates.filter(t => t.is_active).map(tpl => (
                        <option key={tpl.id} value={tpl.id}>
                          [{tpl.category}] {tpl.slug} — {tpl.subject}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Mailbox selector */}
                  <div className="mb-4">
                    <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
                      Send From Mailbox
                    </label>
                    <select
                      value={selectedMailbox}
                      onChange={e => setSelectedMailbox(Number(e.target.value))}
                      className="w-full max-w-xs bg-gray-900 border border-gray-700 rounded px-3 py-2.5 text-sm text-white focus:outline-none focus:border-red-600"
                    >
                      <option value={1}>Mailbox 1 (Primary)</option>
                      <option value={2}>Mailbox 2</option>
                      <option value={3}>Mailbox 3</option>
                      <option value={4}>Mailbox 4</option>
                    </select>
                  </div>

                  {/* Template preview */}
                  {selectedTemplate && (
                    <div className="space-y-4">
                      {/* Edit toggle */}
                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={editBeforeSend}
                            onChange={e => setEditBeforeSend(e.target.checked)}
                            className="rounded border-gray-600 bg-gray-900 text-red-600 focus:ring-red-600"
                          />
                          <span className="text-sm text-gray-300">Edit before sending</span>
                        </label>
                      </div>

                      {editBeforeSend ? (
                        <div className="space-y-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-400 mb-1">Subject</label>
                            <input
                              type="text"
                              value={customSubject}
                              onChange={e => setCustomSubject(e.target.value)}
                              className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-red-600"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-400 mb-1">Body (HTML)</label>
                            <textarea
                              value={customBody}
                              onChange={e => setCustomBody(e.target.value)}
                              rows={12}
                              className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-red-600"
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
                          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Subject Preview</p>
                          <p className="text-white font-medium mb-4">{previewBody(selectedTemplate.subject)}</p>
                          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Body Preview</p>
                          <div
                            className="text-gray-300 text-sm prose prose-invert prose-sm max-w-none"
                            dangerouslySetInnerHTML={{ __html: previewBody(selectedTemplate.body) }}
                          />
                          <p className="text-xs text-gray-600 mt-3 italic">
                            Variables shown with sample values in bold
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex justify-between mt-4">
                    <button
                      onClick={() => setCampaignStep(1)}
                      className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded transition-colors flex items-center gap-2"
                    >
                      <ChevronLeft className="w-4 h-4" /> Back
                    </button>
                    <button
                      onClick={() => setCampaignStep(3)}
                      disabled={!selectedTemplate}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-medium rounded transition-colors flex items-center gap-2"
                    >
                      Next: Confirm <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* Step 3: Confirm & Send */}
              {campaignStep === 3 && (
                <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-white mb-4">Confirm & Send</h3>

                  <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 mb-6">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Businesses Selected</p>
                        <p className="text-xl font-bold text-white">{selected.size}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">With Email</p>
                        <p className="text-xl font-bold text-green-400">{selectedWithEmail.length}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Template</p>
                        <p className="text-sm font-medium text-white">{selectedTemplate?.slug}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{selectedTemplate?.subject}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Mailbox</p>
                        <p className="text-sm font-medium text-white">Mailbox {selectedMailbox}</p>
                      </div>
                    </div>
                  </div>

                  {editBeforeSend && (
                    <div className="bg-yellow-900/20 border border-yellow-700/50 rounded-lg p-3 mb-4 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-yellow-500 mt-0.5 flex-shrink-0" />
                      <p className="text-sm text-yellow-300">
                        Custom edits applied. Subject: &ldquo;{customSubject}&rdquo;
                      </p>
                    </div>
                  )}

                  {sending && (
                    <div className="mb-6">
                      <div className="flex items-center gap-3 mb-2">
                        <Loader2 className="w-4 h-4 text-red-500 animate-spin" />
                        <span className="text-sm text-gray-300">Sending emails...</span>
                      </div>
                      <div className="w-full bg-gray-700 rounded-full h-2">
                        <div
                          className="bg-red-600 h-2 rounded-full transition-all duration-500"
                          style={{ width: `${sendProgress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex justify-between">
                    <button
                      onClick={() => setCampaignStep(2)}
                      disabled={sending}
                      className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white text-sm font-medium rounded transition-colors flex items-center gap-2"
                    >
                      <ChevronLeft className="w-4 h-4" /> Back
                    </button>
                    <button
                      onClick={handleSend}
                      disabled={sending}
                      className="px-6 py-2.5 bg-red-600 hover:bg-red-700 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-bold rounded transition-colors flex items-center gap-2"
                    >
                      {sending ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" /> Sending...
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4" /> Send Now
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Step 4: Results */}
          {sendResults && (
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
              <div className="text-center mb-6">
                <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
                <h3 className="text-xl font-bold text-white">Campaign Complete</h3>
              </div>

              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-green-900/30 border border-green-800 rounded-lg p-4 text-center">
                  <p className="text-3xl font-bold text-green-400">{sendResults.sent}</p>
                  <p className="text-xs text-green-400/70 mt-1 uppercase tracking-wider">Sent</p>
                </div>
                <div className="bg-red-900/30 border border-red-800 rounded-lg p-4 text-center">
                  <p className="text-3xl font-bold text-red-400">{sendResults.failed}</p>
                  <p className="text-xs text-red-400/70 mt-1 uppercase tracking-wider">Failed</p>
                </div>
                <div className="bg-yellow-900/30 border border-yellow-800 rounded-lg p-4 text-center">
                  <p className="text-3xl font-bold text-yellow-400">{sendResults.skipped}</p>
                  <p className="text-xs text-yellow-400/70 mt-1 uppercase tracking-wider">Skipped</p>
                </div>
              </div>

              {/* Detailed results */}
              {sendResults.results && sendResults.results.length > 0 && (
                <div className="max-h-64 overflow-y-auto border border-gray-700 rounded-lg mb-6">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-gray-800">
                      <tr className="border-b border-gray-700">
                        <th className="px-3 py-2 text-left text-xs text-gray-400 font-medium">Business</th>
                        <th className="px-3 py-2 text-left text-xs text-gray-400 font-medium">Email</th>
                        <th className="px-3 py-2 text-left text-xs text-gray-400 font-medium">Result</th>
                        <th className="px-3 py-2 text-left text-xs text-gray-400 font-medium">Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sendResults.results.map((r, i) => (
                        <tr key={i} className="border-b border-gray-700/50">
                          <td className="px-3 py-2 text-white">{r.name}</td>
                          <td className="px-3 py-2 text-gray-400">{r.email || '--'}</td>
                          <td className="px-3 py-2">
                            {r.status === 'sent' && (
                              <span className="flex items-center gap-1 text-green-400 text-xs">
                                <CheckCircle className="w-3.5 h-3.5" /> Sent
                              </span>
                            )}
                            {r.status === 'failed' && (
                              <span className="flex items-center gap-1 text-red-400 text-xs">
                                <XCircle className="w-3.5 h-3.5" /> Failed
                              </span>
                            )}
                            {r.status === 'skipped' && (
                              <span className="flex items-center gap-1 text-yellow-400 text-xs">
                                <AlertTriangle className="w-3.5 h-3.5" /> Skipped
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-gray-500 text-xs">{r.error || '--'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex justify-center gap-3">
                <button
                  onClick={() => {
                    setSendResults(null);
                    setSelected(new Set());
                    setSelectedBusinesses([]);
                    setCampaignStep(1);
                    setActiveTab('directory');
                    fetchBusinesses();
                  }}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded transition-colors"
                >
                  Back to Directory
                </button>
                <button
                  onClick={() => {
                    setSendResults(null);
                    setCampaignStep(1);
                    setSelected(new Set());
                    setSelectedBusinesses([]);
                  }}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded transition-colors"
                >
                  New Campaign
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* TAB 3: TEMPLATES                                                  */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'templates' && (
        <div className="space-y-6">
          {/* Header + Create button */}
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white">Outreach Templates</h3>
            {!newTemplate && !editingTemplate && (
              <button
                onClick={startNewTemplate}
                className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded transition-colors flex items-center gap-2"
              >
                <Plus className="w-4 h-4" /> New Template
              </button>
            )}
          </div>

          {/* Create / Edit Form */}
          {(newTemplate || editingTemplate) && (
            <div className="bg-gray-800 border border-red-700/50 rounded-lg p-6">
              <h4 className="text-sm font-semibold text-white mb-4">
                {editingTemplate ? `Edit: ${editingTemplate.slug}` : 'Create New Template'}
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Slug (unique ID)</label>
                  <input
                    type="text"
                    value={tplForm.slug}
                    onChange={e => setTplForm(f => ({ ...f, slug: e.target.value }))}
                    placeholder="e.g. biz-intro-v1"
                    className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-red-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Category</label>
                  <input
                    type="text"
                    value={tplForm.category}
                    onChange={e => setTplForm(f => ({ ...f, category: e.target.value }))}
                    placeholder="e.g. business_outreach"
                    className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-red-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Variant</label>
                  <input
                    type="text"
                    value={tplForm.variant}
                    onChange={e => setTplForm(f => ({ ...f, variant: e.target.value }))}
                    placeholder="e.g. default"
                    className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-red-600"
                  />
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-xs font-medium text-gray-400 mb-1">Subject</label>
                <input
                  type="text"
                  value={tplForm.subject}
                  onChange={e => setTplForm(f => ({ ...f, subject: e.target.value }))}
                  placeholder="e.g. Partnership opportunity with {{name}}"
                  className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-red-600"
                />
              </div>

              <div className="mb-4">
                <label className="block text-xs font-medium text-gray-400 mb-1">Body (HTML)</label>
                <textarea
                  value={tplForm.body}
                  onChange={e => setTplForm(f => ({ ...f, body: e.target.value }))}
                  rows={10}
                  placeholder={'<p>Hi {{name}},</p>\n<p>I noticed your business in {{city}}...</p>'}
                  className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-red-600"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">
                    Variables (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={tplForm.variables}
                    onChange={e => setTplForm(f => ({ ...f, variables: e.target.value }))}
                    placeholder="name,address,city,phone,category,website"
                    className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-red-600"
                  />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={tplForm.is_active}
                      onChange={e => setTplForm(f => ({ ...f, is_active: e.target.checked }))}
                      className="rounded border-gray-600 bg-gray-900 text-red-600 focus:ring-red-600"
                    />
                    <span className="text-sm text-gray-300">Active</span>
                  </label>
                </div>
              </div>

              {/* Preview */}
              {tplForm.body && (
                <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 mb-4">
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Preview (with sample data)</p>
                  <p className="text-white font-medium mb-2">{previewBody(tplForm.subject)}</p>
                  <div
                    className="text-gray-300 text-sm prose prose-invert prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ __html: previewBody(tplForm.body) }}
                  />
                </div>
              )}

              <div className="flex justify-end gap-3">
                <button
                  onClick={cancelEdit}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={saveTemplate}
                  disabled={tplSaving || !tplForm.slug || !tplForm.subject || !tplForm.body}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-medium rounded transition-colors flex items-center gap-2"
                >
                  {tplSaving ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
                  ) : (
                    <><Save className="w-4 h-4" /> {editingTemplate ? 'Update' : 'Create'} Template</>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Templates List */}
          {templatesLoading ? (
            <div className="text-center py-12">
              <Loader2 className="w-6 h-6 text-gray-500 animate-spin mx-auto mb-2" />
              <p className="text-gray-500 text-sm">Loading templates...</p>
            </div>
          ) : templates.length === 0 ? (
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-8 text-center">
              <FileText className="w-8 h-8 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400">No templates found. Create one to get started.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {templates.map(tpl => (
                <div
                  key={tpl.id}
                  className="bg-gray-800 border border-gray-700 rounded-lg p-4 hover:border-gray-600 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-white">{tpl.slug}</span>
                        <span className="text-xs px-2 py-0.5 rounded bg-gray-700 text-gray-400">{tpl.category}</span>
                        <span className="text-xs px-2 py-0.5 rounded bg-gray-700 text-gray-400">{tpl.variant}</span>
                        {tpl.is_active ? (
                          <span className="text-xs px-2 py-0.5 rounded bg-green-900 text-green-400">Active</span>
                        ) : (
                          <span className="text-xs px-2 py-0.5 rounded bg-gray-700 text-gray-500">Inactive</span>
                        )}
                        {tpl._count && (
                          <span className="text-xs text-gray-500">
                            Used {tpl._count.outreach_history}x
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-300 mb-1">
                        <span className="text-gray-500">Subject:</span> {tpl.subject}
                      </p>
                      <p className="text-xs text-gray-500 truncate max-w-2xl">
                        {tpl.body.replace(/<[^>]*>/g, '').slice(0, 120)}...
                      </p>
                    </div>
                    <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                      <button
                        onClick={() => setTplPreview(tplPreview === tpl.id ? null : tpl.id)}
                        className="p-1.5 rounded text-gray-500 hover:text-gray-300 hover:bg-gray-700 transition-colors"
                        title="Preview"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => startEditTemplate(tpl)}
                        className="p-1.5 rounded text-gray-500 hover:text-gray-300 hover:bg-gray-700 transition-colors"
                        title="Edit"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      {tplDeleteConfirm === tpl.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => deleteTemplate(tpl.id)}
                            className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded transition-colors"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setTplDeleteConfirm(null)}
                            className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setTplDeleteConfirm(tpl.id)}
                          className="p-1.5 rounded text-gray-500 hover:text-red-400 hover:bg-gray-700 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Expanded preview */}
                  {tplPreview === tpl.id && (
                    <div className="mt-4 bg-gray-900 border border-gray-700 rounded-lg p-4">
                      <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Preview with sample variables</p>
                      <p className="text-white font-medium mb-3">{previewBody(tpl.subject)}</p>
                      <div
                        className="text-gray-300 text-sm prose prose-invert prose-sm max-w-none"
                        dangerouslySetInnerHTML={{ __html: previewBody(tpl.body) }}
                      />
                      <div className="mt-3 pt-3 border-t border-gray-700">
                        <p className="text-xs text-gray-500">
                          Variables: {tpl.variables.length > 0 ? tpl.variables.map(v => `{{${v}}}`).join(', ') : 'None defined'}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
