'use client';
import React from 'react';

// ─── Sub-components (defined before main export) ─────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
      <div className="px-5 py-3 bg-gray-900 border-b border-gray-700">
        <h2 className="text-sm font-bold text-red-400">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function ChannelSection({ num, title, subtitle, highlight, best, children }: {
  num: number; title: string; subtitle: string;
  highlight?: boolean; best?: boolean; children: React.ReactNode;
}) {
  return (
    <div className={`rounded-xl border overflow-hidden ${best ? 'border-red-700' : highlight ? 'border-blue-800' : 'border-gray-700'}`}>
      <div className={`px-5 py-3 flex items-center gap-3 ${best ? 'bg-red-900' : highlight ? 'bg-[#1a2e4a]' : 'bg-gray-800'}`}>
        <span className="flex items-center justify-center w-7 h-7 rounded-full bg-white/20 text-white text-xs font-bold shrink-0">{num}</span>
        <div>
          <h2 className="text-sm font-bold text-white">{title}</h2>
          <p className="text-xs text-blue-300">{subtitle}</p>
        </div>
        {best && <span className="ml-auto text-xs font-bold bg-white text-red-900 px-2 py-0.5 rounded-full">Top Pick</span>}
      </div>
      <div className="p-5 bg-gray-800">{children}</div>
    </div>
  );
}

function DTable({ heads, rows, boldLast, roiRow }: {
  heads: string[]; rows: string[][];
  boldLast?: boolean; roiRow?: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-gray-900">
            {heads.map(h => (
              <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-blue-300 border-b border-gray-700">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const isLast = i === rows.length - 1;
            const isRoi = roiRow && isLast;
            return (
              <tr key={i} className={isLast && boldLast ? 'bg-gray-700 font-semibold' : i % 2 === 0 ? 'bg-gray-800' : 'bg-gray-750'}>
                {row.map((cell, j) => (
                  <td key={j} className={`px-3 py-2 border-b border-gray-700 text-sm ${isRoi && j > 0 ? 'text-red-400 font-bold' : 'text-gray-300'}`}>
                    {cell}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ProsCons({ pros, cons }: { pros: string; cons: string }) {
  return (
    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
      <div className="p-3 bg-green-950 border border-green-800 rounded-lg">
        <p className="text-xs font-bold text-green-400 mb-1">Pros</p>
        <p className="text-xs text-green-300">{pros}</p>
      </div>
      <div className="p-3 bg-red-950 border border-red-800 rounded-lg">
        <p className="text-xs font-bold text-red-400 mb-1">Cons</p>
        <p className="text-xs text-red-300">{cons}</p>
      </div>
    </div>
  );
}

function BestFor({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3 p-3 bg-blue-950 border border-blue-800 rounded-lg">
      <p className="text-xs font-bold text-blue-400 mb-1">Best For</p>
      <p className="text-xs text-blue-300">{children}</p>
    </div>
  );
}

function TierBlock({ tier, color, subtitle, children }: {
  tier: string; color: 'green' | 'blue' | 'gray'; subtitle: string; children: React.ReactNode;
}) {
  const colors = {
    green: { border: 'border-green-800', badge: 'bg-green-900 text-green-300 border border-green-700' },
    blue:  { border: 'border-blue-800',  badge: 'bg-blue-900 text-blue-300 border border-blue-700' },
    gray:  { border: 'border-gray-600',  badge: 'bg-gray-700 text-gray-300 border border-gray-600' },
  }[color];
  return (
    <div className={`rounded-lg border ${colors.border} overflow-hidden`}>
      <div className="px-4 py-2 bg-gray-900 flex items-center gap-3">
        <span className={`text-xs font-bold px-2 py-0.5 rounded ${colors.badge}`}>{tier}</span>
        <span className="text-xs text-gray-400">{subtitle}</span>
      </div>
      <div className="p-4 space-y-3">{children}</div>
    </div>
  );
}

function ToolCard({ name, badge, children }: { name: string; badge?: string; children: React.ReactNode }) {
  return (
    <div className="p-3 bg-gray-900 rounded-lg border border-gray-700">
      <div className="flex items-center gap-2 mb-2">
        <h4 className="text-sm font-semibold text-white">{name}</h4>
        {badge && <span className="text-xs bg-red-900 text-red-300 border border-red-700 px-2 py-0.5 rounded-full">{badge}</span>}
      </div>
      {children}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function StormProFormaPage() {
  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6 text-gray-300">

      {/* Header */}
      <div className="border-b border-gray-700 pb-4">
        <h1 className="text-2xl font-bold text-white">Storm Lead Generation — Pro Forma & AI Outreach Comparison</h1>
        <p className="text-sm text-gray-400 mt-1">Roof Works of Texas &nbsp;·&nbsp; Updated March 2026</p>
      </div>

      {/* Business Assumptions */}
      <Section title="Business Assumptions">
        <DTable
          heads={['Metric', 'Value', 'Source']}
          rows={[
            ['Average job revenue', '$18,000', 'Industry avg (insurance replacement)'],
            ['Gross margin', '33%', 'Industry standard 25–35%'],
            ['Gross profit per job', '$6,000', '32.5–35% of job revenue'],
            ['Net margin', '11%', 'Industry standard 8–14%'],
            ['Net profit per job', '$2,000', 'After overhead & SGA'],
            ['Target close rate — post-storm leads', '15–30%', 'Storm leads convert 2–3× warm leads'],
            ['Target close rate — cold outreach', '2–5%', 'Industry benchmark'],
            ['CAD parcels (Dallas County)', '634,402', 'DCAD ingest, 96% geocoded'],
            ['Avg DFW storm affected properties', '500–2,500', 'Based on March 4 2026 event'],
          ]}
        />
      </Section>

      {/* Channel 1 */}
      <ChannelSection num={1} title="Door Knocking" subtitle="Baseline">
        <p className="text-sm text-gray-300 mb-4"><strong className="text-white">How it works:</strong> Sales rep drives to storm-affected neighborhood, walks door to door.</p>
        <DTable
          heads={['Metric', 'Value']}
          rows={[
            ['Rep cost (fully loaded)', '$25–35/hr'],
            ['Doors knocked per hour', '20–30'],
            ['Contact rate (someone home)', '40–50% → 10–15 contacts/hr'],
            ['Appointment set rate', '10–15% of contacts'],
            ['Appointments per hour', '1–2'],
            ['Close rate on appointment', '30–40%'],
            ['Jobs per 8-hr day', '2–6'],
            ['Revenue per day', '$36,000–$108,000'],
            ['Cost per job (labor only)', '$40–$140'],
            ['Effective CAC', '$40–$140'],
          ]}
          boldLast
        />
        <ProsCons
          pros="Highest trust, immediate qualification, rep can assess damage on-site"
          cons="Weather-dependent, physically exhausting, geographic limits, rep morale, can't scale without headcount, takes 2–3 days post-storm to mobilize"
        />
      </ChannelSection>

      {/* Channel 2 */}
      <ChannelSection num={2} title="Cold Email" subtitle="AI-Assisted" highlight>
        <p className="text-sm text-gray-300 mb-4"><strong className="text-white">How it works:</strong> Export enriched parcel list → skip trace for email → send branded sequence via Hostinger SMTP. Already built in admin panel.</p>
        <h4 className="text-xs font-semibold text-amber-400 uppercase tracking-wide mb-2">Cost Breakdown (per storm event, 300 Tier A+B prospects)</h4>
        <DTable
          heads={['Item', 'Cost']}
          rows={[
            ['Skip tracing (BatchSkipTracing, $0.15/record)', '$45.00'],
            ['Email sending (Hostinger SMTP, included)', '$0.00'],
            ['AI personalization (Claude Haiku, ~$0.001/email)', '$0.30'],
            ['Rep time to review + send (30 min)', '$12.50'],
            ['Total per campaign', '$57.80'],
          ]}
          boldLast
        />
        <h4 className="text-xs font-semibold text-amber-400 uppercase tracking-wide mt-4 mb-2">Performance Model</h4>
        <DTable
          heads={['Metric', 'Conservative', 'Realistic', 'Optimistic']}
          rows={[
            ['Records enriched (Tier A+B)', '300', '300', '300'],
            ['Email delivery rate', '85%', '88%', '92%'],
            ['Open rate', '25%', '35%', '45%'],
            ['Reply / click rate', '3%', '6%', '10%'],
            ['Appointment set rate', '1.5%', '3%', '5%'],
            ['Appointments', '4–5', '9', '15'],
            ['Close rate', '20%', '25%', '30%'],
            ['Jobs closed', '1', '2–3', '4–5'],
            ['Revenue', '$18,000', '$36,000–$54,000', '$72,000–$90,000'],
            ['Gross Profit (33%)', '$6,000', '$12,000–$18,000', '$24,000–$30,000'],
            ['Net Profit / EBITDA (11%)', '$2,000', '$4,000–$6,000', '$8,000–$10,000'],
            ['CAC (cost / jobs)', '$57.80', '$19–$29', '$12–$14'],
            ['ROI', '311×', '623–934×', '1,246–1,557×'],
          ]}
          boldLast
          roiRow
        />
        <ProsCons
          pros="Fully automated after setup, scalable, permanent record in CRM, personalizable with AI"
          cons="Email goes to spam for unknown senders, needs 3–5 touch sequence, slower feedback loop, requires valid email (skip trace)"
        />
        <BestFor>Initial outreach blast within 24–48 hrs of storm, follow-up sequence over 7–14 days</BestFor>
      </ChannelSection>

      {/* Channel 3 */}
      <ChannelSection num={3} title="SMS" subtitle="AI-Assisted via Twilio" highlight best>
        <p className="text-sm text-gray-300 mb-4"><strong className="text-white">How it works:</strong> Same enriched list → send storm inspection text → AI-assisted reply qualification. Built in admin panel (pending Twilio activation).</p>
        <h4 className="text-xs font-semibold text-amber-400 uppercase tracking-wide mb-2">Cost Breakdown (per storm event, 300 prospects)</h4>
        <DTable
          heads={['Item', 'Cost']}
          rows={[
            ['Skip tracing — same list as email, no extra cost', '$0.00'],
            ['Twilio SMS ($0.0083/message outbound)', '$2.49'],
            ['AI reply handling (Claude Haiku, ~$0.002/exchange)', '$1.20'],
            ['Rep time to close warm replies (1 hr)', '$25.00'],
            ['Total per campaign', '$28.69'],
          ]}
          boldLast
        />
        <h4 className="text-xs font-semibold text-amber-400 uppercase tracking-wide mt-4 mb-2">Performance Model</h4>
        <DTable
          heads={['Metric', 'Conservative', 'Realistic', 'Optimistic']}
          rows={[
            ['SMS delivery rate', '90%', '93%', '97%'],
            ['Open rate', '90%', '95%', '98%'],
            ['Response rate', '8%', '15%', '22%'],
            ['Appointment rate from responses', '20%', '30%', '40%'],
            ['Appointments', '4–5', '13–14', '26'],
            ['Close rate', '20%', '25%', '30%'],
            ['Jobs closed', '1', '3–4', '8'],
            ['Revenue', '$18,000', '$54,000–$72,000', '$144,000'],
            ['Gross Profit (33%)', '$6,000', '$18,000–$24,000', '$48,000'],
            ['Net Profit / EBITDA (11%)', '$2,000', '$6,000–$8,000', '$16,000'],
            ['CAC', '$28.69', '$7–$10', '$3.59'],
            ['ROI', '628×', '1,882–2,510×', '5,019×'],
          ]}
          boldLast
          roiRow
        />
        <ProsCons
          pros="98% open rate, immediate, conversational, feels personal, fastest response loop"
          cons="Opt-out/spam compliance (10DLC registration required), phone numbers harder to obtain than emails, can feel intrusive if messaging is poor"
        />
        <BestFor>Same-day follow-up after email, re-engagement of non-openers, time-sensitive &quot;we&apos;re in your neighborhood this week&quot; pushes</BestFor>
        <div className="mt-3 p-3 bg-amber-950 border border-amber-800 rounded text-xs text-amber-300">
          <strong className="text-amber-200">10DLC Note:</strong> Twilio requires A2P 10DLC brand registration (~$4/mo) for business SMS. One-time campaign registration ~$10. Required to avoid carrier filtering.
        </div>
      </ChannelSection>

      {/* Channel 4 */}
      <ChannelSection num={4} title="AI Voice Calling" subtitle="Outbound AI Agent" highlight best>
        <p className="text-sm text-gray-300 mb-4"><strong className="text-white">How it works:</strong> AI agent (Bland.ai or Retell AI) calls the prospect, introduces as &quot;calling on behalf of Roof Works of Texas,&quot; qualifies damage, books free inspection if interested. No human needed until appointment confirmed.</p>
        <h4 className="text-xs font-semibold text-amber-400 uppercase tracking-wide mb-2">Cost Breakdown (per storm event, 300 prospects)</h4>
        <DTable
          heads={['Item', 'Bland.ai', 'Retell AI']}
          rows={[
            ['Per-minute rate', '$0.09/min', '$0.07/min'],
            ['Avg call duration (qualified + voicemail)', '2.5 min avg', '2.5 min avg'],
            ['Cost per call attempt', '$0.225', '$0.175'],
            ['300 calls', '$67.50', '$52.50'],
            ['Phone number rental', '$15.00/mo', '$2.00/mo'],
            ['Skip tracing (same list, no extra cost)', '$0', '$0'],
            ['Total per campaign', '$82.50', '$54.50'],
          ]}
          boldLast
        />
        <h4 className="text-xs font-semibold text-amber-400 uppercase tracking-wide mt-4 mb-2">Performance Model (shared)</h4>
        <DTable
          heads={['Metric', 'Conservative', 'Realistic', 'Optimistic']}
          rows={[
            ['Connect rate (live answer)', '20%', '30%', '40%'],
            ['Qualified (interested in inspection)', '15% of connects', '25%', '35%'],
            ['Appointments booked by AI', '60% of qualified', '70%', '80%'],
            ['Appointments', '5–6', '15–16', '33'],
            ['Close rate', '25%', '30%', '35%'],
            ['Jobs closed', '1–2', '4–5', '11–12'],
            ['Revenue', '$18,000–$36,000', '$72,000–$90,000', '$198,000–$216,000'],
            ['Gross Profit (33%)', '$6,000–$12,000', '$24,000–$30,000', '$66,000–$72,000'],
            ['Net Profit / EBITDA (11%)', '$2,000–$4,000', '$8,000–$10,000', '$22,000–$24,000'],
            ['CAC (Retell)', '$27–$54', '$11–$14', '$4.55–$4.95'],
            ['ROI (Retell)', '330–661×', '1,321–1,651×', '3,633–3,963×'],
          ]}
          boldLast
          roiRow
        />
        <ProsCons
          pros="Scales infinitely, calls within minutes of storm, no human fatigue, consistent pitch every time, works nights/weekends, books directly into calendar"
          cons="Some prospects hang up on AI calls, requires well-tuned script, AI can mishandle unusual objections, setup takes 1–2 days"
        />
        <BestFor>First contact blast within 4–6 hours of a major storm event while reps are still mobilizing</BestFor>
      </ChannelSection>

      {/* Channel 5 */}
      <ChannelSection num={5} title="Human Telemarketing" subtitle="Comparison Baseline">
        <DTable
          heads={['Metric', 'Value']}
          rows={[
            ['Caller cost', '$18–$25/hr'],
            ['Dials per hour', '30–40'],
            ['Connect rate', '15–25% → 5–10 connects/hr'],
            ['Appointment rate', '10–15% of connects'],
            ['Appointments per hour', '0.5–1.5'],
            ['Close rate', '20–25%'],
            ['Jobs per 8-hr shift', '1–3'],
            ['Cost per job (labor only)', '$60–$200'],
            ['Effective CAC', '$60–$200'],
          ]}
          boldLast
        />
        <ProsCons
          pros="Human judgment, can handle complex objections, builds rapport"
          cons="Most expensive at scale, turnover, inconsistent quality, limited hours, compliance burden"
        />
      </ChannelSection>

      {/* Channel 6 */}
      <ChannelSection num={6} title="Direct Mail" subtitle="Reference">
        <DTable
          heads={['Metric', 'Value']}
          rows={[
            ['Cost per piece (design + print + postage)', '$0.80–$1.50'],
            ['500 pieces', '$400–$750'],
            ['Response rate', '1–2%'],
            ['Appointments from 500 pieces', '5–10'],
            ['Close rate', '20–25%'],
            ['Jobs', '1–2'],
            ['CAC', '$200–$750'],
            ['ROI', '20–75×'],
          ]}
          boldLast
        />
        <p className="text-xs text-gray-500 mt-3 italic">Slow (5–10 day delivery), can&apos;t time to storm event, no personalization at scale</p>
      </ChannelSection>

      {/* ROI Summary */}
      <Section title="ROI Summary — Head-to-Head">
        <p className="text-sm text-gray-400 mb-3">300 prospects, realistic scenario</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-900">
                {['Channel', 'Cost', 'Jobs', 'Revenue', 'Gross Profit (33%)', 'Net / EBITDA (11%)', 'ROI', 'Speed'].map(h => (
                  <th key={h} className="px-3 py-2 text-left font-semibold text-xs text-blue-300 border-b border-gray-700">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                { label: 'Door Knocking',         cost: '$200 (1 day)', jobs: '3–5',  rev: '$54K–$90K',       profit: '$18K–$30K',  net: '$6K–$10K',   roi: '90–150×',       time: '1–3 days post-storm', highlight: false, best: false },
                { label: 'Cold Email ★',           cost: '$58',          jobs: '2–3',  rev: '$36K–$54K',       profit: '$12K–$18K',  net: '$4K–$6K',    roi: '623–934×',      time: '< 2 hrs',             highlight: true,  best: false },
                { label: 'SMS ★★',                 cost: '$29',          jobs: '3–4',  rev: '$54K–$72K',       profit: '$18K–$24K',  net: '$6K–$8K',    roi: '1,882–2,510×',  time: '< 1 hr',              highlight: true,  best: true  },
                { label: 'AI Calling — Retell ★★', cost: '$55',          jobs: '4–5',  rev: '$72K–$90K',       profit: '$24K–$30K',  net: '$8K–$10K',   roi: '1,321–1,651×',  time: '< 30 min',            highlight: true,  best: true  },
                { label: 'Human Telemarketing',    cost: '$800 (1 day)', jobs: '2–3',  rev: '$36K–$54K',       profit: '$12K–$18K',  net: '$4K–$6K',    roi: '45–67×',        time: 'Same day',            highlight: false, best: false },
                { label: 'Direct Mail',            cost: '$500',         jobs: '1–2',  rev: '$18K–$36K',       profit: '$6K–$12K',   net: '$2K–$4K',    roi: '12–24×',        time: '5–10 days',           highlight: false, best: false },
              ].map((row, i) => (
                <tr key={i} className={row.best ? 'bg-red-950' : row.highlight ? 'bg-[#1a2e4a]/40' : i % 2 === 0 ? 'bg-gray-800' : 'bg-gray-750'}>
                  <td className="px-3 py-2 border-b border-gray-700 text-gray-200">{row.label}</td>
                  <td className="px-3 py-2 border-b border-gray-700 text-gray-300">{row.cost}</td>
                  <td className="px-3 py-2 border-b border-gray-700 text-gray-300">{row.jobs}</td>
                  <td className="px-3 py-2 border-b border-gray-700 text-gray-300">{row.rev}</td>
                  <td className="px-3 py-2 border-b border-gray-700 text-green-400 font-semibold">{row.profit}</td>
                  <td className="px-3 py-2 border-b border-gray-700 text-blue-400 font-semibold">{row.net}</td>
                  <td className={`px-3 py-2 border-b border-gray-700 font-bold ${row.best ? 'text-red-400' : row.highlight ? 'text-red-400' : 'text-gray-300'}`}>{row.roi}</td>
                  <td className="px-3 py-2 border-b border-gray-700 text-gray-400">{row.time}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          <div className="p-3 bg-red-950 rounded border border-red-800">
            <span className="font-semibold text-red-300">Winner by ROI:</span>
            <p className="text-red-400 mt-1 text-xs">SMS &gt; AI Calling &gt; Email &gt;&gt; Telemarketing &gt; Door Knock &gt; Direct Mail</p>
          </div>
          <div className="p-3 bg-blue-950 rounded border border-blue-800">
            <span className="font-semibold text-blue-300">Winner by Speed:</span>
            <p className="text-blue-400 mt-1 text-xs">AI Calling &gt; SMS &gt; Email &gt; Door Knock &gt; Telemarketing &gt; Direct Mail</p>
          </div>
          <div className="p-3 bg-green-950 rounded border border-green-800">
            <span className="font-semibold text-green-300">Winner by Lead Quality:</span>
            <p className="text-green-400 mt-1 text-xs">Door Knock ≈ AI Calling &gt; SMS &gt; Email &gt; Direct Mail</p>
          </div>
        </div>
      </Section>

      {/* Storm Day Protocol */}
      <Section title="Recommended Stack — Storm Day Protocol">
        <p className="text-sm text-gray-300 mb-4">A storm hits DFW. Optimal sequence:</p>
        <div className="bg-gray-900 rounded-lg p-5 font-mono text-sm text-green-400 overflow-x-auto leading-relaxed border border-gray-700">
          <p><span className="text-yellow-400">T+0 hrs</span>{'   '}Storm-alert cron detects DFW hail event → sends push notification</p>
          <p><span className="text-yellow-400">T+1 hr</span>{'    '}Generate Leads in admin panel → 300 Tier A+B prospects scored + tiered</p>
          <p><span className="text-yellow-400">T+2 hrs</span>{'   '}AI Calling (Retell/Bland) → 300 automated outbound calls begin</p>
          <p className="pl-10 text-gray-500">&quot;Hi, this is Alex calling for Roof Works of Texas. We noticed your</p>
          <p className="pl-10 text-gray-500">neighborhood in [city] had significant hail today and we&apos;re offering</p>
          <p className="pl-10 text-gray-500">free roof inspections. Can I book a quick 20-minute visit?&quot;</p>
          <p><span className="text-yellow-400">T+2 hrs</span>{'   '}SMS blast → 300 texts sent simultaneously (non-call-hours backup)</p>
          <p><span className="text-yellow-400">T+4 hrs</span>{'   '}Email sequence starts → personalized branded email to all 300</p>
          <p className="pl-10 text-gray-500">(reinforces AI call, catches those who missed the call)</p>
          <p><span className="text-yellow-400">T+48 hrs</span>{'  '}Follow-up SMS + email to non-responders (automated, 2-touch)</p>
          <p><span className="text-yellow-400">T+7 days</span>{'  '}Final follow-up email → &quot;Last chance — free inspection offer expires&quot;</p>
          <p className="mt-3 text-white font-bold">Reps: Only handle calls from AI-qualified leads who said YES. Zero cold dialing.</p>
        </div>
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Total Spend',        value: '~$150',          sub: 'per storm event' },
            { label: 'Booked Inspections', value: '12–18',          sub: 'expected output' },
            { label: 'Closed Jobs',        value: '3–6',            sub: 'expected output' },
            { label: 'Gross Profit',       value: '$18,000–$36,000', sub: 'from one event'  },
          ].map(s => (
            <div key={s.label} className="bg-gray-900 border border-gray-700 rounded-lg p-3 text-center">
              <div className="text-xl font-bold text-red-400">{s.value}</div>
              <div className="text-xs font-semibold text-gray-300 mt-1">{s.label}</div>
              <div className="text-xs text-gray-500">{s.sub}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* AI Tools */}
      <Section title="AI Tools for Admin Panel Integration">
        <div className="space-y-4">
          <TierBlock tier="Tier 1 — Integrate Now" color="green" subtitle="Low Complexity, Immediate ROI">
            <ToolCard name="Retell AI — Outbound Voice Agent" badge="Recommended">
              <ul className="text-sm text-gray-400 space-y-1 mt-2">
                <li><strong className="text-gray-200">Cost:</strong> $0.07/min, $2/mo per number</li>
                <li><strong className="text-gray-200">Integration:</strong> REST API + webhook → post-call webhook fires to <code className="bg-gray-700 px-1 rounded text-xs text-green-400">/api/admin/prospects/[id]</code> to update status to CONTACTED or INTERESTED</li>
                <li><strong className="text-gray-200">What to build:</strong> <code className="bg-gray-700 px-1 rounded text-xs text-green-400">/api/admin/outreach/voice-campaign</code> route that accepts <code className="bg-gray-700 px-1 rounded text-xs text-green-400">prospect_ids[]</code>, dispatches batch calls, receives webhook</li>
                <li><strong className="text-gray-200">Timeline:</strong> 1–2 days to build + test</li>
              </ul>
            </ToolCard>
            <ToolCard name="Twilio 10DLC Registration — Enable SMS at Scale">
              <ul className="text-sm text-gray-400 space-y-1 mt-2">
                <li><strong className="text-gray-200">Cost:</strong> ~$4/mo brand fee + $10 campaign registration (one-time)</li>
                <li><strong className="text-gray-200">Already coded:</strong> <code className="bg-gray-700 px-1 rounded text-xs text-green-400">lib/sms.ts</code> + <code className="bg-gray-700 px-1 rounded text-xs text-green-400">TWILIO_FROM_NUMBER</code> env var — just needs credentials</li>
                <li><strong className="text-gray-200">Timeline:</strong> Hours once Twilio funded + 10DLC approved (1–3 business days)</li>
              </ul>
            </ToolCard>
          </TierBlock>

          <TierBlock tier="Tier 2 — Short Term" color="blue" subtitle="Medium Complexity, High Leverage">
            <ToolCard name="BatchData API — Automated Property Enrichment">
              <ul className="text-sm text-gray-400 space-y-1 mt-2">
                <li><strong className="text-gray-200">Cost:</strong> $500/mo for 20,000 records ($0.025/record)</li>
                <li><strong className="text-gray-200">What it adds:</strong> Phone + email + storm damage history + equity + roof permit history</li>
                <li><strong className="text-gray-200">Integration:</strong> Webhook on generate-leads completion → auto-enrich top Tier A prospects</li>
                <li><strong className="text-gray-200">Replaces:</strong> Manual BatchSkipTracing CSV upload workflow</li>
                <li><strong className="text-gray-200">ROI breakeven:</strong> 1 job/month covers the subscription</li>
              </ul>
            </ToolCard>
            <ToolCard name="Bland.ai — Alternative/Backup Voice">
              <ul className="text-sm text-gray-400 space-y-1 mt-2">
                <li><strong className="text-gray-200">Cost:</strong> $0.09/min</li>
                <li><strong className="text-gray-200">Advantage over Retell:</strong> No-code setup, Zapier/Make integration, simpler for first deployment</li>
                <li><strong className="text-gray-200">Use case:</strong> Faster to test; switch to Retell at volume</li>
              </ul>
            </ToolCard>
          </TierBlock>

          <TierBlock tier="Tier 3 — Future" color="gray" subtitle="Strategic, Requires Planning">
            <ToolCard name="Clay.com — Hyper-Personalization at Scale">
              <ul className="text-sm text-gray-400 space-y-1 mt-2">
                <li><strong className="text-gray-200">Cost:</strong> $185–$495/mo</li>
                <li><strong className="text-gray-200">Use case:</strong> Pull LinkedIn + social data on property owners for ultra-personalized outreach at volume</li>
                <li><strong className="text-gray-200">Verdict:</strong> Overkill until running 1,000+ prospects/storm</li>
              </ul>
            </ToolCard>
            <ToolCard name="Twilio ConversationRelay — Two-Way AI SMS">
              <ul className="text-sm text-gray-400 space-y-1 mt-2">
                <li><strong className="text-gray-200">Cost:</strong> $0.05/message + SMS cost</li>
                <li><strong className="text-gray-200">What it does:</strong> AI reads inbound SMS replies and responds intelligently — converts SMS from broadcast to conversation</li>
                <li><strong className="text-gray-200">Build complexity:</strong> 4/5 — webhook handler + LLM prompt engineering</li>
                <li><strong className="text-gray-200">Timeline:</strong> 3–5 days</li>
              </ul>
            </ToolCard>
          </TierBlock>

          <div className="p-4 bg-red-950 border border-red-800 rounded-lg">
            <h4 className="text-sm font-bold text-red-300 mb-2">Tools to Avoid</h4>
            <ul className="text-sm text-red-400 space-y-1">
              <li><strong className="text-red-300">Air.ai:</strong> FTC lawsuit filed August 2025, platform inactive — do not use</li>
              <li><strong className="text-red-300">Apollo.io for homeowners:</strong> B2B database, poor coverage for residential</li>
              <li><strong className="text-red-300">Attentive / Klaviyo:</strong> Built for ecommerce, $8K+ annual minimums, wrong market</li>
              <li><strong className="text-red-300">Vapi.ai:</strong> Costs stack with hidden provider fees at scale — Retell is cheaper</li>
            </ul>
          </div>
        </div>
      </Section>

      {/* CAC Comparison */}
      <Section title="CAC Comparison — Full Picture">
        <p className="text-sm text-gray-400 mb-4">Cost per Qualified Lead (realistic scenario)</p>
        <div className="space-y-2">
          {[
            { label: 'Door Knocking',   range: '$40–$140',  pct: 95, color: 'bg-gray-500' },
            { label: 'Direct Mail',     range: '$25–$75',   pct: 75, color: 'bg-gray-500' },
            { label: 'Telemarketing',   range: '$15–$40',   pct: 55, color: 'bg-gray-500' },
            { label: 'Google Ads',      range: '$25–$188',  pct: 80, color: 'bg-gray-500' },
            { label: 'Shared Leads',    range: '$100–$200', pct: 88, color: 'bg-gray-500' },
            { label: 'Cold Email',      range: '$6–$29',    pct: 22, color: 'bg-blue-500' },
            { label: 'AI Calling',      range: '$4–$27',    pct: 16, color: 'bg-red-600'  },
            { label: 'SMS',             range: '$2–$10',    pct: 9,  color: 'bg-red-700'  },
            { label: 'Skip Trace Only', range: '$0.15',     pct: 2,  color: 'bg-green-600'},
          ].map(row => (
            <div key={row.label} className="flex items-center gap-3">
              <div className="w-36 text-xs text-gray-400 text-right shrink-0">{row.label}</div>
              <div className="flex-1 bg-gray-700 rounded h-5 overflow-hidden">
                <div className={`h-full ${row.color} rounded`} style={{ width: `${row.pct}%` }} />
              </div>
              <div className="w-24 text-xs font-semibold text-gray-300">{row.range}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* Property Value */}
      <Section title="Property Value Recovery — Why DCAD Appraisal Values Matter">
        <div className="p-4 bg-amber-950 border border-amber-800 rounded-lg text-sm text-amber-300">
          <p className="mb-2"><strong className="text-amber-200">Current state:</strong> <code className="bg-amber-900 px-1 rounded text-xs">total_value = $0</code> for all 634,402 parcels (appraisal file not yet loaded). Scoring model uses <strong>sqft as proxy</strong> — adequate but not optimal.</p>
          <p className="mb-2"><strong className="text-amber-200">To fix:</strong> Download <code className="bg-amber-900 px-1 rounded text-xs">ACCOUNT_APPRL_YEAR.CSV</code> from DCAD (separate from RES_DETAIL.CSV). Re-run ingest with: <code className="bg-amber-900 px-1 rounded text-xs">python dcad_ingest.py --skip-geocoding --values-only</code></p>
          <p><strong className="text-amber-200">Impact:</strong> Unlocks proper value-tier scoring — estimated 15–20% improvement in Tier A lead quality.</p>
        </div>
      </Section>

      {/* 5-Year Projection */}
      <Section title="Five-Year Revenue Projection (Storm Lead Gen Only)">
        <p className="text-sm text-gray-400 mb-3">Assumptions: 4 DFW storms/year, 300 Tier A+B prospects per storm, SMS + AI voice stack</p>
        <DTable
          heads={['Year', 'Storms', 'Prospects', 'Jobs (3% close)', 'Revenue', 'Lead Gen Cost']}
          rows={[
            ['2026 (partial)', '2', '600',    '18', '$270,000',   '$300'],
            ['2027',           '4', '1,200',  '36', '$540,000',   '$600'],
            ['2028',           '4', '1,500*', '45', '$675,000',   '$750'],
            ['2029',           '4', '2,000*', '60', '$900,000',   '$1,000'],
            ['2030',           '4', '2,500*', '75', '$1,125,000', '$1,250'],
          ]}
        />
        <p className="text-xs text-gray-500 mt-2">*Growth from adding Tarrant, Collin, Denton CAD data</p>
        <div className="mt-4 grid grid-cols-2 gap-4">
          <div className="p-4 bg-gray-900 border border-gray-700 rounded-lg text-center">
            <div className="text-2xl font-bold text-white">$3,510,000</div>
            <div className="text-sm text-gray-400 mt-1">5-Year Cumulative Revenue</div>
          </div>
          <div className="p-4 bg-red-900 border border-red-700 rounded-lg text-center">
            <div className="text-2xl font-bold text-white">900×</div>
            <div className="text-sm text-red-300 mt-1">Total ROI on $3,900 in lead gen costs</div>
          </div>
        </div>
      </Section>

      <p className="text-xs text-gray-600 italic border-t border-gray-700 pt-4">Pro forma prepared for Roof Works of Texas internal planning. All projections based on industry benchmarks and modeled assumptions. Actual results will vary based on storm frequency, market conditions, and execution quality.</p>
    </div>
  );
}
