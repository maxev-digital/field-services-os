// app/api/admin/finance/cashflow/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();

    const now = new Date();

    // ── 6-month chart ──────────────────────────────────────────────────────
    const monthly_chart: { month: string; cash_in: number; cash_out: number }[] = [];

    for (let i = 5; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end   = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999);
      const df    = { gte: start, lte: end };

      const [pIn, mpIn, expOut, jcOut] = await Promise.all([
        prisma.payments.aggregate({ _sum: { amount: true }, where: { paid_at: df } }),
        prisma.manual_payments.aggregate({ _sum: { amount: true }, where: { paid_at: df } }),
        prisma.expenses.aggregate({ _sum: { amount: true }, where: { date: df } }),
        prisma.job_costs.aggregate({ _sum: { amount: true }, where: { created_at: df } }),
      ]);

      monthly_chart.push({
        month: start.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
        cash_in:  Math.round(((pIn._sum.amount  || 0) + (mpIn._sum.amount  || 0)) * 100) / 100,
        cash_out: Math.round(((expOut._sum.amount || 0) + (jcOut._sum.amount || 0)) * 100) / 100,
      });
    }

    // ── Current month totals ───────────────────────────────────────────────
    const current = monthly_chart[monthly_chart.length - 1];
    const cash_in  = current.cash_in;
    const cash_out = current.cash_out;
    const net      = Math.round((cash_in - cash_out) * 100) / 100;

    // ── Outstanding receivables ────────────────────────────────────────────
    const [unpaidInv, unpaidMan] = await Promise.all([
      prisma.invoices.aggregate({ _sum: { amount_due: true }, where: { status: { not: 'PAID' } } }),
      prisma.manual_invoices.aggregate({ _sum: { amount_due: true }, where: { status: { not: 'PAID' } } }),
    ]);
    const outstanding_receivables = Math.round(
      ((unpaidInv._sum.amount_due || 0) + (unpaidMan._sum.amount_due || 0)) * 100
    ) / 100;

    // ── Upcoming recurring expenses (next 30 days) ─────────────────────────
    const next30 = new Date();
    next30.setDate(next30.getDate() + 30);

    const recurringRows = await prisma.recurring_expenses.findMany({
      where: { is_active: true, next_due: { lte: next30 } },
      orderBy: { next_due: 'asc' },
    });

    const recurring_upcoming = recurringRows.map((r: any) => ({
      id:          r.id,
      description: r.description,
      amount:      r.amount,
      due_date:    (r.next_due instanceof Date ? r.next_due : new Date(r.next_due))
                     .toISOString().slice(0, 10),
      category:    r.category,
    }));

    // ── Outstanding invoices (unpaid, with customer info) ──────────────────
    // Combine system invoices (linked to estimates/customers) + manual invoices
    const [sysInvoices, manInvoices] = await Promise.all([
      prisma.invoices.findMany({
        where: { status: { not: 'PAID' } },
        select: {
          id: true,
          amount_due: true,
          due_at: true,
          estimate: {
            select: {
              address: true,
              customer: { select: { name: true } },
            },
          },
        },
        orderBy: { issued_at: 'asc' },
      }),
      prisma.manual_invoices.findMany({
        where: { status: { not: 'PAID' } },
        select: {
          id: true,
          customer_name: true,
          property_address: true,
          amount_due: true,
          due_at: true,
        },
        orderBy: { issued_at: 'asc' },
      }),
    ]);

    const todayMs = now.getTime();

    const outstanding_invoices = [
      ...sysInvoices.map((inv: any) => {
        const dueMs  = inv.due_at ? new Date(inv.due_at).getTime() : null;
        const days_overdue = dueMs ? Math.max(0, Math.floor((todayMs - dueMs) / 86400000)) : 0;
        return {
          id:            inv.id,
          job_address:   inv.estimate?.address ?? '',
          customer_name: inv.estimate?.customer?.name ?? 'Unknown',
          amount:        inv.amount_due,
          due_date:      inv.due_at ? new Date(inv.due_at).toISOString().slice(0, 10) : '',
          days_overdue,
        };
      }),
      ...manInvoices.map((inv: any) => {
        const dueMs  = inv.due_at ? new Date(inv.due_at).getTime() : null;
        const days_overdue = dueMs ? Math.max(0, Math.floor((todayMs - dueMs) / 86400000)) : 0;
        return {
          id:            inv.id,
          job_address:   inv.property_address ?? '',
          customer_name: inv.customer_name,
          amount:        inv.amount_due,
          due_date:      inv.due_at ? new Date(inv.due_at).toISOString().slice(0, 10) : '',
          days_overdue,
        };
      }),
    ].sort((a, b) => b.days_overdue - a.days_overdue);

    return NextResponse.json({
      cash_in,
      cash_out,
      net,
      outstanding_receivables,
      monthly_chart,
      recurring_upcoming,
      outstanding_invoices,
    });
  } catch (error: any) {
    if (error.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
