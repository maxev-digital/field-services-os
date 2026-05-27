import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await params;

    const deleted = await prisma.$executeRaw`
      DELETE FROM campaign_costs WHERE id = ${id}
    `;

    if (deleted === 0) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('Campaign costs DELETE error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
