'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Search, ChevronUp, ChevronDown, Play, RefreshCw,
  Filter, DollarSign, MapPin, Zap, CheckSquare, Square
} from 'lucide-react'

interface StormArea {
  city:           string
  zip:            string
  count:          number
  max_hail:       number
  hail_tier:      string
  avg_value:      number
  max_value:      number
  priority_score: number
  est_skip_cost:  number
  est_call_cost:  number
  est_total_cost: number
}

interface AreaData {
  date:              string
  min_hail_size:     number
  total_properties:  number
  total_areas:       number
  est_total_cost:    number
  areas:             StormArea[]
  message?:          string
}

type SortKey = keyof StormArea
type SortDir = 'asc' | 'desc'

const HAIL_TIER_COLORS: Record<string, string> = {
  '3"+ Catastrophic':   'bg-red-900 text-red-200',
  '2"+ Major':          'bg-orange-900 text-orange-200',
  '1.5"+ Significant':  'bg-yellow-900 text-yellow-200',
  '1"+ Damaging':       'bg-lime-900 text-lime-200',
  '0.75"+ Moderate':    'bg-blue-900 text-blue-200',
}

function tierColor(tier: string) {
  return HAIL_TIER_COLORS[tier] || 'bg-gray-800 text-gray-300'
}

function stars(score: number) {
  const filled = Math.round((score / 100) * 5)
  return '★'.repeat(filled) + '☆'.repeat(5 - filled)
}

export default function CampaignsPage() {
  const [date, setDate]               = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`
  })
  const [dateInput, setDateInput]     = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  })
  const [minHail, setMinHail]         = useState('0.75')
  const [minValue, setMinValue]       = useState('')
  const [minCount, setMinCount]       = useState('')
  const [areaData, setAreaData]       = useState<AreaData | null>(null)
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState('')
  const [selected, setSelected]       = useState<Set<string>>(new Set())
  const [sortKey, setSortKey]         = useState<SortKey>('priority_score')
  const [sortDir, setSortDir]         = useState<SortDir>('desc')
  const [running, setRunning]         = useState(false)
  const [runResult, setRunResult]     = useState<any>(null)

  const fetchAreas = useCallback(async () => {
    setLoading(true)
    setError('')
    setAreaData(null)
    setSelected(new Set())
    setRunResult(null)
    try {
      const r = await fetch(`/api/admin/storm/areas?date=${date}&minHailSize=${minHail}`)
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Failed to load areas')
      setAreaData(d)
      // Auto-select areas with priority >= 60 and hail >= 1.0"
      const autoSelect = new Set(
        (d.areas || [])
          .filter((a: StormArea) => a.priority_score >= 60 && a.max_hail >= 1.0)
          .map((a: StormArea) => `${a.city}|${a.zip}`)
      )
      setSelected(autoSelect)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [date, minHail])

  const filteredAreas = (areaData?.areas || []).filter(a => {
    if (minValue && a.avg_value < parseInt(minValue)) return false
    if (minCount && a.count < parseInt(minCount)) return false
    return true
  })

  const sorted = [...filteredAreas].sort((a, b) => {
    const av = a[sortKey] as number, bv = b[sortKey] as number
    return sortDir === 'desc' ? bv - av : av - bv
  })

  const key = (a: StormArea) => `${a.city}|${a.zip}`

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortKey(k); setSortDir('desc') }
  }

  const toggleAll = () => {
    if (selected.size === filteredAreas.length) setSelected(new Set())
    else setSelected(new Set(filteredAreas.map(key)))
  }

  const selectedAreas  = filteredAreas.filter(a => selected.has(key(a)))
  const selCount       = selectedAreas.reduce((s, a) => s + a.count, 0)
  const selCost        = selectedAreas.reduce((s, a) => s + a.est_total_cost, 0)

  const runPipeline = async () => {
    if (!selectedAreas.length) return
    const cities = [...new Set(selectedAreas.map(a => a.city))]
    const zips   = selectedAreas.map(a => a.zip).filter(Boolean)
    if (!confirm(`Run pipeline for ${selectedAreas.length} areas (${selCount} properties)?\nEst. cost: $${selCost.toFixed(0)}`)) return
    setRunning(true)
    setRunResult(null)
    try {
      const r = await fetch('/api/admin/storm/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, min_hail_size: parseFloat(minHail), cities, zips, max_properties: selCount + 100 }),
      })
      const d = await r.json()
      setRunResult(d)
    } catch (e: any) {
      setRunResult({ error: e.message })
    } finally {
      setRunning(false)
    }
  }

  const SortIcon = ({ k }: { k: SortKey }) => sortKey === k
    ? (sortDir === 'desc' ? <ChevronDown className="w-3 h-3 inline ml-1" /> : <ChevronUp className="w-3 h-3 inline ml-1" />)
    : null

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-black text-white">Storm Campaign Manager</h1>
        <p className="text-gray-400 text-sm mt-1">Preview affected areas, select targets, and run pipeline in batches.</p>
      </div>

      {/* Controls */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 mb-4">
        <div className="flex flex-wrap gap-3 items-end">
          {/* Date */}
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wider block mb-1">Storm Date</label>
            <input
              type="date"
              value={dateInput}
              onChange={e => {
                setDateInput(e.target.value)
                setDate(e.target.value.replace(/-/g, ''))
              }}
              className="bg-gray-800 border border-gray-700 text-white text-sm rounded px-3 py-2 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Min Hail */}
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wider block mb-1">Min Hail Size</label>
            <select
              value={minHail}
              onChange={e => setMinHail(e.target.value)}
              className="bg-gray-800 border border-gray-700 text-white text-sm rounded px-3 py-2 focus:outline-none focus:border-blue-500"
            >
              <option value="0.75">0.75"+ Any Hail</option>
              <option value="1.0">1"+ Damaging</option>
              <option value="1.5">1.5"+ Significant</option>
              <option value="2.0">2"+ Major</option>
              <option value="3.0">3"+ Catastrophic</option>
            </select>
          </div>

          {/* Min Value */}
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wider block mb-1">Min Avg Value</label>
            <input
              type="number"
              placeholder="e.g. 250000"
              value={minValue}
              onChange={e => setMinValue(e.target.value)}
              className="bg-gray-800 border border-gray-700 text-white text-sm rounded px-3 py-2 w-36 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Min Count */}
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wider block mb-1">Min Properties</label>
            <input
              type="number"
              placeholder="e.g. 50"
              value={minCount}
              onChange={e => setMinCount(e.target.value)}
              className="bg-gray-800 border border-gray-700 text-white text-sm rounded px-3 py-2 w-28 focus:outline-none focus:border-blue-500"
            />
          </div>

          <button
            onClick={fetchAreas}
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded transition-colors disabled:opacity-40"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            {loading ? 'Loading...' : 'Preview Areas'}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/40 border border-red-700 text-red-300 text-sm rounded px-4 py-3 mb-4">{error}</div>
      )}

      {areaData?.message && !areaData.areas.length && (
        <div className="bg-gray-800 border border-gray-700 text-gray-400 text-sm rounded px-4 py-6 text-center">{areaData.message}</div>
      )}

      {areaData && areaData.areas.length > 0 && (
        <>
          {/* Summary strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {[
              { label: 'Total Areas',      value: areaData.total_areas,                        icon: <MapPin className="w-4 h-4" />    },
              { label: 'Total Properties', value: areaData.total_properties.toLocaleString(),  icon: <Filter className="w-4 h-4" />   },
              { label: 'Est. Total Cost',  value: `$${areaData.est_total_cost.toFixed(0)}`,    icon: <DollarSign className="w-4 h-4"/>  },
              { label: 'Selected',         value: `${selectedAreas.length} areas · ${selCount} props · $${selCost.toFixed(0)}`, icon: <Zap className="w-4 h-4" /> },
            ].map(({ label, value, icon }) => (
              <div key={label} className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 flex items-center gap-3">
                <div className="text-blue-400">{icon}</div>
                <div>
                  <div className="text-xs text-gray-400">{label}</div>
                  <div className="text-sm font-bold text-white">{value}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Run bar */}
          <div className="bg-gradient-to-r from-green-900 to-green-800 border border-green-700 rounded-lg px-5 py-4 mb-4 flex items-center gap-4 flex-wrap">
            <span className="text-xs font-black text-green-200 uppercase tracking-widest">Run Pipeline</span>
            <span className="text-xs text-green-300">{selectedAreas.length} areas · {selCount.toLocaleString()} properties · ~${selCost.toFixed(0)}</span>
            <button
              onClick={runPipeline}
              disabled={running || !selectedAreas.length}
              className="ml-auto flex items-center gap-2 px-5 py-2 bg-white text-green-900 text-sm font-black rounded hover:bg-green-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Play className="w-4 h-4" />
              {running ? 'Running...' : 'Run Selected Areas'}
            </button>
          </div>

          {runResult && (
            <div className={`border rounded-lg px-5 py-4 mb-4 text-sm ${runResult.error ? 'bg-red-900/30 border-red-700 text-red-300' : 'bg-green-900/30 border-green-700 text-green-200'}`}>
              {runResult.error ? `❌ ${runResult.error}` : (
                <div className="space-y-1">
                  <div>✅ <strong>Leads:</strong> {runResult.steps?.generate_leads?.created ?? 0} created</div>
                  <div>✅ <strong>Skip trace:</strong> {runResult.steps?.skip_trace?.found ?? 0} phones found</div>
                  <div>{runResult.steps?.voice_campaign?.skipped
                    ? `⏰ Voice: ${runResult.steps.voice_campaign.reason}`
                    : `✅ Voice: ${runResult.steps?.voice_campaign?.dispatched ?? 0} calls dispatched`}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Table */}
          <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-xs text-gray-400 uppercase tracking-wider">
                  <th className="px-4 py-3 text-left w-8">
                    <button onClick={toggleAll}>
                      {selected.size === filteredAreas.length
                        ? <CheckSquare className="w-4 h-4 text-blue-400" />
                        : <Square className="w-4 h-4" />}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left cursor-pointer hover:text-white" onClick={() => toggleSort('city')}>
                    City / Zip <SortIcon k="city" />
                  </th>
                  <th className="px-4 py-3 text-left">Hail</th>
                  <th className="px-4 py-3 text-right cursor-pointer hover:text-white" onClick={() => toggleSort('count')}>
                    Props <SortIcon k="count" />
                  </th>
                  <th className="px-4 py-3 text-right cursor-pointer hover:text-white" onClick={() => toggleSort('avg_value')}>
                    Avg Value <SortIcon k="avg_value" />
                  </th>
                  <th className="px-4 py-3 text-center cursor-pointer hover:text-white" onClick={() => toggleSort('priority_score')}>
                    Priority <SortIcon k="priority_score" />
                  </th>
                  <th className="px-4 py-3 text-right cursor-pointer hover:text-white" onClick={() => toggleSort('est_total_cost')}>
                    Est Cost <SortIcon k="est_total_cost" />
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((area, i) => {
                  const k   = key(area)
                  const sel = selected.has(k)
                  return (
                    <tr
                      key={k}
                      onClick={() => setSelected(prev => {
                        const next = new Set(prev)
                        sel ? next.delete(k) : next.add(k)
                        return next
                      })}
                      className={`border-b border-gray-800/50 cursor-pointer transition-colors
                        ${sel ? 'bg-blue-950/40 hover:bg-blue-950/60' : 'hover:bg-gray-800/40'}
                        ${i % 2 === 0 ? '' : 'bg-gray-800/10'}`}
                    >
                      <td className="px-4 py-3">
                        {sel
                          ? <CheckSquare className="w-4 h-4 text-blue-400" />
                          : <Square className="w-4 h-4 text-gray-600" />}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-white">{area.city}</div>
                        {area.zip && <div className="text-xs text-gray-500">{area.zip}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-bold px-2 py-1 rounded ${tierColor(area.hail_tier)}`}>
                          {area.max_hail}"
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-white font-mono">{area.count.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right text-gray-300">
                        {area.avg_value ? `$${(area.avg_value / 1000).toFixed(0)}k` : '—'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs font-mono ${area.priority_score >= 75 ? 'text-yellow-400' : area.priority_score >= 50 ? 'text-blue-400' : 'text-gray-500'}`}>
                          {stars(area.priority_score)}
                        </span>
                        <div className="text-xs text-gray-500">{area.priority_score}/100</div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-gray-300">
                        ${area.est_total_cost.toFixed(0)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {sorted.length === 0 && (
              <div className="px-4 py-8 text-center text-gray-500 text-sm">No areas match your filters.</div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
