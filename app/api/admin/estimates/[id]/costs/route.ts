import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await params;

    const costs = await prisma.job_costs.findMany({
      where: { estimate_id: id },
      orderBy: { created_at: 'asc' },
    });

    return NextResponse.json({ costs });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 401 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await params;
    const body = await req.json();

    const { category, description, amount } = body;
    if (!category || !description || amount == null) {
      return NextResponse.json({ error: 'category, description, and amount are required' }, { status: 400 });
    }

    const cost = await prisma.job_costs.create({
      data: {
        estimate_id: id,
        category,
        description,
        amount: parseFloat(amount),
      },
    });

    return NextResponse.json({ cost });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
