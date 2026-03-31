import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';

export async function GET(_req: NextRequest) {
  try {
    await requireAdmin();

    // Leads = customers with estimates in DRAFT or SENT status (no converted job yet)
    const estimates = await prisma.estimates.findMany({
      where: { status: { in: ['DRAFT', 'SENT'] }, job_id: null },
      include: { customer: { select: { id: true, name: true, phone: true, email: true } } },
      orderBy: { created_at: 'desc' },
    });

    // Also include INTERESTED storm prospects that haven't been converted yet
    const unconvertedProspects = await prisma.storm_prospects.findMany({
      where: { status: 'INTERESTED' },
      orderBy: { updated_at: 'desc' },
      take: 100,
    });

    // Map prospects into a similar lead shape for the frontend
    const prospectLeads = unconvertedProspects.map((p: any) => ({
      id: p.id,
      type: 'prospect' as const,
      address: p.address,
      insurer: null,
      claim_no: null,
      our_total: 0,
      insurance_total: 0,
      status: 'INTERESTED',
      created_at: p.updated_at || p.created_at,
      customer: {
        id: p.id,
        name: p.name || 'Storm Lead',
        phone: p.phone || '',
        email: p.email || null,
      },
      source: p.source || 'storm_campaign',
      notes: p.notes || null,
    }));

    // Tag estimate leads
    const estimateLeads = estimates.map((e: any) => ({
      ...e,
      type: 'estimate' as const,
    }));

    const allLeads = [...estimateLeads, ...prospectLeads];

    return NextResponse.json({
      leads: allLeads,
      total: allLeads.length,
      estimate_count: estimates.length,
      prospect_count: unconvertedProspects.length,
    });
  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
