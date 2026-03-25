'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Camera,
  Trash2,
  ChevronDown,
  ChevronRight,
  Download,
  Save,
  FileText,
  CheckCircle,
  ClipboardList,
} from 'lucide-react';
import { INSPECTION_SECTIONS } from '@/lib/inspection-sections';

// ─── Types ────────────────────────────────────────────────────────────────────

interface InspectionItem {
  id: string;
  section: string;
  damaged: boolean;
  data: Record<string, any>;
  notes: string | null;
  sort_order: number;
}

interface InspectionPhoto {
  id: string;
  section: string;
  photo_data: string;
  caption: string | null;
  created_at: string;
}

interface InspectionReport {
  id: string;
  address: string;
  inspector: string | null;
  inspection_date: string | null;
  weather: string | null;
  notes: string | null;
  status: 'DRAFT' | 'COMPLETE';
  created_at: string;
  items: InspectionItem[];
  photos: InspectionPhoto[];
}

interface SectionState {
  damaged: boolean;
  data: Record<string, any>;
  notes: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDateInput(d: string | null): string {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '';
  return dt.toISOString().split('T')[0];
}

/** Resize + compress a photo to JPEG before uploading (keeps base64 under ~500 KB). */
function compressImage(file: File, maxPx = 1400, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > maxPx || height > maxPx) {
        if (width >= height) {
          height = Math.round((height / width) * maxPx);
          width = maxPx;
        } else {
          width = Math.round((width / height) * maxPx);
          height = maxPx;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = reject;
    img.src = url;
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function InspectionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [report, setReport] = useState<InspectionReport | null>(null);
  const [loading, setLoading] = useState(true);

  // Header fields
  const [address, setAddress] = useState('');
  const [inspector, setInspector] = useState('');
  const [inspectionDate, setInspectionDate] = useState('');
  const [weather, setWeather] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<'DRAFT' | 'COMPLETE'>('DRAFT');

  // Section state keyed by section key
  const [itemData, setItemData] = useState<Record<string, SectionState>>({});
  const [sectionPhotos, setSectionPhotos] = useState<Record<string, InspectionPhoto[]>>({});

  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [savingHeader, setSavingHeader] = useState(false);
  const [uploadingSections, setUploadingSections] = useState<Record<string, boolean>>({});

  // Per-section debounce timers
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // File input refs per section
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // ── Load ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch(`/api/admin/inspections/${id}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.report) return;
        const rpt: InspectionReport = d.report;
        setReport(rpt);
        setAddress(rpt.address);
        setInspector(rpt.inspector || '');
        setInspectionDate(fmtDateInput(rpt.inspection_date));
        setWeather(rpt.weather || '');
        setNotes(rpt.notes || '');
        setStatus(rpt.status);

        // Build itemData from report.items
        const initData: Record<string, SectionState> = {};
        for (const sec of INSPECTION_SECTIONS) {
          const existing = rpt.items.find((i) => i.section === sec.key);
          initData[sec.key] = {
            damaged: existing?.damaged ?? false,
            data: (existing?.data as Record<string, any>) ?? {},
            notes: existing?.notes ?? '',
          };
        }
        setItemData(initData);

        // Build expanded sections — default open if damaged
        const expanded: Record<string, boolean> = {};
        for (const sec of INSPECTION_SECTIONS) {
          const existing = rpt.items.find((i) => i.section === sec.key);
          expanded[sec.key] = existing?.damaged ?? false;
        }
        setExpandedSections(expanded);

        // Build sectionPhotos
        const photos: Record<string, InspectionPhoto[]> = {};
        for (const p of rpt.photos) {
          if (!photos[p.section]) photos[p.section] = [];
          photos[p.section].push(p);
        }
        setSectionPhotos(photos);
      })
      .finally(() => setLoading(false));
  }, [id]);

  // ── Save header ─────────────────────────────────────────────────────────────
  async function saveHeader() {
    setSavingHeader(true);
    try {
      await fetch(`/api/admin/inspections/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, inspector, inspection_date: inspectionDate || null, weather, notes, status }),
      });
    } finally {
      setSavingHeader(false);
    }
  }

  // ── Save all items ──────────────────────────────────────────────────────────
  const saveAllItems = useCallback(async () => {
    setSaving(true);
    try {
      const items = INSPECTION_SECTIONS.map((sec) => ({
        section: sec.key,
        damaged: itemData[sec.key]?.damaged ?? false,
        data: itemData[sec.key]?.data ?? {},
        notes: itemData[sec.key]?.notes ?? '',
      }));
      await fetch(`/api/admin/inspections/${id}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });
    } finally {
      setSaving(false);
    }
  }, [id, itemData]);

  // ── Debounced auto-save for a section ───────────────────────────────────────
  function scheduleSectionSave(sectionKey: string) {
    if (debounceTimers.current[sectionKey]) {
      clearTimeout(debounceTimers.current[sectionKey]);
    }
    debounceTimers.current[sectionKey] = setTimeout(async () => {
      setItemData((prev) => {
        const sectionState = prev[sectionKey];
        if (!sectionState) return prev;
        fetch(`/api/admin/inspections/${id}/items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: [{ section: sectionKey, damaged: sectionState.damaged, data: sectionState.data, notes: sectionState.notes }],
          }),
        });
        return prev;
      });
    }, 1500);
  }

  // ── Update section field ────────────────────────────────────────────────────
  function updateField(sectionKey: string, fieldKey: string, value: any) {
    setItemData((prev) => {
      const updated = {
        ...prev,
        [sectionKey]: {
          ...prev[sectionKey],
          data: { ...prev[sectionKey]?.data, [fieldKey]: value },
        },
      };
      return updated;
    });
    scheduleSectionSave(sectionKey);
  }

  function updateNotes(sectionKey: string, value: string) {
    setItemData((prev) => ({
      ...prev,
      [sectionKey]: { ...prev[sectionKey], notes: value },
    }));
    scheduleSectionSave(sectionKey);
  }

  function toggleDamaged(sectionKey: string, val: boolean) {
    setItemData((prev) => ({
      ...prev,
      [sectionKey]: { ...prev[sectionKey], damaged: val },
    }));
    if (val) {
      setExpandedSections((prev) => ({ ...prev, [sectionKey]: true }));
    }
    scheduleSectionSave(sectionKey);
  }

  // ── Photo upload ────────────────────────────────────────────────────────────
  async function handleFileChange(sectionKey: string, e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadingSections((prev) => ({ ...prev, [sectionKey]: true }));

    try {
      for (const file of Array.from(files)) {
        const photoData = await compressImage(file);
        const res = await fetch(`/api/admin/inspections/${id}/photos`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ section: sectionKey, photo_data: photoData, caption: '' }),
        });
        const data = await res.json();
        if (data.photo) {
          setSectionPhotos((prev) => ({
            ...prev,
            [sectionKey]: [...(prev[sectionKey] || []), data.photo],
          }));
        }
      }
    } finally {
      setUploadingSections((prev) => ({ ...prev, [sectionKey]: false }));
      if (fileInputRefs.current[sectionKey]) {
        fileInputRefs.current[sectionKey]!.value = '';
      }
    }
  }

  async function deletePhoto(sectionKey: string, photoId: string) {
    await fetch(`/api/admin/inspections/${id}/photos/${photoId}`, { method: 'DELETE' });
    setSectionPhotos((prev) => ({
      ...prev,
      [sectionKey]: (prev[sectionKey] || []).filter((p) => p.id !== photoId),
    }));
  }

  async function updatePhotoCaption(sectionKey: string, photoId: string, caption: string) {
    setSectionPhotos((prev) => ({
      ...prev,
      [sectionKey]: (prev[sectionKey] || []).map((p) =>
        p.id === photoId ? { ...p, caption } : p
      ),
    }));
  }

  // ── Counts ──────────────────────────────────────────────────────────────────
  const damagedCount = INSPECTION_SECTIONS.filter((s) => itemData[s.key]?.damaged).length;

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-red-400">Report not found.</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/admin/inspections')}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-red-500" />
            <h1 className="text-lg font-bold text-white truncate max-w-md">{report.address}</h1>
          </div>
        </div>
        <button
          onClick={saveAllItems}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white text-sm font-medium rounded transition-colors"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : 'Save All'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Main content ────────────────────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-3">
          {INSPECTION_SECTIONS.map((sec) => {
            const state = itemData[sec.key] || { damaged: false, data: {}, notes: '' };
            const expanded = expandedSections[sec.key] ?? false;
            const photos = sectionPhotos[sec.key] || [];
            const uploading = uploadingSections[sec.key] ?? false;

            return (
              <div
                key={sec.key}
                className={`bg-gray-800 border rounded-lg overflow-hidden transition-colors ${
                  state.damaged ? 'border-red-700' : 'border-gray-700'
                }`}
              >
                {/* Section header */}
                <div
                  className="flex items-center justify-between px-4 py-3 cursor-pointer select-none"
                  onClick={() => setExpandedSections((prev) => ({ ...prev, [sec.key]: !prev[sec.key] }))}
                >
                  <div className="flex items-center gap-3">
                    {expanded ? (
                      <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    )}
                    <span className="text-sm font-semibold text-white">{sec.label}</span>
                    {photos.length > 0 && (
                      <span className="flex items-center gap-1 text-xs text-gray-400">
                        <Camera className="w-3 h-3" />
                        {photos.length}
                      </span>
                    )}
                  </div>

                  {/* Damaged toggle */}
                  <div
                    className="flex items-center gap-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="text-xs text-gray-400">Damaged</span>
                    <button
                      onClick={() => toggleDamaged(sec.key, !state.damaged)}
                      className={`relative w-10 h-5 rounded-full transition-colors focus:outline-none ${
                        state.damaged ? 'bg-red-600' : 'bg-gray-600'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                          state.damaged ? 'translate-x-5' : 'translate-x-0.5'
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {/* Section body */}
                {expanded && (
                  <div className="px-4 pb-4 border-t border-gray-700 pt-4 space-y-4">
                    {/* Fields */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                      {sec.fields.map((field) => {
                        const val = state.data[field.key];

                        if (field.type === 'select') {
                          return (
                            <div key={field.key}>
                              <label className="block text-xs font-medium text-gray-400 mb-1">
                                {field.label}
                              </label>
                              <select
                                value={val ?? ''}
                                onChange={(e) => updateField(sec.key, field.key, e.target.value || undefined)}
                                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500"
                              >
                                <option value="">— Select —</option>
                                {field.options?.map((opt) => (
                                  <option key={opt} value={opt}>{opt}</option>
                                ))}
                              </select>
                            </div>
                          );
                        }

                        if (field.type === 'multi') {
                          const selected: string[] = Array.isArray(val) ? val : [];
                          return (
                            <div key={field.key} className="sm:col-span-2">
                              <label className="block text-xs font-medium text-gray-400 mb-2">
                                {field.label}
                              </label>
                              <div className="flex flex-wrap gap-2">
                                {field.options?.map((opt) => {
                                  const checked = selected.includes(opt);
                                  return (
                                    <label
                                      key={opt}
                                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded border cursor-pointer text-xs transition-colors ${
                                        checked
                                          ? 'bg-red-900 border-red-600 text-red-200'
                                          : 'bg-gray-700 border-gray-600 text-gray-300 hover:border-gray-500'
                                      }`}
                                    >
                                      <input
                                        type="checkbox"
                                        className="sr-only"
                                        checked={checked}
                                        onChange={(e) => {
                                          const next = e.target.checked
                                            ? [...selected, opt]
                                            : selected.filter((s) => s !== opt);
                                          updateField(sec.key, field.key, next.length > 0 ? next : undefined);
                                        }}
                                      />
                                      {opt}
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        }

                        if (field.type === 'boolean') {
                          return (
                            <div key={field.key} className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                id={`${sec.key}-${field.key}`}
                                checked={val === true}
                                onChange={(e) => updateField(sec.key, field.key, e.target.checked || undefined)}
                                className="w-4 h-4 rounded accent-red-600 cursor-pointer"
                              />
                              <label
                                htmlFor={`${sec.key}-${field.key}`}
                                className="text-sm text-gray-300 cursor-pointer"
                              >
                                {field.label}
                              </label>
                            </div>
                          );
                        }

                        if (field.type === 'text') {
                          return (
                            <div key={field.key}>
                              <label className="block text-xs font-medium text-gray-400 mb-1">
                                {field.label}
                              </label>
                              <input
                                type="text"
                                value={val ?? ''}
                                onChange={(e) => updateField(sec.key, field.key, e.target.value || undefined)}
                                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500"
                              />
                            </div>
                          );
                        }

                        return null;
                      })}
                    </div>

                    {/* Notes */}
                    <div>
                      <label className="block text-xs font-medium text-gray-400 mb-1">Notes</label>
                      <textarea
                        value={state.notes}
                        onChange={(e) => updateNotes(sec.key, e.target.value)}
                        rows={2}
                        placeholder="Section-specific notes..."
                        className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white placeholder-gray-500 resize-none focus:outline-none focus:border-red-500"
                      />
                    </div>

                    {/* Photos */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-gray-400">Photos</span>
                        <button
                          onClick={() => fileInputRefs.current[sec.key]?.click()}
                          disabled={uploading}
                          className="flex items-center gap-1.5 px-3 py-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-300 hover:text-white text-xs rounded transition-colors"
                        >
                          <Camera className="w-3.5 h-3.5" />
                          {uploading ? 'Uploading...' : '+ Add Photo'}
                        </button>
                        <input
                          ref={(el) => { fileInputRefs.current[sec.key] = el; }}
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          onChange={(e) => handleFileChange(sec.key, e)}
                        />
                      </div>

                      {photos.length > 0 && (
                        <div className="grid grid-cols-3 gap-2">
                          {photos.map((photo) => (
                            <div key={photo.id} className="relative group">
                              <div className="aspect-video bg-gray-700 rounded overflow-hidden">
                                <img
                                  src={photo.photo_data}
                                  alt={photo.caption || 'Inspection photo'}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                              <button
                                onClick={() => deletePhoto(sec.key, photo.id)}
                                className="absolute top-1 right-1 p-1 bg-red-700 hover:bg-red-600 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                              <input
                                type="text"
                                value={photo.caption || ''}
                                onChange={(e) => updatePhotoCaption(sec.key, photo.id, e.target.value)}
                                placeholder="Caption..."
                                className="mt-1 w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-red-500"
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
        <div className="space-y-4">

          {/* Back link */}
          <button
            onClick={() => router.push('/admin/inspections')}
            className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            All Inspections
          </button>

          {/* Status card */}
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 space-y-3">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Report Status</h3>
            <div className="flex gap-2">
              <button
                onClick={() => setStatus('DRAFT')}
                className={`flex-1 px-3 py-2 text-xs font-medium rounded border transition-colors ${
                  status === 'DRAFT'
                    ? 'bg-gray-700 border-gray-500 text-white'
                    : 'bg-gray-900 border-gray-700 text-gray-500 hover:border-gray-600 hover:text-gray-300'
                }`}
              >
                <FileText className="w-3.5 h-3.5 inline mr-1" />
                Draft
              </button>
              <button
                onClick={() => setStatus('COMPLETE')}
                className={`flex-1 px-3 py-2 text-xs font-medium rounded border transition-colors ${
                  status === 'COMPLETE'
                    ? 'bg-green-900 border-green-600 text-green-300'
                    : 'bg-gray-900 border-gray-700 text-gray-500 hover:border-gray-600 hover:text-gray-300'
                }`}
              >
                <CheckCircle className="w-3.5 h-3.5 inline mr-1" />
                Complete
              </button>
            </div>
          </div>

          {/* Report details card */}
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 space-y-3">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Report Details</h3>

            <div>
              <label className="block text-xs text-gray-500 mb-1">Property Address</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500"
              />
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">Inspector</label>
              <input
                type="text"
                value={inspector}
                onChange={(e) => setInspector(e.target.value)}
                placeholder="Inspector name"
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-red-500"
              />
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">Inspection Date</label>
              <input
                type="date"
                value={inspectionDate}
                onChange={(e) => setInspectionDate(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500"
              />
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">Weather</label>
              <input
                type="text"
                value={weather}
                onChange={(e) => setWeather(e.target.value)}
                placeholder="e.g. Clear, 72F"
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-red-500"
              />
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="General inspection notes..."
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white placeholder-gray-500 resize-none focus:outline-none focus:border-red-500"
              />
            </div>

            <button
              onClick={saveHeader}
              disabled={savingHeader}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white text-sm font-medium rounded transition-colors"
            >
              <Save className="w-4 h-4" />
              {savingHeader ? 'Saving...' : 'Save Details'}
            </button>
          </div>

          {/* Damage summary card */}
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Damage Summary</h3>
            <div className="flex items-center gap-3 mb-3">
              <div className="text-2xl font-bold text-red-400">{damagedCount}</div>
              <div className="text-sm text-gray-400">
                of {INSPECTION_SECTIONS.length} sections damaged
              </div>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-2">
              <div
                className="bg-red-600 h-2 rounded-full transition-all"
                style={{ width: `${(damagedCount / INSPECTION_SECTIONS.length) * 100}%` }}
              />
            </div>
            <div className="mt-3 space-y-1">
              {INSPECTION_SECTIONS.map((sec) => {
                const isDamaged = itemData[sec.key]?.damaged;
                return (
                  <div key={sec.key} className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isDamaged ? 'bg-red-500' : 'bg-gray-600'}`} />
                    <span className={`text-xs ${isDamaged ? 'text-white' : 'text-gray-500'}`}>{sec.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Download PDF */}
          <a
            href={`/api/admin/inspections/${id}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-red-700 hover:bg-red-600 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            <Download className="w-4 h-4" />
            Download Report PDF
          </a>
        </div>
      </div>
    </div>
  );
}
