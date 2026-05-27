'use client';

import { useEffect, useState, useCallback } from 'react';
import { MessageSquare, Phone, RefreshCw, Send, ArrowLeft, User } from 'lucide-react';

interface Convo {
  phone: string;
  name: string | null;
  address: string | null;
  sent_count: number;
  reply_count: number;
  last_activity: string;
  last_sent: string | null;
  last_reply: string | null;
}

interface Message {
  id: number;
  phone: string;
  message: string;
  status: string;
  sent_at: string;
  name?: string;
  address?: string;
}

function timeAgo(d: string) {
  const diff = (Date.now() - new Date(d).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatPhone(p: string) {
  const d = p.replace(/\D/g, '');
  if (d.length === 10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
  if (d.length === 11) return `+${d[0]} (${d.slice(1,4)}) ${d.slice(4,7)}-${d.slice(7)}`;
  return p;
}

export default function SMSInboxPage() {
  const [convos, setConvos] = useState<Convo[]>([]);
  const [totalReplies, setTotalReplies] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [thread, setThread] = useState<{ sent: Message[]; replies: Message[] }>({ sent: [], replies: [] });
  const [threadLoading, setThreadLoading] = useState(false);

  const loadConvos = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/admin/sms');
      const d = await r.json();
      setConvos(d.conversations ?? []);
      setTotalReplies(d.totalReplies ?? 0);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadConvos(); }, [loadConvos]);

  async function openThread(phone: string) {
    setSelected(phone); setThreadLoading(true);
    try {
      const r = await fetch(`/api/admin/sms?phone=${encodeURIComponent(phone)}`);
      const d = await r.json();
      setThread(d);
    } finally { setThreadLoading(false); }
  }

  // Merge and sort sent + replies for thread view
  const merged = [
    ...thread.sent.map(m => ({ ...m, direction: 'out' as const })),
    ...thread.replies.map(m => ({ ...m, direction: 'in' as const })),
  ].sort((a, b) => new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime());

  const selectedConvo = convos.find(c => c.phone === selected);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2.5 bg-green-700 rounded-xl"><MessageSquare className="w-5 h-5 text-white" /></div>
        <div>
          <h1 className="text-2xl font-bold text-white">SMS Inbox</h1>
          <p className="text-sm text-gray-400">{convos.length} conversations · {totalReplies} replies received</p>
        </div>
        <button onClick={loadConvos} className="ml-auto p-2 text-gray-400 hover:text-white rounded-lg hover:bg-gray-700 transition-colors">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="w-6 h-6 animate-spin text-gray-500" />
        </div>
      ) : convos.length === 0 ? (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-12 text-center">
          <MessageSquare className="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400 font-medium">No SMS conversations yet</p>
          <p className="text-gray-600 text-sm mt-1">Messages will appear here once storm campaigns start sending.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 h-[calc(100vh-200px)] min-h-96">
          {/* Conversation list */}
          <div className={`md:col-span-2 bg-gray-800 border border-gray-700 rounded-xl overflow-y-auto ${selected && 'hidden md:block'}`}>
            {convos.map(c => (
              <button key={c.phone} onClick={() => openThread(c.phone)}
                className={`w-full text-left px-4 py-3 border-b border-gray-700/60 hover:bg-gray-700/50 transition-colors ${selected === c.phone ? 'bg-gray-700/50 border-l-2 border-l-green-500' : ''}`}>
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center flex-shrink-0">
                    <User className="w-4 h-4 text-gray-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-sm font-semibold text-white truncate">{c.name || formatPhone(c.phone)}</span>
                      <span className="text-[10px] text-gray-500 flex-shrink-0">{timeAgo(c.last_activity)}</span>
                    </div>
                    {c.name && <div className="text-xs text-gray-500 truncate">{formatPhone(c.phone)}</div>}
                    <div className="text-xs text-gray-400 truncate mt-0.5">
                      {c.last_reply ? <span className="text-green-400">↩ {c.last_reply}</span> : (c.last_sent || '')}
                    </div>
                  </div>
                  {c.reply_count > 0 && (
                    <span className="flex-shrink-0 min-w-[20px] h-5 bg-green-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                      {c.reply_count}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>

          {/* Thread view */}
          <div className={`md:col-span-3 bg-gray-800 border border-gray-700 rounded-xl flex flex-col overflow-hidden ${!selected && 'hidden md:flex'}`}>
            {!selected ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <MessageSquare className="w-10 h-10 text-gray-600 mx-auto mb-2" />
                  <p className="text-gray-500 text-sm">Select a conversation</p>
                </div>
              </div>
            ) : (
              <>
                {/* Thread header */}
                <div className="px-4 py-3 border-b border-gray-700 flex items-center gap-3">
                  <button onClick={() => setSelected(null)} className="md:hidden p-1 text-gray-400 hover:text-white">
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center">
                    <User className="w-4 h-4 text-gray-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-white">{selectedConvo?.name || formatPhone(selected)}</div>
                    {selectedConvo?.name && <div className="text-xs text-gray-500">{formatPhone(selected)}</div>}
                    {selectedConvo?.address && <div className="text-xs text-gray-500 truncate">📍 {selectedConvo.address}</div>}
                  </div>
                  <a href={`tel:${selected}`} className="flex items-center gap-1 px-3 py-1.5 bg-green-700 hover:bg-green-600 text-white text-xs font-semibold rounded-lg transition-colors">
                    <Phone className="w-3.5 h-3.5" /> Call
                  </a>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {threadLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <RefreshCw className="w-5 h-5 animate-spin text-gray-500" />
                    </div>
                  ) : merged.length === 0 ? (
                    <p className="text-gray-500 text-sm text-center py-8">No messages</p>
                  ) : merged.map((m, i) => (
                    <div key={i} className={`flex ${m.direction === 'out' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${
                        m.direction === 'out'
                          ? 'bg-green-700 text-white rounded-br-sm'
                          : 'bg-gray-700 text-gray-100 rounded-bl-sm'
                      }`}>
                        <p>{m.message}</p>
                        <p className={`text-[10px] mt-1 ${m.direction === 'out' ? 'text-green-200' : 'text-gray-500'}`}>
                          {m.direction === 'out' ? '→ Sent' : '← Reply'} · {timeAgo(m.sent_at)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Reply hint */}
                <div className="border-t border-gray-700 px-4 py-3">
                  <div className="flex items-center gap-2 bg-gray-700/50 rounded-lg px-3 py-2.5 text-xs text-gray-500">
                    <Send className="w-3.5 h-3.5 flex-shrink-0" />
                    Manual reply via Twilio console or call — direct reply from panel coming soon.
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
