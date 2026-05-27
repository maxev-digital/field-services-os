/**
 * PUBLIC endpoint — called by roofworksoftexas.com contact form.
 * Saves to customers table + fires admin email notification.
 * No auth required.
 */
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { notifyNewContact } from '@/lib/notify';
import { notifyNewContact as tgNotifyContact } from '@/lib/telegram-notify';

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
    const { name, phone, email, message, source } = body;

    if (!name || !phone || !message) {
      return NextResponse.json(
        { error: 'name, phone, and message are required' },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // Save contact to customers (find or create by phone)
    let customer = await prisma.customers.findFirst({
      where: { phone: phone.trim() },
    });

    if (!customer) {
      customer = await prisma.customers.create({
        data: {
          name:  name.trim(),
          phone: phone.trim(),
          email: email?.trim() || null,
          notes: `Contact form (${new Date().toLocaleDateString('en-US')}): ${message.trim()}`,
        },
      });
    } else {
      // Append note to existing customer
      const existingNotes = customer.notes || '';
      await prisma.customers.update({
        where: { id: customer.id },
        data: {
          notes: [
            existingNotes,
            `Contact form (${new Date().toLocaleDateString('en-US')}): ${message.trim()}`,
          ].filter(Boolean).join('\n\n'),
        },
      });
    }

    // ── Insert admin notification for new contact ─────────────────────────
    try {
      await prisma.$executeRaw`
        INSERT INTO admin_notifications (id, type, title, message, data)
        VALUES (
          gen_random_uuid()::text,
          'new_contact',
          ${'New Contact — ' + name.trim()},
          ${name.trim() + ': ' + message.trim().slice(0, 100)},
          ${JSON.stringify({ customerName: name.trim(), phone: phone.trim(), email: email?.trim() || null, message: message.trim() })}::jsonb
        )`;
    } catch (e: any) {
      console.error('[contact] Failed to insert notification:', e.message);
    }

    // Fire admin notification — non-blocking
    notifyNewContact({
      name:    name.trim(),
      phone:   phone.trim(),
      email:   email?.trim() || null,
      message: message.trim(),
      source:  source || 'Contact Form',
    });

    // Telegram push
    tgNotifyContact(name.trim(), phone.trim(), message.trim()).catch(() => {});

    return NextResponse.json(
      { success: true, message: "Thanks! We'll be in touch within 24 hours." },
      { headers: CORS_HEADERS }
    );
  } catch (error: any) {
    console.error('[POST /api/contact]', error.message);
    return NextResponse.json(
      { error: 'Failed to save contact' },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
