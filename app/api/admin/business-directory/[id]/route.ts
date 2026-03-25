// app/api/admin/business-directory/[id]/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;

  const { id } = params;
  const body = await req.json();

  const allowedFields = ['status', 'notes', 'last_contacted_at'];
  const data: any = {};

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      data[field] = body[field];
    }
  }

  // Validate status if provided
  const validStatuses = ['NEW', 'CONTACTED', 'NO_RESPONSE', 'INTERESTED', 'CONVERTED', 'DNC'];
  if (data.status && !validStatuses.includes(data.status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  // If marking as contacted, auto-set last_contacted_at
  if (data.status && data.status !== 'NEW' && !data.last_contacted_at) {
    data.last_contacted_at = new Date();
  }

  try {
    const updated = await prisma.business_directory.update({
      where: { id },
      data,
    });
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: 'Business not found' }, { status: 404 });
  }
}
