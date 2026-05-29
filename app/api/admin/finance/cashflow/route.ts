import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const now = new Date();

    // 6-month chart
    const monthly_chart: { month: string; cash_in: number; cash_out: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999);
      const df = { gte: start, lte: end };
      const [pIn, mpIn, expOut, jcOut] = await Promise.all([
        prisma.payments.aggregate({ _sum: { amount: true }, where: { paid_at: df } }),
        prisma.manual_payments.aggregate({ _sum: { amount: true }, where: { paid_at: df } }),
        prisma.expenses.aggregate({ _sum: { amount: true }, where: { date: df } }),
        prisma.job_costs.aggregate({ _sum: { amount: true }, where: { created_at: df } }),
      ]);
      monthly_chart.push({
        month: start.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
        cash_in: Math.round(((pIn._sum.amount || 0) + (mpIn._sum.amount || 0)) * 100) / 100,
        cash_out: Math.round(((expOut._sum.amount || 0) + (jcOut._sum.amount || 0)) * 100) / 100,
      });
    }

    const current = monthly_chart[monthly_chart.length - 1];
    const cash_in = current.cash_in;
    const cash_out = current.cash_out;
    const net = Math.round((cash_in - cash_out) * 100) / 100;

    const [unpaidInv, unpaidMan] = await Promise.all([
      prisma.invoices.aggregate({ _sum: { amount_due: true }, where: { status: { not: 'PAID' } } }),
      prisma.manual_invoices.aggregate({ _sum: { amount_due: true }, where: { status: { not: 'PAID' } } }),
    ]);
    const outstanding_receivables = Math.round(((unpaidInv._sum.amount_due || 0) + (unpaidMan._sum.amount_due || 0)) * 100) / 100;

    const next30 = new Date(now.getTime() + 30 * 86400000);
    const next7 = new Date(now.getTime() + 7 * 86400000);

    const [recurringRows, recurringDue7d, missingCosts] = await Promise.all([
      prisma.recurring_expenses.findMany({ where: { is_active: true, next_due: { lte: next30 } }, orderBy: { next_due: 'asc' } }),
      prisma.recurring_expenses.count({ where: { is_active: true, next_due: { lte: next7 } } }),
      prisma.estimates.count({ where: { status: { in: ['INVOICED', 'PAID'] }, job_costs: { none: {} } } }),
    ]);

    const recurring_upcoming = recurringRows.map((r: any) => ({
      id: r.id, description: r.description, amount: r.amount,
      due_date: (r.next_due instanceof Date ? r.next_due : new Date(r.next_due)).toISOString().slice(0, 10),
      category: r.category,
    }));

    const recurringTotal30 = recurringRows.reduce((s: number, r: any) => s + r.amount, 0);
    const low_cash_warning = cash_in > 0 && (recurringTotal30 + cash_out) > cash_in * 1.5;
    const alert_summary = { recurring_due_7d: recurringDue7d, low_cash_warning, missing_costs_count: missingCosts };

    // Outstanding invoices + reminder history
    const todayMs = now.getTime();
    const [sysInvoices, manInvoices] = await Promise.all([
      prisma.invoices.findMany({
        where: { status: { not: 'PAID' } },
        select: { id: true, amount_due: true, due_at: true, issued_at: true,
          estimate: { select: { address: true, customer: { select: { name: true, email: true } } } } },
        orderBy: { issued_at: 'asc' },
      }),
      prisma.manual_invoices.findMany({
        where: { status: { not: 'PAID' } },
        select: { id: true, customer_name: true, customer_email: true, property_address: true, amount_due: true, due_at: true, issued_at: true },
        orderBy: { issued_at: 'asc' },
      }),
    ]);

    // Get all reminder records for these invoices
    const allInvoiceIds = [...sysInvoices.map((i: any) => i.id), ...manInvoices.map((i: any) => i.id)];
    const allReminders = await prisma.invoice_reminders.findMany({
      where: { invoice_id: { in: allInvoiceIds } },
      orderBy: { sent_at: 'desc' },
    });

    function effectiveDue(dueAt: Date | null, issuedAt: Date): Date {
      return dueAt ?? new Date(issuedAt.getTime() + 30 * 86400000);
    }

    function getReminderInfo(invoiceId: string) {
      const rems = allReminders.filter((r: any) => r.invoice_id === invoiceId);
      return {
        reminder_count: rems.length,
        last_reminded: rems[0]?.sent_at ? new Date(rems[0].sent_at).toISOString() : null,
      };
    }

    const outstanding_invoices = [
      ...sysInvoices.map((inv: any) => {
        const effDue = effectiveDue(inv.due_at, inv.issued_at);
        return {
          id: inv.id, invoice_type: 'system',
          job_address: inv.estimate?.address ?? '',
          customer_name: inv.estimate?.customer?.name ?? 'Unknown',
          amount: inv.amount_due,
          due_date: effDue.toISOString().slice(0, 10),
          days_overdue: Math.max(0, Math.floor((todayMs - effDue.getTime()) / 86400000)),
          can_remind: !!(inv.estimate?.customer?.email),
          ...getReminderInfo(inv.id),
        };
      }),
      ...manInvoices.map((inv: any) => {
        const effDue = effectiveDue(inv.due_at, inv.issued_at);
        return {
          id: inv.id, invoice_type: 'manual',
          job_address: inv.property_address ?? '',
          customer_name: inv.customer_name,
          amount: inv.amount_due,
          due_date: effDue.toISOString().slice(0, 10),
          days_overdue: Math.max(0, Math.floor((todayMs - effDue.getTime()) / 86400000)),
          can_remind: !!(inv.customer_email),
          ...getReminderInfo(inv.id),
        };
      }),
    ].sort((a, b) => b.days_overdue - a.days_overdue);

    return NextResponse.json({ cash_in, cash_out, net, outstanding_receivables, monthly_chart, recurring_upcoming, outstanding_invoices, alert_summary });
  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
