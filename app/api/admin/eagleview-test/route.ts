import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { evGetAvailableProducts } from '@/lib/eagleview';

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const products = await evGetAvailableProducts();
    return NextResponse.json({ ok: true, products });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
