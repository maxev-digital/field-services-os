'use client';

import { useEffect, useState } from 'react';
import {
  FileText, Briefcase, Users, ShieldCheck, DollarSign,
  Star, TrendingUp, ArrowUpRight, Plus, ChevronRight, LayoutDashboard,
} from 'lucide-react';

interface DashboardMetrics {
  newLeads:              number;
  activeJobs:            number;
  pendingEstimates:      number;
  openClaims:            number;
  revenueThisMonth:      number;
  jobsCompleteThisMonth: number;
  reviewRequestsSent:    number;
  conversionRate:        number;
}

interface KpiCard {
  label:   string;
  value:   string | number;
  icon:    React.ElementType;
  accent:  string;
  iconBg:  string;
  sub:     string;
}

function StatCard({ label, value, icon: Icon, accent, iconBg, sub }: KpiCard) {
  return (
    <div className="relative bg-gray-800 border border-gray-700 rounded-2xl p-5 overflow-hidden hover:border-gray-600 transition-all group">
      <div className={`absolute top-0 left-0 right-0 h-0.5 ${accent}`} />
      <div className="flex items-start justify-between mb-4">
        <div className={`p-2.5 rounded-xl ${iconBg}`}>
          <Icon className="w-4 h-4 text-white" />
        </div>
        <ArrowUpRight className="w-3.5 h-3.5 text-gray-600 group-hover:text-gray-400 transition-colors" />
      </div>
      <div className="text-2xl font-black text-white tracking-tight">{value}</div>
      <div className="text-xs font-semibold text-gray-400 mt-1">{label}</div>
      {sub && <div className="text-xs text-gray-600 mt-0.5">{sub}</div>}
    </div>
  );
}

const QUICK_LINKS = [
  { label: 'New Lead',     href: '/admin/leads/new',  icon: Plus,        color: 'bg-red-700 hover:bg-red-600'   },
  { label: 'Estimates',    href: '/admin/estimates',   icon: FileText,    color: 'bg-gray-700 hover:bg-gray-600' },
  { label: 'Job Pipeline', href: '/admin/jobs',        icon: Briefcase,   color: 'bg-gray-700 hover:bg-gray-600' },
  { label: 'Claims',       href: '/admin/claims',      icon: ShieldCheck, color: 'bg-gray-700 hover:bg-gray-600' },
  { label: 'Send Review',  href: '/admin/reviews',     icon: Star,        color: 'bg-gray-700 hover:bg-gray-600' },
  { label: 'Pricing',      href: '/admin/line-items',  icon: TrendingUp,  color: 'bg-gray-700 hover:bg-gray-600' },
];

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  useEffect(() => {
    fetch('/api/admin/dashboard/metrics')
      .then(r => r.json())
      .then(d => { setMetrics(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const m = metrics;

  const cards: KpiCard[] = [
    { label: 'New Leads',          value: m?.newLeads ?? 0,                                  icon: TrendingUp,  accent: 'bg-blue-500',    iconBg: 'bg-blue-600',    sub: 'This month' },
    { label: 'Active Jobs',         value: m?.activeJobs ?? 0,                                icon: Briefcase,   accent: 'bg-orange-500',  iconBg: 'bg-orange-600',  sub: 'In progress' },
    { label: 'Pending Estimates',   value: m?.pendingEstimates ?? 0,                          icon: FileText,    accent: 'bg-yellow-500',  iconBg: 'bg-yellow-600',  sub: 'Awaiting approval' },
    { label: 'Open Claims',         value: m?.openClaims ?? 0,                                icon: ShieldCheck, accent: 'bg-purple-500',  iconBg: 'bg-purple-600',  sub: 'With insurer' },
    { label: 'Revenue (MTD)',       value: `$${(m?.revenueThisMonth ?? 0).toLocaleString()}`, icon: DollarSign,  accent: 'bg-emerald-500', iconBg: 'bg-emerald-600', sub: 'Jobs invoiced' },
    { label: 'Jobs Complete (MTD)', value: m?.jobsCompleteThisMonth ?? 0,                     icon: Briefcase,   accent: 'bg-teal-500',    iconBg: 'bg-teal-600',    sub: 'This month' },
    { label: 'Reviews Sent',        value: m?.reviewRequestsSent ?? 0,                        icon: Star,        accent: 'bg-pink-500',    iconBg: 'bg-pink-600',    sub: 'All time' },
    { label: 'Lead \u2192 Job Rate',     value: `${m?.conversionRate ?? 0}%`,                      icon: Users,       accent: 'bg-indigo-500',  iconBg: 'bg-indigo-600',  sub: 'Conversion' },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <div className="p-2.5 bg-red-700 rounded-xl">
          <LayoutDashboard className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-black text-white tracking-tight leading-none">Dashboard</h1>
          <p className="text-gray-500 text-xs mt-0.5">{today} &middot; Roof Works of Texas</p>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="bg-gray-800 border border-gray-700 rounded-2xl p-5 animate-pulse h-32" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {cards.map(card => <StatCard key={card.label} {...card} />)}
        </div>
      )}

      <div className="border-t border-gray-800 pt-6">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Quick Actions</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {QUICK_LINKS.map(({ label, href, icon: Icon, color }) => (
            <a key={href} href={href} className={`${color} text-white flex items-center justify-between gap-2 px-4 py-3 rounded-xl text-sm font-semibold transition-colors`}>
              <div className="flex items-center gap-2 min-w-0">
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">{label}</span>
              </div>
              <ChevronRight className="w-3.5 h-3.5 opacity-50 flex-shrink-0" />
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
