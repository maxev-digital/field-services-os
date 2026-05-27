// app/api/admin/expenses/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAdmin();

    const expense = await prisma.expenses.findUnique({
      where: { id: params.id },
      include: { subcontractor: true },
    });

    if (!expense) {
      return NextResponse.json({ error: 'Expense not found' }, { status: 404 });
    }

    return NextResponse.json(expense);
  } catch (error: any) {
    if (error.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAdmin();

    const body = await request.json();

    const data: any = {};
    if (body.date !== undefined) data.date = new Date(body.date);
    if (body.amount !== undefined) data.amount = parseFloat(body.amount);
    if (body.category !== undefined) data.category = body.category;
    if (body.description !== undefined) data.description = body.description;
    if (body.vendor !== undefined) data.vendor = body.vendor ?? null;
    if (body.payment_method !== undefined) data.payment_method = body.payment_method ?? null;
    if (body.reference_no !== undefined) data.reference_no = body.reference_no ?? null;
    if (body.notes !== undefined) data.notes = body.notes ?? null;
    if (body.is_recurring !== undefined) data.is_recurring = Boolean(body.is_recurring);
    if (body.is_tax_deductible !== undefined) data.is_tax_deductible = Boolean(body.is_tax_deductible);
    if (body.subcontractor_id !== undefined) data.subcontractor_id = body.subcontractor_id ?? null;

    const expense = await prisma.expenses.update({
      where: { id: params.id },
      data,
      include: { subcontractor: true },
    });

    return NextResponse.json(expense);
  } catch (error: any) {
    if (error.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAdmin();

    // Fetch the expense first to check for subcontractor link
    const expense = await prisma.expenses.findUnique({
      where: { id: params.id },
    });

    if (!expense) {
      return NextResponse.json({ error: 'Expense not found' }, { status: 404 });
    }

    // If linked to a subcontractor, adjust their total_paid
    if (expense.subcontractor_id) {
      await prisma.subcontractors.update({
        where: { id: expense.subcontractor_id },
        data: {
          total_paid: {
            decrement: expense.amount,
          },
        },
      });
    }

    await prisma.expenses.delete({
      where: { id: params.id },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
