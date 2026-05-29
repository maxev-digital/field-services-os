'use client';

import { useEffect, useState } from 'react';
import { Briefcase, Search, Plus, Phone, MapPin, Calendar, ChevronRight } from 'lucide-react';

type JobStatus = 'LEAD' | 'ESTIMATE_SENT' | 'INSURANCE_APPROVED' | 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETE' | 'INVOICED' | 'PAID';

interface Job {
  id: string;
  address: string;
  insurer: string | null;
  claim_no: string | null;
  status: JobStatus;
  crew_name: string | null;
  scheduled_date: string | null;
  completed_date: string | null;
  created_at: string;
  customer: { id: string; name: string; phone: string };
  is_prospect?: boolean;
  source?: string | null;
}

const STATUSES: { value: JobStatus; label: string; color: string; bar: string }[] = [
  { value: 'LEAD',               label: 'Lead',               color: 'bg-gray-700 text-gray-300',    bar: 'bg-gray-500' },
  { value: 'ESTIMATE_SENT',      label: 'Estimate Sent',      color: 'bg-blue-900 text-blue-300',    bar: 'bg-blue-500' },
  { value: 'INSURANCE_APPROVED', label: 'Ins. Approved',      color: 'bg-purple-900 text-purple-300',bar: 'bg-purple-500' },
  { value: 'SCHEDULED',          label: 'Scheduled',          color: 'bg-yellow-900 text-yellow-300',bar: 'bg-yellow-500' },
  { value: 'IN_PROGRESS',        label: 'In Progress',        color: 'bg-orange-900 text-orange-300',bar: 'bg-orange-500' },
  { value: 'COMPLETE',           label: 'Complete',           color: 'bg-green-900 text-green-300',  bar: 'bg-green-500' },
  { value: 'INVOICED',           label: 'Invoiced',           color: 'bg-teal-900 text-teal-300',    bar: 'bg-teal-500' },
  { value: 'PAID',               label: 'Paid',               color: 'bg-emerald-900 text-emerald-300', bar: 'bg-emerald-500' },
];

const STATUS_MAP = Object.fromEntries(STATUSES.map(s => [s.value, s])) as Record<JobStatus, typeof STATUSES[0]>;

function fmtDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [view, setView] = useState<'kanban' | 'list'>('list');

  const load = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (statusFilter !== 'ALL') params.set('status', statusFilter);
    const res = await fetch(`/api/admin/jobs?${params}`);
    const data = await res.json();
    setJobs(data.jobs || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [search, statusFilter]);

  const updateStatus = async (id: string, status: JobStatus) => {
    await fetch(`/api/admin/jobs/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    load();
  };

  const byStatus = (s: JobStatus) => jobs.filter(j => j.status === s);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Job Pipeline</h1>
          <p className="text-gray-400 text-sm mt-1">{jobs.length} total jobs</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
            {(['list', 'kanban'] as const).map(v => (
              <button key={v} onClick={() => setView(v)}
                className={`px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${view === v ? 'bg-red-700 text-white' : 'text-gray-400 hover:text-white'}`}>
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Status summary row */}
      <div className="grid grid-cols-4 lg:grid-cols-8 gap-2 mb-6">
        {STATUSES.map(s => {
          const count = byStatus(s.value).length;
          return (
            <div key={s.value} className="bg-gray-800 border border-gray-700 rounded-lg p-3 cursor-pointer hover:border-gray-500"
              onClick={() => setStatusFilter(statusFilter === s.value ? 'ALL' : s.value)}>
              <div className="text-lg font-black text-white">{count}</div>
              <div className="text-xs text-gray-400 truncate">{s.label}</div>
              <div className={`mt-2 h-1 rounded-full ${s.bar}`} />
            </div>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-60">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search address, customer, claim #..."
            className="w-full pl-9 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-400 focus:outline-none focus:border-red-500" />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {['ALL', ...STATUSES.map(s => s.value)].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                statusFilter === s ? 'bg-red-700 text-white' : 'bg-gray-800 text-gray-400 border border-gray-700 hover:text-white'
              }`}>
              {s === 'ALL' ? 'All' : STATUS_MAP[s as JobStatus]?.label || s}
            </button>
          ))}
        </div>
      </div>

      {view === 'list' ? (
        /* List View */
        <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700 text-left">
                <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Customer</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Address</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Insurer / Claim</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Scheduled</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Date</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Move</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [...Array(6)].map((_, i) => (
                  <tr key={i} className="border-b border-gray-700/50">
                    {[...Array(7)].map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-700 rounded animate-pulse" /></td>
                    ))}
                  </tr>
                ))
              ) : jobs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                    No jobs found. Convert an approved estimate to create your first job.
                  </td>
                </tr>
              ) : jobs.map(job => {
                const st = STATUS_MAP[job.status];
                const idx = STATUSES.findIndex(s => s.value === job.status);
                const nextStatus = STATUSES[idx + 1]?.value;
                return (
                  <tr key={job.id} onClick={() => window.location.href = job.is_prospect ? '/admin/leads' : `/admin/jobs/${job.id}`}
                    className={`border-b border-gray-700/50 hover:bg-gray-700/30 transition-colors cursor-pointer ${job.is_prospect ? 'border-l-2 border-l-orange-600' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="font-medium text-white">{job.customer.name}</div>
                        {job.is_prospect && <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase rounded bg-orange-900/60 text-orange-400 border border-orange-700/50 leading-none">Storm</span>}
                      </div>
                      <div className="text-gray-400 text-xs flex items-center gap-1 mt-0.5">
                        <Phone className="w-3 h-3" />{job.customer.phone}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-300 max-w-48 truncate">
                      <div className="flex items-start gap-1">
                        <MapPin className="w-3 h-3 text-gray-500 mt-0.5 flex-shrink-0" />
                        <span className="truncate text-xs">{job.address}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-gray-300 text-xs">{job.insurer || '—'}</div>
                      <div className="text-gray-500 text-xs">{job.claim_no || ''}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${st.color}`}>{st.label}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {job.scheduled_date ? (
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {fmtDate(job.scheduled_date)}
                        </div>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{fmtDate(job.created_at)}</td>
                    <td className="px-4 py-3">
                      {nextStatus && !job.is_prospect && (
                        <button onClick={e => { e.stopPropagation(); updateStatus(job.id, nextStatus as JobStatus); }}
                          className="flex items-center gap-1 px-2 py-1 bg-gray-700 hover:bg-red-700 text-gray-300 hover:text-white rounded text-xs transition-colors">
                          <ChevronRight className="w-3 h-3" />
                          {STATUS_MAP[nextStatus as JobStatus]?.label}
                        </button>
                      )}
                      {job.is_prospect && (
                        <a href="/admin/leads" className="flex items-center gap-1 px-2 py-1 bg-orange-900/40 hover:bg-orange-800/50 text-orange-400 rounded text-xs transition-colors">
                          <ChevronRight className="w-3 h-3" /> Work Lead
                        </a>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        /* Kanban View */
        <div className="flex gap-3 overflow-x-auto pb-4">
          {STATUSES.map(s => {
            const cols = byStatus(s.value);
            return (
              <div key={s.value} className="flex-shrink-0 w-60">
                <div className={`flex items-center justify-between px-3 py-2 rounded-t-lg ${s.bar} bg-opacity-20 border border-gray-700 border-b-0`}>
                  <span className="text-xs font-bold text-white">{s.label}</span>
                  <span className="text-xs bg-gray-800 text-gray-300 px-1.5 py-0.5 rounded">{cols.length}</span>
                </div>
                <div className="bg-gray-800 border border-gray-700 rounded-b-lg min-h-32 p-2 space-y-2">
                  {cols.map(job => (
                    <div key={job.id} onClick={() => window.location.href = job.is_prospect ? '/admin/leads' : `/admin/jobs/${job.id}`}
                      className={`border rounded-lg p-3 hover:border-gray-500 transition-colors cursor-pointer ${job.is_prospect ? 'border-orange-700/50 bg-orange-950/20' : 'border-gray-700'}`}
                      style={job.is_prospect ? undefined : { backgroundColor: 'rgba(55,65,81,0.5)' }}>
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <div className="font-medium text-white text-sm truncate">{job.customer.name}</div>
                        {job.is_prospect && <span className="flex-shrink-0 px-1 py-0.5 text-[8px] font-bold uppercase rounded bg-orange-900/60 text-orange-400 border border-orange-700/50 leading-none">Storm</span>}
                      </div>
                      <div className="text-gray-400 text-xs truncate mt-0.5">{job.address}</div>
                      {job.insurer && <div className="text-gray-500 text-xs mt-1">{job.insurer}</div>}
                      {job.scheduled_date && (
                        <div className="flex items-center gap-1 mt-2 text-yellow-400 text-xs">
                          <Calendar className="w-3 h-3" />{fmtDate(job.scheduled_date)}
                        </div>
                      )}
                    </div>
                  ))}
                  {cols.length === 0 && (
                    <div className="text-center py-6 text-gray-600 text-xs">Empty</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
