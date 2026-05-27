'use client';

import { useEffect, useState, useMemo } from 'react';
import {
  Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed,
  Play, ChevronDown, ChevronUp, Clock, Users, BarChart2,
  PhoneCall, PhoneOff, Search, Loader2, Settings, ToggleLeft,
  ToggleRight, CheckCircle2, XCircle, Info,
} from 'lucide-react';

/* ---------- types ---------- */
interface Call {
  call_id: string;
  agent_name: string;
  call_status: string;
  duration_seconds: number;
  from_number: string;
  to_number: string;
  recording_url: string | null;
  transcript: string;
  call_summary: string | null;
  user_sentiment: string | null;
  direction: 'inbound' | 'outbound';
  created_at: string | null;
  end_time: string | null;
  disconnect_reason: string | null;
  call_analysis: any;
}

interface CallDetail extends Call {
  transcript_object: Array<{
    role: string;
    content: string;
    words?: Array<{ word: string; start: number; end: number }>;
  }>;
  metadata: any;
}

interface Stats {
  totalCalls: number;
  totalDuration: number;
  avgDuration: number;
  inboundCount: number;
  outboundCount: number;
  connectedCount: number;
  notConnectedCount: number;
}

/* ---------- helpers ---------- */
function fmtDuration(sec: number) {
  if (!sec || sec <= 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function fmtPhone(num: string) {
  if (!num) return 'Unknown';
  const digits = num.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return num;
}

function fmtDateTime(iso: string | null) {
  if (!iso) return 'N/A';
  return new Date(iso).toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function fmtDateTimeFull(iso: string | null) {
  if (!iso) return 'N/A';
  return new Date(iso).toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}

function sentimentColor(s: string | null) {
  if (!s) return '';
  const l = s.toLowerCase();
  if (l === 'positive') return 'bg-green-600/20 text-green-400 border-green-600/30';
  if (l === 'negative') return 'bg-red-600/20 text-red-400 border-red-600/30';
  return 'bg-gray-600/20 text-gray-400 border-gray-600/30';
}

function statusBadge(status: string) {
  const s = status.toLowerCase();
  if (s === 'ended' || s === 'registered') return { label: 'Connected', cls: 'bg-green-600/20 text-green-400 border-green-600/30' };
  if (s === 'ongoing' || s === 'in_progress') return { label: 'In Progress', cls: 'bg-yellow-600/20 text-yellow-400 border-yellow-600/30' };
  return { label: 'Not Connected', cls: 'bg-red-600/20 text-red-400 border-red-600/30' };
}

/* ---------- Skeleton ---------- */
function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-gray-700 rounded ${className}`} />;
}


/* ---------- Inbound Call Configuration ---------- */
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface InboundSettings {
  ownerMobile:        string;
  businessHoursStart: number;
  businessHoursEnd:   number;
  businessDays:       number[];
  afterHoursMessage:  string;
  transferMessage:    string;
  enabled:            boolean;
}

function InboundConfig() {
  const [settings, setSettings] = useState<InboundSettings | null>(null);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [err, setErr]           = useState('');
  const [open, setOpen]         = useState(false);

  useEffect(() => {
    fetch('/api/admin/settings/inbound')
      .then(r => r.json())
      .then(d => setSettings(d))
      .catch(() => {});
  }, []);

  async function save() {
    if (!settings) return;
    setSaving(true); setErr(''); setSaved(false);
    try {
      const res = await fetch('/api/admin/settings/inbound', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error('Save failed');
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e: any) { setErr(e.message); }
    finally { setSaving(false); }
  }

  function toggleDay(d: number) {
    if (!settings) return;
    const days = settings.businessDays.includes(d)
      ? settings.businessDays.filter(x => x !== d)
      : [...settings.businessDays, d].sort();
    setSettings({ ...settings, businessDays: days });
  }

  const HOUR_OPTS = Array.from({ length: 24 }, (_, i) => {
    const label = i === 0 ? '12:00 AM' : i < 12 ? `${i}:00 AM` : i === 12 ? '12:00 PM' : `${i - 12}:00 PM`;
    return { value: i, label };
  });

  const setupSteps = [
    {
      done: !!settings?.ownerMobile,
      label: 'Set your mobile number below',
      detail: 'Transfer calls will ring this number',
    },
    {
      done: false,
      label: 'Create a Retell inbound agent in your dashboard',
      detail: 'Go to retell.ai → Agents → New Agent → type: Phone',
    },
    {
      done: false,
      label: 'Paste the receptionist system prompt into the agent',
      detail: 'See "Agent Prompt" section below',
    },
    {
      done: false,
      label: 'Add a transfer tool to the agent',
      detail: 'Tool type: Custom Function | URL: https://admin.roofworksoftexas.com/api/admin/webhooks/retell-transfer',
    },
    {
      done: false,
      label: 'Buy/port a Retell phone number and assign it to the agent',
      detail: 'Retell → Phone Numbers → Buy Number',
    },
    {
      done: false,
      label: 'Forward (214) 795-3905 to the Retell number',
      detail: 'Log in to your phone carrier and set unconditional call forwarding',
    },
  ];

  const AGENT_PROMPT = `You are Alex, the professional phone receptionist for Roof Works of Texas — a licensed roofing contractor serving the DFW metroplex.

CORE BEHAVIOR:
- Answer warmly: "Thank you for calling Roof Works of Texas, this is Alex. How can I help you today?"
- You are screening for legitimate roofing inquiries before transferring to the owner.

SPAM / ROBOCALL DETECTION — hang up immediately if:
- There is silence for more than 3 seconds after you answer
- The caller is a pre-recorded message or clearly automated
- The caller is selling something or asking for "the business owner" about unrelated services
- The caller asks for a person by a generic title with no name

QUALIFY BEFORE TRANSFER — ask if not already mentioned:
1. "What's your name?"
2. "What's the address of the property?"
3. "What kind of roofing concern do you have?" (repair / inspection / storm damage / full replacement)

TRANSFER — after qualifying a real roofing customer, say:
"Great [name], let me get you connected with our team right now." Then call the transfer tool.

DO NOT transfer for: sales calls, wrong number, unrelated services, or anyone who won't give a name and property address.

AFTER HOURS — if the transfer tool returns an after-hours error, say the after-hours message and offer to take a callback number.`;

  if (!settings) {
    return (
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 animate-pulse">
        <div className="h-5 w-48 bg-gray-700 rounded" />
      </div>
    );
  }

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-700/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-blue-600/20 rounded-lg">
            <PhoneIncoming className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h2 className="text-white font-semibold text-sm">Inbound Call System</h2>
            <p className="text-gray-400 text-xs mt-0.5">AI receptionist → spam filter → transfer to you</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${
            settings.enabled
              ? 'bg-green-600/20 text-green-400 border-green-600/30'
              : 'bg-gray-600/20 text-gray-400 border-gray-600/30'
          }`}>
            {settings.enabled ? 'Enabled' : 'Disabled'}
          </span>
          {open ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
        </div>
      </button>

      {open && (
        <div className="border-t border-gray-700 p-5 space-y-6">

          {/* Setup Checklist */}
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Setup Checklist</h3>
            <div className="space-y-2">
              {setupSteps.map((step, i) => (
                <div key={i} className="flex items-start gap-3">
                  {step.done
                    ? <CheckCircle2 className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
                    : <XCircle className="w-4 h-4 text-gray-600 mt-0.5 shrink-0" />}
                  <div>
                    <p className={`text-sm ${step.done ? 'text-green-300 line-through' : 'text-gray-300'}`}>{step.label}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{step.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Call Flow Diagram */}
          <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-4">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Call Flow</h3>
            <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
              {[
                { label: '(214) 795-3905', color: 'bg-gray-700 text-gray-300' },
                { label: '→', color: '' },
                { label: 'Forward to Retell #', color: 'bg-blue-900/40 text-blue-300 border border-blue-700/40' },
                { label: '→', color: '' },
                { label: 'Alex (AI)', color: 'bg-purple-900/40 text-purple-300 border border-purple-700/40' },
                { label: '→', color: '' },
                { label: 'Spam? Hang up', color: 'bg-red-900/40 text-red-300 border border-red-700/40' },
                { label: '|', color: 'text-gray-600' },
                { label: 'Qualified? Transfer', color: 'bg-green-900/40 text-green-300 border border-green-700/40' },
                { label: '→', color: '' },
                { label: settings.ownerMobile || 'Your Mobile', color: 'bg-yellow-900/40 text-yellow-300 border border-yellow-700/40' },
              ].map((node, i) => node.color
                ? <span key={i} className={`px-2 py-1 rounded ${node.color}`}>{node.label}</span>
                : <span key={i} className="text-gray-500 font-bold">{node.label}</span>
              )}
            </div>
          </div>

          {/* Settings Form */}
          <div className="space-y-4">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Settings</h3>

            {/* Enable toggle */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-200 font-medium">Transfer Enabled</p>
                <p className="text-xs text-gray-500">When off, calls will not be transferred</p>
              </div>
              <button
                onClick={() => setSettings({ ...settings, enabled: !settings.enabled })}
                className="text-2xl"
              >
                {settings.enabled
                  ? <ToggleRight className="w-8 h-8 text-green-400" />
                  : <ToggleLeft className="w-8 h-8 text-gray-500" />}
              </button>
            </div>

            {/* Owner mobile */}
            <div>
              <label className="block text-sm text-gray-300 font-medium mb-1">Your Mobile Number</label>
              <p className="text-xs text-gray-500 mb-2">Qualified callers will be warm-transferred here</p>
              <input
                type="tel"
                value={settings.ownerMobile}
                onChange={e => setSettings({ ...settings, ownerMobile: e.target.value })}
                placeholder="(214) 555-0100"
                className="w-full max-w-xs bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* Business hours */}
            <div>
              <label className="block text-sm text-gray-300 font-medium mb-2">Business Hours (CST)</label>
              <div className="flex items-center gap-3">
                <select
                  value={settings.businessHoursStart}
                  onChange={e => setSettings({ ...settings, businessHoursStart: Number(e.target.value) })}
                  className="bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-white text-sm focus:outline-none focus:border-blue-500"
                >
                  {HOUR_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <span className="text-gray-500 text-sm">to</span>
                <select
                  value={settings.businessHoursEnd}
                  onChange={e => setSettings({ ...settings, businessHoursEnd: Number(e.target.value) })}
                  className="bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-white text-sm focus:outline-none focus:border-blue-500"
                >
                  {HOUR_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>

            {/* Business days */}
            <div>
              <label className="block text-sm text-gray-300 font-medium mb-2">Business Days</label>
              <div className="flex gap-1.5">
                {DAY_NAMES.map((name, i) => (
                  <button
                    key={i}
                    onClick={() => toggleDay(i)}
                    className={`w-10 h-10 rounded-lg text-xs font-semibold transition-colors ${
                      settings.businessDays.includes(i)
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                    }`}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>

            {/* Transfer message */}
            <div>
              <label className="block text-sm text-gray-300 font-medium mb-1">Transfer Message</label>
              <p className="text-xs text-gray-500 mb-2">Alex reads this aloud before connecting</p>
              <textarea
                value={settings.transferMessage}
                onChange={e => setSettings({ ...settings, transferMessage: e.target.value })}
                rows={2}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none"
              />
            </div>

            {/* After hours message */}
            <div>
              <label className="block text-sm text-gray-300 font-medium mb-1">After-Hours Message</label>
              <p className="text-xs text-gray-500 mb-2">Alex says this when called outside business hours</p>
              <textarea
                value={settings.afterHoursMessage}
                onChange={e => setSettings({ ...settings, afterHoursMessage: e.target.value })}
                rows={3}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none"
              />
            </div>

            {/* Save */}
            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={save}
                disabled={saving}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {saving ? 'Saving...' : 'Save Settings'}
              </button>
              {saved && <span className="text-green-400 text-sm flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> Saved</span>}
              {err && <span className="text-red-400 text-sm">{err}</span>}
            </div>
          </div>

          {/* Agent Prompt */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Receptionist Agent Prompt</h3>
              <span className="text-xs text-gray-500">— copy into Retell agent System Prompt</span>
            </div>
            <div className="relative">
              <pre className="bg-gray-900 border border-gray-700 rounded-lg p-4 text-xs text-gray-300 whitespace-pre-wrap font-mono leading-relaxed max-h-72 overflow-y-auto">
{AGENT_PROMPT}
              </pre>
              <button
                onClick={() => navigator.clipboard.writeText(AGENT_PROMPT)}
                className="absolute top-2 right-2 px-2 py-1 bg-gray-700 hover:bg-gray-600 text-xs text-gray-300 rounded transition-colors"
              >
                Copy
              </button>
            </div>
          </div>

          {/* Transfer webhook info */}
          <div className="bg-blue-900/20 border border-blue-700/30 rounded-lg p-4">
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm text-blue-300 font-medium mb-1">Transfer Webhook URL</p>
                <p className="text-xs text-gray-400 mb-2">Add this as a Custom Function tool in your Retell agent:</p>
                <code className="text-xs text-blue-200 font-mono bg-blue-900/40 px-2 py-1 rounded block break-all">
                  https://admin.roofworksoftexas.com/api/admin/webhooks/retell-transfer
                </code>
                <p className="text-xs text-gray-500 mt-2">The agent calls this when it decides to transfer. The webhook checks business hours and returns your mobile number. You get an email + Telegram alert before your phone rings.</p>
              </div>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}

/* ---------- Main Component ---------- */
export default function CallCenterPage() {
  const [calls, setCalls] = useState<Call[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [direction, setDirection] = useState<'all' | 'inbound' | 'outbound'>('all');
  const [status, setStatus] = useState<'all' | 'ended' | 'not_connected'>('all');
  const [search, setSearch] = useState('');

  // Expanded row
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [callDetail, setCallDetail] = useState<CallDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Fetch calls
  useEffect(() => {
    fetchCalls();
  }, [direction, status]);

  async function fetchCalls() {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ limit: '100', direction, status });
      const res = await fetch(`/api/admin/call-center?${params}`);
      if (!res.ok) throw new Error('Failed to fetch calls');
      const data = await res.json();
      setCalls(data.calls || []);
      setStats(data.stats || null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  // Fetch call detail
  async function fetchDetail(callId: string) {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/admin/call-center/${callId}`);
      if (!res.ok) throw new Error('Failed to fetch call detail');
      const data = await res.json();
      setCallDetail(data);
    } catch (e: any) {
      console.error(e);
    } finally {
      setDetailLoading(false);
    }
  }

  function toggleExpand(callId: string) {
    if (expandedId === callId) {
      setExpandedId(null);
      setCallDetail(null);
    } else {
      setExpandedId(callId);
      fetchDetail(callId);
    }
  }

  // Client-side search filter
  const filtered = useMemo(() => {
    if (!search.trim()) return calls;
    const q = search.toLowerCase();
    return calls.filter(c =>
      c.from_number?.toLowerCase().includes(q) ||
      c.to_number?.toLowerCase().includes(q) ||
      c.transcript?.toLowerCase().includes(q) ||
      c.call_summary?.toLowerCase().includes(q) ||
      c.agent_name?.toLowerCase().includes(q)
    );
  }, [calls, search]);

  const connectedRate = stats && stats.totalCalls > 0
    ? Math.round((stats.connectedCount / stats.totalCalls) * 100)
    : 0;

  return (
    <div className="p-4 lg:p-8 space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <div className="p-2 bg-red-600/20 rounded-lg">
            <Phone className="w-6 h-6 text-red-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Call Center</h1>
            <p className="text-gray-400 text-sm">AI Call Recordings &amp; Transcripts</p>
          </div>
        </div>
      </div>

      {/* Inbound Call Config */}
      <InboundConfig />

      {/* Stats Cards */}
      {loading && !stats ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : stats ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard icon={PhoneCall} label="Total Calls" value={stats.totalCalls} />
          <StatCard icon={Clock} label="Total Minutes" value={Math.round(stats.totalDuration / 60)} />
          <StatCard icon={BarChart2} label="Avg Duration" value={fmtDuration(stats.avgDuration)} />
          <StatCard icon={PhoneIncoming} label="Inbound" value={stats.inboundCount} color="text-blue-400" />
          <StatCard icon={PhoneOutgoing} label="Outbound" value={stats.outboundCount} color="text-orange-400" />
          <StatCard icon={Users} label="Connected" value={`${connectedRate}%`} color="text-green-400" />
        </div>
      ) : null}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Direction Toggle */}
        <div className="flex bg-gray-800 rounded-lg border border-gray-700 p-0.5">
          {(['all', 'inbound', 'outbound'] as const).map(d => (
            <button
              key={d}
              onClick={() => setDirection(d)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors capitalize ${
                direction === d
                  ? 'bg-red-600 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {d}
            </button>
          ))}
        </div>

        {/* Status Toggle */}
        <div className="flex bg-gray-800 rounded-lg border border-gray-700 p-0.5">
          {([
            { value: 'all', label: 'All' },
            { value: 'ended', label: 'Connected' },
            { value: 'not_connected', label: 'Not Connected' },
          ] as const).map(s => (
            <button
              key={s.value}
              onClick={() => setStatus(s.value)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                status === s.value
                  ? 'bg-red-600 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Search phone, transcript..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-red-500 transition-colors"
          />
        </div>

        {/* Refresh */}
        <button
          onClick={fetchCalls}
          disabled={loading}
          className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-300 hover:text-white hover:border-gray-600 transition-colors disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Refresh'}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg p-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Call List */}
      {loading && calls.length === 0 ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-12 text-center">
          <PhoneOff className="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400 text-lg font-medium">No calls found</p>
          <p className="text-gray-500 text-sm mt-1">
            {search ? 'Try a different search term' : 'Calls will appear here when Retell processes them'}
          </p>
        </div>
      ) : (
        <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
          {/* Table Header */}
          <div className="hidden md:grid grid-cols-[40px_1fr_1.2fr_0.8fr_80px_100px_100px_80px] gap-3 px-4 py-3 border-b border-gray-700 text-xs font-semibold text-gray-500 uppercase tracking-wider">
            <div></div>
            <div>Date / Time</div>
            <div>From / To</div>
            <div>Agent</div>
            <div>Duration</div>
            <div>Status</div>
            <div>Sentiment</div>
            <div></div>
          </div>

          {/* Rows */}
          {filtered.map(call => {
            const expanded = expandedId === call.call_id;
            const badge = statusBadge(call.call_status);
            const isInbound = call.direction === 'inbound';
            const DirIcon = isInbound ? PhoneIncoming : PhoneOutgoing;

            return (
              <div key={call.call_id}>
                {/* Row */}
                <div
                  onClick={() => toggleExpand(call.call_id)}
                  className={`grid grid-cols-1 md:grid-cols-[40px_1fr_1.2fr_0.8fr_80px_100px_100px_80px] gap-3 px-4 py-3 cursor-pointer transition-colors border-b border-gray-700/50 ${
                    expanded ? 'bg-gray-750 bg-gray-700/30' : 'hover:bg-gray-700/20'
                  }`}
                >
                  {/* Direction icon */}
                  <div className="flex items-center">
                    <DirIcon className={`w-4 h-4 ${isInbound ? 'text-blue-400' : 'text-orange-400'}`} />
                  </div>

                  {/* Date */}
                  <div className="flex items-center text-sm text-gray-300">
                    {fmtDateTime(call.created_at)}
                  </div>

                  {/* From / To */}
                  <div className="flex items-center text-sm">
                    <span className={isInbound ? 'text-white font-medium' : 'text-gray-400'}>
                      {fmtPhone(call.from_number)}
                    </span>
                    <span className="text-gray-600 mx-1.5">&rarr;</span>
                    <span className={!isInbound ? 'text-white font-medium' : 'text-gray-400'}>
                      {fmtPhone(call.to_number)}
                    </span>
                  </div>

                  {/* Agent */}
                  <div className="flex items-center text-sm text-gray-400 truncate">
                    {call.agent_name}
                  </div>

                  {/* Duration */}
                  <div className="flex items-center text-sm text-gray-300 font-mono">
                    {fmtDuration(call.duration_seconds)}
                  </div>

                  {/* Status */}
                  <div className="flex items-center">
                    <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${badge.cls}`}>
                      {badge.label}
                    </span>
                  </div>

                  {/* Sentiment */}
                  <div className="flex items-center">
                    {call.user_sentiment ? (
                      <span className={`px-2 py-0.5 text-xs font-medium rounded-full border capitalize ${sentimentColor(call.user_sentiment)}`}>
                        {call.user_sentiment}
                      </span>
                    ) : (
                      <span className="text-gray-600 text-xs">--</span>
                    )}
                  </div>

                  {/* Expand */}
                  <div className="flex items-center justify-end">
                    {expanded ? (
                      <ChevronUp className="w-4 h-4 text-gray-500" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-gray-500" />
                    )}
                  </div>
                </div>

                {/* Expanded Detail */}
                {expanded && (
                  <div className="bg-gray-900/50 border-b border-gray-700 px-4 py-5">
                    {detailLoading ? (
                      <div className="space-y-3">
                        <Skeleton className="h-6 w-64" />
                        <Skeleton className="h-12 w-full" />
                        <Skeleton className="h-40 w-full" />
                      </div>
                    ) : callDetail ? (
                      <CallDetailPanel call={callDetail} />
                    ) : (
                      <p className="text-gray-500 text-sm">Failed to load call detail.</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Count */}
      {!loading && filtered.length > 0 && (
        <p className="text-gray-500 text-sm text-center">
          Showing {filtered.length} call{filtered.length !== 1 ? 's' : ''}
        </p>
      )}
    </div>
  );
}

/* ---------- Stat Card ---------- */
function StatCard({
  icon: Icon,
  label,
  value,
  color = 'text-white',
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  color?: string;
}) {
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`w-4 h-4 ${color === 'text-white' ? 'text-red-500' : color}`} />
        <span className="text-xs text-gray-500 font-medium">{label}</span>
      </div>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

/* ---------- Call Detail Panel ---------- */
function CallDetailPanel({ call }: { call: CallDetail }) {
  return (
    <div className="space-y-5 max-w-4xl">
      {/* Summary */}
      {call.call_summary && (
        <div>
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">AI Summary</h3>
          <p className="text-gray-300 text-sm leading-relaxed bg-gray-800 rounded-lg p-3 border border-gray-700">
            {call.call_summary}
          </p>
        </div>
      )}

      {/* Audio Player */}
      {call.recording_url && (
        <div>
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">Recording</h3>
          <audio
            controls
            preload="metadata"
            className="w-full rounded-lg"
            style={{ filter: 'invert(1) hue-rotate(180deg)', maxHeight: '54px' }}
          >
            <source src={call.recording_url} type="audio/wav" />
            Your browser does not support the audio element.
          </audio>
          <a
            href={call.recording_url}
            download={`call-${call.call_id}.wav`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 mt-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
            Download Recording
          </a>
        </div>
      )}

      {/* Transcript */}
      {call.transcript_object && call.transcript_object.length > 0 ? (
        <div>
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">Transcript</h3>
          <div className="space-y-2 max-h-96 overflow-y-auto pr-2">
            {call.transcript_object.map((msg, i) => {
              const isAgent = msg.role === 'agent';
              return (
                <div key={i} className={`flex ${isAgent ? 'justify-start' : 'justify-end'}`}>
                  <div
                    className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${
                      isAgent
                        ? 'bg-gray-700 text-gray-200 rounded-bl-sm'
                        : 'bg-red-600/30 text-gray-200 border border-red-600/40 rounded-br-sm'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`text-xs font-semibold ${isAgent ? 'text-gray-400' : 'text-red-400'}`}>
                        {isAgent ? 'Agent' : 'Caller'}
                      </span>
                      {msg.words && msg.words.length > 0 && (
                        <span className="text-xs text-gray-600">
                          {Math.floor(msg.words[0].start / 60)}:{Math.floor(msg.words[0].start % 60).toString().padStart(2, '0')}
                        </span>
                      )}
                    </div>
                    <p className="leading-relaxed">{msg.content}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : call.transcript ? (
        <div>
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">Transcript</h3>
          <pre className="text-gray-300 text-sm bg-gray-800 rounded-lg p-3 border border-gray-700 whitespace-pre-wrap max-h-96 overflow-y-auto">
            {call.transcript}
          </pre>
        </div>
      ) : null}

      {/* Metadata */}
      <div>
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">Call Details</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <MetaItem label="Call ID" value={call.call_id.slice(0, 12) + '...'} />
          <MetaItem label="Start Time" value={fmtDateTimeFull(call.created_at)} />
          <MetaItem label="End Time" value={fmtDateTimeFull(call.end_time)} />
          <MetaItem label="Duration" value={fmtDuration(call.duration_seconds)} />
          <MetaItem label="Direction" value={call.direction} />
          <MetaItem label="Status" value={call.call_status} />
          <MetaItem label="Disconnect" value={call.disconnect_reason || 'N/A'} />
          <MetaItem label="Sentiment" value={call.user_sentiment || 'N/A'} />
        </div>
      </div>
    </div>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-800 rounded-lg p-2 border border-gray-700">
      <p className="text-xs text-gray-500 mb-0.5">{label}</p>
      <p className="text-gray-300 capitalize truncate">{value}</p>
    </div>
  );
}
