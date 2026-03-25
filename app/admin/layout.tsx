'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useEffect } from 'react';
import {
  LayoutDashboard, FileText, Briefcase, Users, ShieldCheck,
  Mail, Send, Calendar, DollarSign, Camera, Star, BarChart2,
  Settings, LogOut, ExternalLink, Wrench, CloudLightning, UserPlus, MapPin, ClipboardList,
  BookOpen, TrendingUp, Building2,
  Receipt, HardHat, Car, BarChart3, ArrowLeftRight, Calculator, Package,
} from 'lucide-react';

interface NavItem  { href: string; label: string; icon: React.ElementType }
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
    label: 'Outreach',
    items: [
      { href: '/admin/storm',               label: 'Storm Dashboard',    icon: CloudLightning },
      { href: '/admin/prospects',            label: 'Storm Prospects',    icon: MapPin },
      { href: '/admin/business-outreach',    label: 'Business Outreach',  icon: Building2 },
      { href: '/admin/outreach/send',        label: 'Campaign Sender',    icon: Send },
      { href: '/admin/outreach',             label: 'Email Templates',    icon: Mail },
      { href: '/admin/reviews',              label: 'Review Requests',    icon: Star },
      { href: '/admin/scheduler',            label: 'Automation',         icon: Calendar },
    ],
  },
  {
    label: 'System',
    items: [
      { href: '/admin/line-items', label: 'Pricing / Line Items', icon: Wrench },
      { href: '/admin/docs', label: 'Product Docs', icon: BookOpen },
      { href: '/admin/document-packets', label: 'Doc Packets', icon: Package },
      { href: '/admin/settings',   label: 'Settings',             icon: Settings },
    ],
  },
];

function isActive(pathname: string, href: string) {
  if (href === '/admin/dashboard') return pathname === '/admin/dashboard' || pathname === '/admin'
  // exact match for pages that are prefixes of other nav items
  if (href === '/admin/outreach') return pathname === '/admin/outreach'
  if (href === '/admin/finance') return pathname === '/admin/finance'
  return pathname.startsWith(href)
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    fetch('/api/admin/auth/me')
      .then(r => r.json())
      .then(d => { if (!d.admin) router.push('/admin/login'); })
      .catch(() => router.push('/admin/login'));
  }, []);

  const handleLogout = async () => {
    await fetch('/api/admin/auth/logout', { method: 'POST' });
    router.push('/admin/login');
  };

  if (pathname === '/admin/login') return <>{children}</>;

  return (
    <div className="flex min-h-screen bg-gray-900">
      {/* Sidebar */}
      <aside className="w-52 bg-gray-800 flex flex-col flex-shrink-0 border-r border-gray-700 shadow-xl">

        {/* Brand */}
        <div className="px-4 py-5 border-b border-gray-700 flex flex-col">
          <img src="/images/logo.png" alt="Roof Works of Texas" className="h-9 w-auto object-contain" />
          <p className="text-gray-500 text-xs mt-2">Admin Panel</p>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 px-2 overflow-y-auto">
          {NAV_GROUPS.map(group => (
            <div key={group.label} className="mb-4">
              <p className="px-3 mb-1 text-xs font-bold text-gray-500 uppercase tracking-wider">
                {group.label}
              </p>
              {group.items.map(({ href, label, icon: Icon }) => {
                const active = isActive(pathname, href);
                return (
                  <a
                    key={href}
                    href={href}
                    className={`flex items-center gap-2.5 px-3 py-2 mb-0.5 text-sm font-medium rounded transition-all border ${
                      active
                        ? 'bg-red-700 border-red-600 text-white'
                        : 'border-transparent text-gray-300 hover:text-white hover:bg-gray-700 hover:border-gray-600'
                    }`}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    <span className="truncate">{label}</span>
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
      <main className="flex-1 overflow-auto bg-gray-900">
        {children}
      </main>
    </div>
  );
}
