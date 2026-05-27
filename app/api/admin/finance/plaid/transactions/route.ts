import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') || 'pending';
    const limit = parseInt(searchParams.get('limit') || '100');
    const where: any = {};
    if (status !== 'all') where.status = status;
    const txs = await prisma.bank_transactions.findMany({
      where, orderBy: { date: 'desc' }, take: limit,
      include: { item: { select: { institution_name: true } } },
    });
    return NextResponse.json({ transactions: txs });
  } catch (e: any) {
    if (e.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await requireAdmin();
    const { id, category, status, notes } = await req.json();
    const data: any = { updated_at: new Date() };
    if (category !== undefined) data.category = category;
    if (status !== undefined) data.status = status;
    if (notes !== undefined) data.notes = notes;
    const tx = await prisma.bank_transactions.update({ where: { id }, data });
    if (status === 'matched' && category) {
      await prisma.expenses.create({
        data: { date: tx.date, category: tx.category || 'misc', description: tx.description,
          amount: tx.amount, vendor: tx.merchant_name || undefined, payment_method: 'card',
          is_tax_deductible: true, notes: 'Auto-imported from bank' },
      });
    }
    return NextResponse.json({ ok: true, transaction: tx });
  } catch (e: any) {
    if (e.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
