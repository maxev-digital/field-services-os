# Roof Works Admin

> Full-stack business operating system built and deployed for a roofing contractor — from zero to production in 6 weeks.

**Live:** [admin.roofworksoftexas.com](https://admin.roofworksoftexas.com) &nbsp;|&nbsp; **Demo:** `demo@apexroofingdfw.com` / `Demo2026!`

---

## The FDE Story

Roof Works of Texas had no internal software. Phone calls were tracked in spreadsheets, leads were lost between job sites, and follow-ups depended on whoever remembered to make them.

In 6 weeks: assessed the operation, designed the stack, built and shipped a complete business OS. The owner now runs daily operations — lead routing, IVR calls, SMS follow-ups, crew scheduling, inspection reports, and client documents — entirely through this platform.

This is what forward deployment looks like.

---

## What It Does

| Module | Description |
|---|---|
| **Lead Management** | Full lead pipeline — inbound capture, status tracking, crew assignment, follow-up scheduling |
| **IVR Call Campaigns** | Automated outbound calling via Retell AI — area targeting, call batching, voicemail detection |
| **SMS Outreach** | Two-way SMS via Sinch — automated sequences, inbox, reply tracking |
| **AI Phone Agent** | Retell AI voice agent answers inbound calls, qualifies leads, books appointments |
| **Inspection Reports** | Field crew submits reports with photos, damage notes, and material estimates |
| **Document Generation** | Proposals, contracts, SOW — auto-generated from lead data |
| **Email Outreach** | Multi-mailbox outreach with 3 dedicated SMTP accounts and sequence automation |
| **Cron Automation** | Scheduled billing reminders, drip sequences, morning lead summaries via Telegram |
| **Admin Dashboard** | Real-time pipeline view, revenue tracking, crew performance |
| **AI Insights** | Anthropic Claude for lead scoring, follow-up drafts, and territory analysis |
| **Financial Tracking** | Invoice tracking, payment status, Plaid bank integration |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript |
| Database | PostgreSQL (Docker) |
| ORM | Prisma |
| AI | Anthropic Claude — lead scoring, draft generation |
| Phone AI | Retell AI — IVR campaigns + inbound voice agent |
| SMS | Sinch — two-way SMS, sequences |
| Voice Synthesis | ElevenLabs — custom voicemail messages |
| Email | Nodemailer — 3 outreach mailboxes + SMTP |
| Notifications | Telegram bot — morning summaries, alerts |
| Financial | Plaid — bank account integration |
| Deploy | VPS — PM2 + Nginx |

---

## Architecture

```
roof-works-admin/
├── app/
│   ├── admin/              # Protected admin panel (dashboard, leads, reports)
│   ├── api/                # API routes — leads, calls, SMS, AI, cron jobs
│   ├── report/             # Field inspection report submission (crew-facing)
│   └── sign/               # Document e-signature flow
├── components/             # UI components
├── lib/                    # DB client, auth, email, SMS, Retell helpers
├── prisma/
│   └── schema.prisma       # Lead, call, SMS, report, document models
└── scripts/                # Area targeting, batch calling, data utilities
```

---

## Getting Started

```bash
# 1. Clone
git clone git@github.com:maxev-digital/roof-works-admin.git
cd roof-works-admin

# 2. Install
npm install

# 3. Configure
cp .env.example .env.local
# Fill in DATABASE_URL, RETELL_API_KEY, SINCH credentials, etc.

# 4. Database
npx prisma db push
npx prisma generate

# 5. Run
npm run dev
```

---

## Built By

**Max EV Digital** — Forward-deployed AI systems for real businesses.

[maxevdigital.com](https://maxevdigital.com) · [info@max-ev-holdings.com](mailto:info@max-ev-holdings.com)
