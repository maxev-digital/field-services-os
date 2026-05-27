// Component: DocumentPacketPanel
// Insert into estimate detail page — shows pre/post project document packets

'use client';

import { useEffect, useState } from 'react';
import { Package, Send, Check, Clock, FileText, Download, ChevronDown, ChevronUp } from 'lucide-react';

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
}

interface PacketSend {
  id: string;
  estimate_id: string;
  packet_type: string;
  doc_ids: string[];
  sent_to: string;
  sent_at: string;
}

interface Props {
  estimateId: string;
  customerEmail: string | null;
  customerName: string;
  estimateAddress: string;
  estimateTotal?: number;
  invoiceNo?: string;
}

const CATEGORY_BADGES: Record<string, { bg: string; text: string }> = {
  agreement:   { bg: 'bg-blue-900/60',   text: 'text-blue-300' },
  license:     { bg: 'bg-green-900/60',   text: 'text-green-300' },
  insurance:   { bg: 'bg-yellow-900/60',  text: 'text-yellow-300' },
  warranty:    { bg: 'bg-purple-900/60',   text: 'text-purple-300' },
  certificate: { bg: 'bg-emerald-900/60',  text: 'text-emerald-300' },
  guide:       { bg: 'bg-cyan-900/60',     text: 'text-cyan-300' },
  inspection:  { bg: 'bg-orange-900/60',   text: 'text-orange-300' },
  other:       { bg: 'bg-gray-700',        text: 'text-gray-300' },
  general:     { bg: 'bg-gray-700',        text: 'text-gray-300' },
};

const fmtSize = (bytes: number) => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
};

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};

export default function DocumentPacketPanel({ estimateId, customerEmail, customerName, estimateAddress, estimateTotal, invoiceNo }: Props) {
  const [docs, setDocs] = useState<PacketDoc[]>([]);
  const [sends, setSends] = useState<PacketSend[]>([]);
  const [loading, setLoading] = useState(true);
  const [preSelected, setPreSelected] = useState<Set<string>>(new Set());
  const [postSelected, setPostSelected] = useState<Set<string>>(new Set());
  const [sendingPre, setSendingPre] = useState(false);
  const [sendingPost, setSendingPost] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showPreHistory, setShowPreHistory] = useState(false);
  const [showPostHistory, setShowPostHistory] = useState(false);

  const preDocs = docs.filter(d => d.doc_type === 'pre_project' && d.active);
  const postDocs = docs.filter(d => d.doc_type === 'post_project' && d.active);
  const preSends = sends.filter(s => s.packet_type === 'pre_project');
  const postSends = sends.filter(s => s.packet_type === 'post_project');

  useEffect(() => {
    loadData();
  }, [estimateId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [docsRes, sendsRes] = await Promise.all([
        fetch('/api/admin/document-packets').then(r => r.json()),
        fetch(`/api/admin/document-packets/send?estimateId=${estimateId}`).then(r => r.ok ? r.json() : { sends: [] }),
      ]);

      const allDocs: PacketDoc[] = docsRes.packets || [];
      setDocs(allDocs);
      setSends(sendsRes.sends || []);

      // Pre-check defaults
      const preDefaults = new Set(allDocs.filter(d => d.doc_type === 'pre_project' && d.is_default && d.active).map(d => d.id));
      const postDefaults = new Set(allDocs.filter(d => d.doc_type === 'post_project' && d.is_default && d.active).map(d => d.id));
      setPreSelected(preDefaults);
      setPostSelected(postDefaults);
    } catch (e) {
      console.error('Failed to load document packets', e);
    }
    setLoading(false);
  };

  const toggleDoc = (id: string, type: 'pre_project' | 'post_project') => {
    const setter = type === 'pre_project' ? setPreSelected : setPostSelected;
    setter(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const sendPacket = async (type: 'pre_project' | 'post_project') => {
    if (!customerEmail) {
      setMessage({ type: 'error', text: 'Customer has no email address on file.' });
      return;
    }

    const selected = type === 'pre_project' ? preSelected : postSelected;
    if (selected.size === 0) {
      setMessage({ type: 'error', text: 'Select at least one document to send.' });
      return;
    }

    const setSending = type === 'pre_project' ? setSendingPre : setSendingPost;
    setSending(true);
    setMessage(null);

    try {
      const res = await fetch('/api/admin/document-packets/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          estimateId,
          customerEmail,
          customerName,
          packetType: type,
          docIds: Array.from(selected),
          estimateTotal,
          invoiceNo,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setMessage({ type: 'success', text: `${type === 'pre_project' ? 'Pre' : 'Post'}-project packet sent to ${customerEmail} (${data.sent} docs)` });
        // Reload send history
        const sendsRes = await fetch(`/api/admin/document-packets/send?estimateId=${estimateId}`).then(r => r.ok ? r.json() : { sends: [] });
        setSends(sendsRes.sends || []);
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to send' });
      }
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message || 'Network error' });
    }
    setSending(false);
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

  if (loading) {
    return (
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Package className="w-5 h-5 text-red-400" />
          <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider">Document Packets</h3>
        </div>
        <div className="h-24 bg-gray-700 rounded animate-pulse" />
      </div>
    );
  }

  if (docs.length === 0) {
    return (
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <Package className="w-5 h-5 text-red-400" />
          <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider">Document Packets</h3>
        </div>
        <p className="text-sm text-gray-500">No document packets configured. <a href="/admin/document-packets" className="text-red-400 hover:underline">Manage packets</a></p>
      </div>
    );
  }

  const renderSection = (
    type: 'pre_project' | 'post_project',
    label: string,
    sectionDocs: PacketDoc[],
    selected: Set<string>,
    sectionSends: PacketSend[],
    sending: boolean,
    showHistory: boolean,
    setShowHistory: (v: boolean) => void,
  ) => (
    <div className="flex-1 min-w-0">
      <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">{label}</h4>

      {sectionDocs.length === 0 ? (
        <p className="text-xs text-gray-500 mb-3">No {type === 'pre_project' ? 'pre' : 'post'}-project docs uploaded yet.</p>
      ) : (
        <div className="space-y-1.5 mb-3">
          {sectionDocs.map(doc => {
            const badge = CATEGORY_BADGES[doc.category] || CATEGORY_BADGES.general;
            return (
              <label
                key={doc.id}
                className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-gray-700/50 cursor-pointer transition-colors"
              >
                <input
                  type="checkbox"
                  checked={selected.has(doc.id)}
                  onChange={() => toggleDoc(doc.id, type)}
                  className="w-4 h-4 rounded border-gray-600 text-red-600 focus:ring-red-500 bg-gray-700"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${badge.bg} ${badge.text}`}>
                      {doc.category}
                    </span>
                    <span className="text-sm text-white truncate">{doc.display_name}</span>
                  </div>
                  <span className="text-[11px] text-gray-500">{fmtSize(doc.size_bytes)}</span>
                </div>
                <button
                  onClick={(e) => { e.preventDefault(); downloadDoc(doc.id, doc.filename); }}
                  className="p-1 text-gray-500 hover:text-blue-400 transition-colors"
                  title="Download"
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
              </label>
            );
          })}
        </div>
      )}

      {sectionDocs.length > 0 && (
        <button
          onClick={() => sendPacket(type)}
          disabled={sending || !customerEmail || selected.size === 0}
          className="flex items-center gap-2 w-full justify-center px-4 py-2 bg-red-700 hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
        >
          {sending ? (
            <span className="flex items-center gap-2"><Clock className="w-4 h-4 animate-spin" /> Sending...</span>
          ) : (
            <span className="flex items-center gap-2"><Send className="w-4 h-4" /> Send {label}</span>
          )}
        </button>
      )}

      {/* Send history */}
      {sectionSends.length > 0 && (
        <div className="mt-3">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            {showHistory ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {sectionSends.length} previous send{sectionSends.length > 1 ? 's' : ''}
          </button>
          {showHistory && (
            <div className="mt-2 space-y-1">
              {sectionSends.map(s => (
                <div key={s.id} className="flex items-center gap-2 text-xs text-gray-500 pl-1">
                  <Check className="w-3 h-3 text-green-500 flex-shrink-0" />
                  <span>{s.sent_to}</span>
                  <span className="text-gray-600">&middot;</span>
                  <span>{fmtDate(s.sent_at)}</span>
                  <span className="text-gray-600">&middot;</span>
                  <span>{s.doc_ids?.length || 0} docs</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Package className="w-5 h-5 text-red-400" />
          <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider">Document Packets</h3>
        </div>
        <a href="/admin/document-packets" className="text-xs text-gray-500 hover:text-red-400 transition-colors">
          Manage
        </a>
      </div>

      {message && (
        <div className={`mb-4 px-3 py-2 rounded-lg text-sm ${
          message.type === 'success' ? 'bg-green-900/40 text-green-300 border border-green-800' : 'bg-red-900/40 text-red-300 border border-red-800'
        }`}>
          {message.text}
        </div>
      )}

      <div className="flex gap-6 flex-col lg:flex-row">
        {renderSection('pre_project', 'Pre-Project Packet', preDocs, preSelected, preSends, sendingPre, showPreHistory, setShowPreHistory)}
        <div className="hidden lg:block w-px bg-gray-700" />
        <hr className="lg:hidden border-gray-700" />
        {renderSection('post_project', 'Post-Project Packet', postDocs, postSelected, postSends, sendingPost, showPostHistory, setShowPostHistory)}
      </div>
    </div>
  );
}
