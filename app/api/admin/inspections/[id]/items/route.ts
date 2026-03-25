import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();

    const body = await req.json();
    const { items } = body as {
      items: Array<{ section: string; damaged: boolean; data: Record<string, any>; notes?: string }>;
    };

    if (!Array.isArray(items)) {
      return NextResponse.json({ error: 'items must be an array' }, { status: 400 });
    }

    const results = await Promise.all(
      items.map((item) =>
        prisma.inspection_items.upsert({
          where: {
            report_id_section: {
              report_id: params.id,
              section: item.section,
            },
          },
          update: {
            damaged: item.damaged,
            data: item.data as any,
            notes: item.notes ?? null,
          },
          create: {
            report_id: params.id,
            section: item.section,
            damaged: item.damaged,
            data: item.data as any,
            notes: item.notes ?? null,
          },
        })
      )
    );

    return NextResponse.json({ items: results });
  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
