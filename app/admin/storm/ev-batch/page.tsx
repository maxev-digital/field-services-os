"use client";
import { useEffect, useState } from "react";
import { Satellite, RefreshCw, AlertCircle, CheckCircle2, Clock, ExternalLink, ChevronDown } from "lucide-react";

interface StormDate { storm_date: string; count: number; }
interface StormStats {
  prospects: { total: number; has_phone: number; has_email: number };
  ev_reports: { ordered: number; completed: number };
  recent_orders: { id: string; address: string; status: string; ev_order_id: number | null; created_at: string; pdf_url: string | null }[];
}

function fmtDate(d: string) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[parseInt(m)-1]} ${parseInt(day)}, ${y}`;
}

export default function EVBatchPage() {
  const [dates,     setDates]     = useState<StormDate[]>([]);
  const [stormDate, setStormDate] = useState<string>("");
  const [stats,     setStats]     = useState<StormStats | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [ordering,  setOrdering]  = useState(false);
  const [result,    setResult]    = useState<any>(null);
  const [error,     setError]     = useState("");
  const [filter,    setFilter]    = useState("has_phone");
  const [maxCount,  setMaxCount]  = useState(48);

  useEffect(() => {
    fetch("/api/admin/storm/ev-batch?dates=true")
      .then(r => r.json())
      .then(d => {
        const list: StormDate[] = d.dates ?? [];
        setDates(list);
        if (list.length > 0) setStormDate(list[0].storm_date);
        else setLoading(false);
      })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  useEffect(() => {
    if (!stormDate) return;
    setLoading(true); setStats(null); setResult(null); setError("");
    fetch("/api/admin/storm/ev-batch?storm_date=" + stormDate)
      .then(r => r.json())
      .then(d => setStats(d))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [stormDate]);

  async function placeOrders() {
    if (!stormDate) return;
    if (!confirm(
      "This will place REAL EagleView orders billed to your account.\n\n" +
      "Storm: " + fmtDate(stormDate) + "\nFilter: " + filter + "\nMax: " + maxCount + "\n" +
      "Est. cost: $" + (maxCount * 30) + "–$" + (maxCount * 75) + "\n\nProceed?"
    )) return;
    setOrdering(true); setResult(null); setError("");
    try {
      const r = await fetch("/api/admin/storm/ev-batch", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storm_date: stormDate, filter, max_count: maxCount }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setResult(d);
      const r2 = await fetch("/api/admin/storm/ev-batch?storm_date=" + stormDate);
      setStats(await r2.json());
    } catch (e: any) { setError(e.message); }
    finally { setOrdering(false); }
  }

  const statusColor = (s: string) =>
    s === "completed" ? "text-green-400" : s === "ordered" ? "text-blue-400" : "text-gray-400";
  const statusIcon = (s: string) =>
    s === "completed" ? <CheckCircle2 className="w-4 h-4 text-green-400" /> :
    s === "ordered"   ? <Clock        className="w-4 h-4 text-blue-400"  /> :
                        <RefreshCw    className="w-4 h-4 text-gray-400"  />;

  const filterLabel: Record<string, string> = {
    has_phone: "Has phone (callable leads)", has_email: "Has email",
    has_contact: "Has phone OR email", all: "All prospects with address",
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-700 rounded-xl"><Satellite className="w-5 h-5 text-white" /></div>
          <div>
            <h1 className="text-2xl font-bold text-white">EagleView Batch Orders</h1>
            <p className="text-sm text-gray-400">
              {stormDate ? fmtDate(stormDate) + " storm" : "Select a storm date"} · Production mode
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-400 uppercase tracking-wider whitespace-nowrap">Storm Date</label>
          <div className="relative">
            <select value={stormDate} onChange={e => setStormDate(e.target.value)}
              className="appearance-none bg-gray-800 border border-gray-600 text-white rounded-lg pl-3 pr-8 py-2 text-sm focus:outline-none focus:border-blue-500 cursor-pointer">
              {dates.length === 0 && <option value="">No storms in database</option>}
              {dates.map(d => (
                <option key={d.storm_date} value={d.storm_date}>
                  {fmtDate(d.storm_date)} · {d.count.toLocaleString()} prospects
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>
        </div>
      </div>

      {!loading && dates.length === 0 && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-8 text-center">
          <Satellite className="w-10 h-10 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400">No storm dates found. Generate storm prospects first.</p>
        </div>
      )}

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total Prospects", val: stats.prospects.total.toLocaleString(),     color: "text-white"       },
            { label: "Has Phone",       val: stats.prospects.has_phone.toLocaleString(),  color: "text-green-400"   },
            { label: "EV Ordered",      val: stats.ev_reports.ordered.toLocaleString(),   color: "text-blue-400"    },
            { label: "EV Completed",    val: stats.ev_reports.completed.toLocaleString(), color: "text-emerald-400" },
          ].map(s => (
            <div key={s.label} className="bg-gray-800 border border-gray-700 rounded-xl p-4 text-center">
              <div className={`text-2xl font-bold ${s.color}`}>{s.val}</div>
              <div className="text-xs text-gray-500 mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {stormDate && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 space-y-4">
          <h2 className="font-semibold text-white">Place Batch Orders</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-400 uppercase tracking-wider mb-2">Filter prospects</label>
              <select value={filter} onChange={e => setFilter(e.target.value)}
                className="w-full bg-gray-900 border border-gray-600 text-white rounded-lg px-3 py-2.5 text-sm">
                {Object.entries(filterLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 uppercase tracking-wider mb-2">
                Max orders (est. ${maxCount * 30}–${maxCount * 75})
              </label>
              <input type="number" value={maxCount} min={1} max={200}
                onChange={e => setMaxCount(parseInt(e.target.value) || 1)}
                className="w-full bg-gray-900 border border-gray-600 text-white rounded-lg px-3 py-2.5 text-sm" />
            </div>
          </div>
          <div className="flex items-start gap-3 bg-amber-900/30 border border-amber-700/50 rounded-lg p-3">
            <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-300">
              <strong>Production mode.</strong> Orders billed at $30–75/report. Reports appear on each estimate once completed.
            </p>
          </div>
          <button onClick={placeOrders} disabled={ordering || loading}
            className="flex items-center gap-2 bg-blue-700 hover:bg-blue-600 disabled:opacity-40 text-white font-bold px-6 py-3 rounded-lg text-sm transition-colors">
            {ordering
              ? <><RefreshCw className="w-4 h-4 animate-spin" /> Placing Orders...</>
              : <><Satellite className="w-4 h-4" /> Place Orders — {fmtDate(stormDate)}</>}
          </button>
        </div>
      )}

      {result && (
        <div className="bg-green-900/30 border border-green-700 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 className="w-5 h-5 text-green-400" />
            <span className="font-semibold text-green-300">Batch complete</span>
          </div>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div><div className="text-green-400 text-xl font-bold">{result.ordered}</div><div className="text-gray-400">Ordered</div></div>
            <div><div className="text-gray-400 text-xl font-bold">{result.skipped}</div><div className="text-gray-400">Skipped</div></div>
            <div><div className="text-red-400 text-xl font-bold">{result.failed}</div><div className="text-gray-400">Failed</div></div>
          </div>
          <p className="text-xs text-gray-400 mt-3">Est. cost: {result.cost_estimate} · Delivered within 48hrs</p>
          {result.errors?.length > 0 && (
            <details className="mt-3">
              <summary className="text-xs text-red-400 cursor-pointer">Errors ({result.errors.length})</summary>
              <div className="mt-2 space-y-1">
                {result.errors.map((e: string, i: number) => <div key={i} className="text-xs text-red-300 font-mono">{e}</div>)}
              </div>
            </details>
          )}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 bg-red-900/30 border border-red-800 text-red-300 rounded-xl p-4 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      {stats?.recent_orders?.length > 0 && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-700">
            <h2 className="font-semibold text-white text-sm">Recent Orders (All Storms)</h2>
          </div>
          <div className="divide-y divide-gray-700">
            {stats.recent_orders.map(o => (
              <div key={o.id} className="px-5 py-3 flex items-center justify-between gap-4">
                <div className="flex items-center gap-2 min-w-0">
                  {statusIcon(o.status)}
                  <div className="min-w-0">
                    <div className="text-sm text-white truncate">{o.address}</div>
                    <div className="text-xs text-gray-500">Order #{o.ev_order_id ?? "pending"} · {new Date(o.created_at).toLocaleDateString()}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className={"text-xs font-semibold " + statusColor(o.status)}>{o.status.toUpperCase()}</span>
                  {o.pdf_url && (
                    <a href={o.pdf_url} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">
                      <ExternalLink className="w-3 h-3" /> PDF
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading && stormDate && (
        <div className="text-center py-12 text-gray-500">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />Loading...
        </div>
      )}
    </div>
  );
}
