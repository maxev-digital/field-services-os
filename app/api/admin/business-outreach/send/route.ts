// app/api/admin/business-outreach/send/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';
import { sendEmail } from '@/lib/mailer';
import { brandedWrapper } from '@/lib/email/brandedWrapper';

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    const { business_ids, template_id, mailbox } = await req.json();

    if (!business_ids || !Array.isArray(business_ids) || business_ids.length === 0) {
      return NextResponse.json({ error: 'business_ids array is required' }, { status: 400 });
    }
    if (!template_id) {
      return NextResponse.json({ error: 'template_id is required' }, { status: 400 });
    }

    const template = await prisma.outreach_templates.findUnique({ where: { id: template_id } });
    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    const businesses = await prisma.business_directory.findMany({
      where: { id: { in: business_ids } },
    });

    const mailboxIndex = typeof mailbox === 'number' ? mailbox - 1 : 0;

    let sent = 0;
    let failed = 0;
    let skipped = 0;
    const results: Array<{
      id: string;
      name: string;
      email: string | null;
      status: 'sent' | 'failed' | 'skipped';
      error?: string;
    }> = [];

    for (const biz of businesses) {
      // Skip businesses without email
      if (!biz.email) {
        skipped++;
        results.push({
          id: biz.id,
          name: biz.name,
          email: null,
          status: 'skipped',
          error: 'No email address',
        });
        continue;
      }

      try {
        // Substitute template variables
        const vars: Record<string, string> = {
          name: biz.name || 'Business Owner',
          address: biz.address || '',
          city: biz.city || '',
          phone: biz.phone || '',
          category: biz.category || '',
          website: biz.website || '',
        };

        let subject = template.subject;
        let body = template.body;

        for (const [key, value] of Object.entries(vars)) {
          const pattern = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
          subject = subject.replace(pattern, value);
          body = body.replace(pattern, value);
        }

        // Wrap body in branded email template
        const html = brandedWrapper({ body, preheader: subject });

        // Send via nodemailer using shared mailer
        const result = await sendEmail({
          to: biz.email,
          toName: biz.name,
          subject,
          html,
          mailboxIndex,
        });

        if (!result.success) {
          throw new Error(result.error || 'Send failed');
        }

        // Update business status to CONTACTED
        await prisma.business_directory.update({
          where: { id: biz.id },
          data: {
            status: 'CONTACTED',
            last_contacted_at: new Date(),
          },
        });

        sent++;
        results.push({
          id: biz.id,
          name: biz.name,
          email: biz.email,
          status: 'sent',
        });
      } catch (err: any) {
        failed++;
        results.push({
          id: biz.id,
          name: biz.name,
          email: biz.email,
          status: 'failed',
          error: err.message,
        });
      }
    }

    // Also count businesses that were in business_ids but not found in DB
    const notFound = business_ids.length - businesses.length;
    if (notFound > 0) {
      skipped += notFound;
    }

    return NextResponse.json({
      sent,
      failed,
      skipped,
      total: business_ids.length,
      results,
    });
  } catch (error: any) {
    if (error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
