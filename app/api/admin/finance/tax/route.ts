// app/api/admin/finance/tax/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();

    const { searchParams } = new URL(req.url);
    const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()));
    const start = new Date(year, 0, 1);
    const end   = new Date(year, 11, 31, 23, 59, 59, 999);
    const df    = { gte: start, lte: end };

    const [
      paymentsRev,
      manPaymentsRev,
      expByCat,
      mileageAgg,
      subsAll,
      missingReceiptsCount,
    ] = await Promise.all([
      prisma.payments.aggregate({ _sum: { amount: true }, where: { paid_at: df } }),
      prisma.manual_payments.aggregate({ _sum: { amount: true }, where: { paid_at: df } }),
      prisma.expenses.groupBy({
        by: ['category'],
        _sum: { amount: true },
        where: { date: df, is_tax_deductible: true },
      }),
      prisma.mileage_log.aggregate({
        _sum: { miles: true, deduction: true },
        where: { date: df },
      }),
      prisma.subcontractors.findMany({
        where: { total_paid: { gte: 600 } },
        select: { id: true, name: true, company: true, tax_id: true, total_paid: true },
        orderBy: { total_paid: 'desc' },
      }),
      prisma.expenses.count({
        where: { date: df, receipt_data: null, receipt_url: null },
      }),
    ]);

    const revenue_total = Math.round(
      ((paymentsRev._sum.amount || 0) + (manPaymentsRev._sum.amount || 0)) * 100
    ) / 100;

    // Build deductions_by_category as a Record<string, number>
    const deductions_by_category: Record<string, number> = {};
    for (const row of expByCat) {
      deductions_by_category[row.category] = Math.round((row._sum.amount || 0) * 100) / 100;
    }

    const mileage_deduction = Math.round((mileageAgg._sum.deduction || 0) * 100) / 100;
    const expense_total     = Object.values(deductions_by_category).reduce((a, b) => a + b, 0);
    const total_deductions  = Math.round((expense_total + mileage_deduction) * 100) / 100;
    const net_taxable_income = Math.round((revenue_total - total_deductions) * 100) / 100;

    // 1099 subcontractors — those paid >= $600 in the selected year
    // (subcontractors.total_paid is a running total across all time;
    //  for accuracy we compute year-specific totals from expenses)
    const subExpenses = await prisma.expenses.groupBy({
      by: ['subcontractor_id'],
      _sum: { amount: true },
      where: {
        date: df,
        subcontractor_id: { not: null },
      },
    });

    const subIdsOver600 = subExpenses
      .filter((r: any) => (r._sum.amount || 0) >= 600)
      .map((r: any) => r.subcontractor_id as string);

    // Also include subsAll (running total) if not already covered
    const allSubIds = new Set([
      ...subIdsOver600,
      ...subsAll
        .filter((s: any) => (s.total_paid || 0) >= 600)
        .map((s: any) => s.id as string),
    ]);

    const subs1099Rows = await prisma.subcontractors.findMany({
      where: { id: { in: [...allSubIds] } },
      select: { id: true, name: true, company: true, tax_id: true, total_paid: true },
      orderBy: { total_paid: 'desc' },
    });

    const subs_needing_1099 = subs1099Rows.map((s: any) => ({
      id:         s.id,
      name:       s.name,
      company:    s.company ?? '',
      tax_id:     s.tax_id ?? '',
      total_paid: s.total_paid,
    }));

    // W-9 warnings: check subcontractor_documents for w9 docs
    const w9Docs = await prisma.subcontractor_documents.findMany({
      where: {
        subcontractor_id: { in: subs1099Rows.map((s: any) => s.id) },
        doc_type: 'w9',
      },
      select: { subcontractor_id: true },
    });
    const subsWithW9 = new Set(w9Docs.map((d: any) => d.subcontractor_id));

    const subs_without_w9 = subs1099Rows
      .filter((s: any) => !subsWithW9.has(s.id))
      .map((s: any) => ({ id: s.id, name: s.name }));

    const subs_without_tax_id = subs1099Rows
      .filter((s: any) => !s.tax_id)
      .map((s: any) => ({ id: s.id, name: s.name }));

    return NextResponse.json({
      year,
      revenue_total,
      deductions_by_category,
      mileage_deduction,
      total_deductions,
      subs_needing_1099,
      net_taxable_income,
      warnings: {
        subs_without_w9,
        subs_without_tax_id,
        missing_receipts_count: missingReceiptsCount,
      },
    });
  } catch (error: any) {
    if (error.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
