import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';

export async function GET(_req: NextRequest) {
  try {
    await requireAdmin();

    const estimates = await prisma.estimates.findMany({
      where: {
        status: { in: ['APPROVED', 'INVOICED', 'PAID'] },
      },
      orderBy: { created_at: 'desc' },
      include: {
        customer: { select: { id: true, name: true } },
        invoice: {
          select: {
            id: true, invoice_no: true, amount_due: true,
            amount_paid: true, status: true,
          },
        },
        job_costs: true,
      },
    });

    const rows = estimates.map(e => {
      const revenue   = e.invoice?.amount_due ?? e.our_total;
      const collected = e.invoice?.amount_paid ?? 0;
      const totalCosts = e.job_costs.reduce((s, c) => s + c.amount, 0);
      const grossProfit = revenue - totalCosts;
      const margin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;

      // Group costs by category for breakdown
      const costsByCategory: Record<string, number> = {};
      for (const c of e.job_costs) {
        costsByCategory[c.category] = (costsByCategory[c.category] ?? 0) + c.amount;
      }

      return {
        id:            e.id,
        address:       e.address,
        customer:      e.customer,
        status:        e.status,
        insurer:       e.insurer,
        claim_no:      e.claim_no,
        created_at:    e.created_at,
        revenue,
        collected,
        our_total:     e.our_total,
        total_costs:   totalCosts,
        gross_profit:  grossProfit,
        margin_pct:    margin,
        costs_entered: e.job_costs.length > 0,
        costs_by_category: costsByCategory,
        invoice_status: e.invoice?.status ?? null,
        invoice_no:    e.invoice?.invoice_no ?? null,
      };
    });

    // Totals summary
    const totals = rows.reduce(
      (acc, r) => ({
        revenue:      acc.revenue      + r.revenue,
        collected:    acc.collected    + r.collected,
        total_costs:  acc.total_costs  + r.total_costs,
        gross_profit: acc.gross_profit + r.gross_profit,
      }),
      { revenue: 0, collected: 0, total_costs: 0, gross_profit: 0 }
    );

    return NextResponse.json({ rows, totals });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 401 });
  }
}
