"use client";
import { useEffect, useState } from "react";
import { Building2, TrendingUp, DollarSign, Users, MapPin, RefreshCw, AlertCircle } from "lucide-react";

const fmt  = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
const fmtK = (n: number) => n >= 1000000 ? "$" + (n/1000000).toFixed(1)+"M" : n >= 1000 ? "$" + Math.round(n/1000)+"K" : "$"+Math.round(n);

interface OrgMetrics {
  jobs_total: number; jobs_mtd: number; jobs_ytd: number;
  revenue_ytd: number; revenue_mtd: number; revenue_last_mo: number;
  pipeline_value: number; pipeline_count: number;
  prospects_total: number; prospects_interested: number; prospects_converted: number;
  estimates_open: number; estimates_approved: number;
  invoices_unpaid_amt: number; signed_this_month: number;
}

interface Org {
  org_id: string; org_name: string; state: string; active: boolean;
  metrics: OrgMetrics | null;
}

interface Totals {
  revenue_ytd: number; revenue_mtd: number; pipeline_value: number;
  jobs_ytd: number; prospects_total: number; invoices_unpaid_amt: number; active_orgs: number;
}

interface DashData {
  parent: { name: string; orgs: number };
  totals: Totals;
  orgs: Org[];
  generated_at: string;
}

function Stat({ label, value, sub, color = "text-white" }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-gray-900 rounded-xl p-4">
      <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function OrgCard({ org }: { org: Org }) {
  const m = org.metrics;
  return (
    <div className={"rounded-2xl border p-6 " + (org.active ? "border-gray-700 bg-gray-800" : "border-gray-800 bg-gray-900 opacity-60")}>
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={"p-2 rounded-lg " + (org.active ? "bg-red-700" : "bg-gray-700")}>
            <MapPin className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="font-bold text-white text-lg">{org.org_name}</h3>
            <p className="text-xs text-gray-400">{org.state} · org_id: {org.org_id}</p>
          </div>
        </div>
        <span className={"text-xs font-semibold px-2.5 py-1 rounded-full " + (org.active ? "bg-green-900 text-green-300" : "bg-gray-800 text-gray-500")}>
          {org.active ? "Active" : "Planned"}
        </span>
      </div>

      {m ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Stat label="Revenue YTD"   value={fmtK(m.revenue_ytd)}   color="text-green-400" />
          <Stat label="Revenue MTD"   value={fmtK(m.revenue_mtd)}   sub={"Last mo: " + fmtK(m.revenue_last_mo)} />
          <Stat label="Pipeline"      value={fmtK(m.pipeline_value)} sub={m.pipeline_count + " estimates"} color="text-blue-400" />
          <Stat label="Jobs YTD"      value={String(m.jobs_ytd)}     sub={"MTD: " + m.jobs_mtd} />
          <Stat label="Prospects"     value={m.prospects_total.toLocaleString()} sub={m.prospects_interested + " interested · " + m.prospects_converted + " converted"} />
          <Stat label="AR Outstanding" value={fmtK(m.invoices_unpaid_amt)} color={m.invoices_unpaid_amt > 50000 ? "text-amber-400" : "text-white"} />
          <Stat label="Estimates Open" value={String(m.estimates_open)}    sub={m.estimates_approved + " approved"} />
          <Stat label="Signed (MTD)"  value={String(m.signed_this_month)} color="text-indigo-400" />
        </div>
      ) : (
        <div className="text-center py-8 text-gray-600">
          <Building2 className="w-10 h-10 mx-auto mb-2 opacity-40" />
          <p className="text-sm">Region not yet active</p>
          <p className="text-xs mt-1">Set up DB + org_id to activate</p>
        </div>
      )}
    </div>
  );
}

export default function RWCRDashboard() {
  const [data,    setData]    = useState<DashData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/rwcr");
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setData(d);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  if (loading) return (
    <div className="p-8 flex items-center justify-center min-h-96">
      <RefreshCw className="w-6 h-6 animate-spin text-gray-500" />
    </div>
  );

  if (error) return (
    <div className="p-8">
      <div className="flex items-center gap-2 text-red-400 bg-red-900/20 border border-red-800 rounded-xl p-4">
        <AlertCircle className="w-4 h-4" /> {error}
      </div>
    </div>
  );

  const t = data!.totals;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-[#1a3a5c] rounded-xl">
            <Building2 className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">RWCR, LLC</h1>
            <p className="text-sm text-gray-400">Parent company dashboard · {data!.orgs.length} regions</p>
          </div>
        </div>
        <button onClick={load} className="flex items-center gap-2 text-sm text-gray-400 hover:text-white border border-gray-700 rounded-lg px-3 py-2 transition-colors">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* Rolled-up totals */}
      <div className="bg-[#1a3a5c] rounded-2xl p-6">
        <h2 className="text-sm font-semibold text-blue-200 uppercase tracking-wider mb-4">Consolidated Metrics — All Regions</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {[
            { label: "Revenue YTD",   value: fmtK(t.revenue_ytd),         color: "text-green-300" },
            { label: "Revenue MTD",   value: fmtK(t.revenue_mtd),         color: "text-green-200" },
            { label: "Pipeline",      value: fmtK(t.pipeline_value),      color: "text-blue-200"  },
            { label: "Jobs YTD",      value: String(t.jobs_ytd),          color: "text-white"     },
            { label: "Prospects",     value: t.prospects_total.toLocaleString(), color: "text-white" },
            { label: "AR Outstanding",value: fmtK(t.invoices_unpaid_amt), color: "text-amber-300" },
          ].map(s => (
            <div key={s.label} className="text-center">
              <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-xs text-blue-300 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
        <p className="text-xs text-blue-400 mt-4">{t.active_orgs} active region · Data as of {new Date(data!.generated_at).toLocaleString("en-US", { timeZone: "America/Chicago", dateStyle: "short", timeStyle: "short" })} CT</p>
      </div>

      {/* Regional org cards */}
      <div>
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Regional Orgs</h2>
        <div className="space-y-4">
          {data!.orgs.map(org => <OrgCard key={org.org_id} org={org} />)}
        </div>
      </div>

      {/* How to expand */}
      <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6">
        <h3 className="font-semibold text-white mb-3">Adding a New Region (e.g. Roof Works of Colorado)</h3>
        <ol className="space-y-2 text-sm text-gray-400 list-decimal list-inside">
          <li>Register new LLC (e.g. <span className="text-gray-200">Roof Works of Colorado, LLC</span>) as subsidiary of RWCR, LLC</li>
          <li>Provision a new Postgres DB on the VPS (<code className="text-blue-300">createdb roofworks_co</code>)</li>
          <li>Run Prisma migrations against the new DB (<code className="text-blue-300">DATABASE_URL=... npx prisma migrate deploy</code>)</li>
          <li>Add <code className="text-blue-300">DB_CO=postgres://...</code> to .env.local and update this API to query it</li>
          <li>Update <code className="text-blue-300">org_id</code> in future_regions from "planned" to active</li>
        </ol>
      </div>
    </div>
  );
}
