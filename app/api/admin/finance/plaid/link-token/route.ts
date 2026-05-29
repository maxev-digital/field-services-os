import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { plaidClient, plaidEnabled } from '@/lib/plaid';
import { Products, CountryCode } from 'plaid';

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    if (!plaidEnabled) return NextResponse.json({ error: 'Plaid not configured. Add PLAID_CLIENT_ID and PLAID_SECRET to .env' }, { status: 503 });
    const response = await plaidClient.linkTokenCreate({
      user: { client_user_id: 'roof-works-admin-user' },
      client_name: 'Roof Works of Texas',
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: 'en',
    });
    return NextResponse.json({ link_token: response.data.link_token });
  } catch (e: any) {
    if (e.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: e.response?.data?.error_message || e.message }, { status: 500 });
  }
}
