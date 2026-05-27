'use client';

import { useEffect, useState } from 'react';
import {
  MapPin, Phone, ChevronRight, Clock, CheckCircle2,
  Hammer, FileCheck, RefreshCw, LayoutList,
} from 'lucide-react';

interface Job {
  id: string;
  address: string;
  status: string;
  material: string | null;
  shingle_color: string | null;
  squares: number | null;
  crew_name: string | null;
  scheduled_date: string | null;
  customer: { name: string; phone: string; email?: string };
}

const STATUS_CONFIG: Record<string, { label: string; color: string; next: string; nextLabel: string; icon: any }> = {
  SCHEDULED:   { label: 'Scheduled',   color: 'bg-yellow-900 text-yellow-300 border-yellow-700',   next: 'IN_PROGRESS', nextLabel: 'Start Job',       icon: Clock },
  IN_PROGRESS: { label: 'In Progress', color: 'bg-blue-900 text-blue-300 border-blue-700',         next: 'COMPLETE',    nextLabel: 'Mark Complete',   icon: Hammer },
  COMPLETE:    { label: 'Complete',     color: 'bg-green-900 text-green-300 border-green-700',      next: 'INVOICED',    nextLabel: 'Send Invoice',    icon: CheckCircle2 },
  INVOICED:    { label: 'Invoiced',     color: 'bg-purple-900 text-purple-300 border-purple-700',   next: '',            nextLabel: '',                icon: FileCheck },
};

export default function FieldPage() {
  const [data, setData]         = useState<{ todayJobs: Job[]; activeJobs: Job[] } | null>(null);
  const [loading, setLoading]   = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await fetch('/api/admin/field');
      setData(await res.json());
    } catch {}
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const updateStatus = async (jobId: string, status: string) => {
    setUpdating(jobId);
    try {
      await fetch('/api/admin/field', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, status }),
      });
      await load();
    } catch {}
    finally { setUpdating(null); }
  };

  if (loading) return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-red-600" />
    </div>
  );

  const all = [...(data?.todayJobs || []), ...(data?.activeJobs || [])
    .filter(j => !data?.todayJobs.find(t => t.id === j.id))];

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="min-h-screen bg-gray-900 pb-20">
      {/* Top bar */}
      <div className="sticky top-0 z-10 bg-gray-900 border-b border-gray-800 px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <LayoutList className="h-5 w-5 text-red-500" />
              <span className="text-white font-bold text-lg">Field View</span>
            </div>
            <p className="text-gray-400 text-xs mt-0.5">{today}</p>
          </div>
          <button onClick={load} className="p-2 text-gray-400 active:text-white">
            <RefreshCw className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="px-4 pt-4 space-y-3">
        {all.length === 0 && (
          <div className="text-center py-16">
            <CheckCircle2 className="h-12 w-12 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400">No active jobs today</p>
          </div>
        )}

        {all.map(job => {
          const cfg = STATUS_CONFIG[job.status] || STATUS_CONFIG['SCHEDULED'];
          const Icon = cfg.icon;
          const isExpanded = expanded === job.id;

          return (
            <div key={job.id} className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
              {/* Job header */}
              <button
                className="w-full px-4 py-4 flex items-start gap-3 text-left"
                onClick={() => setExpanded(isExpanded ? null : job.id)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.color}`}>
                      {cfg.label}
                    </span>
                    {job.scheduled_date && (
                      <span className="text-gray-400 text-xs flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(job.scheduled_date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                  <p className="text-white font-semibold mt-1.5 leading-snug">{job.address}</p>
                  <p className="text-gray-400 text-sm mt-0.5">{job.customer.name}</p>
                </div>
                <ChevronRight className={`h-5 w-5 text-gray-500 flex-shrink-0 mt-1 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
              </button>

              {/* Expanded details */}
              {isExpanded && (
                <div className="px-4 pb-4 border-t border-gray-700 pt-3 space-y-3">
                  {/* Contact */}
                  <div className="flex gap-2">
                    <a
                      href={`tel:${job.customer.phone}`}
                      className="flex-1 flex items-center justify-center gap-2 bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium"
                    >
                      <Phone className="h-4 w-4" />
                      Call {job.customer.name.split(' ')[0]}
                    </a>
                    <a
                      href={`https://maps.google.com/?q=${encodeURIComponent(job.address)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex-1 flex items-center justify-center gap-2 bg-gray-700 text-white rounded-lg py-2.5 text-sm font-medium"
                    >
                      <MapPin className="h-4 w-4" />
                      Directions
                    </a>
                  </div>

                  {/* Job details */}
                  {(job.material || job.squares || job.shingle_color || job.crew_name) && (
                    <div className="bg-gray-700 rounded-lg p-3 space-y-1.5 text-sm">
                      {job.material     && <div className="flex justify-between"><span className="text-gray-400">Material</span><span className="text-white">{job.material}</span></div>}
                      {job.squares      && <div className="flex justify-between"><span className="text-gray-400">Squares</span><span className="text-white">{job.squares}</span></div>}
                      {job.shingle_color && <div className="flex justify-between"><span className="text-gray-400">Color</span><span className="text-white">{job.shingle_color}</span></div>}
                      {job.crew_name    && <div className="flex justify-between"><span className="text-gray-400">Crew</span><span className="text-white">{job.crew_name}</span></div>}
                    </div>
                  )}

                  {/* Status action */}
                  {cfg.next && (
                    <button
                      onClick={() => updateStatus(job.id, cfg.next)}
                      disabled={updating === job.id}
                      className="w-full py-3 rounded-lg bg-red-600 text-white font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {updating === job.id
                        ? <><span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />Updating...</>
                        : <><Icon className="h-4 w-4" />{cfg.nextLabel}</>
                      }
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
