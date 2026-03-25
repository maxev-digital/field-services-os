'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Briefcase, User, Phone, MapPin, Calendar, Wrench,
  Image, Star, ChevronRight, Edit2, Check, X,
} from 'lucide-react';

type JobStatus = 'LEAD' | 'ESTIMATE_SENT' | 'INSURANCE_APPROVED' | 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETE' | 'INVOICED' | 'PAID';

const STATUSES: { value: JobStatus; label: string; color: string; bar: string }[] = [
  { value: 'LEAD',               label: 'Lead',            color: 'bg-gray-700 text-gray-300',         bar: 'bg-gray-500' },
  { value: 'ESTIMATE_SENT',      label: 'Estimate Sent',   color: 'bg-blue-900 text-blue-300',         bar: 'bg-blue-500' },
  { value: 'INSURANCE_APPROVED', label: 'Ins. Approved',   color: 'bg-purple-900 text-purple-300',     bar: 'bg-purple-500' },
  { value: 'SCHEDULED',          label: 'Scheduled',       color: 'bg-yellow-900 text-yellow-300',     bar: 'bg-yellow-500' },
  { value: 'IN_PROGRESS',        label: 'In Progress',     color: 'bg-orange-900 text-orange-300',     bar: 'bg-orange-500' },
  { value: 'COMPLETE',           label: 'Complete',        color: 'bg-green-900 text-green-300',       bar: 'bg-green-500' },
  { value: 'INVOICED',           label: 'Invoiced',        color: 'bg-teal-900 text-teal-300',         bar: 'bg-teal-500' },
  { value: 'PAID',               label: 'Paid',            color: 'bg-emerald-900 text-emerald-300',   bar: 'bg-emerald-500' },
];
const STATUS_MAP = Object.fromEntries(STATUSES.map(s => [s.value, s])) as Record<JobStatus, typeof STATUSES[0]>;

interface Claim {
  id: string;
  insurer: string;
  claim_no: string | null;
  adjuster_name: string | null;
  adjuster_phone: string | null;
  adjuster_email: string | null;
  deductible: number | null;
  acv_amount: number | null;
  rcv_amount: number | null;
  approved_amount: number | null;
  depreciation: number | null;
  mortgage_company: string | null;
  mortgage_loan_no: string | null;
  status: string;
}

interface Photo {
  id: string;
  url: string;
  photo_type: string;
  caption: string | null;
  created_at: string;
}

interface ReviewRequest {
  id: string;
  sent_at: string;
  clicked_at: string | null;
  reviewed_at: string | null;
}

interface Job {
  id: string;
  address: string;
  insurer: string | null;
  claim_no: string | null;
  status: JobStatus;
  crew_name: string | null;
  scheduled_date: string | null;
  completed_date: string | null;
  material: string | null;
  shingle_color: string | null;
  supplier: string | null;
  squares: number | null;
  notes: string | null;
  created_at: string;
  customer: { id: string; name: string; phone: string; email: string | null };
  claim: Claim | null;
  photos: Photo[];
  review_request: ReviewRequest | null;
}

function fmtDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function toInputDate(d: string | null) {
  if (!d) return '';
  return new Date(d).toISOString().split('T')[0];
}

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingClaim, setSavingClaim] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);

  const [form, setForm] = useState({
    crew_name: '', scheduled_date: '', completed_date: '',
    material: '', shingle_color: '', supplier: '', squares: '', notes: '',
  });

  const load = async () => {
    setLoading(true);
    const res = await fetch(`/api/admin/jobs/${id}`);
    const data = await res.json();
    if (data.job) {
      setJob(data.job);
      setForm({
        crew_name:      data.job.crew_name      || '',
        scheduled_date: toInputDate(data.job.scheduled_date),
        completed_date: toInputDate(data.job.completed_date),
        material:       data.job.material       || '',
        shingle_color:  data.job.shingle_color  || '',
        supplier:       data.job.supplier       || '',
        squares:        data.job.squares != null ? String(data.job.squares) : '',
        notes:          data.job.notes          || '',
      });
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  const save = async () => {
    setSaving(true);
    await fetch(`/api/admin/jobs/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    setSaving(false);
    setEditing(false);
    load();
  };

  const openClaim = async () => {
    if (!job) return;
    setSavingClaim(true);
    await fetch('/api/admin/claims', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        job_id:    id,
        insurer:   job.insurer   || '',
        claim_no:  job.claim_no  || '',
      }),
    });
    setSavingClaim(false);
    load();
  };

  const advanceStatus = async () => {
    if (!job) return;
    const idx = STATUSES.findIndex(s => s.value === job.status);
    const next = STATUSES[idx + 1]?.value;
    if (!next) return;
    await fetch(`/api/admin/jobs/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    });
    load();
  };

  if (loading) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="h-8 bg-gray-700 rounded w-48 mb-6 animate-pulse" />
        <div className="grid grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-36 bg-gray-800 rounded-xl animate-pulse" />)}
        </div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="p-6 text-center text-gray-400">
        Job not found. <button onClick={() => router.back()} className="text-red-400 hover:underline">Go back</button>
      </div>
    );
  }

  const st = STATUS_MAP[job.status];
  const idx = STATUSES.findIndex(s => s.value === job.status);
  const nextStatus = STATUSES[idx + 1];

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="Photo" className="max-h-[90vh] max-w-[90vw] rounded-xl object-contain" />
        </div>
      )}

      {/* Back */}
      <button onClick={() => router.push('/admin/jobs')}
        className="flex items-center gap-2 text-gray-400 hover:text-white text-sm mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Jobs
      </button>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-white">{job.address}</h1>
            <span className={`px-2.5 py-0.5 rounded text-xs font-bold ${st.color}`}>{st.label}</span>
          </div>
          <p className="text-gray-400 text-sm">Created {fmtDate(job.created_at)}</p>
        </div>
        <div className="flex items-center gap-2">
          {nextStatus && (
            <button onClick={advanceStatus}
              className="flex items-center gap-1.5 px-4 py-2 bg-red-700 hover:bg-red-600 text-white text-sm font-semibold rounded-lg transition-colors">
              <ChevronRight className="w-4 h-4" /> Move to {nextStatus.label}
            </button>
          )}
          {editing ? (
            <>
              <button onClick={save} disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors">
                <Check className="w-4 h-4" /> {saving ? 'Saving…' : 'Save'}
              </button>
              <button onClick={() => setEditing(false)}
                className="flex items-center gap-1.5 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm rounded-lg transition-colors">
                <X className="w-4 h-4" />
              </button>
            </>
          ) : (
            <button onClick={() => setEditing(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm font-semibold rounded-lg transition-colors">
              <Edit2 className="w-4 h-4" /> Edit
            </button>
          )}
        </div>
      </div>

      {/* Status progress bar */}
      <div className="flex gap-0.5 mb-6 rounded-full overflow-hidden h-2">
        {STATUSES.map((s, i) => (
          <div key={s.value} className={`flex-1 transition-all ${i <= idx ? s.bar : 'bg-gray-700'}`} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Customer */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
            <User className="w-4 h-4" /> Customer
          </h2>
          <div className="space-y-2">
            <a href={`/admin/customers/${job.customer.id}`}
              className="font-semibold text-white hover:text-red-400 transition-colors text-lg">
              {job.customer.name}
            </a>
            <a href={`tel:${job.customer.phone}`}
              className="flex items-center gap-2 text-gray-300 hover:text-white text-sm transition-colors">
              <Phone className="w-4 h-4 text-gray-500" /> {job.customer.phone}
            </a>
            {job.customer.email && (
              <div className="text-gray-400 text-sm">{job.customer.email}</div>
            )}
          </div>
        </div>

        {/* Job Details */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
            <Briefcase className="w-4 h-4" /> Job Details
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Crew</label>
              {editing ? (
                <input value={form.crew_name} onChange={e => setForm({ ...form, crew_name: e.target.value })}
                  className="w-full px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-sm text-white focus:outline-none focus:border-red-500" />
              ) : (
                <span className="text-white text-sm">{job.crew_name || '—'}</span>
              )}
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Squares</label>
              {editing ? (
                <input value={form.squares} onChange={e => setForm({ ...form, squares: e.target.value })} type="number" step="0.1"
                  className="w-full px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-sm text-white focus:outline-none focus:border-red-500" />
              ) : (
                <span className="text-white text-sm">{job.squares != null ? job.squares : '—'}</span>
              )}
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block flex items-center gap-1"><Calendar className="w-3 h-3" /> Scheduled</label>
              {editing ? (
                <input value={form.scheduled_date} onChange={e => setForm({ ...form, scheduled_date: e.target.value })} type="date"
                  className="w-full px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-sm text-white focus:outline-none focus:border-red-500" />
              ) : (
                <span className="text-white text-sm">{fmtDate(job.scheduled_date)}</span>
              )}
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block flex items-center gap-1"><Calendar className="w-3 h-3" /> Completed</label>
              {editing ? (
                <input value={form.completed_date} onChange={e => setForm({ ...form, completed_date: e.target.value })} type="date"
                  className="w-full px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-sm text-white focus:outline-none focus:border-red-500" />
              ) : (
                <span className="text-white text-sm">{fmtDate(job.completed_date)}</span>
              )}
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Material</label>
              {editing ? (
                <input value={form.material} onChange={e => setForm({ ...form, material: e.target.value })}
                  className="w-full px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-sm text-white focus:outline-none focus:border-red-500" />
              ) : (
                <span className="text-white text-sm">{job.material || '—'}</span>
              )}
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Shingle Color</label>
              {editing ? (
                <input value={form.shingle_color} onChange={e => setForm({ ...form, shingle_color: e.target.value })}
                  className="w-full px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-sm text-white focus:outline-none focus:border-red-500" />
              ) : (
                <span className="text-white text-sm">{job.shingle_color || '—'}</span>
              )}
            </div>
            <div className="col-span-2">
              <label className="text-xs text-gray-500 mb-1 block">Supplier</label>
              {editing ? (
                <input value={form.supplier} onChange={e => setForm({ ...form, supplier: e.target.value })}
                  className="w-full px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-sm text-white focus:outline-none focus:border-red-500" />
              ) : (
                <span className="text-white text-sm">{job.supplier || '—'}</span>
              )}
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
            <Wrench className="w-4 h-4" /> Notes
          </h2>
          {editing ? (
            <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
              rows={5} placeholder="Job notes, special instructions..."
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white focus:outline-none focus:border-red-500 resize-none" />
          ) : job.notes ? (
            <p className="text-gray-300 text-sm whitespace-pre-wrap">{job.notes}</p>
          ) : (
            <p className="text-gray-500 text-sm">No notes yet.</p>
          )}
        </div>

        {/* Insurance / Claim */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
              <MapPin className="w-4 h-4" /> Insurance / Claim
            </h2>
            {!job.claim && (
              <button onClick={openClaim} disabled={savingClaim}
                className="px-3 py-1 bg-red-700 hover:bg-red-600 text-white text-xs font-semibold rounded-lg disabled:opacity-50 transition-colors">
                {savingClaim ? 'Opening…' : '+ Open Claim'}
              </button>
            )}
          </div>
          {job.claim ? (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Insurer</span>
                <span className="text-white font-medium">{job.claim.insurer}</span>
              </div>
              {job.claim.claim_no && (
                <div className="flex justify-between">
                  <span className="text-gray-400">Claim #</span>
                  <span className="text-white">{job.claim.claim_no}</span>
                </div>
              )}
              {job.claim.adjuster_name && (
                <div className="flex justify-between">
                  <span className="text-gray-400">Adjuster</span>
                  <span className="text-white">{job.claim.adjuster_name}</span>
                </div>
              )}
              {job.claim.adjuster_phone && (
                <div className="flex justify-between">
                  <span className="text-gray-400">Adj. Phone</span>
                  <a href={`tel:${job.claim.adjuster_phone}`} className="text-red-400 hover:underline">
                    {job.claim.adjuster_phone}
                  </a>
                </div>
              )}
              {job.claim.adjuster_email && (
                <div className="flex justify-between">
                  <span className="text-gray-400">Adj. Email</span>
                  <a href={`mailto:${job.claim.adjuster_email}`} className="text-red-400 hover:underline text-xs">
                    {job.claim.adjuster_email}
                  </a>
                </div>
              )}
              {job.claim.deductible != null && (
                <div className="flex justify-between">
                  <span className="text-gray-400">Deductible</span>
                  <span className="text-yellow-400 font-semibold">
                    ${job.claim.deductible.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              )}
              {job.claim.acv_amount != null && (
                <div className="flex justify-between">
                  <span className="text-gray-400">ACV</span>
                  <span className="text-blue-400 font-semibold">
                    ${job.claim.acv_amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              )}
              {job.claim.rcv_amount != null && (
                <div className="flex justify-between">
                  <span className="text-gray-400">RCV</span>
                  <span className="text-emerald-400 font-semibold">
                    ${job.claim.rcv_amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              )}
              {job.claim.approved_amount != null && (
                <div className="flex justify-between">
                  <span className="text-gray-400">Approved</span>
                  <span className="text-emerald-400 font-semibold">
                    ${job.claim.approved_amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              )}
              {job.claim.mortgage_company && (
                <div className="flex justify-between">
                  <span className="text-gray-400">Mortgage Co.</span>
                  <span className="text-white text-xs">{job.claim.mortgage_company}</span>
                </div>
              )}
              <div className="flex justify-between pt-1 border-t border-gray-700">
                <span className="text-gray-400">Status</span>
                <span className="text-white text-xs font-semibold bg-gray-700 px-2 py-0.5 rounded">
                  {job.claim.status}
                </span>
              </div>
              <div className="pt-1">
                <a href="/admin/claims" className="text-xs text-red-400 hover:underline">View in Claims →</a>
              </div>
            </div>
          ) : (
            <div className="text-gray-500 text-sm">
              {job.insurer ? (
                <div>
                  <div className="text-white text-sm mb-1">{job.insurer}</div>
                  {job.claim_no && <div className="text-gray-400 text-xs">Claim # {job.claim_no}</div>}
                  <div className="text-gray-500 text-xs mt-2">No claim record yet — click &quot;+ Open Claim&quot; above.</div>
                </div>
              ) : (
                <div>No insurance claim linked. Click &quot;+ Open Claim&quot; to start one.</div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Photos */}
      {job.photos.length > 0 && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 mt-6">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
            <Image className="w-4 h-4" /> Photos ({job.photos.length})
          </h2>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
            {job.photos.map(photo => (
              <div key={photo.id} className="relative aspect-square rounded-lg overflow-hidden cursor-pointer group"
                onClick={() => setLightbox(photo.url)}>
                <img src={photo.url} alt={photo.caption || photo.photo_type}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200" />
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-1.5">
                  <span className="text-white text-xs capitalize">{photo.photo_type.replace(/_/g, ' ')}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Review */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 mt-6">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
          <Star className="w-4 h-4" /> Review Request
        </h2>
        {job.review_request ? (
          <div className="flex items-center gap-6 text-sm">
            <div>
              <div className="text-xs text-gray-500 mb-0.5">Sent</div>
              <div className="text-white">{fmtDate(job.review_request.sent_at)}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-0.5">Clicked</div>
              <div className={job.review_request.clicked_at ? 'text-emerald-400' : 'text-gray-500'}>
                {fmtDate(job.review_request.clicked_at)}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-0.5">Reviewed</div>
              <div className={job.review_request.reviewed_at ? 'text-emerald-400' : 'text-gray-500'}>
                {fmtDate(job.review_request.reviewed_at)}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <p className="text-gray-500 text-sm">No review request sent yet.</p>
            {job.status === 'COMPLETE' || job.status === 'INVOICED' || job.status === 'PAID' ? (
              <a href="/admin/reviews"
                className="text-xs text-red-400 hover:text-red-300 underline transition-colors">
                Send from Reviews page →
              </a>
            ) : (
              <span className="text-xs text-gray-600">Available after job is complete</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
