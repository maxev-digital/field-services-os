import { NextRequest, NextResponse } from 'next/server';

// Proxy ESRI tile requests server-side to avoid CORS issues with server.arcgisonline.com
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const z   = searchParams.get('z');
  const y   = searchParams.get('y');
  const x   = searchParams.get('x');
  const svc = searchParams.get('svc') || 'World_Imagery/MapServer';

  if (!z || !y || !x) return new NextResponse(null, { status: 400 });

  const upstream = `https://server.arcgisonline.com/ArcGIS/rest/services/${svc}/tile/${z}/${y}/${x}`;
  try {
    const res = await fetch(upstream, {
      headers: { 'User-Agent': 'Mozilla/5.0 RoofWorksAdmin/1.0' },
      next: { revalidate: 86400 },
    });
    if (!res.ok) return new NextResponse(null, { status: res.status });
    const buf = await res.arrayBuffer();
    const ct  = res.headers.get('content-type') || 'image/jpeg';
    return new NextResponse(buf, {
      headers: {
        'Content-Type': ct,
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
}
