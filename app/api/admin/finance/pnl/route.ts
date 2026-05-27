// app/api/admin/finance/pnl/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';

// Page sends: type=monthly|quarterly|annual  and  date=YYYY-MM (or YYYY for annual)
function getPeriodRange(type: string, dateStr: string): { start: Date; end: Date; label: string } {
  // Normalise: make sure we have at least YYYY-MM
  const normalised = dateStr.length === 4 ? `${dateStr}-01` : dateStr;
  const d = new Date(normalised + '-01');

  if (type === 'quarterly') {
    const q = Math.floor(d.getMonth() / 3);
    const start = new Date(d.getFullYear(), q * 3, 1);
    const end   = new Date(d.getFullYear(), q * 3 + 3, 0, 23, 59, 59, 999);
    const qNum  = q + 1;
    const label = `Q${qNum} ${d.getFullYear()}`;
    return { start, end, label };
  }

  if (type === 'annual') {
    const start = new Date(d.getFullYear(), 0, 1);
    const end   = new Date(d.getFullYear(), 11, 31, 23, 59, 59, 999);
    return { start, end, label: String(d.getFullYear()) };
  }

  // monthly (default)
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end   = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
  const label = start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  return { start, end, label };
}

function getPriorRange(type: string, start: Date, end: Date): { start: Date; end: Date } {
  const s = new Date(start), e = new Date(end);
  if (type === 'quarterly') { s.setMonth(s.getMonth() - 3); e.setMonth(e.getMonth() - 3); }
  else if (type === 'annual') { s.setFullYear(s.getFullYear() - 1); e.setFullYear(e.getFullYear() - 1); }
  else { s.setMonth(s.getMonth() - 1); e.setMonth(e.getMonth() - 1); }
  return { start: s, end: e };
}

async function calcPeriod(start: Date, end: Date) {
  const df = { gte: start, lte: end };

  const [
    invIssued, manIssued,
    pIn, mpIn,
    jcSum,
    expSum, expByCat,
    unpaidInvAgg, unpaidManAgg,
  ] = await Promise.all([
    prisma.invoices.aggregate({ _sum: { amount_due: true }, where: { issued_at: df } }),
    prisma.manual_invoices.aggregate({ _sum: { amount_due: true }, where: { issued_at: df } }),
    prisma.payments.aggregate({ _sum: { amount: true }, where: { paid_at: df } }),
    prisma.manual_payments.aggregate({ _sum: { amount: true }, where: { paid_at: df } }),
    prisma.job_costs.aggregate({ _sum: { amount: true }, where: { created_at: df } }),
    prisma.expenses.aggregate({ _sum: { amount: true }, where: { date: df } }),
    prisma.expenses.groupBy({ by: ['category'], _sum: { amount: true }, where: { date: df } }),
    prisma.invoices.aggregate({ _sum: { amount_due: true }, where: { issued_at: df, status: { not: 'PAID' } } }),
    prisma.manual_invoices.aggregate({ _sum: { amount_due: true }, where: { issued_at: df, status: { not: 'PAID' } } }),
  ]);

  const invoiced    = Math.round(((invIssued._sum.amount_due || 0) + (manIssued._sum.amount_due || 0)) * 100) / 100;
  const collected   = Math.round(((pIn._sum.amount || 0) + (mpIn._sum.amount || 0)) * 100) / 100;
  const outstanding = Math.round(((unpaidInvAgg._sum.amount_due || 0) + (unpaidManAgg._sum.amount_due || 0)) * 100) / 100;
  const job_costs   = Math.round((jcSum._sum.amount || 0) * 100) / 100;
  const general_expenses = Math.round((expSum._sum.amount || 0) * 100) / 100;

  const expense_breakdown: Record<string, number> = {};
  for (const row of expByCat) {
    expense_breakdown[row.category] = Math.round((row._sum.amount || 0) * 100) / 100;
  }

  const total_costs  = Math.round((job_costs + general_expenses) * 100) / 100;
  const net_profit   = Math.round((collected - total_costs) * 100) / 100;
  const margin_pct   = collected > 0 ? Math.round((net_profit / collected) * 1000) / 10 : 0;

  return {
    revenue: { invoiced, collected, outstanding },
    costs: { job_costs, general_expenses, expense_breakdown },
    net_profit,
    margin_pct,
    total_costs, // used internally for prior_period
  };
}

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();

    const { searchParams } = new URL(req.url);
    // Page sends ?type=monthly|quarterly|annual&date=YYYY-MM
    const type    = searchParams.get('type') || 'monthly';
    const dateStr = searchParams.get('date') || new Date().toISOString().slice(0, 7);

    const { start, end, label } = getPeriodRange(type, dateStr);
    const prior                 = getPriorRange(type, start, end);

    const [current, priorData] = await Promise.all([
      calcPeriod(start, end),
      calcPeriod(prior.start, prior.end),
    ]);

    return NextResponse.json({
      period_label: label,
      revenue:      current.revenue,
      costs:        current.costs,
      net_profit:   current.net_profit,
      margin_pct:   current.margin_pct,
      prior_period: {
        net_profit:        priorData.net_profit,
        revenue_collected: priorData.revenue.collected,
        total_costs:       priorData.total_costs,
      },
    });
  } catch (error: any) {
    if (error.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
