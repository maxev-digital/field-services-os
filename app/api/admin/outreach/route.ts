import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';

export async function GET(_req: NextRequest) {
  try {
    await requireAdmin();
    const templates = await prisma.outreach_templates.findMany({
      where: { is_active: true },
      orderBy: [{ category: 'asc' }, { variant: 'asc' }],
    });
    return NextResponse.json({ templates });
  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    const { slug, category, variant, subject, body, variables } = await req.json();
    if (!slug || !subject || !body || !variant) {
      return NextResponse.json({ error: 'slug, variant, subject, body required' }, { status: 400 });
    }

    const template = await prisma.outreach_templates.create({
      data: { slug, category: category || 'roofing_outreach', variant, subject, body, variables: variables || [] },
    });
    return NextResponse.json({ template });
  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
