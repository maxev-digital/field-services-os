// app/admin/document-packets/page.tsx
// Management page for pre-project and post-project document packets

'use client';

import { useEffect, useState, useRef } from 'react';
import {
  Package, Upload, X, Plus, FileText, Trash2, ToggleLeft, ToggleRight,
  Download, GripVertical, Star, StarOff,
} from 'lucide-react';

interface PacketDoc {
  id: string;
  name: string;
  doc_type: string;
  category: string;
  filename: string;
  display_name: string;
  size_bytes: number;
  is_default: boolean;
  active: boolean;
  sort_order: number;
  created_at: string;
}

const CATEGORIES = [
  { value: 'agreement', label: 'Agreement' },
  { value: 'license', label: 'License' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'warranty', label: 'Warranty' },
  { value: 'certificate', label: 'Certificate' },
  { value: 'guide', label: 'Guide' },
  { value: 'inspection', label: 'Inspection' },
  { value: 'other', label: 'Other' },
];

const CATEGORY_BADGES: Record<string, { bg: string; text: string }> = {
  agreement:   { bg: 'bg-blue-900/60',    text: 'text-blue-300' },
  license:     { bg: 'bg-green-900/60',    text: 'text-green-300' },
  insurance:   { bg: 'bg-yellow-900/60',   text: 'text-yellow-300' },
  warranty:    { bg: 'bg-purple-900/60',    text: 'text-purple-300' },
  certificate: { bg: 'bg-emerald-900/60',   text: 'text-emerald-300' },
  guide:       { bg: 'bg-cyan-900/60',      text: 'text-cyan-300' },
  inspection:  { bg: 'bg-orange-900/60',    text: 'text-orange-300' },
  other:       { bg: 'bg-gray-700',         text: 'text-gray-300' },
  general:     { bg: 'bg-gray-700',         text: 'text-gray-300' },
};

const fmtSize = (bytes: number) => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
};

export default function DocumentPacketsPage() {
  const [docs, setDocs] = useState<PacketDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  // Upload form
  const [formName, setFormName] = useState('');
  const [formDisplayName, setFormDisplayName] = useState('');
  const [formDocType, setFormDocType] = useState<'pre_project' | 'post_project'>('pre_project');
  const [formCategory, setFormCategory] = useState('agreement');
  const [formIsDefault, setFormIsDefault] = useState(false);
  const [formFile, setFormFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const preDocs = docs.filter(d => d.doc_type === 'pre_project').sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
  const postDocs = docs.filter(d => d.doc_type === 'post_project').sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));

  const load = async () => {
    const res = await fetch('/api/admin/document-packets').then(r => r.json());
    setDocs(res.packets || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const resetForm = () => {
    setFormName('');
    setFormDisplayName('');
    setFormDocType('pre_project');
    setFormCategory('agreement');
    setFormIsDefault(false);
    setFormFile(null);
    if (fileRef.current) fileRef.current.value = '';
    setUploadError('');
  };

  const uploadDoc = async () => {
    if (!formFile || !formName.trim() || !formDisplayName.trim()) {
      setUploadError('Name, display name, and file are required.');
      return;
    }
    setUploadError('');
    setUploading(true);

    try {
      // Read file as base64
      const buffer = await formFile.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
      const filename = formFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');

      const res = await fetch('/api/admin/document-packets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName.trim(),
          doc_type: formDocType,
          category: formCategory,
          filename,
          display_name: formDisplayName.trim(),
          file_data: base64,
          size_bytes: formFile.size,
          is_default: formIsDefault,
        }),
      });
      const data = await res.json();
      if (data.packet) {
        setDocs(prev => [...prev, data.packet]);
        resetForm();
        setShowUpload(false);
      } else {
        setUploadError(data.error || 'Upload failed');
      }
    } catch (e: any) {
      setUploadError(e.message || 'Upload failed');
    }
    setUploading(false);
  };

  const toggleActive = async (doc: PacketDoc) => {
    const res = await fetch(`/api/admin/document-packets/${doc.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !doc.active }),
    }).then(r => r.json());
    if (res.packet) {
      setDocs(prev => prev.map(d => d.id === doc.id ? { ...d, active: res.packet.active } : d));
    }
  };

  const toggleDefault = async (doc: PacketDoc) => {
    const res = await fetch(`/api/admin/document-packets/${doc.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_default: !doc.is_default }),
    }).then(r => r.json());
    if (res.packet) {
      setDocs(prev => prev.map(d => d.id === doc.id ? { ...d, is_default: res.packet.is_default } : d));
    }
  };

  const deleteDoc = async (doc: PacketDoc) => {
    if (!confirm(`Delete "${doc.display_name}"? This cannot be undone.`)) return;
    await fetch(`/api/admin/document-packets/${doc.id}`, { method: 'DELETE' });
    setDocs(prev => prev.filter(d => d.id !== doc.id));
  };

  const downloadDoc = async (docId: string, filename: string) => {
    try {
      const res = await fetch(`/api/admin/document-packets/${docId}`);
      const data = await res.json();
      if (data.packet?.file_data) {
        const byteChars = atob(data.packet.file_data);
        const byteNumbers = new Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
        const blob = new Blob([new Uint8Array(byteNumbers)]);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      console.error('Download failed', e);
    }
  };

  const renderColumn = (title: string, subtitle: string, columnDocs: PacketDoc[]) => (
    <div className="flex-1 min-w-0">
      <div className="mb-4">
        <h2 className="text-base font-bold text-white">{title}</h2>
        <p className="text-xs text-gray-500">{subtitle}</p>
      </div>

      {columnDocs.length === 0 ? (
        <div className="text-center py-12 bg-gray-800/50 border border-gray-700 border-dashed rounded-xl">
          <FileText className="w-8 h-8 mx-auto mb-2 text-gray-600" />
          <p className="text-sm text-gray-500">No documents yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {columnDocs.map(doc => {
            const badge = CATEGORY_BADGES[doc.category] || CATEGORY_BADGES.general;
            return (
              <div
                key={doc.id}
                className={`bg-gray-800 border rounded-xl p-3 flex items-start gap-3 transition-all ${
                  doc.active ? 'border-gray-700' : 'border-gray-800 opacity-50'
                }`}
              >
                <GripVertical className="w-4 h-4 text-gray-600 mt-1 flex-shrink-0 cursor-grab" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${badge.bg} ${badge.text}`}>
                      {doc.category}
                    </span>
                    <span className="text-sm text-white font-medium truncate">{doc.display_name}</span>
                    {doc.is_default && (
                      <span className="px-1.5 py-0.5 rounded bg-red-900/40 text-red-300 text-[10px] font-bold uppercase">Default</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500">{doc.filename} &middot; {fmtSize(doc.size_bytes)}</p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => downloadDoc(doc.id, doc.filename)}
                    className="p-1.5 text-gray-500 hover:text-blue-400 hover:bg-gray-700 rounded transition-colors"
                    title="Download"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => toggleDefault(doc)}
                    className="p-1.5 text-gray-500 hover:text-yellow-400 hover:bg-gray-700 rounded transition-colors"
                    title={doc.is_default ? 'Remove default' : 'Set as default'}
                  >
                    {doc.is_default
                      ? <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />
                      : <StarOff className="w-3.5 h-3.5" />
                    }
                  </button>
                  <button
                    onClick={() => toggleActive(doc)}
                    className="p-1.5 text-gray-500 hover:text-white hover:bg-gray-700 rounded transition-colors"
                    title={doc.active ? 'Deactivate' : 'Activate'}
                  >
                    {doc.active
                      ? <ToggleRight className="w-4 h-4 text-green-400" />
                      : <ToggleLeft className="w-4 h-4 text-gray-500" />
                    }
                  </button>
                  <button
                    onClick={() => deleteDoc(doc)}
                    className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-gray-700 rounded transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Package className="w-6 h-6 text-red-400" />
          <div>
            <h1 className="text-xl font-bold text-white">Document Packets</h1>
            <p className="text-sm text-gray-400">Pre-project & post-project documents sent with estimates and invoices</p>
          </div>
        </div>
        <button
          onClick={() => { setShowUpload(v => !v); if (showUpload) resetForm(); }}
          className="flex items-center gap-2 px-4 py-2 bg-red-700 hover:bg-red-600 text-white text-sm font-semibold rounded-lg transition-colors"
        >
          {showUpload ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showUpload ? 'Cancel' : 'Upload Document'}
        </button>
      </div>

      {/* Upload form */}
      {showUpload && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 mb-6">
          <h2 className="text-sm font-bold text-gray-300 uppercase tracking-wider mb-4">Upload New Document</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Internal Name *</label>
              <input
                value={formName}
                onChange={e => setFormName(e.target.value)}
                placeholder="e.g. Customer Agreement v2"
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-red-500"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Display Name * (shown to customer)</label>
              <input
                value={formDisplayName}
                onChange={e => setFormDisplayName(e.target.value)}
                placeholder="e.g. Roof Works Customer Agreement"
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-red-500"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Packet Type *</label>
              <select
                value={formDocType}
                onChange={e => setFormDocType(e.target.value as 'pre_project' | 'post_project')}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white focus:outline-none focus:border-red-500"
              >
                <option value="pre_project">Pre-Project (sent with estimate)</option>
                <option value="post_project">Post-Project (sent with invoice)</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Category</label>
              <select
                value={formCategory}
                onChange={e => setFormCategory(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white focus:outline-none focus:border-red-500"
              >
                {CATEGORIES.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">File (PDF, PNG, JPG) *</label>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                onChange={e => setFormFile(e.target.files?.[0] || null)}
                className="w-full text-sm text-gray-300 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-medium file:bg-gray-700 file:text-gray-300 hover:file:bg-gray-600 cursor-pointer"
              />
            </div>
            <div className="flex items-center gap-3 pt-5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formIsDefault}
                  onChange={e => setFormIsDefault(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-600 text-red-600 focus:ring-red-500 bg-gray-700"
                />
                <span className="text-sm text-gray-300">Auto-select by default</span>
              </label>
            </div>
          </div>
          {uploadError && (
            <p className="mt-3 text-sm text-red-400">{uploadError}</p>
          )}
          <div className="mt-4 flex justify-end">
            <button
              onClick={uploadDoc}
              disabled={uploading}
              className="flex items-center gap-2 px-5 py-2 bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              <Upload className="w-4 h-4" />
              {uploading ? 'Uploading...' : 'Upload Document'}
            </button>
          </div>
        </div>
      )}

      {/* Two-column layout */}
      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-48 bg-gray-800 rounded-xl animate-pulse" />
          <div className="h-48 bg-gray-800 rounded-xl animate-pulse" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {renderColumn('Pre-Project Documents', 'Sent with the initial estimate (agreements, licenses, insurance certs)', preDocs)}
          {renderColumn('Post-Project Documents', 'Sent with the final invoice (warranties, completion certs, maintenance guides)', postDocs)}
        </div>
      )}
    </div>
  );
}
