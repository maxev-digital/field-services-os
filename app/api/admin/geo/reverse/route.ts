import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';

export async function GET(req: NextRequest) {
  try { await requireAdmin(); } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const lat = searchParams.get('lat');
  const lon = searchParams.get('lon');
  if (!lat || !lon) return NextResponse.json({ zip: null });

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`;
    const res  = await fetch(url, {
      headers: { 'User-Agent': 'RoofWorksAdmin/1.0 contact:info@roofworksoftexas.com' },
      next: { revalidate: 86400 },
    });
    const data = await res.json();
    const zip  = data?.address?.postcode?.split('-')[0] ?? null; // trim ZIP+4 suffix
    return NextResponse.json({ zip }, { headers: { 'Cache-Control': 'public, max-age=86400' } });
  } catch {
    return NextResponse.json({ zip: null });
  }
}
