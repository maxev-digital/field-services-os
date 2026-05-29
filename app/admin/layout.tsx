'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  LayoutDashboard, FileText, Briefcase, Users, ShieldCheck,
  Mail, Send, Calendar, DollarSign, Camera, Star, BarChart2,
  Settings, LogOut, ExternalLink, Wrench, CloudLightning, UserPlus, MapPin, ClipboardList,
  BookOpen, TrendingUp, Building2, BookMarked,
  Receipt, HardHat, Car, BarChart3, ArrowLeftRight, Calculator, Package,
  Menu, X, Phone, Target, Zap, Satellite, Database, Bell, MessageSquare, Layers,
} from 'lucide-react';
import AIChatWidget from './components/AIChatWidget';
import NotificationBell from './components/NotificationBell';

interface NavItem  { href: string; label: string; icon: React.ElementType; step?: string }
interface NavGroup { label: string; items: NavItem[] }

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { href: '/admin/dashboard',   label: 'Dashboard',    icon: LayoutDashboard },
      { href: '/admin/analytics',   label: 'Analytics',    icon: BarChart2 },
      { href: '/admin/revenue',     label: 'Revenue',      icon: DollarSign },
      { href: '/admin/accounting',  label: 'Job P&L',      icon: TrendingUp },
    ],
  },
  {
    label: 'Operations',
    items: [
      { href: '/admin/jobs',             label: 'Job Pipeline',    icon: Briefcase },
      { href: '/admin/estimates',        label: 'Estimates',       icon: FileText },
      { href: '/admin/manual-invoices',  label: 'Manual Invoices', icon: BookOpen },
      { href: '/admin/claims',           label: 'Claims',          icon: ShieldCheck },
      { href: '/admin/inspections',      label: 'Inspections',     icon: ClipboardList },
      { href: '/admin/photos',           label: 'Photos',          icon: Camera },
    ],
  },
  {
    label: 'Finance',
    items: [
      { href: '/admin/expenses',        label: 'Expenses',        icon: Receipt },
      { href: '/admin/subcontractors',  label: 'Subcontractors',  icon: HardHat },
      { href: '/admin/mileage',         label: 'Mileage Log',     icon: Car },
      { href: '/admin/finance',         label: 'P&L Report',      icon: BarChart3 },
      { href: '/admin/cashflow',        label: 'Cash Flow',       icon: ArrowLeftRight },
      { href: '/admin/tax',             label: 'Tax Prep',        icon: Calculator },
      { href: '/admin/finance/bank',    label: 'Bank Connect',    icon: Building2 },
      { href: '/admin/campaign-costs',  label: 'Campaign ROI',    icon: Target },
    ],
  },
  {
    label: 'Leads & CRM',
    items: [
      { href: '/admin/leads',     label: 'Leads',     icon: UserPlus },
      { href: '/admin/customers', label: 'Customers', icon: Users },
    ],
  },
  {
    label: 'Communications',
    items: [
      { href: '/admin/call-center',    label: 'Call Center',    icon: Phone },
      { href: '/admin/sms',           label: 'SMS Inbox',      icon: MessageSquare },
      { href: '/admin/notifications', label: 'Notifications',  icon: Bell },
    ],
  },
  {
    label: 'Storm — Automated',
    items: [
      { href: '/admin/storm/operations', label: 'Pipeline Ops',     icon: Zap,            step: 'Step 0 — Control' },
      { href: '/admin/storm',            label: 'Storm Dashboard',  icon: CloudLightning, step: 'Step 1 — Monitor' },
      { href: '/admin/outreach/zones',   label: 'Storm Zones',      icon: Target,         step: 'Step 2 — Zone Map' },
      { href: '/admin/prospects',        label: 'Storm Prospects',  icon: MapPin,         step: 'Step 3 — Lead List' },
      { href: '/admin/storm/campaigns',  label: 'Campaign Manager', icon: Send,           step: 'Step 4 — Launch' },
      { href: '/admin/storm/roi',        label: 'Storm ROI',        icon: BarChart2,      step: 'Step 5 — Track ROI' },
    ],
  },
  {
    label: 'Storm — Manual',
    items: [
      { href: '/admin/storm/dfw-data',  label: 'DFW Property DB',  icon: Database,       step: 'Step 1 — Pull Data' },
      { href: '/admin/outreach/parcels-map', label: 'Property Pin Map',  icon: Layers,         step: 'Step 2 — Target' },
      { href: '/admin/storm/target',    label: 'Storm Targeting',  icon: Target,         step: 'Step 2 — Target' },
      { href: '/admin/storm/canvass',   label: 'Canvass Tool',     icon: MapPin,         step: 'Step 3 — Field Canvas' },
      { href: '/admin/storm/campaigns', label: 'Campaign Manager', icon: Send,           step: 'Step 4 — Launch' },
      { href: '/admin/storm/roi',       label: 'Storm ROI',        icon: BarChart2,      step: 'Step 5 — Track ROI' },
    ],
  },
  {
    label: 'Outreach',
    items: [
      { href: '/admin/storm/playbook',    label: 'Outreach Playbook',  icon: BookMarked },
      { href: '/admin/storm/pro-forma',   label: 'Lead Gen Pro Forma', icon: TrendingUp },
      { href: '/admin/quick-estimate',    label: 'Quick Estimate',     icon: Zap },
      { href: '/admin/storm/ev-batch',    label: 'EagleView Batch',    icon: Satellite },
      { href: '/admin/rwcr',              label: 'RWCR HQ Dashboard',  icon: Building2 },
      { href: '/admin/business-outreach', label: 'Business Outreach',  icon: Building2 },
      { href: '/admin/outreach/send',     label: 'Campaign Sender',    icon: Send },
      { href: '/admin/outreach',          label: 'Email Templates',    icon: Mail },
      { href: '/admin/reviews',           label: 'Review Requests',    icon: Star },
      { href: '/admin/scheduler',         label: 'Automation',         icon: Calendar },
    ],
  },
  {
    label: 'System',
    items: [
      { href: '/admin/line-items', label: 'Pricing / Line Items', icon: Wrench },
      { href: '/admin/guide', label: 'Platform Guide', icon: BookMarked },
      { href: '/admin/docs', label: 'Product Docs', icon: BookOpen },
      { href: '/admin/document-packets', label: 'Doc Packets', icon: Package },
      { href: '/admin/settings',   label: 'Settings',             icon: Settings },
    ],
  },
];

function isActive(pathname: string, href: string) {
  if (href === '/admin/dashboard') return pathname === '/admin/dashboard' || pathname === '/admin'
  if (href === '/admin/outreach') return pathname === '/admin/outreach'
  if (href === '/admin/finance') return pathname === '/admin/finance'
  return pathname.startsWith(href)
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    fetch('/api/admin/auth/me')
      .then(r => r.json())
      .then(d => { if (!d.admin) router.push('/admin/login'); })
      .catch(() => router.push('/admin/login'));
  }, []);

  // Close sidebar on navigation
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  const handleLogout = async () => {
    await fetch('/api/admin/auth/logout', { method: 'POST' });
    router.push('/admin/login');
  };

  if (pathname === '/admin/login') return <>{children}</>;

  return (
    <div className="flex min-h-screen bg-gray-900">
      {/* Mobile header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-gray-800 border-b border-gray-700 flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1.5 rounded-lg bg-gray-700 text-gray-300 hover:text-white hover:bg-gray-600 transition-colors"
          >
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <img src="/images/logo.png" alt="Roof Works" className="h-7 w-auto object-contain" />
        </div>
        <div className="flex items-center gap-2">
          <NotificationBell />
          <a href="/admin/dashboard" className="p-1.5 text-gray-400 hover:text-white">
            <LayoutDashboard className="w-5 h-5" />
          </a>
          <button onClick={handleLogout} className="p-1.5 text-gray-400 hover:text-red-400">
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Overlay */}
      {sidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/60"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-50
        w-60 lg:w-52 bg-gray-800 flex flex-col flex-shrink-0 border-r border-gray-700 shadow-xl
        transform transition-transform duration-200 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>

        {/* Brand */}
        <div className="px-4 py-5 border-b border-gray-700 flex flex-col">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <img src="/images/logo.png" alt="Roof Works of Texas" className="h-9 w-auto object-contain" />
              <div className="hidden lg:block">
                <NotificationBell />
              </div>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden p-1 text-gray-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <p className="text-gray-500 text-xs mt-2">Admin Panel</p>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 px-2 overflow-y-auto">
          {NAV_GROUPS.map(group => (
            <div key={group.label} className="mb-4">
              <p className="px-3 mb-1 text-xs font-bold text-gray-500 uppercase tracking-wider">
                {group.label}
              </p>
              {group.items.map(({ href, label, icon: Icon, step }) => {
                const active = isActive(pathname, href);
                return (
                  <a
                    key={`${group.label}-${href}`}
                    href={href}
                    className={`flex items-center gap-2.5 px-3 py-1.5 mb-0.5 text-sm font-medium rounded transition-all border ${
                      active
                        ? 'bg-red-700 border-red-600 text-white'
                        : 'border-transparent text-gray-300 hover:text-white hover:bg-gray-700 hover:border-gray-600'
                    }`}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span className="flex flex-col min-w-0">
                      <span className="truncate leading-tight">{label}</span>
                      {step && (
                        <span className={`text-[10px] leading-tight truncate ${active ? 'text-red-200' : 'text-gray-500'}`}>
                          {step}
                        </span>
                      )}
                    </span>
                  </a>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="p-3 border-t border-gray-700 space-y-0.5">
          <a
            href="https://roofworksoftexas.com"
            target="_blank"
            className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            View Site
          </a>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-gray-400 hover:text-red-400 hover:bg-gray-700 rounded transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto bg-gray-900 pt-14 lg:pt-0">
        {children}
      </main>

      {/* AI Assistant */}
      <AIChatWidget />
    </div>
  );
}
