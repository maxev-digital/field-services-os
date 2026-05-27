'use client';

import { useEffect, useState, useRef } from 'react';
import { BookOpen, Upload, X, Eye, Trash2, ToggleLeft, ToggleRight, Plus, FileText } from 'lucide-react';

interface MfrDoc {
  id: string;
  manufacturer: string;
  name: string;
  filename: string;
  description: string | null;
  size_bytes: number;
  active: boolean;
  created_at: string;
}

const fmtSize = (bytes: number) => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
};

const MFR_BADGE_COLORS: Record<string, string> = {
  GAF: 'bg-green-900 text-green-300',
  'Owens Corning': 'bg-red-900 text-red-300',
  OC: 'bg-red-900 text-red-300',
  CertainTeed: 'bg-blue-900 text-blue-300',
  Atlas: 'bg-orange-900 text-orange-300',
  IKO: 'bg-purple-900 text-purple-300',
};

const badgeColor = (mfr: string) =>
  MFR_BADGE_COLORS[mfr] || 'bg-gray-700 text-gray-300';

export default function ProductDocsPage() {
  const [docs, setDocs] = useState<MfrDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  // Upload form state
  const [manufacturer, setManufacturer] = useState('');
  const [docName, setDocName] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    const d = await fetch('/api/admin/manufacturer-docs').then(r => r.json());
    setDocs(d.docs || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const uploadDoc = async () => {
    if (!file || !manufacturer.trim() || !docName.trim()) {
      setUploadError('Manufacturer, name, and PDF file are required.');
      return;
    }
    setUploadError('');
    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('manufacturer', manufacturer.trim());
    fd.append('name', docName.trim());
    fd.append('description', description.trim());
    const res = await fetch('/api/admin/manufacturer-docs', { method: 'POST', body: fd });
    const data = await res.json();
    if (data.doc) {
      setDocs(prev => [...prev, data.doc].sort((a, b) =>
        a.manufacturer.localeCompare(b.manufacturer) || a.name.localeCompare(b.name)
      ));
      setManufacturer('');
      setDocName('');
      setDescription('');
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
      setShowUpload(false);
    } else {
      setUploadError(data.error || 'Upload failed');
    }
    setUploading(false);
  };

  const toggleActive = async (doc: MfrDoc) => {
    const updated = await fetch(`/api/admin/manufacturer-docs/${doc.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !doc.active }),
    }).then(r => r.json());
    if (updated.doc) {
      setDocs(prev => prev.map(d => d.id === doc.id ? { ...d, active: updated.doc.active } : d));
    }
  };

  const deleteDoc = async (doc: MfrDoc) => {
    if (!confirm(`Delete "${doc.manufacturer} — ${doc.name}"? This will also remove the file.`)) return;
    await fetch(`/api/admin/manufacturer-docs/${doc.id}`, { method: 'DELETE' });
    setDocs(prev => prev.filter(d => d.id !== doc.id));
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <BookOpen className="w-6 h-6 text-red-400" />
          <div>
            <h1 className="text-xl font-bold text-white">Product Docs Library</h1>
            <p className="text-sm text-gray-400">Manufacturer guides and installation specs</p>
          </div>
        </div>
        <button
          onClick={() => setShowUpload(v => !v)}
          className="flex items-center gap-2 px-4 py-2 bg-red-700 hover:bg-red-600 text-white text-sm font-semibold rounded-lg transition-colors"
        >
          {showUpload ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showUpload ? 'Cancel' : 'Upload New Doc'}
        </button>
      </div>

      {/* Upload form */}
      {showUpload && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 mb-6">
          <h2 className="text-sm font-bold text-gray-300 uppercase tracking-wider mb-4">Upload New Document</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Manufacturer *</label>
              <input
                value={manufacturer}
                onChange={e => setManufacturer(e.target.value)}
                placeholder="e.g. GAF, Owens Corning, CertainTeed"
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-red-500"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Document Name *</label>
              <input
                value={docName}
                onChange={e => setDocName(e.target.value)}
                placeholder="e.g. Residential Reference Guide"
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-red-500"
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs text-gray-400 mb-1 block">Description</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={2}
                placeholder="Brief description of what this guide covers..."
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-red-500 resize-none"
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs text-gray-400 mb-1 block">PDF File *</label>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,application/pdf"
                onChange={e => setFile(e.target.files?.[0] || null)}
                className="w-full text-sm text-gray-300 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-medium file:bg-gray-700 file:text-gray-300 hover:file:bg-gray-600 cursor-pointer"
              />
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

      {/* Docs grid */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-28 bg-gray-800 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : docs.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No documents yet. Upload your first manufacturer guide.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {docs.map(doc => (
            <div
              key={doc.id}
              className={`bg-gray-800 border rounded-xl p-4 flex items-start justify-between gap-4 transition-opacity ${
                doc.active ? 'border-gray-700' : 'border-gray-800 opacity-60'
              }`}
            >
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <FileText className="w-5 h-5 text-gray-500 mt-0.5 flex-shrink-0" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wide ${badgeColor(doc.manufacturer)}`}>
                      {doc.manufacturer}
                    </span>
                    <span className="text-white font-medium text-sm">{doc.name}</span>
                  </div>
                  {doc.description && (
                    <p className="text-sm text-gray-400 mb-1 truncate">{doc.description}</p>
                  )}
                  <p className="text-xs text-gray-500">
                    {fmtSize(doc.size_bytes)} &middot; {doc.filename}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <a
                  href={`/docs/manufacturers/${doc.filename}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 text-gray-400 hover:text-blue-400 hover:bg-gray-700 rounded transition-colors"
                  title="View PDF"
                >
                  <Eye className="w-4 h-4" />
                </a>
                <button
                  onClick={() => toggleActive(doc)}
                  className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
                  title={doc.active ? 'Deactivate' : 'Activate'}
                >
                  {doc.active
                    ? <ToggleRight className="w-5 h-5 text-green-400" />
                    : <ToggleLeft className="w-5 h-5 text-gray-500" />
                  }
                </button>
                <button
                  onClick={() => deleteDoc(doc)}
                  className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-gray-700 rounded transition-colors"
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
