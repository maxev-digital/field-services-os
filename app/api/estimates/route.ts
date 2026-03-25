/**
 * PUBLIC endpoint — called by roofworksoftexas.com estimate tool
 * No auth required.
 *
 * Payload shape (from Hostinger estimate tool):
 *   { project, contact, lineItems[], totals }
 *
 * lineItems fields accepted (both camelCase from tool and snake_case):
 *   id, label, category, unit, qty,
 *   xactimatePerUnit | xactimate_per_unit,
 *   ourPerUnit | our_per_unit,
 *   insAmt, ourAmt, delta
 *
 * All submitted line items are saved. Unknown IDs are auto-created in
 * line_item_master so the admin can see and manage pricing later.
 */
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { notifyNewEstimate, notifyEstimateCustomer } from '@/lib/notify';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { project, contact, lineItems, totals } = body;

    // ── Validate required fields ──────────────────────────────────────────
    if (!contact?.name || !contact?.phone || !project?.address) {
      return NextResponse.json(
        { error: 'Missing required fields: name, phone, address' },
        { status: 400, headers: CORS_HEADERS }
      );
    }
    if (!Array.isArray(lineItems) || lineItems.length === 0) {
      return NextResponse.json(
        { error: 'No line items provided' },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // ── Normalise each line item ──────────────────────────────────────────
    // Accept both camelCase (from estimate tool) and snake_case field names.
    const normalisedItems = lineItems.map((item: any) => {
      const qty              = parseFloat(item.qty) || 0;
      const xactimatePerUnit = item.xactimatePerUnit ?? item.xactimate_per_unit ?? 0;
      const ourPerUnit       = item.ourPerUnit       ?? item.our_per_unit       ?? 0;
      const insAmt           = item.insAmt ?? qty * xactimatePerUnit;
      const ourAmt           = item.ourAmt ?? qty * ourPerUnit;
      const delta            = item.delta  ?? insAmt - ourAmt;

      return {
        id:             String(item.id),
        label:          item.label    || String(item.id),
        category:       item.category || 'Other',
        unit:           item.unit     || 'EA',
        qty,
        xactimatePerUnit,
        ourPerUnit,
        insAmt,
        ourAmt,
        delta,
      };
    });

    // ── Upsert unknown items into line_item_master ────────────────────────
    // Creates any ID we haven't seen before; never overwrites admin pricing.
    await Promise.all(
      normalisedItems.map(item =>
        prisma.line_item_master.upsert({
          where:  { id: item.id },
          create: {
            id:        item.id,
            label:     item.label,
            category:  item.category,
            unit:      item.unit,
            xactimate: item.xactimatePerUnit,
            ours:      item.ourPerUnit,
          },
          update: {}, // never overwrite admin-managed prices
        })
      )
    );

    // ── Find or create customer by phone ──────────────────────────────────
    let customer = await prisma.customers.findFirst({
      where: { phone: contact.phone },
    });
    if (!customer) {
      customer = await prisma.customers.create({
        data: {
          name:    contact.name,
          phone:   contact.phone,
          email:   contact.email   || null,
          address: project.address || null,
        },
      });
    }

    // ── Calculate totals (trust payload values; recalculate as fallback) ──
    const insuranceTotal = totals?.insuranceTotal
      ?? normalisedItems.reduce((s, i) => s + i.insAmt, 0);
    const ourTotal = totals?.ourTotal
      ?? normalisedItems.reduce((s, i) => s + i.ourAmt, 0);
    const savings    = insuranceTotal - ourTotal;
    const savingsPct = insuranceTotal > 0 ? (savings / insuranceTotal) * 100 : 0;

    // ── Create estimate + all line items ─────────────────────────────────
    const estimate = await prisma.estimates.create({
      data: {
        customer_id:     customer.id,
        address:         project.address,
        insurer:         project.insurer || null,
        claim_no:        project.claimNo || null,
        adj_date:        project.adjDate || null,
        insurance_total: insuranceTotal,
        our_total:       ourTotal,
        savings,
        savings_pct:     savingsPct,
        status:          'DRAFT',
        line_items: {
          create: normalisedItems.map(item => ({
            line_item_id:       item.id,
            label:              item.label,
            category:           item.category,
            unit:               item.unit,
            qty:                item.qty,
            xactimate_per_unit: item.xactimatePerUnit,
            our_per_unit:       item.ourPerUnit,
            ins_amt:            item.insAmt,
            our_amt:            item.ourAmt,
            delta:              item.delta,
          })),
        },
      },
    });

    // ── Auto-create storm_prospect so outreach system can follow up ──────
    const existingProspect = await prisma.storm_prospects.findFirst({
      where: { phone: contact.phone },
    });
    if (!existingProspect) {
      await prisma.storm_prospects.create({
        data: {
          name:    contact.name,
          address: project.address,
          city:    'DFW',
          phone:   contact.phone  || null,
          email:   contact.email  || null,
          source:  'estimate_tool',
          status:  'INTERESTED',
          notes:   `Online estimate submitted. Insurer: ${project.insurer || '—'} | Claim #: ${project.claimNo || '—'} | Our Total: $${ourTotal.toFixed(2)}`,
        },
      });
    } else if (['NEW', 'NO_RESPONSE'].includes(existingProspect.status)) {
      await prisma.storm_prospects.update({
        where: { id: existingProspect.id },
        data:  { status: 'INTERESTED', last_contacted_at: new Date() },
      });
    }

    // ── Customer confirmation email (non-blocking) ────────────────────────
    if (customer.email) {
      notifyEstimateCustomer({
        estimateId:     estimate.id,
        customerName:   customer.name,
        customerEmail:  customer.email,
        address:        project.address,
        insurer:        project.insurer || null,
        claimNo:        project.claimNo || null,
        ourTotal,
        insuranceTotal,
        lineItems:      normalisedItems.map(i => ({
          label:    i.label,
          category: i.category,
          qty:      i.qty,
          unit:     i.unit,
          insAmt:   i.insAmt,
          ourAmt:   i.ourAmt,
          delta:    i.delta,
        })),
      });
    }

    // ── Admin notification (non-blocking) ────────────────────────────────
    notifyNewEstimate({
      estimateId:     estimate.id,
      customerName:   customer.name,
      customerPhone:  customer.phone,
      customerEmail:  customer.email,
      address:        project.address,
      insurer:        project.insurer || null,
      claimNo:        project.claimNo || null,
      ourTotal,
      insuranceTotal,
      lineItems:      normalisedItems.map(i => ({
        label:    i.label,
        category: i.category,
        qty:      i.qty,
        unit:     i.unit,
        insAmt:   i.insAmt,
        ourAmt:   i.ourAmt,
        delta:    i.delta,
      })),
    });

    return NextResponse.json(
      { success: true, estimateId: estimate.id, message: "We'll be in touch shortly." },
      { headers: CORS_HEADERS }
    );

  } catch (error: any) {
    console.error('[POST /api/estimates]', error.message);
    return NextResponse.json(
      { error: 'Failed to save estimate' },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
