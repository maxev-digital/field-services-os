'use client';

import { useEffect, useState } from 'react';
import { Users, Phone, Mail, MapPin, FileText, Clock, UserPlus, XCircle, AlertCircle, CheckCircle } from 'lucide-react';

interface Lead {
  id: string;
  type: 'estimate' | 'prospect';
  address: string;
  insurer: string | null;
  claim_no: string | null;
  our_total: number;
  insurance_total: number;
  status: string;
  created_at: string;
  customer: { id: string; name: string; phone: string; email: string | null };
  source?: string;
  report_token?: string | null;
  notes?: string | null;
}

interface PendingLead {
  id: string;
  name: string;
  phone: string;
  address: string;
  source: string | null;
  digit_pressed: string | null;
  call_time: string | null;
  reply_source?: string;
}

function fmt(n: number) { return `$${n.toLocaleString(undefined, { minimumFractionDigits: 0 })}`; }
function fmtDate(d: string) {
  if (!d) return '—';
  const diff = Math.floor((Date.now() - new Date(d).getTime()) / 1000 / 60);
  if (diff < 60) return `${diff}m ago`;
  if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
  return `${Math.floor(diff / 1440)}d ago`;
}

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [pendingLeads, setPendingLeads] = useState<PendingLead[]>([]);
  const [total, setTotal] = useState(0);
  const [estimateCount, setEstimateCount] = useState(0);
  const [prospectCount, setProspectCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [converting, setConverting] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const res = await fetch('/api/admin/leads');
    const data = await res.json();
    setLeads(data.leads || []);
    setPendingLeads(data.pending_leads || []);
    setTotal(data.total || 0);
    setEstimateCount(data.estimate_count || 0);
    setProspectCount(data.prospect_count || 0);
    setPendingCount(data.pending_count || 0);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const markSent = async (id: string) => {
    await fetch(`/api/admin/estimates/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'SENT' }),
    });
    load();
  };

  const convertProspect = async (id: string) => {
    setConverting(id);
    try {
      await fetch('/api/admin/prospects/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prospect_ids: [id] }),
      });
      load();
    } finally {
      setConverting(null);
    }
  };

  const markDead = async (id: string) => {
    await fetch(`/api/admin/prospects/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'HARD_NO' }),
    });
    load();
  };

  const confirmLead = async (id: string) => {
    await fetch(`/api/admin/prospects/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'INTERESTED' }),
    });
    load();
  };

  const rejectPending = async (id: string, toDNC = false) => {
    await fetch(`/api/admin/prospects/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: toDNC ? 'DNC' : 'HARD_NO' }),
    });
    load();
  };

  const estimateLeads = leads.filter(l => l.type === 'estimate');
  const prospectLeads = leads.filter(l => l.type === 'prospect');
  const draftLeads = estimateLeads.filter(l => l.status === 'DRAFT');
  const sentLeads  = estimateLeads.filter(l => l.status === 'SENT');
  const pipelineValue = estimateLeads.reduce((s, l) => s + l.our_total, 0);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Leads</h1>
          <p className="text-gray-400 text-sm mt-1">{total} leads needing follow-up</p>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-6">
        {[
          { label: 'Total Leads',       value: total,                 color: 'text-white' },
          { label: 'Needs Verification', value: pendingCount,          color: pendingCount > 0 ? 'text-yellow-400' : 'text-gray-500' },
          { label: 'Estimates (Draft)',  value: draftLeads.length,     color: 'text-blue-400' },
          { label: 'Estimates (Sent)',   value: sentLeads.length,      color: 'text-yellow-400' },
          { label: 'Storm Prospects',    value: prospectCount,         color: 'text-orange-400' },
          { label: 'Pipeline Value',     value: fmt(pipelineValue),    color: 'text-green-400' },
        ].map(({ label, value, color }) => (
          <div key={label} className={`bg-gray-800 border rounded-xl p-4 ${label === 'Needs Verification' && pendingCount > 0 ? 'border-yellow-700/50' : 'border-gray-700'}`}>
            <div className="text-xs text-gray-400 mb-1">{label}</div>
            <div className={`text-2xl font-black ${color}`}>{value}</div>
          </div>
        ))}
      </div>

      {/* NEEDS VERIFICATION — highest priority queue */}
      {pendingLeads.length > 0 && (
        <div className="mb-6 border border-yellow-700/40 rounded-xl overflow-hidden">
          <div className="bg-yellow-900/20 px-4 py-3 flex items-center gap-2 border-b border-yellow-700/30">
            <AlertCircle className="w-4 h-4 text-yellow-400 flex-shrink-0" />
            <span className="text-yellow-300 font-bold text-sm">
              {pendingLeads.length} Response{pendingLeads.length !== 1 ? 's' : ''} Pending Verification
            </span>
            <span className="text-yellow-700 text-xs ml-2 hidden sm:inline">IVR press or email reply — confirm before treating as a lead</span>
          </div>
          <div className="divide-y divide-yellow-900/20">
            {pendingLeads.map(lead => (
              <div key={lead.id} className="p-4 bg-yellow-950/10 hover:bg-yellow-950/20 transition-colors">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1.5 flex-wrap">
                      <span className="font-semibold text-white">{lead.name}</span>
                      <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-full border ${
                        lead.digit_pressed === '1'
                          ? 'bg-green-900/40 text-green-300 border-green-700/50'
                          : lead.digit_pressed === '2'
                          ? 'bg-blue-900/40 text-blue-300 border-blue-700/50'
                          : lead.reply_source === 'email'
                          ? 'bg-purple-900/40 text-purple-300 border-purple-700/50'
                          : 'bg-blue-900/40 text-blue-300 border-blue-700/50'
                      }`}>
                        {lead.digit_pressed === '1' ? 'Pressed 1 — Wants Rep'
                          : lead.digit_pressed === '2' ? 'Pressed 2 — Wants Visit (24-48h)'
                          : lead.reply_source === 'email' ? 'Email Reply'
                          : 'IVR Response'}
                      </span>
                      <span className="text-xs text-gray-500">{fmtDate(lead.call_time ?? '')}</span>
                    </div>
                    <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-400">
                      {lead.phone && (
                        <div className="flex items-center gap-1.5">
                          <Phone className="w-3 h-3" />{lead.phone}
                        </div>
                      )}
                      {lead.address && (
                        <div className="flex items-center gap-1.5">
                          <MapPin className="w-3 h-3" />{lead.address}
                        </div>
                      )}
                      {lead.source && <div className="text-gray-500">Source: {lead.source}</div>}
                    </div>
                  </div>
                  <div className="flex-shrink-0 flex gap-2 flex-wrap">
                    {lead.phone && (
                      <a href={`tel:${lead.phone}`}
                        className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded-lg flex items-center gap-1">
                        <Phone className="w-3 h-3" /> Call
                      </a>
                    )}
                    <button
                      onClick={() => confirmLead(lead.id)}
                      className="px-3 py-1.5 bg-green-700 hover:bg-green-600 text-white text-xs font-semibold rounded-lg flex items-center gap-1"
                    >
                      <CheckCircle className="w-3 h-3" /> Confirm Lead
                    </button>
                    <button
                      onClick={() => { if (confirm('Mark as wrong number or no match? Will be set to HARD_NO.')) rejectPending(lead.id); }}
                      className="px-3 py-1.5 bg-gray-800 hover:bg-red-950 text-gray-500 hover:text-red-400 text-xs rounded-lg flex items-center gap-1 border border-gray-700 hover:border-red-800"
                    >
                      <XCircle className="w-3 h-3" /> Not a Match
                    </button>
                    <button
                      onClick={() => { if (confirm('Add to Do Not Call list? This is permanent.')) rejectPending(lead.id, true); }}
                      className="px-3 py-1.5 bg-gray-800 hover:bg-red-950 text-gray-600 hover:text-red-500 text-xs rounded-lg flex items-center gap-1 border border-gray-700 hover:border-red-900"
                    >
                      Add to DNC
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Storm Prospect Leads (INTERESTED but not yet converted) */}
      {prospectLeads.length > 0 && (
        <div className="mb-6">
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
            <UserPlus className="w-3.5 h-3.5 text-orange-400" />
            <span className="text-orange-400">Storm Prospects — Confirmed Leads (Not Yet Converted)</span>
          </h2>
          <div className="space-y-2">
            {prospectLeads.map(lead => (
              <div key={lead.id} className="bg-gray-800 border border-orange-900/30 rounded-xl p-4 hover:border-orange-700/50 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="font-semibold text-white">{lead.customer.name}</span>
                      <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded-full bg-orange-900/50 text-orange-300 border border-orange-700/50">Storm Lead</span>
                      <span className="text-xs text-gray-500">{fmtDate(lead.created_at)}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-gray-400">
                      {lead.customer.phone && (
                        <div className="flex items-center gap-1.5">
                          <Phone className="w-3 h-3" />{lead.customer.phone}
                        </div>
                      )}
                      {lead.customer.email && (
                        <div className="flex items-center gap-1.5">
                          <Mail className="w-3 h-3" />{lead.customer.email}
                        </div>
                      )}
                      <div className="flex items-center gap-1.5 col-span-2">
                        <MapPin className="w-3 h-3" />{lead.address}
                      </div>
                      {lead.source && <div className="text-gray-500">Source: {lead.source}</div>}
                    </div>
                    {lead.notes && (
                      <div className="mt-2 text-xs text-gray-500 line-clamp-2">{lead.notes}</div>
                    )}
                  </div>
                  <div className="flex-shrink-0 flex gap-2">
                    {lead.customer.phone && (
                      <a href={`tel:${lead.customer.phone}`}
                        className="px-3 py-1.5 bg-orange-700 hover:bg-orange-600 text-white text-xs font-semibold rounded-lg flex items-center gap-1">
                        <Phone className="w-3 h-3" /> Call
                      </a>
                    )}
                    {lead.report_token && (
                      <a
                        href={`https://admin.roofworksoftexas.com/report/${lead.report_token}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 bg-blue-800 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg flex items-center gap-1"
                      >
                        <FileText className="w-3 h-3" /> Report
                      </a>
                    )}
                    <button
                      onClick={() => convertProspect(lead.id)}
                      disabled={converting === lead.id}
                      className="px-3 py-1.5 bg-green-700 hover:bg-green-600 text-white text-xs font-semibold rounded-lg flex items-center gap-1 disabled:opacity-40"
                    >
                      <UserPlus className="w-3 h-3" /> {converting === lead.id ? 'Converting...' : 'Convert to Job'}
                    </button>
                    <button
                      onClick={() => { if (confirm('Mark this lead as dead? It will be removed from the leads queue.')) markDead(lead.id); }}
                      className="px-3 py-1.5 bg-gray-800 hover:bg-red-950 text-gray-500 hover:text-red-400 text-xs font-semibold rounded-lg flex items-center gap-1 border border-gray-700 hover:border-red-800"
                    >
                      <XCircle className="w-3 h-3" /> Dead Lead
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* New leads needing outreach */}
      {draftLeads.length > 0 && (
        <div className="mb-6">
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-red-400" />
            <span className="text-red-400">New Estimates — Needs Contact</span>
          </h2>
          <div className="space-y-2">
            {draftLeads.map(lead => (
              <div key={lead.id} className="bg-gray-800 border border-red-900/30 rounded-xl p-4 hover:border-red-700/50 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="font-semibold text-white">{lead.customer.name}</span>
                      <span className="text-xs text-gray-500">{fmtDate(lead.created_at)}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-gray-400">
                      <div className="flex items-center gap-1.5">
                        <Phone className="w-3 h-3" />{lead.customer.phone}
                      </div>
                      {lead.customer.email && (
                        <div className="flex items-center gap-1.5">
                          <Mail className="w-3 h-3" />{lead.customer.email}
                        </div>
                      )}
                      <div className="flex items-center gap-1.5 col-span-2">
                        <MapPin className="w-3 h-3" />{lead.address}
                      </div>
                      {lead.insurer && <div>Insurer: {lead.insurer}</div>}
                      {lead.claim_no && <div>Claim: {lead.claim_no}</div>}
                    </div>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <div className="text-lg font-black text-white">{fmt(lead.our_total)}</div>
                    <div className="text-xs text-gray-500">Ins: {fmt(lead.insurance_total)}</div>
                    <div className="flex gap-2 mt-3">
                      <a href={`tel:${lead.customer.phone}`}
                        className="px-3 py-1.5 bg-red-700 hover:bg-red-600 text-white text-xs font-semibold rounded-lg flex items-center gap-1">
                        <Phone className="w-3 h-3" /> Call
                      </a>
                      <a href={`/admin/estimates/${lead.id}`}
                        className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs rounded-lg flex items-center gap-1">
                        <FileText className="w-3 h-3" /> View
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sent / waiting */}
      {sentLeads.length > 0 && (
        <div>
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Estimate Sent — Awaiting Decision</h2>
          <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700 text-left">
                  <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Customer</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Address</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Insurer</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider text-right">Our Total</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Submitted</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {sentLeads.map(lead => (
                  <tr key={lead.id} className="border-b border-gray-700/50 hover:bg-gray-700/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-white">{lead.customer.name}</div>
                      <div className="text-gray-400 text-xs">{lead.customer.phone}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-300 text-xs max-w-48 truncate">{lead.address}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{lead.insurer || '-'}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-white">{fmt(lead.our_total)}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{fmtDate(lead.created_at)}</td>
                    <td className="px-4 py-3">
                      <a href={`/admin/estimates/${lead.id}`}
                        className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs rounded transition-colors">
                        View
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && leads.length === 0 && pendingLeads.length === 0 && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-12 text-center">
          <Users className="w-10 h-10 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400">No open leads right now. All estimates have been converted or closed.</p>
        </div>
      )}
    </div>
  );
}
