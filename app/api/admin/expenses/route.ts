import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = 50;
    const skip = (page - 1) * limit;
    const category = searchParams.get('category');
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const vendor = searchParams.get('vendor');
    const subcontractor_id = searchParams.get('subcontractor_id');
    const is_recurring = searchParams.get('is_recurring');

    const where: any = {};
    if (category) where.category = category;
    if (vendor) where.vendor = { contains: vendor, mode: 'insensitive' };
    if (subcontractor_id) where.subcontractor_id = subcontractor_id;
    if (is_recurring === 'true') where.is_recurring = true;
    if (from || to) {
      where.date = {};
      if (from) where.date.gte = new Date(from);
      if (to) where.date.lte = new Date(to);
    }

    const [expenses, total] = await Promise.all([
      prisma.expenses.findMany({ where, include: { subcontractor: true }, orderBy: { date: 'desc' }, skip, take: limit }),
      prisma.expenses.count({ where }),
    ]);

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    const [totalThisMonth, totalThisYear, byCategory] = await Promise.all([
      prisma.expenses.aggregate({ _sum: { amount: true }, where: { date: { gte: startOfMonth } } }),
      prisma.expenses.aggregate({ _sum: { amount: true }, where: { date: { gte: startOfYear } } }),
      prisma.expenses.groupBy({ by: ['category'], _sum: { amount: true }, where: { date: { gte: startOfYear } } }),
    ]);

    return NextResponse.json({
      expenses, total, page, totalPages: Math.ceil(total / limit),
      summary: {
        totalThisMonth: totalThisMonth._sum.amount || 0,
        totalThisYear: totalThisYear._sum.amount || 0,
        byCategory: byCategory.map(i => ({ category: i.category, total: i._sum.amount || 0 })),
      },
    });
  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
    const body = await request.json();
    const { date, category, vendor, description, amount, payment_method, reference_no, receipt_url, receipt_data, subcontractor_id, is_recurring, recurring_freq, is_tax_deductible, notes } = body;

    if (!date || !category || !description || !amount) {
      return NextResponse.json({ error: 'date, category, description, and amount are required' }, { status: 400 });
    }

    const data: any = {
      date: new Date(date),
      category,
      description,
      amount: parseFloat(amount),
      vendor: vendor || null,
      payment_method: payment_method || null,
      reference_no: reference_no || null,
      receipt_url: receipt_url || null,
      receipt_data: receipt_data || null,
      is_recurring: is_recurring || false,
      recurring_freq: recurring_freq || null,
      is_tax_deductible: is_tax_deductible !== false,
      notes: notes || null,
    };

    // Use Prisma connect syntax for relation
    if (subcontractor_id) {
      data.subcontractor = { connect: { id: subcontractor_id } };
    }

    const expense = await prisma.expenses.create({ data, include: { subcontractor: true } });

    // Update subcontractor total_paid if linked
    if (subcontractor_id) {
      await prisma.subcontractors.update({
        where: { id: subcontractor_id },
        data: { total_paid: { increment: parseFloat(amount) } },
      });
    }

    return NextResponse.json(expense, { status: 201 });
  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
