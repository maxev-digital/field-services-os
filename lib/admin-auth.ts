import bcrypt from 'bcrypt';
import { cookies } from 'next/headers';
import prisma from './prisma';

const ADMIN_SESSION_COOKIE = 'rwt_admin_session';
const SESSION_EXPIRY_DAYS = 7;

export interface AdminUser {
  id: string;
  email: string;
  role: string;
  name: string;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createAdminSession(userId: string): Promise<string> {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_EXPIRY_DAYS);

  const session = await prisma.admin_sessions.create({
    data: { user_id: userId, expires_at: expiresAt },
  });

  const cookieStore = await cookies();
  cookieStore.set(ADMIN_SESSION_COOKIE, session.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires: expiresAt,
    path: '/',
  });

  return session.id;
}

export async function getCurrentAdmin(): Promise<AdminUser | null> {
  try {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
    if (!sessionId) return null;

    const session = await prisma.admin_sessions.findFirst({
      where: { id: sessionId, expires_at: { gt: new Date() } },
    });
    if (!session) return null;

    const admin = await prisma.admin_users.findUnique({
      where: { id: session.user_id },
      select: { id: true, email: true, role: true, name: true },
    });

    return admin;
  } catch {
    return null;
  }
}

export async function deleteAdminSession(): Promise<void> {
  try {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
    if (sessionId) {
      await prisma.admin_sessions.delete({ where: { id: sessionId } }).catch(() => {});
    }
    cookieStore.delete(ADMIN_SESSION_COOKIE);
  } catch {}
}

export async function requireAdmin(): Promise<AdminUser> {
  const admin = await getCurrentAdmin();
  if (!admin) throw new Error('Unauthorized');
  return admin;
}

export async function requireAdminOrInternal(req?: { headers: { get(name: string): string | null } }): Promise<AdminUser> {
  // Allow server-to-server calls via x-internal-key header
  const key = req?.headers?.get('x-internal-key');
  if (key && key === process.env.ADMIN_SECRET) {
    return { id: 'system', email: 'system@roofworks.internal', role: 'admin', name: 'System' };
  }
  return requireAdmin();
}
