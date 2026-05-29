import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { plaidClient } from '@/lib/plaid';
import prisma from '@/lib/prisma';

export async function DELETE(req: NextRequest) {
  try {
    await requireAdmin();
    const { item_id } = await req.json();
    const item = await prisma.plaid_items.findUnique({ where: { id: item_id } });
    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    try { await plaidClient.itemRemove({ access_token: item.access_token }); } catch {}
    await prisma.plaid_items.delete({ where: { id: item_id } });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
