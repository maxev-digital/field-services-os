'use client';

import { useEffect, useState } from 'react';
import { Star, Phone, Mail, CheckCircle, Clock, Send } from 'lucide-react';

interface ReviewRequest {
  id: string;
  sent_via: string;
  sent_at: string;
  opened_at: string | null;
  clicked_at: string | null;
  job: {
    id: string;
    address: string;
    customer: { id: string; name: string; phone: string; email: string | null };
  };
}

interface PendingJob {
  id: string;
  address: string;
  completed_date: string | null;
  customer: { id: string; name: string; phone: string; email: string | null };
}

const GOOGLE_REVIEW_URL = 'https://g.page/r/YOUR_GOOGLE_REVIEW_LINK'; // Update in settings

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ReviewsPage() {
  const [reviews, setReviews] = useState<ReviewRequest[]>([]);
  const [pending, setPending] = useState<PendingJob[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const res = await fetch('/api/admin/reviews');
    const data = await res.json();
    setReviews(data.reviews || []);
    setPending(data.pending || []);
    setTotal(data.total || 0);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const sendReview = async (job_id: string, via: 'SMS' | 'EMAIL') => {
    setSending(job_id);
    await fetch('/api/admin/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_id, sent_via: via }),
    });
    setSending(null);
    load();
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Review Requests</h1>
          <p className="text-gray-400 text-sm mt-1">{total} sent · {pending.length} jobs awaiting review request</p>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Requests Sent',  value: total,                                          color: 'text-white' },
          { label: 'Opened',         value: reviews.filter(r => r.opened_at).length,        color: 'text-blue-400' },
          { label: 'Link Clicked',   value: reviews.filter(r => r.clicked_at).length,       color: 'text-green-400' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-gray-800 border border-gray-700 rounded-xl p-4">
            <div className="text-xs text-gray-400 mb-1">{label}</div>
            <div className={`text-2xl font-black ${color}`}>{value}</div>
          </div>
        ))}
      </div>

      {/* Jobs pending review */}
      {pending.length > 0 && (
        <div className="mb-6">
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-yellow-400" />
            <span className="text-yellow-400">Jobs Ready for Review Request ({pending.length})</span>
          </h2>
          <div className="space-y-2">
            {pending.map(job => (
              <div key={job.id} className="bg-gray-800 border border-yellow-900/30 rounded-xl p-4 flex items-center justify-between gap-4">
                <div>
                  <div className="font-medium text-white">{job.customer.name}</div>
                  <div className="text-gray-400 text-xs">{job.address}</div>
                  {job.completed_date && (
                    <div className="text-gray-500 text-xs mt-0.5">Completed: {fmtDate(job.completed_date)}</div>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <a href={`tel:${job.customer.phone}`}
                    className="flex items-center gap-1 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs rounded-lg">
                    <Phone className="w-3 h-3" />{job.customer.phone}
                  </a>
                  {job.customer.email && (
                    <button onClick={() => sendReview(job.id, 'EMAIL')} disabled={sending === job.id}
                      className="flex items-center gap-1 px-3 py-1.5 bg-blue-800 hover:bg-blue-700 text-blue-200 text-xs font-semibold rounded-lg disabled:opacity-50">
                      <Mail className="w-3 h-3" /> Email
                    </button>
                  )}
                  <button onClick={() => sendReview(job.id, 'SMS')} disabled={sending === job.id}
                    className="flex items-center gap-1 px-3 py-1.5 bg-red-700 hover:bg-red-600 text-white text-xs font-semibold rounded-lg disabled:opacity-50">
                    <Send className="w-3 h-3" />{sending === job.id ? '...' : 'Mark SMS Sent'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sent reviews */}
      {reviews.length > 0 && (
        <div>
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
            <CheckCircle className="w-3.5 h-3.5 text-green-400" />
            <span className="text-green-400">Sent</span>
          </h2>
          <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700 text-left">
                  <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Customer</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Address</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Via</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Sent</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider text-center">Opened</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider text-center">Clicked</th>
                </tr>
              </thead>
              <tbody>
                {reviews.map(r => (
                  <tr key={r.id} className="border-b border-gray-700/50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-white">{r.job.customer.name}</div>
                      <div className="text-gray-400 text-xs">{r.job.customer.phone}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-300 text-xs truncate max-w-48">{r.job.address}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                        r.sent_via === 'EMAIL' ? 'bg-blue-900 text-blue-300' : 'bg-gray-700 text-gray-300'
                      }`}>{r.sent_via}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{fmtDate(r.sent_at)}</td>
                    <td className="px-4 py-3 text-center">
                      {r.opened_at ? <CheckCircle className="w-4 h-4 text-green-400 mx-auto" /> : <span className="text-gray-600">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {r.clicked_at ? <Star className="w-4 h-4 text-yellow-400 mx-auto" /> : <span className="text-gray-600">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && reviews.length === 0 && pending.length === 0 && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-12 text-center">
          <Star className="w-10 h-10 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400">No completed jobs yet. Review requests appear when jobs are marked Complete.</p>
        </div>
      )}
    </div>
  );
}
