import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();
    const sig = await prisma.contract_signatures.findUnique({
      where: { estimate_id: params.id },
    });
    return NextResponse.json({ signature: sig });
  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();
    const { signer_name, signature_data } = await req.json();
    if (!signer_name || !signature_data) {
      return NextResponse.json({ error: 'signer_name and signature_data required' }, { status: 400 });
    }

    const sig = await prisma.contract_signatures.upsert({
      where:  { estimate_id: params.id },
      create: { estimate_id: params.id, signer_name, signature_data },
      update: { signer_name, signature_data, signed_at: new Date() },
    });

    return NextResponse.json({ signature: sig });
  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();
    await prisma.contract_signatures.deleteMany({ where: { estimate_id: params.id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
