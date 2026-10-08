import { NextRequest, NextResponse } from 'next/server';
import { one } from '@/lib/db';
import { expireStale } from '@/lib/orders';

// Lets the customer's order page poll for status changes. Needs the order's private access token.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const t = req.nextUrl.searchParams.get('t') || '';
  await expireStale();
  const data = await one('SELECT status, expires_at, pop_uploaded_at, tracking_reference, tracking_url, access_token FROM orders WHERE id = ?', [params.id]);
  if (!data || data.access_token !== t) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  const { access_token: _omit, ...rest } = data;
  return NextResponse.json({ ...rest, now: Date.now() });
}
