# Roof Works Admin — CLAUDE.md

## Project Overview
Next.js 15 App Router + TypeScript admin panel for Roof Works of Texas (DFW roofing contractor).
- **Live URL**: https://admin.roofworksoftexas.com
- **VPS**: 72.60.43.168, SSH: `ssh root@72.60.43.168`
- **VPS path**: `/var/www/roof-works-admin`
- **PM2 name**: `roof-works-admin`
- **Port**: 3020 (nginx proxied to admin.roofworksoftexas.com)
- **DB**: PostgreSQL via Docker (container: `roofworks-db`, port 5440, DB: `roofworks`, user: `roofworks`)
- **ORM**: Prisma
- **Brand color**: #dc2626 (red), dark mode UI (gray-800/900 backgrounds)

---

## Deploy Workflow
No git on VPS. Local development pushed via SCP.

```bash
# 1. SCP changed files to VPS
scp local_file.ts root@72.60.43.168:/var/www/roof-works-admin/path/file.ts

# 2. Build on VPS
ssh root@72.60.43.168 "cd /var/www/roof-works-admin && npm run build"

# 3. Restart PM2
ssh root@72.60.43.168 "pm2 restart roof-works-admin --update-env"

# Schema changes: push to DB after updating schema.prisma
ssh root@72.60.43.168 "cd /var/www/roof-works-admin && npx prisma db push && npx prisma generate"
```

---

## Auth Pattern
All API routes use `requireAdmin()` from `@/lib/admin-auth`. Throws `Error('Unauthorized')` if no valid session.

```ts
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try { await requireAdmin(); } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); }
  // ... handler
}
```

---

## Email Pattern
- SMTP: `smtp.hostinger.com:465` (SSL)
- From: `info@roofworksoftexas.com`
- Env vars: `OUTREACH_MAILBOX_1_EMAIL`, `OUTREACH_MAILBOX_1_PASS`
- Supports up to 4 mailboxes (500/day, 200/hour per mailbox)
- Mailer: `lib/mailer.ts` — `sendEmail(opts)` / `sendTransactionalEmail(opts)`
- Branded wrapper: `lib/brandedWrapper.ts` — `wrapInBrandedEmail(body, { preheader })` returns full HTML email
- Also exists at: `lib/email/brandedWrapper.ts`
- Attachments supported: `{ filename, content: Buffer, contentType }`

---

## Full Database Schema

### Auth
| Table | Purpose |
|-------|---------|
| `admin_users` | Admin accounts (email, password_hash, name, role) |
| `admin_sessions` | Session tokens (user_id, expires_at) |

### CRM
| Table | Purpose |
|-------|---------|
| `customers` | Homeowner customers (name, phone, email, address, notes) |
| `customer_documents` | Uploaded files for customers (display_name, filename, doc_type, file_path) |
| `customer_activity` | Activity log (NOTE, CALL, EMAIL, MEETING, STATUS_CHANGE, DOCUMENT_UPLOADED) |

### Estimating
| Table | Purpose |
|-------|---------|
| `estimates` | Estimates tied to customer (address, insurance info, totals, status: DRAFT→SENT→APPROVED→DECLINED→INVOICED→PAID) |
| `estimate_line_items` | Line items per estimate (linked to line_item_master, qty, pricing) |
| `change_orders` | Change orders on estimates (new totals, linked items) |
| `change_order_line_items` | Individual line changes in a change order |
| `line_item_master` | Pricing catalog (label, unit, xactimate price, our price, category) |
| `payment_schedule_items` | Payment milestones (sort_order, label, amount_type FIXED/PERCENT, due_trigger) |
| `contract_signatures` | Digital signatures on estimates (signer_name, signature_data base64 PNG) |

### Jobs
| Table | Purpose |
|-------|---------|
| `jobs` | Job pipeline (status: LEAD→ESTIMATE_SENT→INSURANCE_APPROVED→SCHEDULED→IN_PROGRESS→COMPLETE→INVOICED→PAID) |
| `job_photos` | Photos per job (url, type, caption) |
| `review_requests` | Review request tracking (sent_via, opened_at, clicked_at, reviewed_at) |
| `insurance_claims` | Insurance claim details (adjuster info, amounts, supplements, status) |

### Invoicing
| Table | Purpose |
|-------|---------|
| `invoices` | Invoices linked to estimates (invoice_no, amounts, Stripe fields, status: UNPAID→PARTIAL→PAID→VOID) |
| `payments` | Payments on invoices (amount, method, Stripe payment ID) |
| `manual_invoices` | Standalone invoices not tied to estimates (customer info, line items) |
| `manual_invoice_items` | Line items on manual invoices |
| `manual_payments` | Payments on manual invoices |

### Outreach
| Table | Purpose |
|-------|---------|
| `outreach_templates` | Email template library (slug-keyed, {{variable}} substitution) |
| `storm_prospects` | Homeowner directory for storm outreach (address, damage_type, status) |
| `outreach_history` | Sent email log (linked to prospect + template) |
| `outreach_scheduler_config` | Automation settings (daily_cap, cooldown_days, template_slug) |
| `outreach_runs` | Automation run history (sent/failed/skipped counts) |

### Business Directory
| Table | Purpose |
|-------|---------|
| `business_directory` | Cold outreach business contacts (name, category, address, status) |

### Inspections
| Table | Purpose |
|-------|---------|
| `inspection_reports` | Roof inspection reports (address, inspector, weather, status: DRAFT/COMPLETE) |
| `inspection_items` | Inspection sections (section, damaged, data JSON, notes) |
| `inspection_photos` | Photos per inspection section (photo_data base64) |

### Finance
| Table | Purpose |
|-------|---------|
| `expenses` | Business expenses (date, category, amount, vendor, receipt, tax_deductible) |
| `subcontractors` | Subcontractor profiles (trade, rates, insurance, tax ID) |
| `subcontractor_documents` | Sub documents (W-9, insurance certs, contracts) |
| `mileage_log` | Mileage tracking (from/to, miles, IRS rate, deduction) |
| `recurring_expenses` | Recurring expense templates (frequency, next_due, auto_log) |

### Job Costs
| Table | Purpose |
|-------|---------|
| `job_costs` | P&L line items per estimate (category: materials/labor/subs/equipment/permits/eagleview/marketing/other) |

### Documents
| Table | Purpose |
|-------|---------|
| `manufacturer_docs` | Product documentation library (manufacturer, name, filename on disk) |
| `document_packets` | Pre/post-project document templates (doc_type, category, file_data base64, is_default) |
| `estimate_packet_sends` | Log of document packets sent per estimate (packet_type, doc_ids, sent_to) |

### EagleView
| Table | Purpose |
|-------|---------|
| `ev_reports` | EagleView measurement reports (ref_id, status, measurements JSON, pdf_url) |

### Material Orders
| Table | Purpose |
|-------|---------|
| `material_orders` | Material orders per estimate (brand, items JSON, notes) |

---

## Full Sidebar Navigation

### Overview
- `/admin/dashboard` — Dashboard
- `/admin/analytics` — Analytics
- `/admin/revenue` — Revenue
- `/admin/accounting` — Job P&L

### Operations
- `/admin/jobs` — Job Pipeline
- `/admin/estimates` — Estimates
- `/admin/manual-invoices` — Manual Invoices
- `/admin/claims` — Claims
- `/admin/inspections` — Inspections
- `/admin/photos` — Photos

### Finance
- `/admin/expenses` — Expenses
- `/admin/subcontractors` — Subcontractors
- `/admin/mileage` — Mileage Log
- `/admin/finance` — P&L Report
- `/admin/cashflow` — Cash Flow
- `/admin/tax` — Tax Prep

### Leads & CRM
- `/admin/leads` — Leads
- `/admin/customers` — Customers
- `/admin/customers/[id]` — Customer Detail

### Outreach
- `/admin/storm` — Storm Dashboard
- `/admin/storm/canvass` — Canvass Map
- `/admin/prospects` — Storm Prospects
- `/admin/business-outreach` — Business Outreach
- `/admin/outreach/send` — Campaign Sender
- `/admin/outreach` — Email Templates
- `/admin/reviews` — Review Requests
- `/admin/scheduler` — Automation

### System
- `/admin/line-items` — Pricing / Line Items
- `/admin/docs` — Product Docs Library
- `/admin/document-packets` — Document Packets
- `/admin/settings` — Settings

---

## Complete Page Inventory

| Page | Path | Description |
|------|------|-------------|
| Login | `/admin/login` | Admin authentication |
| Dashboard | `/admin/dashboard` | KPI cards, recent activity, quick actions |
| Analytics | `/admin/analytics` | Charts and metrics across CRM/jobs/revenue |
| Revenue | `/admin/revenue` | Revenue tracking and reporting |
| Job P&L | `/admin/accounting` | Per-job profit & loss breakdown |
| Job Pipeline | `/admin/jobs` | Kanban/list of all jobs by status |
| Job Detail | `/admin/jobs/[id]` | Single job view (photos, status, claim) |
| Estimates | `/admin/estimates` | List of all estimates with filters |
| Estimate Detail | `/admin/estimates/[id]` | Full estimate editor: line items, PDF gen, signature pad, payment schedule, change orders, product docs, document packets, job costs, EagleView, material orders |
| Manual Invoices | `/admin/manual-invoices` | Standalone invoices list |
| Manual Invoice Detail | `/admin/manual-invoices/[id]` | View/edit manual invoice, record payments |
| New Manual Invoice | `/admin/manual-invoices/new` | Create new manual invoice |
| Claims | `/admin/claims` | Insurance claims management |
| Inspections | `/admin/inspections` | Roof inspection reports list |
| Inspection Detail | `/admin/inspections/[id]` | Section-by-section inspection with photos |
| Photos | `/admin/photos` | Photo gallery across all jobs |
| Expenses | `/admin/expenses` | Business expense tracking with receipts |
| Subcontractors | `/admin/subcontractors` | Sub profiles, documents, payment history |
| Mileage Log | `/admin/mileage` | IRS mileage tracking and deductions |
| P&L Report | `/admin/finance` | Company-wide profit & loss statement |
| Cash Flow | `/admin/cashflow` | Cash flow analysis and projections |
| Tax Prep | `/admin/tax` | Tax preparation summary (expenses, mileage, 1099s) |
| Leads | `/admin/leads` | Incoming lead management |
| Customers | `/admin/customers` | Customer CRM list |
| Customer Detail | `/admin/customers/[id]` | Customer profile, documents, activity, estimates, jobs |
| Storm Dashboard | `/admin/storm` | Storm tracking and damage area mapping |
| Canvass | `/admin/storm/canvass` | Door-to-door canvassing map |
| Storm Prospects | `/admin/prospects` | Homeowner prospect directory for storm outreach |
| Business Outreach | `/admin/business-outreach` | B2B cold outreach from business directory |
| Campaign Sender | `/admin/outreach/send` | 4-step bulk email campaign builder |
| Email Templates | `/admin/outreach` | Template library with variable substitution |
| Review Requests | `/admin/reviews` | Post-job review request tracking |
| Automation | `/admin/scheduler` | Cron scheduler config and run history |
| Pricing / Line Items | `/admin/line-items` | Master pricing catalog (Xactimate vs our pricing) |
| Product Docs | `/admin/docs` | Manufacturer documentation library |
| Document Packets | `/admin/document-packets` | Pre-project & post-project document packet management |
| Settings | `/admin/settings` | System settings, contractor signature |

---

## Customer Workflow
1. Lead comes in (estimate tool on website, phone call, referral)
2. Customer created in CRM (`/admin/customers`)
3. Estimate created with line items from pricing catalog (`/admin/estimates`)
4. Estimate sent to customer (email with PDF attachment)
5. Customer approves / signs contract (inline signature pad on estimate detail)
6. Job created, moves through pipeline: `LEAD → ESTIMATE_SENT → INSURANCE_APPROVED → SCHEDULED → IN_PROGRESS → COMPLETE → INVOICED → PAID`
7. Pre-project document packet sent (agreement, insurance cert, license, etc.)
8. Work performed, inspections logged
9. Invoice generated from estimate
10. Post-project document packet sent (warranty, completion cert, maintenance guide)
11. Payment collected (Stripe checkout / manual: check, cash, Zelle, ACH)
12. Review request sent on completion

---

## API Patterns

### Admin APIs (`/api/admin/*`) — all require `requireAdmin()`
- Auth: `/api/admin/auth/login`, `/api/admin/auth/logout`, `/api/admin/auth/me`
- Dashboard: `/api/admin/dashboard/metrics`
- Customers: `/api/admin/customers`, `/api/admin/customers/[id]`, `[id]/activity`, `[id]/documents`, `[id]/documents/[docId]`, `[id]/send-email`
- Estimates: `/api/admin/estimates`, `/api/admin/estimates/[id]`, `[id]/pdf`, `[id]/sign`, `[id]/contract`, `[id]/change-order`, `[id]/convert-to-job`, `[id]/generate-invoice`, `[id]/payment-schedule`, `[id]/costs`, `[id]/costs/[costId]`, `[id]/ev-report`, `[id]/material-order`, `[id]/send-packet`, `[id]/lien-waiver`, `[id]/certificate-of-completion`, `[id]/post-construction-checklist`, `[id]/customer-guidelines`
- Jobs: `/api/admin/jobs`, `/api/admin/jobs/[id]`
- Claims: `/api/admin/claims`, `/api/admin/claims/[id]`
- Inspections: `/api/admin/inspections`, `[id]`, `[id]/items`, `[id]/pdf`, `[id]/photos`, `[id]/photos/[photoId]`
- Invoices: `/api/admin/invoices/[id]/payments`, `[id]/payments/[payId]/receipt`, `[id]/pdf`, `[id]/payment-link`
- Manual Invoices: `/api/admin/manual-invoices`, `[id]`, `[id]/payments`, `[id]/payments/[payId]`, `[id]/pdf`
- Line Items: `/api/admin/line-items`, `/api/admin/line-items/[id]`
- Manufacturer Docs: `/api/admin/manufacturer-docs`, `[id]`, `[id]/send`
- Document Packets: `/api/admin/document-packets`, `[id]`, `send`
- Outreach: `/api/admin/outreach`, `/api/admin/outreach/send`, `/api/admin/outreach/cron`, `/api/admin/outreach/scheduler`
- Templates: `/api/admin/templates`, `[id]`, `[id]/preview`
- Prospects: `/api/admin/prospects`, `[id]`, `import`
- Business Directory: `/api/admin/business-directory`, `[id]`
- Business Outreach: `/api/admin/business-outreach/send`
- Storm: `/api/admin/storm`, `forecast`, `properties`, `swath`
- Reviews: `/api/admin/reviews`
- Photos: `/api/admin/photos`
- Analytics: `/api/admin/analytics`
- Revenue: `/api/admin/revenue`
- Accounting: `/api/admin/accounting`
- Finance: `/api/admin/finance/pnl`, `cashflow`, `tax`
- Expenses: `/api/admin/expenses`, `[id]`
- Recurring Expenses: `/api/admin/recurring-expenses`, `[id]`
- Subcontractors: `/api/admin/subcontractors`, `[id]`, `[id]/documents`, `[id]/documents/[docId]`
- Mileage: `/api/admin/mileage`, `[id]`
- Settings: `/api/admin/settings/signature`
- EagleView: `/api/admin/eagleview-test`
- Leads: `/api/admin/leads`

### Public APIs (no auth)
- `/api/estimates` — Estimate tool (public website widget)
- `/api/contact` — Contact form submissions

### Webhooks
- `/api/webhooks/stripe` — Stripe payment webhooks
- `/api/webhooks/eagleview` — EagleView report completion webhooks

---

## Environment Variables (.env on VPS)
```
DATABASE_URL=postgresql://roofworks:...@localhost:5440/roofworks
ADMIN_SECRET=...
NEXT_PUBLIC_BRAND_NAME=Roof Works of Texas
NEXT_PUBLIC_BRAND_SHORT_NAME=Roof Works
NEXT_PUBLIC_BRAND_TAGLINE=Licensed Roofing Contractor · DFW & North Texas · Since 2015
NEXT_PUBLIC_BRAND_COLOR=#dc2626
NEXT_PUBLIC_BRAND_EMAIL=info@roofworksoftexas.com
NEXT_PUBLIC_BRAND_PHONE=(214) 795-3905
NEXT_PUBLIC_BRAND_PHONE_RAW=2147953905
NEXT_PUBLIC_BRAND_SENDER_NAME=Roof Works of Texas
NEXT_PUBLIC_BRAND_SENDER_EMAIL=info@roofworksoftexas.com
NEXT_PUBLIC_SITE_URL=https://roofworksoftexas.com
NEXT_PUBLIC_BRAND_LOGO_URL=/logo.png
NEXT_PUBLIC_BRAND_CITY=Dallas-Fort Worth, TX
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
OUTREACH_MAILBOX_1_EMAIL=info@roofworksoftexas.com
OUTREACH_MAILBOX_1_PASS=...
OUTREACH_MAILBOX_1_NAME=Roof Works of Texas
GOOGLE_REVIEW_URL=
PUBLIC_SITE_URL=https://roofworksoftexas.com
ADMIN_NOTIFY_EMAIL=info@roofworksoftexas.com
EV_ENV=sandbox
EV_CLIENT_ID=...
EV_CLIENT_SECRET=...
```

---

## Important Notes
- **iconv-lite warnings**: Build shows warnings from pdfkit/fontkit re: `iconv-lite`. Harmless — build succeeds (exit 0). Do not attempt to fix.
- **Estimate detail page**: Most complex page (~1600 lines). Has inline signature pad, PDF generation, payment schedules, change orders, job costs, EagleView integration, material orders, product docs panel, document packet panel.
- **Business directory** is separate from storm prospects — different tables, different outreach flows.
- **Template variables**: `{{name}}`, `{{address}}`, `{{city}}`, `{{phone}}` — substituted at preview and send time.
- **Cron endpoint**: `GET /api/admin/outreach/cron?secret=CRON_SECRET` — triggered by external cron (cron-job.org).
- **Branded wrapper**: `lib/brandedWrapper.ts` — red header, white body, signature footer, dark outer frame.
- **Prisma raw SQL**: For new tables, can execute SQL directly on Docker DB, then add Prisma models and run `prisma db push`.
- **No git on server**: All deploys via SCP. Build and restart with PM2.
