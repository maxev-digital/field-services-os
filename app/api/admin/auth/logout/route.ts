import { NextResponse } from 'next/server';
import { deleteAdminSession } from '@/lib/admin-auth';

export async function POST() {
  await deleteAdminSession();
  return NextResponse.json({ success: true });
}
