/**
 * POST /api/admin/outreach/send
 * Sends outreach emails to storm prospects via configured Hostinger mailboxes.
 * Uses lib/mailer.ts (supports up to 4 mailboxes, 500/day each).
 *
 * Body: {
 *   prospect_ids: string[],
 *   template_id: string,
 *   mailbox?: number,         // 1-4, defaults to 1
 *   custom_subject?: string,  // override template subject
 *   custom_body?: string,     // override template body HTML
 * }
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';
import { sendEmail } from '@/lib/mailer';
import fs from 'fs';
import path from 'path';
import { wrapInBrandedEmail } from '@/lib/email/brandedWrapper';

function getRepName(): string {
  try {
    const f = path.join(process.cwd(), 'data', 'admin-settings.json');
    const s = JSON.parse(fs.readFileSync(f, 'utf8'));
    return s.repName || 'Will';
  } catch { return 'Will'; }
}

function substituteVars(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
}

export async function POST(req: NextRequest) {
  try { await requireAdmin(); } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { prospect_ids, template_id, mailbox = 1, custom_subject, custom_body } = body;

  if (!prospect_ids?.length || !template_id) {
    return NextResponse.json({ error: 'prospect_ids and template_id required' }, { status: 400 });
  }

  const tmpl = await prisma.outreach_templates.findUnique({ where: { id: template_id } });
  if (!tmpl) return NextResponse.json({ error: 'Template not found' }, { status: 404 });

  const prospects = await prisma.storm_prospects.findMany({
    where: { id: { in: prospect_ids } },
  });

  const mailboxIndex = typeof mailbox === 'number' ? mailbox - 1 : 0;
  const BASE_URL     = process.env.NEXTAUTH_URL || 'https://admin.roofworksoftexas.com';
  const repName      = getRepName();

  // Send all emails in parallel — avoids sequential SMTP timeout on large batches
  const results = await Promise.all(prospects.map(async (prospect): Promise<{ id: string; status: string; error?: string }> => {
    if (!prospect.email) return { id: prospect.id, status: 'skipped_no_email' };
    if ((prospect as any).status === 'DNC') return { id: prospect.id, status: 'skipped_dnc' };

    const vars: Record<string, string> = {
      name:         prospect.name || 'Homeowner',
      first_name:   (prospect.name || 'Homeowner').split(' ')[0],
      address:      prospect.address,
      city:         prospect.city,
      phone:        prospect.phone || '',
      neighborhood: prospect.neighborhood || prospect.city,
      rep_name:     repName,
    };

    const subject        = custom_subject ?? substituteVars(tmpl.subject, vars);
    const rawBody        = custom_body ?? substituteVars(tmpl.body, vars);
    const rawBodyText    = (tmpl as any).body_text ? substituteVars((tmpl as any).body_text, vars) : null;
    const unsubscribeUrl = `${BASE_URL}/api/unsubscribe?email=${encodeURIComponent(prospect.email)}`;
    const html           = wrapInBrandedEmail(rawBody, { preheader: subject, repName, repTitle: 'Owner, Roof Works of Texas', unsubscribeUrl });
    const textWithUnsub  = rawBodyText ? `${rawBodyText}\n\n--\nTo unsubscribe: ${unsubscribeUrl}` : null;

    const result = await sendEmail({
      to:          prospect.email,
      toName:      prospect.name || undefined,
      subject,
      html,
      text:        textWithUnsub || undefined,
      mailboxIndex,
    });

    if (result.success) {
      await Promise.all([
        prisma.outreach_history.create({
          data: { prospect_id: prospect.id, template_id: tmpl.id, from_email: result.fromEmail || '', subject, status: 'sent' },
        }),
        prisma.storm_prospects.update({
          where: { id: prospect.id },
          data:  { status: 'CONTACTED', last_contacted_at: new Date(), updated_at: new Date() },
        }),
      ]);
      return { id: prospect.id, status: 'sent' };
    } else {
      await prisma.outreach_history.create({
        data: { prospect_id: prospect.id, template_id: tmpl.id, from_email: result.fromEmail || '', subject, status: 'failed', error_msg: result.error },
      });
      return { id: prospect.id, status: 'failed', error: result.error };
    }
  }));

  const sent    = results.filter(r => r.status === 'sent').length;
  const failed  = results.filter(r => r.status === 'failed').length;
  const skipped = results.filter(r => r.status.startsWith('skipped')).length;

  return NextResponse.json({ sent, failed, skipped, results });
}
