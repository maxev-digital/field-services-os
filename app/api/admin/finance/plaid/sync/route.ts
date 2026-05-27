import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { plaidClient, plaidEnabled } from '@/lib/plaid';
import prisma from '@/lib/prisma';

function mapCategory(plaidCats: string[] | null): string {
  if (!plaidCats || plaidCats.length === 0) return 'misc';
  const j = plaidCats.join(' ').toLowerCase();
  if (j.includes('fuel') || j.includes('gas station') || j.includes('auto')) return 'vehicle_fuel';
  if (j.includes('insurance')) return 'insurance';
  if (j.includes('restaurant') || j.includes('food') || j.includes('dining')) return 'meals';
  if (j.includes('hotel') || j.includes('airline') || j.includes('travel')) return 'travel';
  if (j.includes('office') || j.includes('rent')) return 'office_rent';
  if (j.includes('software') || j.includes('subscription')) return 'subscriptions';
  if (j.includes('hardware') || j.includes('tool') || j.includes('equipment')) return 'tools_equipment';
  if (j.includes('utilities') || j.includes('electric') || j.includes('phone')) return 'utilities';
  if (j.includes('advertising') || j.includes('marketing')) return 'marketing';
  if (j.includes('payroll') || j.includes('salary')) return 'payroll';
  if (j.includes('tax')) return 'taxes';
  if (j.includes('material') || j.includes('lumber') || j.includes('supply')) return 'materials';
  return 'misc';
}

async function syncItem(item: { id: string; access_token: string; cursor: string | null }) {
  let cursor: string | undefined = item.cursor ?? undefined;
  let added = 0, updated = 0, removed = 0, hasMore = true;
  while (hasMore) {
    const resp = await plaidClient.transactionsSync({ access_token: item.access_token, cursor });
    const data = resp.data;
    for (const tx of data.added) {
      if (tx.amount <= 0) continue;
      const pfc = (tx as any).personal_finance_category;
      const cats = pfc ? [pfc.primary, pfc.detailed] : (tx.category || null);
      await prisma.bank_transactions.upsert({
        where: { plaid_transaction_id: tx.transaction_id },
        create: { plaid_item_id: item.id, plaid_transaction_id: tx.transaction_id, account_id: tx.account_id,
          date: new Date(tx.date), amount: tx.amount, description: tx.name, merchant_name: tx.merchant_name ?? null,
          category: mapCategory(cats), plaid_category: cats ? cats.join(' > ') : null, status: 'pending' },
        update: { amount: tx.amount, description: tx.name, merchant_name: tx.merchant_name ?? null },
      });
      added++;
    }
    for (const tx of data.modified) {
      await prisma.bank_transactions.updateMany({
        where: { plaid_transaction_id: tx.transaction_id },
        data: { amount: tx.amount, description: tx.name, merchant_name: tx.merchant_name ?? null, updated_at: new Date() },
      });
      updated++;
    }
    for (const rtx of data.removed) {
      await prisma.bank_transactions.deleteMany({ where: { plaid_transaction_id: rtx.transaction_id } });
      removed++;
    }
    cursor = data.next_cursor; hasMore = data.has_more;
  }
  await prisma.plaid_items.update({ where: { id: item.id }, data: { cursor, last_synced_at: new Date() } });
  return { added, updated, removed };
}

export async function POST(req: NextRequest) {
  const secret = new URL(req.url).searchParams.get('secret');
  if (secret !== process.env.CRON_SECRET) {
    try { await requireAdmin(); } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); }
  }
  if (!plaidEnabled) return NextResponse.json({ error: 'Plaid not configured' }, { status: 503 });
  const items = await prisma.plaid_items.findMany({ select: { id: true, access_token: true, cursor: true } });
  if (items.length === 0) return NextResponse.json({ ok: true, message: 'No bank accounts connected' });
  const results = [];
  for (const item of items) {
    try { results.push({ item_id: item.id, ...(await syncItem(item)) }); }
    catch (e: any) { results.push({ item_id: item.id, error: e.message }); }
  }
  return NextResponse.json({ ok: true, results });
}
