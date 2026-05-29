'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Zap, RefreshCw, Play, CheckCircle, AlertCircle, Clock,
  CloudLightning, Phone, Users, TrendingUp, MapPin, Activity,
  DollarSign, ShieldAlert,
} from 'lucide-react';

interface SpcLive {
  date: string;
  tx_reports: number;
}

interface StormEvent {
  date:         string;
  dfw_hail:     number;
  max_hail_in:  number;
  has_dfw_hail: boolean;
  prospects:    number;
  with_phone:   number;
  contacted:    number;
  interested:   number;
  converted:    number;
  total_calls:  number;
  answered:     number;
  pipeline_ran: boolean;
}

interface OpsData {
  events:   StormEvent[];
  spc_live: { today: SpcLive; yesterday: SpcLive };
}

const COST_PER_RECORD = 0.12;
const BATCH_OPTIONS   = [50, 100, 200, 500];

function hailLabel(sizeIn: number) {
  if (sizeIn >= 3.0) return { label: '3"+ Catastrophic', color: 'text-purple-400' };
  if (sizeIn >= 2.0) return { label: '2"+ Major',        color: 'text-red-400'    };
  if (sizeIn >= 1.5) return { label: '1.5"+ Significant',color: 'text-orange-400' };
  if (sizeIn >= 1.0) return { label: '1"+ Damaging',     color: 'text-yellow-400' };
  if (sizeIn > 0)    return { label: 'Moderate',          color: 'text-green-400'  };
  return { label: '—', color: 'text-gray-500' };
}

export default function StormOperationsPage() {
  const [data,    setData]    = useState<OpsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, any>>({});
  const [manDate, setManDate] = useState('');
  const [error,   setError]   = useState('');

  // Skip-trace authorization state
  const [stDate,    setStDate]    = useState('');
  const [stBatch,   setStBatch]   = useState(100);
  const [stConfirm, setStConfirm] = useState(false);
  const [stRunning, setStRunning] = useState(false);
  const [stResult,  setStResult]  = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const r = await fetch('/api/admin/storm/operations');
      if (!r.ok) throw new Error('Failed to load');
      setData(await r.json());
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function runPipeline(dateCompact: string, force = false) {
    setRunning(dateCompact);
    setResults(prev => ({ ...prev, [dateCompact]: null }));
    try {
      const r = await fetch('/api/admin/storm/operations', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ date: dateCompact, force }),
      });
      const d = await r.json();
      setResults(prev => ({ ...prev, [dateCompact]: d }));
      await load();
    } catch (e: any) {
      setResults(prev => ({ ...prev, [dateCompact]: { error: e.message } }));
    }
    setRunning(null);
  }

  async function authorizeSkipTrace() {
    if (!stDate || !stConfirm) return;
    setStRunning(true);
    setStResult(null);
    try {
      // Fetch prospect IDs for this date without phones, up to batch size
      const pr = await fetch(`/api/admin/prospects?storm_date=${stDate}&has_phone=0&limit=${stBatch}`);
      const pd = await pr.json();
      const ids: string[] = (pd.prospects || []).map((p: any) => p.id);
      if (ids.length === 0) {
        setStResult({ message: 'All prospects for this date already have phone numbers.', found: 0 });
        setStRunning(false);
        setStConfirm(false);
        return;
      }
      const st = await fetch('/api/admin/prospects/skip-trace', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ prospect_ids: ids }),
      });
      const sd = await st.json();
      setStResult(sd);
      await load();
    } catch (e: any) {
      setStResult({ error: e.message });
    }
    setStRunning(false);
    setStConfirm(false);
  }

  function dateToCompact(iso: string) { return iso.replace(/-/g, ''); }

  // Dates that have prospects missing phones — available for skip-trace
  const skipTraceDates = (data?.events || []).filter(e => e.prospects > 0 && e.with_phone < e.prospects);
  const selectedEvent  = skipTraceDates.find(e => e.date === stDate);
  const needsPhone     = selectedEvent ? selectedEvent.prospects - selectedEvent.with_phone : 0;
  const batchActual    = Math.min(stBatch, needsPhone);
  const batchCost      = (batchActual * COST_PER_RECORD).toFixed(2);

  const spc = data?.spc_live;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-yellow-700 rounded-xl">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Storm Pipeline Operations</h1>
            <p className="text-sm text-gray-400">Auto-detection · Lead generation · Manual skip-trace auth</p>
          </div>
        </div>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-2 bg-gray-800 border border-gray-700 text-gray-300 px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-900/30 border border-red-700 text-red-300 rounded-lg p-3 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      {/* Live SPC Activity */}
      {spc && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            { label: 'Today',     d: spc.today     },
            { label: 'Yesterday', d: spc.yesterday },
          ].map(({ label, d }) => (
            <div key={label} className="bg-gray-800 border border-gray-700 rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">{label} SPC — {d.date}</span>
                <div className={`flex items-center gap-1.5 text-xs font-bold px-2 py-1 rounded-full ${
                  d.tx_reports > 0 ? 'bg-red-900/40 text-red-400 border border-red-700' :
                  d.tx_reports === 0 ? 'bg-gray-700 text-gray-400' : 'bg-gray-700 text-gray-500'
                }`}>
                  <Activity className="w-3 h-3" />
                  {d.tx_reports < 0 ? 'N/A' : d.tx_reports === 0 ? 'No TX Hail' : `${d.tx_reports} TX Reports`}
                </div>
              </div>
              {d.tx_reports > 0 && (
                <button
                  onClick={() => runPipeline(dateToCompact(d.date))}
                  disabled={running === dateToCompact(d.date)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-yellow-600 hover:bg-yellow-500 disabled:opacity-50 text-white text-sm font-bold rounded-lg transition-colors mt-2"
                >
                  {running === dateToCompact(d.date)
                    ? <><RefreshCw className="w-4 h-4 animate-spin" /> Generating leads...</>
                    : <><Play className="w-4 h-4" /> Generate Leads for {d.date}</>
                  }
                </button>
              )}
              {results[dateToCompact(d.date)] && (
                <PipelineResult result={results[dateToCompact(d.date)]} />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Manual lead generation trigger */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
          <CloudLightning className="w-3.5 h-3.5 text-yellow-400" /> Manual Lead Generation
        </h2>
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <label className="text-xs text-gray-400 block mb-1">Storm Date</label>
            <input type="date" value={manDate} onChange={e => setManDate(e.target.value)}
              className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-500" />
          </div>
          <button
            onClick={() => manDate && runPipeline(manDate.replace(/-/g, ''), true)}
            disabled={!manDate || running === manDate.replace(/-/g, '')}
            className="flex items-center gap-2 px-4 py-2 bg-orange-700 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            {running === manDate.replace(/-/g, '')
              ? <><RefreshCw className="w-4 h-4 animate-spin" /> Running...</>
              : <><Play className="w-4 h-4" /> Force Run</>
            }
          </button>
          <p className="text-xs text-gray-500">Force re-runs even if prospects exist. Free — no charges.</p>
        </div>
        {manDate && results[manDate.replace(/-/g, '')] && (
          <div className="mt-3">
            <PipelineResult result={results[manDate.replace(/-/g, '')]} />
          </div>
        )}
      </div>

      {/* ── Skip-Trace Authorization Panel ───────────────────────────────────── */}
      <div className="bg-gray-800 border border-amber-700/50 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <ShieldAlert className="w-4 h-4 text-amber-400" />
          <h2 className="text-sm font-bold text-amber-300">Skip-Trace Authorization</h2>
          <span className="ml-auto text-xs text-gray-500 bg-gray-700 px-2 py-0.5 rounded-full">
            ${COST_PER_RECORD.toFixed(2)}/record · BatchData
          </span>
        </div>

        {skipTraceDates.length === 0 ? (
          <p className="text-sm text-gray-500 italic">
            No storm dates currently need skip-trace — all prospects either have phones or no leads generated yet.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-4 items-end">
              {/* Date selector */}
              <div>
                <label className="text-xs text-gray-400 block mb-1">Storm Date</label>
                <select
                  value={stDate}
                  onChange={e => { setStDate(e.target.value); setStConfirm(false); setStResult(null); }}
                  className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500 min-w-[180px]"
                >
                  <option value="">Select date…</option>
                  {skipTraceDates.map(e => (
                    <option key={e.date} value={e.date}>
                      {e.date} — {(e.prospects - e.with_phone).toLocaleString()} need phones
                    </option>
                  ))}
                </select>
              </div>

              {/* Batch size selector */}
              <div>
                <label className="text-xs text-gray-400 block mb-1">Batch Size</label>
                <div className="flex gap-2">
                  {BATCH_OPTIONS.map(n => (
                    <button
                      key={n}
                      onClick={() => { setStBatch(n); setStConfirm(false); }}
                      className={`px-3 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                        stBatch === n
                          ? 'bg-amber-700 border-amber-500 text-white'
                          : 'bg-gray-700 border-gray-600 text-gray-300 hover:border-gray-500'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Cost preview */}
            {stDate && (
              <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400">Prospects needing phones</span>
                  <span className="text-white font-semibold">{needsPhone.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400">This batch will process</span>
                  <span className="text-white font-semibold">{batchActual.toLocaleString()} records</span>
                </div>
                <div className="flex items-center justify-between text-sm border-t border-gray-700 pt-2 mt-2">
                  <span className="text-amber-300 font-bold flex items-center gap-1">
                    <DollarSign className="w-3.5 h-3.5" /> Estimated charge
                  </span>
                  <span className="text-amber-300 font-bold text-base">${batchCost}</span>
                </div>
                <p className="text-xs text-gray-500">
                  {batchActual} × ${COST_PER_RECORD.toFixed(2)} = ${batchCost} billed to BatchData account.
                  Cost is auto-logged to campaign costs.
                </p>

                {!stConfirm ? (
                  <button
                    onClick={() => setStConfirm(true)}
                    disabled={batchActual === 0}
                    className="w-full mt-2 flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-700 hover:bg-amber-600 disabled:opacity-40 text-white text-sm font-bold rounded-lg transition-colors"
                  >
                    <Phone className="w-4 h-4" />
                    Authorize Skip-Trace — ${batchCost}
                  </button>
                ) : (
                  <div className="mt-2 space-y-2">
                    <div className="flex items-center gap-2 bg-amber-900/30 border border-amber-700 rounded-lg px-3 py-2 text-xs text-amber-300">
                      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                      This will charge <strong>${batchCost}</strong> to your BatchData account. Confirm to proceed.
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={authorizeSkipTrace}
                        disabled={stRunning}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white text-sm font-bold rounded-lg transition-colors"
                      >
                        {stRunning
                          ? <><RefreshCw className="w-4 h-4 animate-spin" /> Running skip-trace...</>
                          : <><CheckCircle className="w-4 h-4" /> Confirm — Charge ${batchCost}</>
                        }
                      </button>
                      <button
                        onClick={() => setStConfirm(false)}
                        disabled={stRunning}
                        className="px-4 py-2.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded-lg transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Skip-trace result */}
            {stResult && (
              <div className={`rounded-lg p-3 text-sm ${stResult.error ? 'bg-red-900/20 border border-red-700 text-red-300' : 'bg-green-900/20 border border-green-700 text-green-300'}`}>
                {stResult.error ? (
                  <span className="flex items-center gap-1"><AlertCircle className="w-4 h-4" /> {stResult.error}</span>
                ) : stResult.message ? (
                  <span>{stResult.message}</span>
                ) : (
                  <span className="flex items-center gap-1">
                    <CheckCircle className="w-4 h-4" />
                    Sent {stResult.total_sent?.toLocaleString()} · Found {stResult.found?.toLocaleString()} phones · {stResult.cost_logged}
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Storm history table */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-700">
          <h2 className="text-sm font-bold text-white">Storm History (Last 21 Days)</h2>
          <p className="text-xs text-gray-500 mt-0.5">Leads generate automatically · Skip-trace authorized above</p>
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700 text-xs text-gray-400 uppercase tracking-wider">
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-center">DFW Reports</th>
                  <th className="px-4 py-3 text-center">Max Hail</th>
                  <th className="px-4 py-3 text-center">Prospects</th>
                  <th className="px-4 py-3 text-center">Phones</th>
                  <th className="px-4 py-3 text-center">Calls</th>
                  <th className="px-4 py-3 text-center">Interested</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700/50">
                {(data?.events || []).map(e => {
                  const hail      = hailLabel(e.max_hail_in);
                  const dc        = e.date.replace(/-/g, '');
                  const isRunning = running === dc;
                  const noPhone   = e.prospects - e.with_phone;
                  return (
                    <tr key={e.date} className="hover:bg-gray-700/20 transition-colors">
                      <td className="px-4 py-3">
                        <span className={`font-mono font-bold text-sm ${e.has_dfw_hail ? 'text-yellow-400' : 'text-gray-400'}`}>
                          {e.date}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {e.dfw_hail > 0
                          ? <span className="text-white font-semibold">{e.dfw_hail}</span>
                          : <span className="text-gray-600">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {e.max_hail_in > 0
                          ? <span className={`font-semibold text-xs ${hail.color}`}>{e.max_hail_in.toFixed(2)}"</span>
                          : <span className="text-gray-600">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {e.prospects > 0
                          ? <span className="text-white font-semibold">{e.prospects.toLocaleString()}</span>
                          : <span className="text-gray-600">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {e.with_phone > 0 ? (
                          <span className="text-green-400 font-semibold">{e.with_phone.toLocaleString()}</span>
                        ) : e.prospects > 0 ? (
                          <button
                            onClick={() => { setStDate(e.date); setStConfirm(false); setStResult(null); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                            className="text-xs text-amber-400 hover:text-amber-300 underline underline-offset-2"
                          >
                            {noPhone.toLocaleString()} need phones
                          </button>
                        ) : (
                          <span className="text-gray-600">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {e.total_calls > 0
                          ? <span className="text-blue-400">{e.total_calls}</span>
                          : <span className="text-gray-600">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {e.interested > 0
                          ? <span className="text-emerald-400 font-bold">{e.interested}</span>
                          : <span className="text-gray-600">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {e.pipeline_ran ? (
                          <span className="inline-flex items-center gap-1 text-xs text-green-400">
                            <CheckCircle className="w-3 h-3" /> Done
                          </span>
                        ) : e.has_dfw_hail ? (
                          <span className="inline-flex items-center gap-1 text-xs text-orange-400">
                            <Clock className="w-3 h-3" /> Pending
                          </span>
                        ) : (
                          <span className="text-xs text-gray-600">No DFW hail</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {e.has_dfw_hail && (
                          <button
                            onClick={() => runPipeline(dc, e.pipeline_ran)}
                            disabled={isRunning}
                            className="px-2.5 py-1 bg-gray-700 hover:bg-yellow-700 disabled:opacity-50 text-xs text-white rounded-lg transition-colors"
                          >
                            {isRunning
                              ? <RefreshCw className="w-3 h-3 animate-spin inline" />
                              : e.pipeline_ran ? 'Re-run Leads' : 'Run Leads'
                            }
                          </button>
                        )}
                        {results[dc] && (
                          <div className="mt-1">
                            <PipelineResult result={results[dc]} compact />
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* How automation works */}
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-5">
        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
          <Zap className="w-3.5 h-3.5 text-yellow-400" /> How the Pipeline Works
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          {[
            { icon: CloudLightning, step: '1', label: 'Detect (Auto)',   desc: 'SPC reports checked every 30 min — today + yesterday (CDT). Free.', color: 'text-yellow-400' },
            { icon: MapPin,         step: '2', label: 'Generate (Auto)', desc: 'SPC hail points → circle polygons → parcel DB intersection. Free.', color: 'text-orange-400' },
            { icon: Phone,          step: '3', label: 'Skip-Trace (Manual)', desc: 'You authorize in batches above. $0.12/record billed to BatchData.', color: 'text-amber-400' },
            { icon: TrendingUp,     step: '4', label: 'Notify',          desc: 'Telegram + email after lead gen. Skip-trace link sent for auth.', color: 'text-green-400' },
          ].map(({ icon: Icon, step, label, desc, color }) => (
            <div key={step} className="flex items-start gap-3">
              <div className={`w-6 h-6 rounded-full bg-gray-700 flex items-center justify-center flex-shrink-0 text-xs font-bold ${color}`}>{step}</div>
              <div>
                <div className={`text-sm font-semibold ${color}`}>{label}</div>
                <div className="text-xs text-gray-500 mt-0.5">{desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PipelineResult({ result, compact = false }: { result: any; compact?: boolean }) {
  if (!result) return null;
  if (result.error) return (
    <div className={`text-red-400 text-xs mt-1 flex items-center gap-1 ${compact ? '' : 'bg-red-900/20 rounded p-2'}`}>
      <AlertCircle className="w-3 h-3" /> {result.error}
    </div>
  );
  if (result.skipped) return (
    <div className={`text-yellow-400 text-xs mt-1 ${compact ? '' : 'bg-yellow-900/20 rounded p-2'}`}>
      ⚠ {result.reason}
    </div>
  );
  const leads = result.steps?.generate_leads?.created ?? 0;
  return (
    <div className={`text-green-400 text-xs mt-1 ${compact ? '' : 'bg-green-900/20 rounded p-2'}`}>
      <CheckCircle className="w-3 h-3 inline mr-1" />
      {leads.toLocaleString()} leads generated
      {result.steps?.generate_leads?.mode === 'spc_circles' && (
        <span className="ml-1 text-yellow-400">[SPC mode]</span>
      )}
    </div>
  );
}
