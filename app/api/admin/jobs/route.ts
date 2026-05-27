import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const search = searchParams.get('search');

    const where: any = {};
    if (status && status !== 'ALL') where.status = status;
    if (search) {
      where.OR = [
        { address: { contains: search, mode: 'insensitive' } },
        { customer: { name: { contains: search, mode: 'insensitive' } } },
        { claim_no: { contains: search, mode: 'insensitive' } },
      ];
    }

    const jobs = await prisma.jobs.findMany({
      where,
      include: { customer: { select: { id: true, name: true, phone: true } } },
      orderBy: { created_at: 'desc' },
    });

    // Include INTERESTED storm prospects as virtual LEAD entries
    const includeProspects = !status || status === 'ALL' || status === 'LEAD';
    let prospectLeads: any[] = [];
    if (includeProspects) {
      const prospectWhere: any = { status: 'INTERESTED' };
      if (search) {
        prospectWhere.OR = [
          { address: { contains: search, mode: 'insensitive' } },
          { name:    { contains: search, mode: 'insensitive' } },
          { phone:   { contains: search, mode: 'insensitive' } },
        ];
      }
      const prospects = await prisma.storm_prospects.findMany({
        where:   prospectWhere,
        select:  { id: true, name: true, address: true, city: true, phone: true, source: true, created_at: true },
        orderBy: { created_at: 'desc' },
      });
      prospectLeads = prospects.map(p => ({
        id:             p.id,
        address:        [p.address, p.city].filter(Boolean).join(', '),
        insurer:        null,
        claim_no:       null,
        status:         'LEAD',
        crew_name:      null,
        scheduled_date: null,
        completed_date: null,
        created_at:     p.created_at,
        customer:       { id: p.id, name: p.name || 'Unknown', phone: p.phone || '' },
        is_prospect:    true,
        source:         p.source ?? null,
      }));
    }

    return NextResponse.json({ jobs: [...jobs, ...prospectLeads] });
  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    const body = await req.json();
    const { customer_id, address, insurer, claim_no, notes, material, squares } = body;

    if (!customer_id || !address) {
      return NextResponse.json({ error: 'customer_id and address are required' }, { status: 400 });
    }

    const job = await prisma.jobs.create({
      data: { customer_id, address, insurer: insurer || null, claim_no: claim_no || null, notes: notes || null, material: material || null, squares: squares ? parseFloat(squares) : null },
      include: { customer: { select: { id: true, name: true, phone: true } } },
    });

    return NextResponse.json({ job });
  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
