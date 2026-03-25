import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();
    const body = await req.json();
    const {
      status, insurer, claim_no, adjuster_name, adjuster_phone, adjuster_email,
      date_filed, deductible, acv_amount, rcv_amount,
      approved_amount, depreciation, supplement_no,
      supplement_status, final_settlement,
      mortgage_company, mortgage_loan_no, notes,
    } = body;

    const data: any = {};
    if (status !== undefined)           data.status            = status;
    if (insurer !== undefined)          data.insurer           = insurer;
    if (claim_no !== undefined)         data.claim_no          = claim_no;
    if (adjuster_name !== undefined)    data.adjuster_name     = adjuster_name;
    if (adjuster_phone !== undefined)   data.adjuster_phone    = adjuster_phone;
    if (adjuster_email !== undefined)   data.adjuster_email    = adjuster_email || null;
    if (date_filed !== undefined)       data.date_filed        = date_filed ? new Date(date_filed) : null;
    if (deductible !== undefined)       data.deductible        = deductible        ? parseFloat(deductible)        : null;
    if (acv_amount !== undefined)       data.acv_amount        = acv_amount        ? parseFloat(acv_amount)        : null;
    if (rcv_amount !== undefined)       data.rcv_amount        = rcv_amount        ? parseFloat(rcv_amount)        : null;
    if (approved_amount !== undefined)  data.approved_amount   = approved_amount   ? parseFloat(approved_amount)   : null;
    if (depreciation !== undefined)     data.depreciation      = depreciation      ? parseFloat(depreciation)      : null;
    if (supplement_no !== undefined)    data.supplement_no     = supplement_no;
    if (supplement_status !== undefined)data.supplement_status = supplement_status;
    if (final_settlement !== undefined) data.final_settlement  = final_settlement  ? parseFloat(final_settlement)  : null;
    if (mortgage_company !== undefined) data.mortgage_company  = mortgage_company  || null;
    if (mortgage_loan_no !== undefined) data.mortgage_loan_no  = mortgage_loan_no  || null;
    if (notes !== undefined)            data.notes             = notes;

    const claim = await prisma.insurance_claims.update({ where: { id: params.id }, data });
    return NextResponse.json({ claim });
  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
