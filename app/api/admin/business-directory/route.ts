// app/api/admin/business-directory/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;

  const sp = req.nextUrl.searchParams;

  const page      = Math.max(1, parseInt(sp.get('page') || '1'));
  const limit     = Math.min(100, Math.max(1, parseInt(sp.get('limit') || '50')));
  const search    = sp.get('search')?.trim() || '';
  const category  = sp.get('category')?.trim() || '';
  const city      = sp.get('city')?.trim() || '';
  const status    = sp.get('status')?.trim() || '';
  const hasEmail  = sp.get('has_email') === '1';
  const hasPhone  = sp.get('has_phone') === '1';

  // Build where clause
  const where: any = {};

  if (search) {
    where.OR = [
      { name:    { contains: search, mode: 'insensitive' } },
      { address: { contains: search, mode: 'insensitive' } },
      { phone:   { contains: search, mode: 'insensitive' } },
      { email:   { contains: search, mode: 'insensitive' } },
    ];
  }

  if (category) {
    where.category = category;
  }

  if (city) {
    where.city = { contains: city, mode: 'insensitive' };
  }

  if (status) {
    where.status = status;
  }

  if (hasEmail) {
    where.email = { not: null };
  }

  if (hasPhone) {
    where.phone = { not: null };
  }

  const [businesses, total, categoriesRaw, withEmail, withPhone, contacted] = await Promise.all([
    prisma.business_directory.findMany({
      where,
      orderBy: { name: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.business_directory.count({ where }),
    prisma.business_directory.findMany({
      where: { category: { not: null } },
      distinct: ['category'],
      select: { category: true },
      orderBy: { category: 'asc' },
    }),
    prisma.business_directory.count({ where: { email: { not: null } } }),
    prisma.business_directory.count({ where: { phone: { not: null } } }),
    prisma.business_directory.count({ where: { status: { not: 'NEW' } } }),
  ]);

  const categories = categoriesRaw
    .map(c => c.category)
    .filter(Boolean) as string[];

  return NextResponse.json({
    businesses,
    total,
    page,
    pages: Math.ceil(total / limit),
    categories,
    stats: {
      total: await prisma.business_directory.count(),
      withEmail,
      withPhone,
      contacted,
    },
  });
}
