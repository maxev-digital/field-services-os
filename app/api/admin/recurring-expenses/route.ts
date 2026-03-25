// app/api/admin/recurring-expenses/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();

    const recurringExpenses = await prisma.recurring_expenses.findMany({
      orderBy: [{ is_active: 'desc' }, { next_due_date: 'asc' }],
    });

    return NextResponse.json(recurringExpenses);
  } catch (error: any) {
    if (error.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();

    const body = await request.json();
    const {
      name,
      category,
      vendor,
      amount,
      frequency,
      next_due_date,
      auto_create,
      notes,
    } = body;

    const recurringExpense = await prisma.recurring_expenses.create({
      data: {
        name,
        category,
        vendor,
        amount: parseFloat(amount),
        frequency,
        next_due_date: new Date(next_due_date),
        is_active: true,
        auto_create: auto_create || false,
        notes,
      },
    });

    return NextResponse.json(recurringExpense, { status: 201 });
  } catch (error: any) {
    if (error.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
