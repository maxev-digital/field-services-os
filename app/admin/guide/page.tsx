'use client';

import { useState } from 'react';
import {
  BookOpen, LayoutDashboard, BarChart2, DollarSign, TrendingUp,
  Briefcase, FileText, ShieldCheck, ClipboardList, Camera,
  Receipt, HardHat, Car, BarChart3, ArrowLeftRight, Calculator, Building2, Target,
  UserPlus, Users, Phone,
  CloudLightning, MapPin, Zap, Satellite, Database, Send, Mail, Star, Calendar,
  Wrench, Package, Settings, CheckCircle, AlertCircle, Lightbulb, ChevronDown, ChevronRight,
} from 'lucide-react';

interface PageDoc {
  label: string;
  href: string;
  icon: React.ElementType;
  what: string;
  how: string;
  sources: string[];
  pipeline?: string;
  missing: string[];
}

interface Section {
  group: string;
  color: string;
  pages: PageDoc[];
}

const SECTIONS: Section[] = [
  {
    group: 'Overview',
    color: 'blue',
    pages: [
      {
        label: 'Dashboard',
        href: '/admin/dashboard',
        icon: LayoutDashboard,
        what: 'Command center showing real-time KPIs: open jobs, revenue (MRR/YTD), recent activity, and outstanding estimates.',
        how: 'Aggregates data from jobs, estimates, customers, and storm_prospects tables. Refreshes on load.',
        sources: ['jobs', 'estimates', 'customers', 'storm_prospects'],
        missing: ['Push notification for new leads', 'Daily revenue goal tracker', 'Weather alert widget on dashboard'],
      },
      {
        label: 'Analytics',
        href: '/admin/analytics',
        icon: BarChart2,
        what: 'Traffic and conversion analytics pulling from Google Analytics 4 and internal lead sources.',
        how: 'GA4 Data API integration. Charts show sessions, conversions, lead sources, and geographic distribution.',
        sources: ['Google Analytics 4 API', 'leads table'],
        missing: ['Funnel visualization (visit → lead → estimate → job)', 'SEO keyword rank tracking', 'Ad spend vs conversion correlation'],
      },
      {
        label: 'Revenue',
        href: '/admin/revenue',
        icon: DollarSign,
        what: 'Revenue tracking across three time windows: MRR (monthly recurring), YTD (year-to-date), and All Time. Includes YouTube AdSense.',
        how: 'Pulls paid invoices from jobs table plus manual revenue entries. YouTube revenue entered manually.',
        sources: ['jobs table (paid invoices)', 'manual_revenue table', 'YouTube AdSense (manual)'],
        missing: ['Stripe/payment processor direct integration', 'Revenue forecasting from open estimates', 'YoY comparison charts'],
      },
      {
        label: 'Job P&L',
        href: '/admin/accounting',
        icon: TrendingUp,
        what: 'Per-job profit and loss: gross revenue minus material, labor, sub, and overhead costs.',
        how: 'Joins jobs with expenses table filtered by job_id. Calculates margin % per job.',
        sources: ['jobs', 'expenses', 'subcontractors'],
        missing: ['Overhead allocation (vehicle, insurance, office) per job', 'Material cost tracking from supplier invoices', 'Job cost vs estimate variance'],
      },
    ],
  },
  {
    group: 'Operations',
    color: 'orange',
    pages: [
      {
        label: 'Job Pipeline',
        href: '/admin/jobs',
        icon: Briefcase,
        what: 'Full lifecycle job management: Prospect → Estimate → Approved → In Progress → Complete → Paid. Each job has photos, notes, line items, and claim tracking.',
        how: 'Kanban-style pipeline with drag-and-drop status updates. Each job links to customer, estimate, claim, and invoice.',
        sources: ['jobs', 'customers', 'estimates', 'claims', 'expenses'],
        pipeline: 'Core record that estimates, inspections, claims, invoices, and photos all reference.',
        missing: ['Crew scheduling / dispatch calendar', 'Supplier material ordering integration', 'Customer progress SMS notifications', 'Sub-job splitting for multi-property jobs'],
      },
      {
        label: 'Estimates',
        href: '/admin/estimates',
        icon: FileText,
        what: 'Generate, send, and track roofing estimates with line items, measurements, and customer signature.',
        how: 'Line items pulled from pricing catalog. PDF generated server-side. Customer signs via email link. Status: Draft → Sent → Viewed → Accepted/Declined.',
        sources: ['estimates', 'line_items', 'customers', 'jobs'],
        pipeline: 'Converts to job on acceptance. Linked to EagleView measurements when ordered.',
        missing: ['EagleView measurement auto-import into estimate', 'Multi-option estimate (good/better/best tiers)', 'Estimate expiry and follow-up automation'],
      },
      {
        label: 'Claims',
        href: '/admin/claims',
        icon: ShieldCheck,
        what: 'Insurance claim tracking: adjuster meetings, claim numbers, supplement history, ACV/RCV amounts, and payout status.',
        how: 'Linked to job. Tracks dates (loss, filed, inspection, approval), amounts, and insurer contact info.',
        sources: ['claims', 'jobs', 'customers'],
        pipeline: 'Supplements trigger re-inspection and revised estimate cycles.',
        missing: ['Xactimate scope import', 'Adjuster meeting auto-scheduling', 'Supplement success rate analytics by carrier'],
      },
      {
        label: 'Inspections',
        href: '/admin/inspections',
        icon: ClipboardList,
        what: 'Roof inspection records with damage assessment, photo documentation, and findings report.',
        how: 'Linked to job or lead. Inspector fills out checklist, uploads photos, generates PDF findings report.',
        sources: ['inspections', 'jobs', 'photos'],
        missing: ['AI damage assessment from photos', 'Drone inspection integration', 'Pre-built inspection checklist templates by damage type'],
      },
      {
        label: 'Photos',
        href: '/admin/photos',
        icon: Camera,
        what: 'Job photo storage organized by phase: before, during, after, and damage documentation.',
        how: 'Photos uploaded to cloud storage (S3-compatible). Linked to job and inspection records.',
        sources: ['photos table', 'cloud storage'],
        missing: ['AI auto-tagging of damage types', 'Before/after comparison slider', 'Customer-facing photo gallery link'],
      },
    ],
  },
  {
    group: 'Finance',
    color: 'green',
    pages: [
      {
        label: 'Expenses',
        href: '/admin/expenses',
        icon: Receipt,
        what: 'Business expense logging: materials, fuel, tools, subs, overhead. Each expense can be tied to a specific job.',
        how: 'Manual entry with category, amount, date, vendor, and optional job link. Exported for tax prep.',
        sources: ['expenses table'],
        missing: ['Receipt photo OCR auto-entry', 'Credit card statement import', 'IRS category auto-classification'],
      },
      {
        label: 'Subcontractors',
        href: '/admin/subcontractors',
        icon: HardHat,
        what: 'Sub crew directory with contact info, trade specialty, rates, and job history.',
        how: 'Simple CRUD. Linked to jobs via expenses table (sub payments) and job assignments.',
        sources: ['subcontractors', 'expenses', 'jobs'],
        missing: ['Sub availability calendar', 'W-9 / 1099 document collection', 'Sub performance scoring by job'],
      },
      {
        label: 'Mileage Log',
        href: '/admin/mileage',
        icon: Car,
        what: 'IRS-compliant vehicle mileage tracking for business travel deductions.',
        how: 'Manual trip entry: date, start/end location, miles, purpose. Calculates deduction at current IRS rate.',
        sources: ['mileage table'],
        missing: ['GPS auto-tracking via mobile app', 'Google Maps trip distance calculator', 'Annual mileage report for tax prep'],
      },
      {
        label: 'P&L Report',
        href: '/admin/finance',
        icon: BarChart3,
        what: 'Consolidated profit & loss statement by period (monthly, quarterly, annual).',
        how: 'Aggregates revenue from jobs and expenses by category. Calculates gross margin and net profit.',
        sources: ['jobs', 'expenses', 'subcontractors', 'manual_revenue'],
        missing: ['Chart of accounts / QuickBooks-style categorization', 'Budget vs actual comparison', 'Export to QuickBooks or Xero'],
      },
      {
        label: 'Cash Flow',
        href: '/admin/cashflow',
        icon: ArrowLeftRight,
        what: 'Rolling cash flow projection based on outstanding estimates, open jobs, and scheduled payments.',
        how: 'Projects 90 days forward using estimate close probability and job payment history.',
        sources: ['jobs', 'estimates', 'expenses'],
        missing: ['Bank balance import via Plaid', 'Payroll integration', 'Scenario modeling (what-if analysis)'],
      },
      {
        label: 'Tax Prep',
        href: '/admin/tax',
        icon: Calculator,
        what: 'Annual tax document compilation: revenue summary, expense breakdown, mileage deduction, sub 1099 totals.',
        how: 'Aggregates all financial records for the selected tax year. Exports to PDF/CSV for accountant.',
        sources: ['jobs', 'expenses', 'mileage', 'subcontractors'],
        missing: ['Auto-generate 1099 PDFs for subs over $600', 'Direct CPA firm integration', 'Quarterly estimated tax calculator'],
      },
      {
        label: 'Bank Connect',
        href: '/admin/finance/bank',
        icon: Building2,
        what: 'Plaid bank account integration to pull real transaction history and reconcile with job records.',
        how: 'Plaid Link flow for OAuth connection. Transactions synced and matched to expenses/revenue.',
        sources: ['Plaid API', 'jobs', 'expenses'],
        missing: ['Auto-categorization of bank transactions', 'Multi-account reconciliation', 'Alert for unmatched large transactions'],
      },
      {
        label: 'Campaign ROI',
        href: '/admin/campaign-costs',
        icon: Target,
        what: 'Marketing spend tracking vs revenue generated per campaign. Calculates CPL, CPA, and ROAS.',
        how: 'Manual spend entry per campaign. Matched to leads/jobs via source tag.',
        sources: ['campaign_costs table', 'leads', 'jobs'],
        missing: ['Google Ads / Meta Ads API direct import', 'Automatic attribution from lead source', 'Lifetime value per lead source'],
      },
    ],
  },
  {
    group: 'Leads & CRM',
    color: 'purple',
    pages: [
      {
        label: 'Leads',
        href: '/admin/leads',
        icon: UserPlus,
        what: 'Traditional inbound lead management: website forms, referrals, and manual entries. Tracks status from new → contacted → estimate → converted.',
        how: 'Simple pipeline view. Linked to customers on conversion. Source tagging for attribution.',
        sources: ['leads table', 'customers'],
        missing: ['Lead scoring model', 'Automatic lead routing by zip code / territory', 'Missed call auto-SMS response'],
      },
      {
        label: 'Customers',
        href: '/admin/customers',
        icon: Users,
        what: 'Full customer CRM: contact info, property address, job history, communication log, and documents.',
        how: 'Each customer links to all jobs, estimates, claims, and photos. Sends emails directly from the record.',
        sources: ['customers', 'jobs', 'estimates', 'claims', 'photos'],
        pipeline: 'Central record — all operations flow in and out of the customer profile.',
        missing: ['Customer portal (let homeowners check job status)', 'Net Promoter Score tracking', 'Referral network mapping'],
      },
    ],
  },
  {
    group: 'Communications',
    color: 'cyan',
    pages: [
      {
        label: 'Call Center',
        href: '/admin/call-center',
        icon: Phone,
        what: 'AI-powered Retell calling dashboard. Dispatches outbound AI calls to storm prospects, tracks call status, transcripts, and outcomes.',
        how: 'Retell API integration. Calls dispatched in batches. Transcripts stored and sentiment analyzed. Interested prospects flagged for human follow-up.',
        sources: ['Retell AI API', 'storm_prospects', 'outreach_history'],
        pipeline: 'Part of storm outreach sequence: Lead Gen → Zone targeting → Retell call → Human follow-up → Estimate.',
        missing: ['Inbound call handling (AI receptionist)', 'Call recording playback in UI', 'A/B test different call scripts', 'Auto-schedule estimates from positive outcomes'],
      },
    ],
  },
  {
    group: 'Outreach — Storm Intelligence',
    color: 'yellow',
    pages: [
      {
        label: 'Storm Dashboard',
        href: '/admin/storm',
        icon: CloudLightning,
        what: 'Real-time DFW storm monitoring: NEXRAD radar, SPC hail/wind/tornado reports, SWDI radar-detected hail grid, and historical storm archive.',
        how: 'Polls SPC CSV every 30 min via storm-alert.js (PM2). NEXRAD radar from Iowa State IEM WMS tiles. SWDI data from NCEI API (1–3 day lag). All layers on interactive MapLibre map.',
        sources: ['SPC NOAA CSV reports', 'NEXRAD IEM WMS', 'SWDI NCEI API', 'storm_history table'],
        pipeline: 'Storm detected → storm-alert.js fires → email + Telegram alert → auto-triggers lead gen script → Storm Zones populated.',
        missing: ['MRMS real-time hail tile overlay', 'Push notification to mobile', 'Storm damage cost estimator overlay', 'Historical storm path animation'],
      },
      {
        label: 'Storm Scout Zones',
        href: '/admin/outreach/zones',
        icon: Target,
        what: 'Per-SPC-point impact zones with prospect counts, cross streets, distance from office, and adjustable search radius. Links to map and prospect list for each zone.',
        how: 'Reads SPC report for selected date → dedupes at 0.02° grid → computes circle radius by hail size → counts storm_prospects within circle via SQL distance formula → Nominatim cross-street reverse geocode. Cached in storm_zones table.',
        sources: ['SPC NOAA CSV', 'storm_prospects table', 'Nominatim OSM geocoder', 'storm_zones table (cache)'],
        pipeline: 'Downstream of Storm Dashboard detection. Feeds Storm Zones Map and Storm Prospects list.',
        missing: ['SWDI radar polygon overlay (true footprint vs point circles)', 'Auto-email zone summary to field reps at 8am', 'Zone comparison across multiple storm dates', 'Canvass route optimizer within a zone'],
      },
      {
        label: 'Storm Zones Map',
        href: '/admin/outreach/zones/map',
        icon: MapPin,
        what: 'Interactive MapLibre map for a single storm zone. Shows the impact circle, all prospects pinned by priority score, and click-popups with owner info and directions.',
        how: 'Loads from zones page via URL params (lat/lon/radius/storm_date). Fetches prospects from API with geographic filter. Uses turf.js for circle polygon. Prospect pins colored by priority_score.',
        sources: ['storm_prospects table (geo-filtered)', 'CartoDB/ESRI satellite tiles'],
        pipeline: 'Field scouting tool — open on mobile while driving the zone.',
        missing: ['Cluster markers for dense areas', 'Route planning (optimize canvass order)', 'Mark visited / knocked doors in the field', 'Offline map caching for areas with poor cell signal'],
      },
      {
        label: 'Storm Prospects',
        href: '/admin/prospects',
        icon: MapPin,
        what: 'Master list of all homeowners in storm-affected areas. Filterable by status, city, damage type, score, and geographic zone. Supports bulk email, SMS, AI calling, and skip trace.',
        how: 'Populated by storm_generate_leads.ts which queries parcels table within SPC circle buffers. Scored by year built, value, owner-occupied status, and proximity. Outreach tracked in outreach_history.',
        sources: ['parcels table (Dallas, Tarrant geocoded; Denton in progress)', 'storm_prospects table', 'outreach_history'],
        pipeline: 'End of lead gen pipeline. Starting point for all outreach channels.',
        missing: ['Auto-sort by "best time to knock" based on neighborhood patterns', 'DNC list integration', 'Automatic status update after call outcome', 'De-duplication against existing customers'],
      },
      {
        label: 'Campaign Manager',
        href: '/admin/storm/campaigns',
        icon: MapPin,
        what: 'Multi-channel storm outreach campaign builder. Configure target zones, channels (email/SMS/call), message templates, and scheduling.',
        how: 'Creates campaign records linking storm date to outreach channels. Tracks sends, opens, responses.',
        sources: ['storm_prospects', 'outreach_history', 'email_templates'],
        missing: ['Drip sequence automation (day 1 email → day 3 SMS → day 5 call)', 'Channel performance A/B testing', 'Per-campaign cost tracking vs jobs won'],
      },
      {
        label: 'Lead Gen Pro Forma',
        href: '/admin/storm/pro-forma',
        icon: TrendingUp,
        what: 'ROI calculator for storm lead generation. Input prospect count, contact rates, conversion rates, and average job value to project expected revenue.',
        how: 'Spreadsheet-style calculator with adjustable inputs. Compares cost of skip trace + outreach vs projected revenue.',
        sources: ['Manual inputs', 'historical conversion data'],
        missing: ['Pull actuals from completed campaigns automatically', 'Per-channel ROI breakdown', 'Sensitivity analysis slider'],
      },
      {
        label: 'Storm ROI',
        href: '/admin/storm/roi',
        icon: BarChart2,
        what: 'Historical performance of storm campaigns: leads generated, jobs won, revenue, and cost per acquisition.',
        how: 'Links storm_date → storm_prospects → converted jobs. Calculates CPL, close rate, and revenue per storm event.',
        sources: ['storm_prospects', 'jobs', 'outreach_history'],
        missing: ['Insurance carrier breakdown of won jobs', 'Multi-storm correlation (which storms generate best ROI)', 'Benchmark vs industry averages'],
      },
      {
        label: 'Quick Estimate',
        href: '/admin/quick-estimate',
        icon: Zap,
        what: 'Rapid field estimate tool for canvassing. Input roof size and damage level, get ballpark estimate to share with homeowner on the spot.',
        how: 'Uses pricing catalog line items. No customer account required — generates shareable link or PDF.',
        sources: ['line_items table'],
        missing: ['Integrate EagleView quick measurement from address', 'Save to lead/customer on the spot', 'Offline mode for no-signal areas'],
      },
      {
        label: 'EagleView Batch',
        href: '/admin/storm/ev-batch',
        icon: Satellite,
        what: 'Bulk EagleView aerial measurement orders for storm-zone properties. Orders roof measurements for multiple addresses at once.',
        how: 'EagleView API integration. Batch order from prospect list. Results import into estimates.',
        sources: ['EagleView API', 'storm_prospects', 'estimates'],
        pipeline: 'Storm Prospects → EagleView Batch → Measurement results → Pre-fill Estimate.',
        missing: ['Auto-trigger EV order for score 80+ prospects', 'Cost tracking per order vs job value', 'Report generation from EV data for adjuster meetings'],
      },
      {
        label: 'Storm Targeting',
        href: '/admin/storm/target',
        icon: Target,
        what: 'Geographic target zone selector for storm canvassing. Draw or select neighborhoods to prioritize.',
        how: 'Map-based selection tool. Saved target areas used to filter prospect lists and plan canvass routes.',
        sources: ['parcels', 'storm_prospects'],
        missing: ['Integration with Storm Scout Zones for auto-population', 'Neighborhood demographic overlay', 'Competitor canvass activity tracking'],
      },
      {
        label: 'DFW Property DB',
        href: '/admin/storm/dfw-data',
        icon: Database,
        what: 'Raw property database browser showing parcel counts, geocoding status, and data coverage by county.',
        how: 'Direct query of parcels table. Shows coverage gaps across DFW counties.',
        sources: ['parcels table'],
        pipeline: 'Foundation for all storm lead generation. Counties loaded: Dallas (683K ✓), Tarrant (452K ✓), Denton (302K — coords in progress), Collin (358K — no coords yet).',
        missing: ['Parker, Wise, Rockwall, Kaufman, Johnson, Ellis county pulls', 'Automated nightly data freshness check', 'Direct ArcGIS sync to keep data current'],
      },
    ],
  },
  {
    group: 'Outreach — Channels',
    color: 'red',
    pages: [
      {
        label: 'Business Outreach',
        href: '/admin/business-outreach',
        icon: Building2,
        what: 'Commercial property outreach targeting businesses with storm damage. Separate prospect list for commercial roofing.',
        how: 'Similar to Storm Prospects but filtered for commercial parcels (B/C state use codes). Outreach via email and direct sales.',
        sources: ['parcels table (commercial)', 'business_prospects table'],
        missing: ['Building size / roof type data from permits', 'Property management company contact enrichment', 'Commercial damage estimation tool'],
      },
      {
        label: 'Campaign Sender',
        href: '/admin/outreach/send',
        icon: Send,
        what: 'Bulk email and SMS campaign sender. Select template, choose prospect segment, send.',
        how: 'Email via Nodemailer (Hostinger SMTP). SMS via Twilio. Tracks send/open/reply rates in outreach_history.',
        sources: ['storm_prospects', 'email_templates', 'Hostinger SMTP', 'Twilio API'],
        missing: ['Deliverability monitoring (bounce rates, spam scores)', 'Unsubscribe/opt-out management', 'HTML email template builder'],
      },
      {
        label: 'Email Templates',
        href: '/admin/outreach',
        icon: Mail,
        what: 'Library of email templates for storm outreach, follow-up, and review requests. Supports {{name}}, {{address}} merge fields.',
        how: 'Templates stored in email_templates table. Preview, edit, and test send from this page.',
        sources: ['email_templates table'],
        missing: ['A/B subject line testing', 'Open/click rate per template', 'AI template generator from prompt'],
      },
      {
        label: 'Review Requests',
        href: '/admin/reviews',
        icon: Star,
        what: 'Automated Google/Yelp review request emails sent to customers after job completion.',
        how: 'Trigger on job status = Complete. Sends templated email with direct review link. Tracks sent/clicked.',
        sources: ['customers', 'jobs', 'Hostinger SMTP'],
        missing: ['SMS review request option', 'Negative feedback intercept (route unhappy customers internally)', 'Auto-respond to reviews via Google Business API'],
      },
      {
        label: 'Automation',
        href: '/admin/scheduler',
        icon: Calendar,
        what: 'Scheduled task manager for recurring automations: storm checks, report emails, data syncs.',
        how: 'PM2-managed cron jobs on VPS. storm-alert.js runs every 30 min. Additional tasks configured here.',
        sources: ['PM2 cron', 'storm-alert.js', 'storm_generate_leads.ts'],
        pipeline: 'storm-alert.js → detects DFW hit → triggers storm_generate_leads.ts → populates storm_prospects → notifies via email/Telegram.',
        missing: ['UI-based cron job editor', 'Failure alerts when automations break', 'Run history / audit log', 'Webhook triggers for external events'],
      },
    ],
  },
  {
    group: 'System',
    color: 'gray',
    pages: [
      {
        label: 'Pricing / Line Items',
        href: '/admin/line-items',
        icon: Wrench,
        what: 'Roofing service pricing catalog. Each line item has name, unit, price, and category. Used to build estimates.',
        how: 'CRUD management. Items pulled into estimate builder. Supports price overrides per estimate.',
        sources: ['line_items table'],
        missing: ['Regional price adjustment factors', 'Supplier cost tracking vs markup', 'Price history / change log'],
      },
      {
        label: 'Product Docs',
        href: '/admin/docs',
        icon: BookOpen,
        what: 'Manufacturer warranty and product documentation library. Upload and organize PDFs by manufacturer (GAF, OC, CertainTeed, etc.).',
        how: 'PDFs uploaded to cloud storage. Organized by manufacturer. Shared with customers in estimate/job documents.',
        sources: ['mfr_docs table', 'cloud storage'],
        missing: ['Customer-facing doc portal link', 'Warranty expiry tracking per job', 'Auto-attach based on materials used in estimate'],
      },
      {
        label: 'Doc Packets',
        href: '/admin/document-packets',
        icon: Package,
        what: 'Pre-built document bundles for common scenarios: insurance claim packet, new customer packet, completion packet.',
        how: 'Templates that auto-fill customer/job data. Generated as PDFs and emailed or printed.',
        sources: ['document_packets table', 'customers', 'jobs', 'claims'],
        missing: ['E-signature integration (DocuSign/HelloSign)', 'Customer self-service portal to access their docs', 'Version history for edited packets'],
      },
      {
        label: 'Settings',
        href: '/admin/settings',
        icon: Settings,
        what: 'System configuration: company info, notification preferences, user management, API key management, and integration settings.',
        how: 'Settings stored in settings/users tables. Controls email sender, Twilio, Retell, BatchData, and EagleView keys.',
        sources: ['settings table', 'users table'],
        missing: ['Multi-user role management (admin / sales / ops)', 'Audit log of settings changes', 'White-label configuration for franchise expansion'],
      },
    ],
  },
];

const COLOR_MAP: Record<string, string> = {
  blue:   'border-blue-500/40 bg-blue-900/20',
  orange: 'border-orange-500/40 bg-orange-900/20',
  green:  'border-green-500/40 bg-green-900/20',
  purple: 'border-purple-500/40 bg-purple-900/20',
  cyan:   'border-cyan-500/40 bg-cyan-900/20',
  yellow: 'border-yellow-500/40 bg-yellow-900/20',
  red:    'border-red-500/40 bg-red-900/20',
  gray:   'border-gray-600/40 bg-gray-800/30',
};

const BADGE_MAP: Record<string, string> = {
  blue:   'bg-blue-700 text-blue-100',
  orange: 'bg-orange-700 text-orange-100',
  green:  'bg-green-700 text-green-100',
  purple: 'bg-purple-700 text-purple-100',
  cyan:   'bg-cyan-700 text-cyan-100',
  yellow: 'bg-yellow-700 text-yellow-100',
  red:    'bg-red-700 text-red-100',
  gray:   'bg-gray-600 text-gray-100',
};

function PageCard({ page, color }: { page: PageDoc; color: string }) {
  const [open, setOpen] = useState(false);
  const Icon = page.icon;

  return (
    <div className={`rounded-xl border ${COLOR_MAP[color]} overflow-hidden`}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Icon className="w-5 h-5 text-gray-300 shrink-0" />
          <div>
            <div className="text-sm font-semibold text-white">{page.label}</div>
            <div className="text-xs text-gray-400 mt-0.5">{page.href}</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {page.pipeline && (
            <span className="text-xs bg-blue-900/60 border border-blue-600/40 text-blue-300 px-2 py-0.5 rounded-full hidden sm:inline">
              Pipeline
            </span>
          )}
          <span className="text-xs text-gray-500">{page.missing.length} ideas</span>
          {open ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
        </div>
      </button>

      {open && (
        <div className="px-5 pb-5 border-t border-white/10 pt-4 space-y-4">
          {/* What it does */}
          <div>
            <div className="flex items-center gap-1.5 text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5">
              <CheckCircle className="w-3.5 h-3.5" /> What It Does
            </div>
            <p className="text-sm text-gray-200">{page.what}</p>
          </div>

          {/* How it works */}
          <div>
            <div className="flex items-center gap-1.5 text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5">
              <Settings className="w-3.5 h-3.5" /> How It Works
            </div>
            <p className="text-sm text-gray-300">{page.how}</p>
          </div>

          {/* Data sources */}
          <div>
            <div className="flex items-center gap-1.5 text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">
              <Database className="w-3.5 h-3.5" /> Data Sources
            </div>
            <div className="flex flex-wrap gap-1.5">
              {page.sources.map(s => (
                <span key={s} className="text-xs bg-gray-700 text-gray-300 px-2 py-1 rounded-md">{s}</span>
              ))}
            </div>
          </div>

          {/* Pipeline role */}
          {page.pipeline && (
            <div>
              <div className="flex items-center gap-1.5 text-xs font-bold text-blue-400 uppercase tracking-widest mb-1.5">
                <ArrowLeftRight className="w-3.5 h-3.5" /> Pipeline Role
              </div>
              <p className="text-sm text-blue-200 bg-blue-900/30 rounded-lg px-3 py-2">{page.pipeline}</p>
            </div>
          )}

          {/* Enhancement ideas */}
          <div>
            <div className="flex items-center gap-1.5 text-xs font-bold text-yellow-400 uppercase tracking-widest mb-2">
              <Lightbulb className="w-3.5 h-3.5" /> Enhancement Ideas
            </div>
            <ul className="space-y-1.5">
              {page.missing.map(m => (
                <li key={m} className="flex items-start gap-2 text-sm text-gray-300">
                  <AlertCircle className="w-3.5 h-3.5 text-yellow-500 shrink-0 mt-0.5" />
                  {m}
                </li>
              ))}
            </ul>
          </div>

          <a
            href={page.href}
            className="inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors mt-1"
          >
            Open {page.label} →
          </a>
        </div>
      )}
    </div>
  );
}

export default function PlatformGuidePage() {
  const [search, setSearch] = useState('');

  const totalPages   = SECTIONS.reduce((n, s) => n + s.pages.length, 0);
  const totalIdeas   = SECTIONS.reduce((n, s) => n + s.pages.reduce((m, p) => m + p.missing.length, 0), 0);
  const pipelineCount = SECTIONS.reduce((n, s) => n + s.pages.filter(p => p.pipeline).length, 0);

  const filtered = search.trim().length >= 2
    ? SECTIONS.map(s => ({
        ...s,
        pages: s.pages.filter(p =>
          p.label.toLowerCase().includes(search.toLowerCase()) ||
          p.what.toLowerCase().includes(search.toLowerCase()) ||
          p.how.toLowerCase().includes(search.toLowerCase()) ||
          p.sources.some(src => src.toLowerCase().includes(search.toLowerCase()))
        ),
      })).filter(s => s.pages.length > 0)
    : SECTIONS;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <BookOpen className="w-7 h-7 text-blue-400" />
        <div>
          <h1 className="text-2xl font-bold text-white">Platform Guide</h1>
          <p className="text-sm text-gray-400 mt-0.5">Complete reference for every page, tool, pipeline, and enhancement idea</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total Pages', value: totalPages },
          { label: 'Pipeline Nodes', value: pipelineCount },
          { label: 'Enhancement Ideas', value: totalIdeas },
        ].map(({ label, value }) => (
          <div key={label} className="bg-gray-800 border border-gray-700 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-white">{value}</div>
            <div className="text-xs text-gray-400 mt-1">{label}</div>
          </div>
        ))}
      </div>

      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search pages, data sources, features..."
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      {/* Storm pipeline callout */}
      <div className="bg-yellow-900/20 border border-yellow-600/30 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <CloudLightning className="w-4 h-4 text-yellow-400" />
          <span className="text-sm font-bold text-yellow-300">Storm Lead Gen Pipeline (fully automated)</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-300">
          {[
            'SPC reports every 30 min',
            '→ storm-alert.js detects DFW hit',
            '→ Email + Telegram alert',
            '→ storm_generate_leads.ts auto-runs',
            '→ parcels table queried within SPC circles',
            '→ storm_prospects populated + scored',
            '→ Storm Zones page shows impact areas',
            '→ Outreach channels activated',
          ].map((step, i) => (
            <span key={i} className={step.startsWith('→') ? 'text-yellow-400' : 'bg-gray-700 px-2 py-0.5 rounded'}>{step}</span>
          ))}
        </div>
      </div>

      {/* Sections */}
      {filtered.map(section => (
        <div key={section.group}>
          <div className="flex items-center gap-3 mb-3">
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${BADGE_MAP[section.color]}`}>
              {section.group}
            </span>
            <span className="text-xs text-gray-500">{section.pages.length} pages</span>
          </div>
          <div className="space-y-2">
            {section.pages.map(page => (
              <PageCard key={page.href} page={page} color={section.color} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
