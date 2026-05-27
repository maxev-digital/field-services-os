import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';

const RETELL_API_URL = 'https://api.retellai.com/v2/list-calls';

// ── helpers ──────────────────────────────────────────────────────────────────

function cents(n: number | null | undefined): number {
  return Math.round((n ?? 0) * 100);
}

async function syncRetellCalls() {
  const apiKey = process.env.RETELL_API_KEY;
  if (!apiKey) return { synced: 0, error: 'RETELL_API_KEY not set' };

  try {
    const res = await fetch(RETELL_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ limit: 1000 }),
    });

    if (!res.ok) {
      const txt = await res.text();
      return { synced: 0, error: `Retell API ${res.status}: ${txt}` };
    }

    const calls: any[] = await res.json();

    // Get existing tracked call_ids
    const existing = await prisma.$queryRaw<{ meta_call_id: string }[]>`
      SELECT metadata->>'call_id' as meta_call_id
      FROM campaign_costs
      WHERE category = 'retell_calls'
    `;
    const trackedIds = new Set(existing.map((r) => r.meta_call_id));

    let synced = 0;
    for (const call of calls) {
      if (!call.call_id || trackedIds.has(call.call_id)) continue;
      const cost = call.call_cost?.combined_cost ?? 0; // in cents from Retell
      const costCents = Math.round(cost);
      if (costCents === 0 && !call.duration_ms) continue; // skip empty/errored

      const callDate = call.start_timestamp
        ? new Date(call.start_timestamp).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10);

      const productCosts = call.call_cost?.product_costs ?? [];
      const metadata = {
        call_id: call.call_id,
        duration_ms: call.duration_ms ?? 0,
        to_number: call.to_number ?? call.from_number ?? '',
        status: call.call_status ?? call.status ?? 'unknown',
        direction: call.direction ?? 'unknown',
        product_costs: productCosts,
        agent_id: call.agent_id ?? '',
      };

      // Try to link to storm date via retell_calls → prospect → storm_date
      let campaignId: string | null = null;
      const dbCall = await prisma.retell_calls.findUnique({ where: { call_id: call.call_id }, select: { prospect_id: true } }).catch(() => null);
      if (dbCall?.prospect_id) {
        const prospect = await prisma.storm_prospects.findUnique({ where: { id: dbCall.prospect_id }, select: { storm_date: true } }).catch(() => null);
        if (prospect?.storm_date) campaignId = prospect.storm_date;
      }

      await prisma.$executeRaw`
        INSERT INTO campaign_costs (id, date, category, description, amount_cents, quantity, unit_cost_cents, campaign_id, auto_tracked, metadata, created_at)
        VALUES (
          gen_random_uuid()::text,
          ${callDate}::date,
          'retell_calls',
          ${'Retell AI Call' + (metadata.to_number ? ` to ${metadata.to_number}` : '')},
          ${costCents},
          1,
          ${costCents},
          ${campaignId},
          true,
          ${JSON.stringify(metadata)}::jsonb,
          NOW()
        )
        ON CONFLICT DO NOTHING
      `;
      synced++;
    }

    return { synced, total: calls.length };
  } catch (e: any) {
    return { synced: 0, error: e.message };
  }
}

// ── GET — Dashboard data ─────────────────────────────────────────────────────

export async function GET(_req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // 1. Sync Retell calls
    const syncResult = await syncRetellCalls();

    // 2. Total spend
    const [totalRow] = await prisma.$queryRaw<{ total: string }[]>`
      SELECT COALESCE(SUM(amount_cents), 0)::text as total FROM campaign_costs
    `;
    const totalSpend = parseInt(totalRow.total);

    // 3. Spend by category
    const spendByCategory = await prisma.$queryRaw<
      { category: string; total: string; count: string }[]
    >`
      SELECT category, SUM(amount_cents)::text as total, COUNT(*)::text as count
      FROM campaign_costs GROUP BY category ORDER BY SUM(amount_cents) DESC
    `;

    // 4. Spend by month
    const spendByMonth = await prisma.$queryRaw<
      { month: string; total: string }[]
    >`
      SELECT to_char(date, 'YYYY-MM') as month, SUM(amount_cents)::text as total
      FROM campaign_costs
      GROUP BY to_char(date, 'YYYY-MM')
      ORDER BY month DESC
      LIMIT 12
    `;

    // 5. Retell breakdown
    const retellRows = await prisma.$queryRaw<{ metadata: any; amount_cents: number }[]>`
      SELECT metadata, amount_cents FROM campaign_costs WHERE category = 'retell_calls'
    `;

    let totalCalls = retellRows.length;
    let totalMinutesMs = 0;
    let totalRetellCost = 0;
    const productTotals: Record<string, number> = {};

    for (const row of retellRows) {
      const meta = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata;
      totalMinutesMs += meta.duration_ms ?? 0;
      totalRetellCost += row.amount_cents;
      for (const pc of meta.product_costs ?? []) {
        const product = pc.product ?? 'unknown';
        const cost = Math.round((pc.cost ?? 0) * 100);
        productTotals[product] = (productTotals[product] ?? 0) + cost;
      }
    }

    const totalMinutes = totalMinutesMs / 60000;
    const retellBreakdown = {
      totalCalls,
      totalMinutes: Math.round(totalMinutes * 10) / 10,
      totalCost: totalRetellCost,
      costPerMinute: totalMinutes > 0 ? Math.round(totalRetellCost / totalMinutes) : 0,
      costPerCall: totalCalls > 0 ? Math.round(totalRetellCost / totalCalls) : 0,
      productBreakdown: Object.entries(productTotals).map(([product, total]) => ({
        product,
        total,
      })),
    };

    // 6. Daily retell costs (for chart)
    const retellDaily = await prisma.$queryRaw<{ day: string; total: string; count: string }[]>`
      SELECT date::text as day, SUM(amount_cents)::text as total, COUNT(*)::text as count
      FROM campaign_costs WHERE category = 'retell_calls'
      GROUP BY date ORDER BY date DESC LIMIT 30
    `;

    // 7. ROI — revenue from storm-sourced leads
    // Storm prospects -> match by address to customers -> estimates -> invoices PAID
    // Also check manual_invoices
    const stormRevenue = await prisma.$queryRaw<{ total: string; count: string }[]>`
      SELECT COALESCE(SUM(i.amount_paid), 0)::text as total, COUNT(*)::text as count
      FROM invoices i
      JOIN estimates e ON e.id = i.estimate_id
      JOIN customers c ON c.id = e.customer_id
      WHERE i.status = 'PAID'
        AND EXISTS (
          SELECT 1 FROM storm_prospects sp
          WHERE LOWER(TRIM(sp.address)) = LOWER(TRIM(c.address))
             OR LOWER(TRIM(sp.address)) = LOWER(TRIM(e.address))
        )
    `;

    const stormManualRevenue = await prisma.$queryRaw<{ total: string }[]>`
      SELECT COALESCE(SUM(mi.amount_paid), 0)::text as total
      FROM manual_invoices mi
      WHERE mi.status = 'PAID'
        AND EXISTS (
          SELECT 1 FROM storm_prospects sp
          WHERE LOWER(TRIM(sp.address)) = LOWER(TRIM(mi.property_address))
             OR LOWER(TRIM(sp.address)) = LOWER(TRIM(mi.customer_address))
        )
    `;

    const totalRevenueCents = cents(parseFloat(stormRevenue[0]?.total ?? '0'))
      + cents(parseFloat(stormManualRevenue[0]?.total ?? '0'));

    const roiPct = totalSpend > 0 ? ((totalRevenueCents - totalSpend) / totalSpend) * 100 : 0;

    // 8. Pipeline — estimates from storm leads (not yet paid)
    const pipeline = await prisma.$queryRaw<{ count: string; value: string }[]>`
      SELECT COUNT(*)::text as count, COALESCE(SUM(e.our_total), 0)::text as value
      FROM estimates e
      JOIN customers c ON c.id = e.customer_id
      WHERE e.status IN ('DRAFT', 'SENT', 'APPROVED', 'INVOICED')
        AND EXISTS (
          SELECT 1 FROM storm_prospects sp
          WHERE LOWER(TRIM(sp.address)) = LOWER(TRIM(c.address))
             OR LOWER(TRIM(sp.address)) = LOWER(TRIM(e.address))
        )
    `;

    const pipelineJobs = await prisma.$queryRaw<{ count: string }[]>`
      SELECT COUNT(*)::text as count
      FROM jobs j
      JOIN customers c ON c.id = j.customer_id
      WHERE j.status NOT IN ('PAID', 'COMPLETE')
        AND EXISTS (
          SELECT 1 FROM storm_prospects sp
          WHERE LOWER(TRIM(sp.address)) = LOWER(TRIM(c.address))
             OR LOWER(TRIM(sp.address)) = LOWER(TRIM(j.address))
        )
    `;

    // 9. Recent costs
    const recentCosts = await prisma.$queryRaw<any[]>`
      SELECT id, date::text, category, description, amount_cents, quantity, unit_cost_cents, auto_tracked, metadata, created_at
      FROM campaign_costs
      ORDER BY created_at DESC
      LIMIT 50
    `;

    // 10. Spend by category by month (for stacked chart)
    const spendByCategoryMonth = await prisma.$queryRaw<
      { month: string; category: string; total: string }[]
    >`
      SELECT to_char(date, 'YYYY-MM') as month, category, SUM(amount_cents)::text as total
      FROM campaign_costs
      GROUP BY to_char(date, 'YYYY-MM'), category
      ORDER BY month DESC
      LIMIT 60
    `;

    return NextResponse.json({
      syncResult,
      totalSpend,
      spendByCategory: spendByCategory.map((r) => ({
        category: r.category,
        total: parseInt(r.total),
        count: parseInt(r.count),
      })),
      spendByMonth: spendByMonth.map((r) => ({
        month: r.month,
        total: parseInt(r.total),
      })),
      spendByCategoryMonth: spendByCategoryMonth.map((r) => ({
        month: r.month,
        category: r.category,
        total: parseInt(r.total),
      })),
      retellBreakdown,
      retellDaily: retellDaily.map((r) => ({
        day: r.day,
        total: parseInt(r.total),
        count: parseInt(r.count),
      })),
      roi: {
        totalRevenue: totalRevenueCents,
        totalSpend,
        roiPct: Math.round(roiPct * 10) / 10,
        revenuePerDollarSpent: totalSpend > 0 ? Math.round((totalRevenueCents / totalSpend) * 100) / 100 : 0,
        paidInvoiceCount: parseInt(stormRevenue[0]?.count ?? '0'),
      },
      pipeline: {
        estimatesCount: parseInt(pipeline[0]?.count ?? '0'),
        estimatesValue: cents(parseFloat(pipeline[0]?.value ?? '0')),
        jobsCount: parseInt(pipelineJobs[0]?.count ?? '0'),
      },
      recentCosts,
    });
  } catch (e: any) {
    console.error('Campaign costs GET error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// ── POST — Add manual cost ───────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { date, category, description, amount_cents, quantity, unit_cost_cents } = body;

    if (!date || !category || !amount_cents) {
      return NextResponse.json({ error: 'date, category, and amount_cents are required' }, { status: 400 });
    }

    const [row] = await prisma.$queryRaw<any[]>`
      INSERT INTO campaign_costs (id, date, category, description, amount_cents, quantity, unit_cost_cents, auto_tracked, metadata, created_at)
      VALUES (
        gen_random_uuid()::text,
        ${date}::date,
        ${category},
        ${description ?? ''},
        ${Math.round(amount_cents)},
        ${quantity ?? 1},
        ${Math.round(unit_cost_cents ?? 0)},
        false,
        '{}'::jsonb,
        NOW()
      )
      RETURNING id, date::text, category, description, amount_cents, auto_tracked, created_at
    `;

    return NextResponse.json({ ok: true, cost: row });
  } catch (e: any) {
    console.error('Campaign costs POST error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
