import { NextRequest, NextResponse } from 'next/server';
import { one } from '@/lib/db';

export const dynamic = 'force-dynamic';

// One home-screen app per order: it opens straight onto that order's tracking.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const t = req.nextUrl.searchParams.get('t') || '';
  if (!/^[0-9a-f-]{36}$/.test(params.id) || !t) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const o = await one<{ order_number: number; access_token: string }>('SELECT order_number, access_token FROM orders WHERE id = ?', [params.id]);
  if (!o || o.access_token !== t) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const start = `/my/${params.id}?t=${encodeURIComponent(t)}`;
  return NextResponse.json({
    id: start,
    name: `Nuvé order NUV${o.order_number}`,
    short_name: 'Nuvé',
    description: 'Track your Nuvé delivery and message us.',
    start_url: start,
    scope: '/my/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#1E1714',
    theme_color: '#1E1714',
    icons: [
      { src: '/brand/app-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/brand/app-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/brand/app-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }, { headers: { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' } });
}
