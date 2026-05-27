'use client';

import Link from 'next/link';
import {
  Phone, Mail, MessageSquare, MapPin, Users, DollarSign,
  TrendingUp, Zap, CheckCircle, Clock, ArrowRight, Star,
  Megaphone, FileText, Globe, Target, BarChart2,
} from 'lucide-react';

const CHANNELS = [
  {
    name: 'AI Voice Calls',
    icon: Phone,
    color: 'text-blue-400',
    bg: 'bg-blue-900/20 border-blue-700/40',
    costPer: '$0.23 all-in',
    costDetail: '$0.12 skip trace + ~$0.10 call + $0.01 SMS follow-up',
    responseRate: '2–5% booking',
    leadCost: '$5–25',
    setup: 'Already built',
    setupColor: 'text-green-400',
    bestFor: 'High-volume proactive outreach at scale',
    status: 'live',
    href: '/admin/prospects',
  },
  {
    name: 'SMS Outreach',
    icon: MessageSquare,
    color: 'text-green-400',
    bg: 'bg-green-900/20 border-green-700/40',
    costPer: '$0.01/msg',
    costDetail: 'Sinch US outbound — $0.0083/msg logged at $0.01',
    responseRate: '8–15% reply',
    leadCost: '$1–5',
    setup: 'Already built',
    setupColor: 'text-green-400',
    bestFor: 'Follow-up after voice call; highest reply rate',
    status: 'live',
    href: '/admin/prospects',
  },
  {
    name: 'EDDM Postcards',
    icon: FileText,
    color: 'text-yellow-400',
    bg: 'bg-yellow-900/20 border-yellow-700/40',
    costPer: '$0.28–0.35/piece',
    costDetail: 'USPS postage $0.203 + printing $0.05–0.15 — no list needed',
    responseRate: '3–8% inbound call',
    leadCost: '$9–25',
    setup: 'USPS.com — 48hr turnaround',
    setupColor: 'text-yellow-400',
    bestFor: 'Covers every door in storm zip. Works in any state with no list.',
    status: 'manual',
    href: null,
  },
  {
    name: 'Door Hangers + Canvassers',
    icon: MapPin,
    color: 'text-orange-400',
    bg: 'bg-orange-900/20 border-orange-700/40',
    costPer: '$0.25–0.35/door',
    costDetail: 'Print $0.10–0.15 + labor $15/hr @ 100 doors/hr = $0.15/door',
    responseRate: '5–15% callback',
    leadCost: '$3–10',
    setup: 'Same day — use canvass radius tool',
    setupColor: 'text-green-400',
    bestFor: 'Highest ROI per dollar. Canvasser can close on the spot.',
    status: 'manual',
    href: '/admin/storm/canvass',
  },
  {
    name: 'Email',
    icon: Mail,
    color: 'text-purple-400',
    bg: 'bg-purple-900/20 border-purple-700/40',
    costPer: '~$0.00',
    costDetail: 'Hostinger SMTP — effectively free at our volume',
    responseRate: '1–3% open-to-lead',
    leadCost: '$0–2',
    setup: 'Already built',
    setupColor: 'text-green-400',
    bestFor: 'Nurture / follow-up after initial contact. Not cold acquisition.',
    status: 'live',
    href: '/admin/outreach',
  },
  {
    name: 'Facebook / Instagram Ads',
    icon: Target,
    color: 'text-blue-300',
    bg: 'bg-blue-900/10 border-blue-800/40',
    costPer: '$10–15 CPM',
    costDetail: 'Target homeowners by zip code — $200/mo reaches ~15,000 impressions',
    responseRate: '1–2% click, 5% convert',
    leadCost: '$20–35',
    setup: '$200 test budget, 1hr setup',
    setupColor: 'text-yellow-400',
    bestFor: 'Passive inbound. Brand presence in storm zips. Scales nationally.',
    status: 'future',
    href: null,
  },
  {
    name: 'Nextdoor (Organic)',
    icon: Globe,
    color: 'text-teal-400',
    bg: 'bg-teal-900/20 border-teal-700/40',
    costPer: 'Free',
    costDetail: 'Post in neighborhood groups — high trust, peer-to-peer perception',
    responseRate: '5–20% engagement',
    leadCost: '$0',
    setup: 'Immediate',
    setupColor: 'text-green-400',
    bestFor: 'Highest trust channel. Works in any neighborhood immediately after storm.',
    status: 'manual',
    href: null,
  },
  {
    name: 'Google Local Services Ads',
    icon: Star,
    color: 'text-yellow-300',
    bg: 'bg-yellow-900/10 border-yellow-800/40',
    costPer: '$50–150/verified lead',
    costDetail: 'Pay per lead — not per click. Background check required.',
    responseRate: '30–50% close (inbound)',
    leadCost: '$50–150',
    setup: '1–2 day setup + Google verification',
    setupColor: 'text-yellow-400',
    bestFor: 'Purely inbound, high intent. Best long-term CAC at volume.',
    status: 'future',
    href: null,
  },
  {
    name: 'Texas Voter File Match',
    icon: Users,
    color: 'text-pink-400',
    bg: 'bg-pink-900/20 border-pink-700/40',
    costPer: '~$0.019/record',
    costDetail: '$75 one-time statewide file ÷ ~4,000 phone matches (40% coverage)',
    responseRate: 'N/A — data source',
    leadCost: 'Reduces skip trace cost',
    setup: 'Build address matcher once',
    setupColor: 'text-yellow-400',
    bestFor: 'Pre-enrichment pass before skip trace. Pays for itself in 1 use.',
    status: 'planned',
    href: null,
  },
  {
    name: 'BatchData Skip Trace',
    icon: Zap,
    color: 'text-amber-400',
    bg: 'bg-amber-900/20 border-amber-700/40',
    costPer: '$0.12/record',
    costDetail: 'Returns phone + email + social profiles + household data per record',
    responseRate: 'N/A — data source',
    leadCost: 'Enables all other channels',
    setup: 'Already built — manual auth required',
    setupColor: 'text-green-400',
    bestFor: 'Full contact dossier: phone, email, Facebook, LinkedIn per homeowner.',
    status: 'live',
    href: '/admin/storm/operations',
  },
];

const BUDGET_TIERS = [
  {
    label: 'Start Today',
    range: '< $100',
    color: 'border-green-600/60 bg-green-900/10',
    labelColor: 'text-green-400',
    actions: [
      { text: 'Post on Nextdoor + Facebook Groups in Rowlett / Garland / Richardson for 4/27 storm', cost: 'Free', icon: Globe },
      { text: 'Print 400 door hangers → hit canvass radius zones', cost: '$30–50', icon: MapPin },
      { text: 'Skip trace top 50 prospects (score ≥ 60, hail ≥ 2") → Launch AI voice campaign', cost: '$6', icon: Phone },
    ],
    roi: 'Estimated 1–3 jobs from a $50–80 spend. One job = $5k–15k.',
  },
  {
    label: 'Week 2',
    range: '$100–500',
    color: 'border-blue-600/60 bg-blue-900/10',
    labelColor: 'text-blue-400',
    actions: [
      { text: 'EDDM postcards to all carrier routes in 75088, 75089, 75043 (Rowlett + Garland)', cost: '$300–400', icon: FileText },
      { text: 'Skip trace top 200 prospects → full AI voice + SMS sequence', cost: '$24 + calls', icon: Zap },
      { text: 'Texas voter file ($75) → free phone match for ~4,000 records', cost: '$75', icon: Users },
    ],
    roi: '5–15 inbound calls from EDDM, 3–10 jobs. ROI: 20–100x.',
  },
  {
    label: 'Cash Flow',
    range: '$500–2,000/mo',
    color: 'border-purple-600/60 bg-purple-900/10',
    labelColor: 'text-purple-400',
    actions: [
      { text: 'Facebook / Instagram zip targeting ($200/mo) — homeowner audiences in storm zips', cost: '$200', icon: Target },
      { text: 'Hire 1–2 commission canvassers (10–15% of closed job, zero upfront)', cost: '$0 upfront', icon: Users },
      { text: 'Google Local Services Ads — high-intent inbound leads', cost: '$50–150/lead', icon: Star },
      { text: 'Expand skip trace batches to 500/run across full storm zone', cost: '$60/batch', icon: Zap },
    ],
    roi: 'Target: 10–30 jobs/mo. $50k–300k/mo revenue at DFW scale.',
  },
  {
    label: 'State → National',
    range: '$2k+/mo',
    color: 'border-orange-600/60 bg-orange-900/10',
    labelColor: 'text-orange-400',
    actions: [
      { text: 'EDDM to all storm-hit zips same-day after any TX storm (USPS covers any zip)', cost: '$0.30/piece', icon: FileText },
      { text: 'Buy voter files for TX + OK + CO ($75–500 each) — millions of free records', cost: 'One-time/state', icon: Globe },
      { text: 'Auto-run voice campaigns for all new storm dates as leads generate', cost: 'Marginal', icon: Phone },
      { text: 'White-label or franchise model — license system to other contractors', cost: '$150–250/mo', icon: TrendingUp },
    ],
    roi: 'System already built for any DFW county and any US zip via EDDM + Retell.',
  },
];

const SYSTEM_STATUS = [
  { label: 'Storm Detection (MRMS + SPC)', status: 'live', desc: 'Auto-detects DFW hail same day' },
  { label: 'Lead Generation (10k+ per storm)', status: 'live', desc: 'Pulls from county property DB' },
  { label: 'Skip Trace Enrichment', status: 'live', desc: 'Manual auth — $0.12/record, BatchData' },
  { label: 'AI Voice Dialer (Retell)', status: 'live', desc: 'Storm outreach agent, voicemail detection' },
  { label: 'SMS Outreach (Sinch)', status: 'live', desc: 'Batch send + cost logging' },
  { label: 'Post-call Webhook', status: 'live', desc: 'Auto-updates status, hot lead email, Calendly SMS' },
  { label: 'Call Center (recordings + transcripts)', status: 'live', desc: '/admin/call-center' },
  { label: 'Campaign ROI Tracking', status: 'live', desc: 'Per storm: skip trace + calls + SMS costs' },
  { label: 'Canvass Radius Tool', status: 'live', desc: 'Address → radius → sorted prospect list' },
  { label: 'EDDM Carrier Route Selector', status: 'planned', desc: 'Add to canvass page — USPS free data' },
  { label: 'Texas Voter File Matcher', status: 'planned', desc: '$75 one-time — pre-enrichment pass' },
  { label: 'Facebook Zip Targeting', status: 'future', desc: 'Manual setup in Meta Ads Manager' },
  { label: 'Google Local Services Ads', status: 'future', desc: 'Manual setup — requires Google verification' },
];

const STATUS_STYLE: Record<string, string> = {
  live:    'bg-green-600/20 text-green-400 border-green-600/30',
  planned: 'bg-yellow-600/20 text-yellow-400 border-yellow-600/30',
  future:  'bg-gray-600/20 text-gray-400 border-gray-600/30',
  manual:  'bg-blue-600/20 text-blue-400 border-blue-600/30',
};

export default function PlaybookPage() {
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-10">

      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-blue-600/20 rounded-lg">
            <BarChart2 className="w-6 h-6 text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-white">Storm Outreach Playbook</h1>
            <p className="text-gray-400 text-sm">Full channel strategy — ROI, costs, and execution steps from $0 to state-wide scale.</p>
          </div>
        </div>
        <div className="mt-4 bg-blue-900/20 border border-blue-700/40 rounded-lg px-5 py-3 flex flex-wrap gap-6 text-sm">
          <div><span className="text-gray-400">Avg job value:</span> <span className="text-white font-bold">$5,000–$15,000</span></div>
          <div><span className="text-gray-400">Avg profit margin:</span> <span className="text-white font-bold">30–50%</span></div>
          <div><span className="text-gray-400">Target market:</span> <span className="text-white font-bold">DFW → All TX → Multi-state</span></div>
          <div><span className="text-gray-400">Best unit economics:</span> <span className="text-green-400 font-bold">AI Voice + EDDM combo</span></div>
        </div>
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Canvass Tool', sub: 'Radius search + prospect list', href: '/admin/storm/canvass', color: 'bg-blue-600 hover:bg-blue-500' },
            { label: 'Skip Trace', sub: 'Authorize enrichment batch', href: '/admin/storm/operations', color: 'bg-amber-600 hover:bg-amber-500' },
            { label: 'Launch Calls', sub: 'AI voice campaign', href: '/admin/prospects', color: 'bg-green-600 hover:bg-green-500' },
            { label: 'Call Center', sub: 'Recordings + transcripts', href: '/admin/call-center', color: 'bg-red-600 hover:bg-red-500' },
          ].map(({ label, sub, href, color }) => (
            <Link key={label} href={href} className={`${color} text-white rounded-lg px-4 py-3 transition-colors flex items-center justify-between group`}>
              <div>
                <div className="font-bold text-sm">{label}</div>
                <div className="text-xs opacity-80 mt-0.5">{sub}</div>
              </div>
              <ArrowRight className="w-4 h-4 opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
            </Link>
          ))}
        </div>
      </div>

      {/* Channel Matrix */}
      <div>
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Channel Comparison</h2>
        <div className="grid md:grid-cols-2 gap-3">
          {CHANNELS.map(ch => {
            const Icon = ch.icon;
            return (
              <div key={ch.name} className={`border rounded-lg p-4 ${ch.bg}`}>
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Icon className={`w-4 h-4 ${ch.color}`} />
                    <span className="text-white font-semibold text-sm">{ch.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${STATUS_STYLE[ch.status]}`}>
                      {ch.status === 'live' ? 'Live' : ch.status === 'manual' ? 'Manual' : ch.status === 'planned' ? 'Planned' : 'Future'}
                    </span>
                    {ch.href && (
                      <Link href={ch.href} className="text-xs text-blue-400 hover:text-blue-300 underline underline-offset-2">
                        Open →
                      </Link>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 mb-2 text-xs">
                  <div className="bg-black/20 rounded px-2 py-1.5">
                    <div className="text-gray-500 mb-0.5">Cost / Contact</div>
                    <div className="text-white font-mono font-bold">{ch.costPer}</div>
                  </div>
                  <div className="bg-black/20 rounded px-2 py-1.5">
                    <div className="text-gray-500 mb-0.5">Response Rate</div>
                    <div className="text-white font-bold">{ch.responseRate}</div>
                  </div>
                  <div className="bg-black/20 rounded px-2 py-1.5">
                    <div className="text-gray-500 mb-0.5">Cost / Lead</div>
                    <div className="text-green-400 font-bold">{ch.leadCost}</div>
                  </div>
                </div>
                <p className="text-xs text-gray-400 leading-relaxed">{ch.bestFor}</p>
                <p className="text-xs text-gray-600 mt-1">{ch.costDetail}</p>
                <div className="mt-2 flex items-center gap-1.5">
                  <Clock className="w-3 h-3 text-gray-500" />
                  <span className={`text-xs ${ch.setupColor}`}>{ch.setup}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Budget Tiers */}
      <div>
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Budget Execution Plan</h2>
        <div className="grid md:grid-cols-2 gap-4">
          {BUDGET_TIERS.map(tier => (
            <div key={tier.label} className={`border rounded-xl p-5 ${tier.color}`}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <span className={`text-xs font-black uppercase tracking-widest ${tier.labelColor}`}>{tier.label}</span>
                  <div className="text-white font-bold text-lg">{tier.range}</div>
                </div>
                <DollarSign className={`w-6 h-6 ${tier.labelColor} opacity-60`} />
              </div>
              <div className="space-y-2.5 mb-4">
                {tier.actions.map((a, i) => {
                  const Icon = a.icon;
                  return (
                    <div key={i} className="flex items-start gap-2.5">
                      <Icon className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
                      <div className="flex-1">
                        <span className="text-sm text-gray-200">{a.text}</span>
                        <span className="ml-2 text-xs font-mono text-gray-500">{a.cost}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="bg-black/20 rounded-lg px-3 py-2">
                <div className="flex items-center gap-1.5">
                  <TrendingUp className={`w-3.5 h-3.5 ${tier.labelColor}`} />
                  <span className="text-xs text-gray-300">{tier.roi}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* System Status */}
      <div>
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">System Build Status</h2>
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          {SYSTEM_STATUS.map((item, i) => (
            <div key={item.label} className={`flex items-center justify-between px-5 py-3 ${i < SYSTEM_STATUS.length - 1 ? 'border-b border-gray-800' : ''}`}>
              <div className="flex items-center gap-3">
                <CheckCircle className={`w-4 h-4 ${item.status === 'live' ? 'text-green-400' : 'text-gray-600'}`} />
                <div>
                  <div className="text-sm text-white">{item.label}</div>
                  <div className="text-xs text-gray-500">{item.desc}</div>
                </div>
              </div>
              <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full border shrink-0 ml-4 ${STATUS_STYLE[item.status]}`}>
                {item.status === 'live' ? '✓ Live' : item.status === 'planned' ? 'Planned' : 'Future'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Key Benchmarks */}
      <div>
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Roofing Storm Outreach Benchmarks</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'AI Voice Connect Rate', value: '20–40%', sub: 'Of dialed numbers' },
            { label: 'Interest Rate (connected)', value: '10–20%', sub: 'Expressed interest' },
            { label: 'Close Rate (appointments)', value: '30–50%', sub: 'Appointment → signed job' },
            { label: 'Overall Lead Rate', value: '1–4%', sub: 'Of skip-traced prospects' },
            { label: 'EDDM Response Rate', value: '3–8%', sub: 'Inbound call per piece' },
            { label: 'Door Hanger Callback', value: '5–12%', sub: 'Of hangers distributed' },
            { label: 'Canvasser On-Spot Close', value: '10–20%', sub: 'Of conversations' },
            { label: 'Cost Per Job (all-in)', value: '$10–50', sub: 'Skip trace + calls + mail' },
          ].map(({ label, value, sub }) => (
            <div key={label} className="bg-gray-900 border border-gray-800 rounded-lg p-3">
              <div className="text-xs text-gray-500 mb-1">{label}</div>
              <div className="text-xl font-black text-white">{value}</div>
              <div className="text-xs text-gray-500 mt-0.5">{sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Scaling Note */}
      <div className="bg-gradient-to-r from-gray-900 to-gray-800 border border-gray-700 rounded-xl p-6">
        <div className="flex items-start gap-4">
          <Megaphone className="w-6 h-6 text-blue-400 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-white font-bold mb-2">Scaling to Full Texas → Multi-State</h3>
            <p className="text-gray-300 text-sm leading-relaxed mb-3">
              The infrastructure is already state-agnostic. Storm detection runs nationally via NOAA/SPC.
              The property database just needs county appraisal data loaded for each new county — most Texas CADs publish free bulk downloads.
              EDDM works identically in any US zip code. Retell calls work in any area code. The entire outreach pipeline
              scales to new states with a county data import and a zip code change.
            </p>
            <div className="flex flex-wrap gap-3 text-xs">
              {[
                'TX: Add Parker, Wise, Rockwall, Kaufman, Johnson, Ellis counties',
                'Phase 2: Oklahoma (OKC, Tulsa storm corridors)',
                'Phase 3: Colorado (Denver, Colorado Springs hail belt)',
                'Phase 4: Midwest — Kansas, Nebraska, Missouri',
              ].map((step, i) => (
                <div key={i} className="flex items-center gap-1.5 bg-gray-800 rounded-full px-3 py-1">
                  <div className={`w-1.5 h-1.5 rounded-full ${i === 0 ? 'bg-yellow-400' : 'bg-gray-600'}`} />
                  <span className={i === 0 ? 'text-yellow-300' : 'text-gray-400'}>{step}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
