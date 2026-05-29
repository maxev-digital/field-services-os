'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Bell, X, FileText, Phone, UserPlus, Calendar, CheckCheck } from 'lucide-react';
import Link from 'next/link';

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string | null;
  data: any;
  read: boolean;
  created_at: string;
}

function playAlertSound() {
  try {
    const audio = new Audio('/sounds/cha-ching.mp3');
    audio.volume = 0.7;
    audio.play().catch(() => {});
  } catch {}
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function typeIcon(type: string) {
  switch (type) {
    case 'new_estimate': return <FileText className="w-4 h-4 text-green-400" />;
    case 'new_contact': return <UserPlus className="w-4 h-4 text-blue-400" />;
    case 'appointment_booked': return <Calendar className="w-4 h-4 text-yellow-400" />;
    case 'call_completed': return <Phone className="w-4 h-4 text-purple-400" />;
    default: return <Bell className="w-4 h-4 text-gray-400" />;
  }
}

function typeBadgeColor(type: string) {
  switch (type) {
    case 'new_estimate': return 'border-green-600 bg-green-900/30';
    case 'new_contact': return 'border-blue-600 bg-blue-900/30';
    case 'appointment_booked': return 'border-yellow-600 bg-yellow-900/30';
    case 'call_completed': return 'border-purple-600 bg-purple-900/30';
    default: return 'border-gray-600 bg-gray-900/30';
  }
}

export default function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<Notification | null>(null);
  const lastUnreadCountRef = useRef<number>(0);
  const initialLoadDone = useRef(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const lastSeenIdRef = useRef<string>('');

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/notifications');
      if (!res.ok) return;
      const data = await res.json();
      const newUnread: number = data.unreadCount ?? 0;
      const notifs: Notification[] = data.notifications ?? [];

      setNotifications(notifs);
      setUnreadCount(newUnread);

      // Check if there's a newer notification than what we've seen
      const latestId = notifs.length > 0 ? notifs[0].id : '';

      if (initialLoadDone.current && latestId && latestId !== lastSeenIdRef.current) {
        // New notification arrived
        const newest = notifs[0];
        if (!newest.read) {
          playAlertSound();
          setToast(newest);
          setTimeout(() => setToast(null), 8000);
        }
      }

      lastSeenIdRef.current = latestId;
      lastUnreadCountRef.current = newUnread;
      initialLoadDone.current = true;
    } catch {}
  }, []);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 15000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const markAllRead = async () => {
    try {
      await fetch('/api/admin/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notification_ids: 'all' }),
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
      lastUnreadCountRef.current = 0;
    } catch {}
  };

  const markRead = async (id: string) => {
    try {
      await fetch('/api/admin/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notification_ids: [id] }),
      });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
      lastUnreadCountRef.current = Math.max(0, lastUnreadCountRef.current - 1);
    } catch {}
  };

  const handleNotificationClick = (n: Notification) => {
    if (!n.read) markRead(n.id);
    // Navigate based on type
    if (n.type === 'new_estimate' && n.data?.estimateId) {
      window.location.href = `/admin/estimates`;
    } else if (n.type === 'new_contact') {
      window.location.href = `/admin/customers`;
    } else if (n.type === 'appointment_booked' || n.type === 'call_completed') {
      window.location.href = `/admin/call-center`;
    }
    setOpen(false);
  };

  return (
    <>
      {/* Toast notification — rendered via portal to escape sidebar overflow */}
      {toast && typeof document !== 'undefined' && createPortal(
        <div className="fixed bottom-6 left-6 lg:left-60 z-[9999] w-[420px] max-w-[calc(100vw-3rem)]">
          <div className="bg-gray-800 border border-gray-600 rounded-2xl shadow-2xl shadow-black/60 overflow-hidden">
            {/* Color bar at top based on type */}
            <div className={`h-1.5 ${
              toast.type === 'new_estimate' ? 'bg-green-500' :
              toast.type === 'appointment_booked' ? 'bg-yellow-500' :
              toast.type === 'call_completed' ? 'bg-purple-500' :
              'bg-blue-500'
            }`} />
            <div className="p-4">
              <div className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  toast.type === 'new_estimate' ? 'bg-green-600/20' :
                  toast.type === 'appointment_booked' ? 'bg-yellow-600/20' :
                  toast.type === 'call_completed' ? 'bg-purple-600/20' :
                  'bg-blue-600/20'
                }`}>
                  {typeIcon(toast.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs font-bold uppercase tracking-wider ${
                      toast.type === 'new_estimate' ? 'text-green-400' :
                      toast.type === 'appointment_booked' ? 'text-yellow-400' :
                      toast.type === 'call_completed' ? 'text-purple-400' :
                      'text-blue-400'
                    }`}>
                      {toast.type === 'new_estimate' ? 'NEW LEAD' :
                       toast.type === 'new_contact' ? 'NEW CONTACT' :
                       toast.type === 'appointment_booked' ? 'APPOINTMENT BOOKED' :
                       toast.type === 'call_completed' ? 'CALL COMPLETED' : 'NOTIFICATION'}
                    </span>
                    <span className="text-xs text-gray-500">just now</span>
                  </div>
                  <p className="text-white font-semibold text-sm">{toast.title}</p>
                  {toast.message && (
                    <p className="text-gray-400 text-sm mt-0.5">{toast.message}</p>
                  )}
                  {toast.data?.address && (
                    <p className="text-gray-500 text-xs mt-1">📍 {toast.data.address}</p>
                  )}
                  {toast.data?.total && (
                    <p className="text-green-400 font-bold text-lg mt-1">${Number(toast.data.total).toLocaleString()}</p>
                  )}
                </div>
                <button onClick={() => setToast(null)} className="p-1.5 hover:bg-gray-700 rounded-lg text-gray-500 hover:text-white flex-shrink-0">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <button
                onClick={() => { handleNotificationClick(toast); setToast(null); }}
                className="w-full mt-3 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white text-xs font-medium rounded-lg transition-colors text-center"
              >
                View Details →
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Bell + dropdown */}
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setOpen(!open)}
          className="relative p-1.5 text-gray-400 hover:text-white transition-colors"
          title="Notifications"
        >
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-600 text-white text-[10px] font-bold leading-none px-1">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>

        {open && (
          <div className="absolute right-0 top-full mt-2 w-80 max-h-[28rem] bg-gray-800 border border-gray-700 rounded-xl shadow-2xl z-[90] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
              <span className="text-sm font-semibold text-white">Notifications</span>
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-green-400 transition-colors"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  Mark all read
                </button>
              )}
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="py-10 text-center text-sm text-gray-500">No notifications yet</div>
              ) : (
                notifications.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => handleNotificationClick(n)}
                    className={`w-full text-left px-4 py-3 border-b border-gray-700/50 hover:bg-gray-700/50 transition-colors flex gap-3 items-start ${
                      !n.read ? 'bg-gray-750/40' : ''
                    }`}
                  >
                    <div className={`mt-0.5 p-1.5 rounded-lg border ${typeBadgeColor(n.type)}`}>
                      {typeIcon(n.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-medium truncate ${!n.read ? 'text-white' : 'text-gray-300'}`}>
                          {n.title}
                        </span>
                        {!n.read && (
                          <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                        )}
                      </div>
                      {n.message && (
                        <p className="text-xs text-gray-400 truncate mt-0.5">{n.message}</p>
                      )}
                      <p className="text-[10px] text-gray-500 mt-1">{timeAgo(n.created_at)}</p>
                    </div>
                  </button>
                ))
              )}
            </div>
            <div className="border-t border-gray-700 px-4 py-2.5">
              <Link href="/admin/notifications" onClick={() => setOpen(false)}
                className="block text-xs text-center text-gray-400 hover:text-white transition-colors py-1">
                View all notifications →
              </Link>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
