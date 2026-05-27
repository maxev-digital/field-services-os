import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/admin-auth';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
    const { id } = await params;
    const order = await prisma.material_orders.findUnique({
      where: { estimate_id: id },
    });
    return NextResponse.json({ order: order ?? null });
  } catch (e: unknown) {
    const err = e as Error;
    if (err.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
    const { id } = await params;
    const body = await req.json() as {
      brand?: string;
      items?: unknown[];
      notes?: string | null;
    };
    const { brand, items, notes } = body;
    const order = await prisma.material_orders.upsert({
      where:  { estimate_id: id },
      create: {
        estimate_id: id,
        brand:       brand  ?? '',
        items:       items  ?? [],
        notes:       notes  ?? null,
      },
      update: {
        brand: brand ?? '',
        items: items ?? [],
        notes: notes ?? null,
      },
    });
    return NextResponse.json({ order });
  } catch (e: unknown) {
    const err = e as Error;
    if (err.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
