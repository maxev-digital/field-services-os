// app/api/admin/mileage/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import prisma from '@/lib/prisma';

const IRS_MILEAGE_RATE = 0.70; // 2026 IRS standard mileage rate

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();

    const { searchParams } = new URL(request.url);
    const date_from = searchParams.get('date_from');
    const date_to = searchParams.get('date_to');

    // Build YTD date range for stats
    const now = new Date();
    const ytdStart = new Date(now.getFullYear(), 0, 1);

    const where: any = {};
    if (date_from || date_to) {
      where.date = {};
      if (date_from) where.date.gte = new Date(date_from);
      if (date_to) where.date.lte = new Date(date_to);
    }

    // Fetch trips (newest first)
    const rows = await prisma.mileage_log.findMany({
      where,
      orderBy: { date: 'desc' },
    });

    // Shape trips exactly as the page expects
    const trips = rows.map((r: any) => ({
      id: r.id,
      date: r.date instanceof Date
        ? r.date.toISOString().slice(0, 10)
        : String(r.date).slice(0, 10),
      from_location: r.from_location,
      to_location: r.to_location,
      miles: r.miles,
      purpose: r.purpose,
      job_address: r.job_address ?? undefined,
      notes: r.notes ?? undefined,
      deduction: r.deduction,
    }));

    // YTD stats (always YTD regardless of filter)
    const ytdRows = await prisma.mileage_log.findMany({
      where: { date: { gte: ytdStart } },
      select: { miles: true, deduction: true, date: true },
    });

    const total_miles_ytd = ytdRows.reduce((s: number, r: any) => s + r.miles, 0);
    const total_deduction = ytdRows.reduce((s: number, r: any) => s + r.deduction, 0);

    // Days from Jan 1 to today (avoid /0)
    const dayOfYear = Math.max(
      Math.floor((now.getTime() - ytdStart.getTime()) / (1000 * 60 * 60 * 24)) + 1,
      1
    );
    const avg_miles_per_day = total_miles_ytd / dayOfYear;

    const stats = {
      total_miles_ytd: Math.round(total_miles_ytd * 10) / 10,
      total_deduction: Math.round(total_deduction * 100) / 100,
      avg_miles_per_day: Math.round(avg_miles_per_day * 10) / 10,
      irs_rate: IRS_MILEAGE_RATE,
    };

    // Monthly summary for YTD (group by YYYY-MM)
    const monthMap: Record<string, { miles: number; deduction: number }> = {};
    for (const r of ytdRows) {
      const d = r.date instanceof Date ? r.date : new Date(r.date);
      const key = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      if (!monthMap[key]) monthMap[key] = { miles: 0, deduction: 0 };
      monthMap[key].miles += r.miles;
      monthMap[key].deduction += r.deduction;
    }

    const monthly_summary = Object.entries(monthMap).map(([month, v]) => ({
      month,
      miles: Math.round(v.miles * 10) / 10,
      deduction: Math.round(v.deduction * 100) / 100,
    }));

    return NextResponse.json({ trips, stats, monthly_summary });
  } catch (error: any) {
    if (error.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();

    const body = await request.json();
    const {
      date,
      from_location,
      to_location,
      miles,
      purpose,
      job_address,
      notes,
    } = body;

    const milesNum = parseFloat(miles);
    const deduction = Math.round(milesNum * IRS_MILEAGE_RATE * 100) / 100;

    const entry = await prisma.mileage_log.create({
      data: {
        date: new Date(date),
        from_location,
        to_location,
        miles: milesNum,
        purpose,
        job_address: job_address || null,
        irs_rate: IRS_MILEAGE_RATE,
        deduction,
        notes: notes || null,
      },
    });

    return NextResponse.json(entry, { status: 201 });
  } catch (error: any) {
    if (error.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
