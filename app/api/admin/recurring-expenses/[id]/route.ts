// app/api/admin/recurring-expenses/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAdmin();

    const body = await request.json();

    if (body.amount) body.amount = parseFloat(body.amount);
    if (body.next_due_date) body.next_due_date = new Date(body.next_due_date);

    const recurringExpense = await prisma.recurring_expenses.update({
      where: { id: params.id },
      data: body,
    });

    return NextResponse.json(recurringExpense);
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

    await prisma.recurring_expenses.delete({
      where: { id: params.id },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
