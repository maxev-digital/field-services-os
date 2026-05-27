'use client';

import { useEffect, useState, useCallback } from 'react';
import { Bell, CheckCheck, FileText, Phone, UserPlus, Calendar, RefreshCw, AlertCircle } from 'lucide-react';

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string | null;
  data: any;
  read: boolean;
  created_at: string;
}

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function typeIcon(type: string) {
  switch (type) {
    case 'new_estimate':       return <FileText className="w-4 h-4 text-green-400" />;
    case 'new_contact':        return <UserPlus className="w-4 h-4 text-blue-400" />;
    case 'appointment_booked': return <Calendar className="w-4 h-4 text-yellow-400" />;
    case 'call_completed':     return <Phone className="w-4 h-4 text-purple-400" />;
    default:                   return <Bell className="w-4 h-4 text-gray-400" />;
  }
}

function typeBadge(type: string) {
  switch (type) {
    case 'new_estimate':       return 'border-green-600 bg-green-900/30';
    case 'new_contact':        return 'border-blue-600 bg-blue-900/30';
    case 'appointment_booked': return 'border-yellow-600 bg-yellow-900/30';
    case 'call_completed':     return 'border-purple-600 bg-purple-900/30';
    default:                   return 'border-gray-600 bg-gray-800';
  }
}

function typeLabel(type: string) {
  switch (type) {
    case 'new_estimate':       return 'New Estimate';
    case 'new_contact':        return 'New Contact';
    case 'appointment_booked': return 'Appointment';
    case 'call_completed':     return 'Call';
    default:                   return type.replace(/_/g, ' ');
  }
}

const FILTERS = ['All', 'Unread', 'Estimates', 'Contacts', 'Calls'] as const;
type Filter = typeof FILTERS[number];

function applyFilter(notifs: Notification[], filter: Filter): Notification[] {
  switch (filter) {
    case 'Unread':    return notifs.filter(n => !n.read);
    case 'Estimates': return notifs.filter(n => n.type === 'new_estimate');
    case 'Contacts':  return notifs.filter(n => n.type === 'new_contact');
    case 'Calls':     return notifs.filter(n => n.type === 'call_completed');
    default:          return notifs;
  }
}

export default function NotificationsPage() {
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [unread, setUnread] = useState(0);
  const [filter, setFilter] = useState<Filter>('All');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/notifications');
      const d = await r.json();
      setNotifs(d.notifications ?? []);
      setUnread(d.unreadCount ?? 0);
    } catch { setError('Failed to load notifications'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function markAllRead() {
    await fetch('/api/admin/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notification_ids: 'all' }),
    });
    setNotifs(n => n.map(x => ({ ...x, read: true })));
    setUnread(0);
  }

  async function markRead(id: string) {
    await fetch('/api/admin/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notification_ids: [id] }),
    });
    setNotifs(n => n.map(x => x.id === id ? { ...x, read: true } : x));
    setUnread(c => Math.max(0, c - 1));
  }

  function handleClick(n: Notification) {
    if (!n.read) markRead(n.id);
    if (n.type === 'new_estimate')       window.location.href = '/admin/estimates';
    else if (n.type === 'new_contact')   window.location.href = '/admin/customers';
    else if (n.type === 'call_completed') window.location.href = '/admin/call-center';
  }

  const visible = applyFilter(notifs, filter);

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gray-700 rounded-xl relative">
            <Bell className="w-5 h-5 text-white" />
            {unread > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-600 text-white text-[10px] font-bold px-1">
                {unread}
              </span>
            )}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Notifications</h1>
            <p className="text-sm text-gray-400">{unread > 0 ? `${unread} unread` : 'All caught up'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-2 text-gray-400 hover:text-white transition-colors rounded-lg hover:bg-gray-700">
            <RefreshCw className="w-4 h-4" />
          </button>
          {unread > 0 && (
            <button onClick={markAllRead}
              className="flex items-center gap-1.5 px-4 py-2 text-sm text-gray-300 hover:text-white border border-gray-600 hover:border-gray-500 rounded-lg transition-colors">
              <CheckCheck className="w-4 h-4" /> Mark all read
            </button>
          )}
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-4 bg-gray-800 border border-gray-700 rounded-xl p-1">
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`flex-1 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              filter === f ? 'bg-red-700 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'
            }`}>
            {f}
          </button>
        ))}
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-900/30 border border-red-800 text-red-300 rounded-xl px-4 py-3 text-sm mb-4">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
        {loading ? (
          <div className="py-16 text-center">
            <RefreshCw className="w-6 h-6 animate-spin text-gray-500 mx-auto mb-2" />
            <p className="text-gray-500 text-sm">Loading...</p>
          </div>
        ) : visible.length === 0 ? (
          <div className="py-16 text-center">
            <Bell className="w-10 h-10 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">No notifications{filter !== 'All' ? ` in ${filter}` : ''}</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-700">
            {visible.map(n => (
              <button key={n.id} onClick={() => handleClick(n)}
                className={`w-full text-left px-5 py-4 flex items-start gap-4 hover:bg-gray-700/50 transition-colors ${!n.read ? 'bg-gray-750/30' : ''}`}>
                <div className={`mt-0.5 p-2 rounded-xl border flex-shrink-0 ${typeBadge(n.type)}`}>
                  {typeIcon(n.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-sm font-semibold ${!n.read ? 'text-white' : 'text-gray-300'}`}>{n.title}</span>
                    <span className="text-[10px] uppercase tracking-wider text-gray-500 font-medium">{typeLabel(n.type)}</span>
                    {!n.read && <span className="w-2 h-2 rounded-full bg-blue-400 flex-shrink-0" />}
                  </div>
                  {n.message && <p className="text-xs text-gray-400 mt-0.5 truncate">{n.message}</p>}
                  {n.data?.address && <p className="text-xs text-gray-500 mt-0.5">📍 {n.data.address}</p>}
                  <p className="text-[11px] text-gray-500 mt-1">{timeAgo(n.created_at)}</p>
                </div>
                {n.data?.total && (
                  <span className="text-green-400 font-bold text-sm flex-shrink-0">${Number(n.data.total).toLocaleString()}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {notifs.length > 0 && (
        <p className="text-xs text-gray-600 text-center mt-3">Showing last 7 days · {notifs.length} total</p>
      )}
    </div>
  );
}
