import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';

export async function GET(_req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {

  // ── 1. Estimates (DRAFT + SENT) with customer info ──────────────────────
  const estimates = await prisma.estimates.findMany({
    where: { status: { in: ['DRAFT', 'SENT'] as any } },
    orderBy: { created_at: 'desc' },
    include: {
      customer: {
        select: { id: true, name: true, phone: true, email: true },
      },
    },
  });

  const estimateLeads = estimates.map((e: any) => ({
    id:               e.id,
    type:             'estimate' as const,
    address:          e.address,
    insurer:          e.insurer ?? null,
    claim_no:         e.claim_no ?? null,
    our_total:        e.our_total,
    insurance_total:  e.insurance_total,
    status:           e.status,
    created_at:       e.created_at,
    customer: {
      id:    e.customer.id,
      name:  e.customer.name,
      phone: e.customer.phone,
      email: e.customer.email ?? null,
    },
  }));

  // ── 2. INTERESTED storm prospects (not yet converted to customers) ────────
  const interestedProspects = await prisma.storm_prospects.findMany({
    where: { status: 'INTERESTED' as any },
    orderBy: { updated_at: 'desc' },
  });

  const prospectLeads = interestedProspects
    .map((p: any) => ({
      id:               p.id,
      type:             'prospect' as const,
      address:          p.address ?? '',
      insurer:          null,
      claim_no:         null,
      our_total:        0,
      insurance_total:  0,
      status:           p.status,
      created_at:       p.updated_at,
      customer: {
        id:    p.id,
        name:  p.name ?? 'Unknown',
        phone: p.phone ?? '',
        email: null,
      },
      source: p.source ?? null,
      notes:        p.notes ?? null,
      report_token: p.report_token ?? null,
    }));

  // ── 3. PENDING_CONFIRMATION — IVR press-1/2 responses needing verification
  const pendingProspects = await prisma.storm_prospects.findMany({
    where: { status: 'PENDING_CONFIRMATION' as any },
    orderBy: { updated_at: 'desc' },
    include: {
      ivr_calls: {
        orderBy: { created_at: 'desc' },
        take: 1,
        select: { digit_pressed: true, created_at: true },
      },
    },
  });

  const pendingLeads = pendingProspects.map((p: any) => {
    const digitPressed = p.ivr_calls?.[0]?.digit_pressed ?? null;
    const isEmailReply = !digitPressed && (p.notes ?? '').includes('Email reply flagged');
    return {
      id:            p.id,
      name:          p.name ?? 'Unknown',
      phone:         p.phone ?? '',
      address:       [p.address, p.city].filter(Boolean).join(', '),
      source:        p.source ?? null,
      digit_pressed: digitPressed,
      call_time:     p.ivr_calls?.[0]?.created_at?.toISOString() ?? p.updated_at?.toISOString() ?? null,
      reply_source:  isEmailReply ? 'email' : 'ivr',
    };
  });

  const leads = [...estimateLeads, ...prospectLeads];

  return NextResponse.json({
    leads,
    total:          leads.length,
    estimate_count: estimateLeads.length,
    prospect_count: prospectLeads.length,
    pending_leads:  pendingLeads,
    pending_count:  pendingLeads.length,
  });

  } catch (err: any) {
    console.error('[leads GET]', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    const { name, phone, email, address, damageType, insurer, notes } = await req.json();
    if (!name || !phone) return NextResponse.json({ error: 'Name and phone are required' }, { status: 400 });

    const fullNotes = [
      damageType ? `Damage type: ${damageType}` : null,
      notes || null,
    ].filter(Boolean).join('\n');

    const customer = await prisma.customers.create({
      data: {
        name,
        phone,
        email: email || null,
        address: address || null,
        notes: fullNotes || null,
      },
    });

    const estimate = await prisma.estimates.create({
      data: {
        customer_id:     customer.id,
        address:         address || '',
        insurer:         insurer || null,
        insurance_total: 0,
        our_total:       0,
        savings:         0,
        savings_pct:     0,
        status:          'DRAFT',
      },
    });

    return NextResponse.json({ customer, estimate });
  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
