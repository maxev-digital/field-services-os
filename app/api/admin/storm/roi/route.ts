/**
 * GET /api/admin/storm/roi
 * ROI summary per storm event — prospects, contacts, conversions, costs, revenue.
 * Revenue uses actual job/invoice data where available, falls back to $8,500 avg per conversion.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';

const AVG_JOB_VALUE = 8500; // fallback when no real invoice data exists

export async function GET(req: NextRequest) {
  try { await requireAdmin(); } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Storm-level prospect stats
  const prospectStats = await prisma.$queryRaw<any[]>`
    SELECT
      storm_date,
      COUNT(*)                                                    AS total_prospects,
      SUM(CASE WHEN status = 'CONTACTED'  THEN 1 ELSE 0 END)    AS contacted,
      SUM(CASE WHEN status = 'INTERESTED' THEN 1 ELSE 0 END)    AS interested,
      SUM(CASE WHEN status = 'CONVERTED'  THEN 1 ELSE 0 END)    AS converted,
      SUM(CASE WHEN status = 'DNC'        THEN 1 ELSE 0 END)    AS dnc,
      SUM(CASE WHEN phone IS NOT NULL     THEN 1 ELSE 0 END)    AS with_phone
    FROM storm_prospects
    WHERE storm_date IS NOT NULL
    GROUP BY storm_date
    ORDER BY storm_date DESC
    LIMIT 20
  `;

  // Call stats per storm date
  const callStats = await prisma.$queryRaw<any[]>`
    SELECT
      sp.storm_date,
      COUNT(rc.id)                                                    AS total_calls,
      SUM(rc.duration_seconds)                                        AS total_seconds,
      SUM(CASE WHEN rc.duration_seconds > 10 THEN 1 ELSE 0 END)      AS answered_calls,
      AVG(CASE WHEN rc.duration_seconds > 0 THEN rc.duration_seconds END) AS avg_duration
    FROM retell_calls rc
    JOIN storm_prospects sp ON rc.prospect_id = sp.id
    WHERE sp.storm_date IS NOT NULL
    GROUP BY sp.storm_date
    ORDER BY sp.storm_date DESC
    LIMIT 20
  `;

  // Campaign costs per storm date
  const costs = await prisma.$queryRaw<any[]>`
    SELECT
      campaign_id,
      SUM(amount_cents)                                                       AS total_cents,
      SUM(CASE WHEN category = 'skip_trace'   THEN amount_cents ELSE 0 END)  AS skip_trace_cents,
      SUM(CASE WHEN category = 'retell_calls' THEN amount_cents ELSE 0 END)  AS calls_cents,
      SUM(CASE WHEN category = 'sms'          THEN amount_cents ELSE 0 END)  AS sms_cents
    FROM campaign_costs
    WHERE campaign_id IS NOT NULL
    GROUP BY campaign_id
    ORDER BY campaign_id DESC
    LIMIT 20
  `;

  // Actual revenue from jobs linked to converted storm prospects (phone match)
  // storm_prospects.phone → customers.phone → jobs → estimates.our_total / invoices.amount_paid
  const revenueStats = await prisma.$queryRaw<any[]>`
    SELECT
      sp.storm_date,
      COUNT(DISTINCT j.id)::int                                             AS actual_jobs,
      COALESCE(SUM(e.our_total), 0)                                         AS contracted_value,
      COALESCE(SUM(CASE WHEN i.status = 'PAID' THEN i.amount_paid ELSE 0 END), 0) AS revenue_collected,
      COALESCE(SUM(i.amount_paid), 0)                                       AS revenue_invoiced
    FROM storm_prospects sp
    JOIN customers c
      ON REGEXP_REPLACE(c.phone, '[^0-9]', '', 'g') = RIGHT(REGEXP_REPLACE(sp.phone, '[^0-9]', '', 'g'), 10)
    JOIN jobs j ON j.customer_id = c.id
    LEFT JOIN estimates e ON e.id = j.estimate_id
    LEFT JOIN invoices i ON i.estimate_id = e.id
    WHERE sp.storm_date IS NOT NULL
      AND sp.status = 'CONVERTED'
    GROUP BY sp.storm_date
    ORDER BY sp.storm_date DESC
    LIMIT 20
  `;

  // Build indexed maps
  const callMap    = new Map(callStats.map((r: any)    => [r.storm_date, r]));
  const costMap    = new Map(costs.map((r: any)        => [r.campaign_id, r]));
  const revenueMap = new Map(revenueStats.map((r: any) => [r.storm_date, r]));

  const storms = prospectStats.map((r: any) => {
    const stormDate = r.storm_date as string;
    const calls     = callMap.get(stormDate)    || {};
    const dateCompact = stormDate.replace(/-/g, '');
    const cost      = costMap.get(stormDate) || costMap.get(dateCompact) || {};
    const rev       = revenueMap.get(stormDate) || {};

    const totalProspects    = Number(r.total_prospects);
    const contacted         = Number(r.contacted);
    const interested        = Number(r.interested);
    const converted         = Number(r.converted);
    const withPhone         = Number(r.with_phone);
    const totalCalls        = Number(calls.total_calls    || 0);
    const answeredCalls     = Number(calls.answered_calls || 0);
    const totalSeconds      = Number(calls.total_seconds  || 0);
    const avgDuration       = Number(calls.avg_duration   || 0);
    const totalCostCents    = Number(cost.total_cents      || 0);
    const skipCostCents     = Number(cost.skip_trace_cents || 0);
    const callCostCents     = Number(cost.calls_cents      || 0);

    const actualJobs        = Number(rev.actual_jobs        || 0);
    const contractedValue   = Number(rev.contracted_value   || 0);
    const revenueCollected  = Number(rev.revenue_collected  || 0);
    const revenueInvoiced   = Number(rev.revenue_invoiced   || 0);

    // Revenue: use real contracted value if jobs exist, else estimate from conversion count
    const hasRealData  = actualJobs > 0;
    const estRevenue   = hasRealData
      ? contractedValue                          // actual signed job value
      : converted * AVG_JOB_VALUE;              // fallback projection

    const totalCost    = totalCostCents / 100;
    const estROI       = totalCost > 0
      ? ((estRevenue - totalCost) / totalCost) * 100
      : null;
    const costPerLead  = totalProspects > 0 ? totalCost / totalProspects : 0;
    const costPerBooked = interested > 0 ? totalCost / interested : null;
    const answerRate   = totalCalls > 0 ? (answeredCalls / totalCalls) * 100 : 0;
    const conversionRate = interested > 0 ? (converted / interested) * 100 : 0;
    const bookingRate  = withPhone > 0 ? (interested / withPhone) * 100 : 0;

    return {
      storm_date:         stormDate,
      total_prospects:    totalProspects,
      with_phone:         withPhone,
      contacted,
      interested,
      converted,
      dnc:                Number(r.dnc),
      total_calls:        totalCalls,
      answered_calls:     answeredCalls,
      total_minutes:      Math.round(totalSeconds / 60),
      avg_duration_s:     Math.round(avgDuration),
      answer_rate:        Math.round(answerRate * 10) / 10,
      booking_rate:       Math.round(bookingRate * 10) / 10,
      conversion_rate:    Math.round(conversionRate * 10) / 10,
      cost_total:         totalCost,
      cost_skip_trace:    skipCostCents / 100,
      cost_calls:         callCostCents / 100,
      cost_per_lead:      Math.round(costPerLead * 100) / 100,
      cost_per_booked:    costPerBooked !== null ? Math.round(costPerBooked * 100) / 100 : null,
      // Revenue fields
      actual_jobs:        actualJobs,
      contracted_value:   contractedValue,
      revenue_collected:  revenueCollected,
      revenue_invoiced:   revenueInvoiced,
      est_revenue:        estRevenue,
      revenue_is_actual:  hasRealData,
      est_roi_pct:        estROI !== null ? Math.round(estROI) : null,
    };
  });

  const totals = storms.reduce((acc, s) => ({
    total_prospects:   acc.total_prospects   + s.total_prospects,
    interested:        acc.interested        + s.interested,
    converted:         acc.converted         + s.converted,
    total_calls:       acc.total_calls       + s.total_calls,
    total_minutes:     acc.total_minutes     + s.total_minutes,
    cost_total:        acc.cost_total        + s.cost_total,
    contracted_value:  acc.contracted_value  + s.contracted_value,
    revenue_collected: acc.revenue_collected + s.revenue_collected,
    est_revenue:       acc.est_revenue       + s.est_revenue,
    actual_jobs:       acc.actual_jobs       + s.actual_jobs,
  }), {
    total_prospects: 0, interested: 0, converted: 0,
    total_calls: 0, total_minutes: 0, cost_total: 0,
    contracted_value: 0, revenue_collected: 0, est_revenue: 0, actual_jobs: 0,
  });

  return NextResponse.json({ storms, totals });
}
