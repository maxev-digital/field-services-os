/**
 * DELETE /api/admin/ivr-scripts/[id] — soft-delete (sets active=false)
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try { await requireAdmin(); } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = params;
  await prisma.$executeRaw`
    UPDATE ivr_scripts SET active = false WHERE id = ${id}
  `;

  return NextResponse.json({ success: true });
}
