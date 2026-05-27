import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { plaidEnabled } from '@/lib/plaid';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const items = await prisma.plaid_items.findMany({
      select: { id: true, institution_name: true, accounts: true, last_synced_at: true, created_at: true, _count: { select: { transactions: true } } },
    });
    const pending = await prisma.bank_transactions.count({ where: { status: 'pending' } });
    return NextResponse.json({ plaid_enabled: plaidEnabled, items, pending_transactions: pending });
  } catch (e: any) {
    if (e.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
