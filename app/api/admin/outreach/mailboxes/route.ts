import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';

export async function GET() {
  try { await requireAdmin(); } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const all = [
    { index: 1, email: process.env.OUTREACH_MAILBOX_1_EMAIL || '', name: process.env.OUTREACH_MAILBOX_1_NAME || '' },
    { index: 2, email: process.env.OUTREACH_MAILBOX_2_EMAIL || '', name: process.env.OUTREACH_MAILBOX_2_NAME || '' },
    { index: 3, email: process.env.OUTREACH_MAILBOX_3_EMAIL || '', name: process.env.OUTREACH_MAILBOX_3_NAME || '' },
    { index: 4, email: process.env.OUTREACH_MAILBOX_4_EMAIL || '', name: process.env.OUTREACH_MAILBOX_4_NAME || '' },
  ].filter(m => m.email && process.env[`OUTREACH_MAILBOX_${m.index}_PASS`]);

  return NextResponse.json({ mailboxes: all });
}
