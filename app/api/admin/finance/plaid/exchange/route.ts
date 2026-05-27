import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { plaidClient, plaidEnabled } from '@/lib/plaid';
import prisma from '@/lib/prisma';

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    if (!plaidEnabled) return NextResponse.json({ error: 'Plaid not configured' }, { status: 503 });
    const { public_token, institution } = await req.json();
    const exchangeResp = await plaidClient.itemPublicTokenExchange({ public_token });
    const { access_token, item_id } = exchangeResp.data;
    const accountsResp = await plaidClient.accountsGet({ access_token });
    const accounts = accountsResp.data.accounts.map(a => ({
      account_id: a.account_id, name: a.name, official_name: a.official_name,
      type: a.type, subtype: a.subtype, mask: a.mask,
    }));
    const item = await prisma.plaid_items.upsert({
      where: { item_id },
      create: { item_id, access_token, institution_id: institution?.institution_id, institution_name: institution?.name, accounts },
      update: { access_token, institution_id: institution?.institution_id, institution_name: institution?.name, accounts },
    });
    return NextResponse.json({ ok: true, item_id: item.id, institution: institution?.name, accounts });
  } catch (e: any) {
    if (e.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: e.response?.data?.error_message || e.message }, { status: 500 });
  }
}
