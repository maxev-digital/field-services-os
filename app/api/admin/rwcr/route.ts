/**
 * GET /api/admin/rwcr
 * RWCR, LLC master dashboard — aggregated metrics across all regional orgs.
 * Currently reflects Roof Works of Texas (roofworks DB).
 * Future: query each region's DB via connection string per org.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';

export async function GET(_req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now   = new Date();
  const y     = now.getFullYear();
  const m     = now.getMonth();
  const ytdStart  = new Date(y, 0, 1);
  const mtdStart  = new Date(y, m, 1);
  const lastMoStart = new Date(y, m - 1, 1);
  const lastMoEnd   = new Date(y, m, 1);

  // ── Roof Works of Texas ─────────────────────────────────────────────────
  const [
    jobsTotal, jobsMtd, jobsYtd,
    revYtd, revMtd, revLastMo,
    pipelineRows,
    prospectsTotal, prospectsInterested, prospectsConverted,
    estimatesOpen, estimatesApproved,
    invoicesUnpaid,
    signedThisMonth,
  ] = await Promise.all([
    prisma.jobs.count(),
    prisma.jobs.count({ where: { created_at: { gte: mtdStart } } }),
    prisma.jobs.count({ where: { created_at: { gte: ytdStart } } }),

    // Revenue YTD from paid invoices
    prisma.invoices.aggregate({
      _sum: { amount_paid: true },
      where: { paid_at: { gte: ytdStart } },
    }),
    prisma.invoices.aggregate({
      _sum: { amount_paid: true },
      where: { paid_at: { gte: mtdStart } },
    }),
    prisma.invoices.aggregate({
      _sum: { amount_paid: true },
      where: { paid_at: { gte: lastMoStart, lt: lastMoEnd } },
    }),

    // Pipeline value (approved estimates not yet invoiced)
    prisma.$queryRaw<any[]>`
      SELECT COALESCE(SUM(e.our_total), 0) AS pipeline_value,
             COUNT(*) AS pipeline_count
      FROM estimates e
      WHERE e.status IN ('APPROVED', 'SENT')
        AND e.id NOT IN (SELECT estimate_id FROM invoices WHERE estimate_id IS NOT NULL)`,

    prisma.storm_prospects.count(),
    prisma.storm_prospects.count({ where: { status: 'INTERESTED' } }),
    prisma.storm_prospects.count({ where: { status: 'CONVERTED' } }),

    prisma.estimates.count({ where: { status: { in: ['DRAFT', 'SENT'] as any } } }),
    prisma.estimates.count({ where: { status: 'APPROVED' as any } }),

    prisma.invoices.aggregate({
      _sum: { amount_due: true },
      where: { status: { in: ['UNPAID', 'PARTIAL'] } },
    }),

    // E-signed this month
    prisma.$queryRaw<any[]>`
      SELECT COUNT(*) AS cnt FROM estimates
      WHERE sign_status = 'signed'
        AND approved_at >= ${mtdStart}`,
  ]);

  const pipeline = pipelineRows[0] ?? {};
  const signed   = signedThisMonth[0] ?? {};

  const texas = {
    org_id:   'rwt',
    org_name: 'Roof Works of Texas',
    state:    'TX',
    active:   true,
    metrics: {
      jobs_total:           jobsTotal,
      jobs_mtd:             jobsMtd,
      jobs_ytd:             jobsYtd,
      revenue_ytd:          Number(revYtd._sum.amount_paid ?? 0),
      revenue_mtd:          Number(revMtd._sum.amount_paid ?? 0),
      revenue_last_mo:      Number(revLastMo._sum.amount_paid ?? 0),
      pipeline_value:       Number(pipeline.pipeline_value ?? 0),
      pipeline_count:       Number(pipeline.pipeline_count ?? 0),
      prospects_total:      prospectsTotal,
      prospects_interested: prospectsInterested,
      prospects_converted:  prospectsConverted,
      estimates_open:       estimatesOpen,
      estimates_approved:   estimatesApproved,
      invoices_unpaid_amt:  Number(invoicesUnpaid._sum.amount_due ?? 0),
      signed_this_month:    Number(signed.cnt ?? 0),
    },
  };

  // Future regions — placeholders until their DBs are provisioned
  const future_regions = [
    { org_id: 'rwco', org_name: 'Roof Works of Colorado', state: 'CO', active: false, metrics: null },
    { org_id: 'rwfl', org_name: 'Roof Works of Florida',  state: 'FL', active: false, metrics: null },
    { org_id: 'rwaz', org_name: 'Roof Works of Arizona',  state: 'AZ', active: false, metrics: null },
  ];

  // Rolled-up totals
  const totals = {
    revenue_ytd:         texas.metrics.revenue_ytd,
    revenue_mtd:         texas.metrics.revenue_mtd,
    pipeline_value:      texas.metrics.pipeline_value,
    jobs_ytd:            texas.metrics.jobs_ytd,
    prospects_total:     texas.metrics.prospects_total,
    invoices_unpaid_amt: texas.metrics.invoices_unpaid_amt,
    active_orgs:         1,
  };

  return NextResponse.json({
    parent: { name: 'RWCR, LLC', orgs: 1 + future_regions.length },
    totals,
    orgs: [texas, ...future_regions],
    generated_at: new Date().toISOString(),
  });
}
