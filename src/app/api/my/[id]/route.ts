import { NextRequest, NextResponse } from 'next/server';
import { insert, one, rows } from '@/lib/db';
import { getTracking, TrackingInfo } from '@/lib/bobgo';
import { journey } from '@/lib/journey';
import { clientIp, overLimit } from '@/lib/ratelimit';
import { messageEmail } from '@/lib/email';
import { expireStale } from '@/lib/orders';

export const dynamic = 'force-dynamic';

type O = {
  id: string; access_token: string; order_number: number; status: string; payment_method: string; customer_first: string; customer_last: string;
  email: string; phone: string; items: { description: string; qty: number }[]; total: number; shipping_method: string | null;
  address_street: string; address_suburb: string; address_city: string; address_postal: string;
  created_at: string; paid_at: string | null; tracking_reference: string | null; tracking_status: string | null; tracking_url: string | null;
};

// Bob Go is asked at most once a minute per parcel, however often the app refreshes.
const cache = new Map<string, { at: number; data: TrackingInfo | null }>();
async function live(ref: string | null) {
  if (!ref) return null;
  const hit = cache.get(ref);
  if (hit && Date.now() - hit.at < 60_000) return hit.data;
  const data = await getTracking(ref);
  cache.set(ref, { at: Date.now(), data });
  if (cache.size > 500) cache.delete(cache.keys().next().value as string);
  return data;
}

async function load(id: string, token: string): Promise<O | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const o = await one<O>(`SELECT id, access_token, order_number, status, payment_method, customer_first, customer_last, email, phone, items, total, shipping_method,
                                 address_street, address_suburb, address_city, address_postal, created_at, paid_at, tracking_reference, tracking_status, tracking_url
                            FROM orders WHERE id = ?`, [id]);
  return o && o.access_token === token ? o : null;
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  await expireStale().catch(() => {});
  const o = await load(params.id, req.nextUrl.searchParams.get('t') || '');
  if (!o) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  const t = await live(o.tracking_reference);
  const j = journey(o, t?.status || '');
  const ref = `NUV${o.order_number}`;
  const msgs = await rows<{ id: string; message: string; created_at: string }>(
    'SELECT id, message, created_at FROM messages WHERE order_ref = ? AND LOWER(email) = ? ORDER BY created_at', [ref, o.email.toLowerCase()]);
  const replies = msgs.length
    ? await rows<{ message_id: string; body: string; created_at: string }>('SELECT message_id, body, created_at FROM message_replies WHERE message_id IN (?) ORDER BY created_at', [msgs.map((m) => m.id)])
    : [];
  const chat = [
    ...msgs.map((m) => ({ from: 'you' as const, text: m.message, at: m.created_at })),
    ...replies.map((r) => ({ from: 'nuve' as const, text: r.body, at: r.created_at })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  return NextResponse.json({
    now: Date.now(),
    order: ref,
    first: o.customer_first,
    status: o.status,
    method: o.payment_method,
    placed: o.created_at,
    paid: o.paid_at,
    items: o.items.map((i) => i.description),
    total: Number(o.total),
    shipping: o.shipping_method,
    address: [o.address_street, o.address_suburb, o.address_city, o.address_postal].filter(Boolean).join(', '),
    journey: j,
    tracking: o.tracking_reference ? {
      reference: o.tracking_reference, url: o.tracking_url || '', courier: t?.courier || '',
      estimateFrom: t?.estimateFrom || '', estimateTo: t?.estimateTo || '',
      checkpoints: t?.checkpoints || [],
    } : null,
    chat,
  }, { headers: { 'Cache-Control': 'no-store' } });
}

// Customer sends a support message from the app. It lands in the admin Messages tab, linked to this order.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const o = await load(params.id, req.nextUrl.searchParams.get('t') || '');
  if (!o) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  const b = await req.json().catch(() => ({}));
  const text = String(b.message ?? '').trim().slice(0, 2000);
  if (text.length < 2) return NextResponse.json({ error: 'Type a message first.' }, { status: 400 });
  if (await overLimit(`app:${o.id}`, clientIp(req), 10, 60)) {
    return NextResponse.json({ error: 'You have sent a few messages already. We will reply soon.' }, { status: 429 });
  }
  const msgId = crypto.randomUUID();
  await insert('messages', {
    id: msgId, name: `${o.customer_first} ${o.customer_last}`.trim(), email: o.email.toLowerCase(), phone: o.phone,
    order_ref: `NUV${o.order_number}`, topic: 'Order app', message: text, ip: clientIp(req),
  });
  void messageEmail(msgId);
  return NextResponse.json({ ok: true });
}
