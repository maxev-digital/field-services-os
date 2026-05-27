/**
 * GET  /api/admin/notifications — fetch unread notifications
 * POST /api/admin/notifications — mark notifications as read
 */
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/admin-auth';

export async function GET() {
  try {
    await requireAdmin();

    const notifications: any[] = await prisma.$queryRaw`
      SELECT id, type, title, message, data, read, created_at
      FROM admin_notifications
      WHERE created_at > NOW() - INTERVAL '7 days'
      ORDER BY created_at DESC
      LIMIT 50
    `;

    const unreadCount: any[] = await prisma.$queryRaw`
      SELECT COUNT(*)::int as count FROM admin_notifications WHERE read = false
    `;

    return NextResponse.json({
      notifications,
      unreadCount: unreadCount[0]?.count ?? 0,
    });
  } catch (err: any) {
    if (err.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[GET /api/admin/notifications]', err.message);
    return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();

    const body = await req.json();
    const { notification_ids } = body;

    if (notification_ids === 'all') {
      await prisma.$executeRaw`UPDATE admin_notifications SET read = true WHERE read = false`;
    } else if (Array.isArray(notification_ids) && notification_ids.length > 0) {
      await prisma.$executeRaw`
        UPDATE admin_notifications SET read = true WHERE id = ANY(${notification_ids})
      `;
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    if (err.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[POST /api/admin/notifications]', err.message);
    return NextResponse.json({ error: 'Failed to update notifications' }, { status: 500 });
  }
}
