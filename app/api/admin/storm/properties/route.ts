/**
 * Storm Properties API
 * Proxies to the MRMS Python microservice which does Shapely point-in-polygon
 * (no PostGIS required — works with standard PostgreSQL + Alpine).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';

const MRMS_BASE = 'http://127.0.0.1:8001';

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    const body = await req.json();
    const { polygon, excludeRentals = false, excludeExisting = false, minYearBuilt, limit = 500, offset = 0 } = body;

    if (!polygon) return NextResponse.json({ error: 'polygon required' }, { status: 400 });

    const params = new URLSearchParams({
      exclude_rentals: String(excludeRentals),
      exclude_existing: String(excludeExisting),
      limit: String(limit),
      offset: String(offset),
    });
    if (minYearBuilt) params.set('min_year_built', String(minYearBuilt));

    const res = await fetch(`${MRMS_BASE}/properties?${params}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(polygon),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return NextResponse.json({ properties: [], total: 0, message: err.detail || 'Lookup failed' });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    // MRMS not running yet
    return NextResponse.json({
      properties: [],
      total: 0,
      message: 'Property lookup service not available. Load CAD data first.',
    });
  }
}

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const res = await fetch(`${MRMS_BASE}/health`, { signal: AbortSignal.timeout(3000) }).catch(() => null);
    if (!res?.ok) return NextResponse.json({ sources: [], status: 'service_offline' });
    const health = await res.json();
    return NextResponse.json({ sources: [], status: 'online', ...health });
  } catch {
    return NextResponse.json({ sources: [], status: 'service_offline' });
  }
}
