import { NextRequest, NextResponse } from 'next/server';
import { one, rows } from '@/lib/db';
import { getTracking } from '@/lib/bobgo';
import { clientIp, overLimit } from '@/lib/ratelimit';

export const dynamic = 'force-dynamic';

const CUSTOMER_STATUS: Record<string, string> = {
  pending_payment: 'Waiting for payment',
  awaiting_eft: 'Waiting for your bank transfer',
  eft_review: 'Checking your payment',
  paid: 'Payment received. Preparing your order',
  sending: 'Payment received. Preparing your order',
  sent_to_bobgo: 'Being packed for the courier',
  shipped: 'On its way',
  delivered: 'Delivered',
  expired: 'Expired (payment not received)',
  cancelled: 'Cancelled',
};
// Progress steps shown as a bar: 0 ordered, 1 paid, 2 packed, 3 shipped, 4 delivered
const STEP: Record<string, number> = { pending_payment: 0, awaiting_eft: 0, eft_review: 0, paid: 1, sending: 1, sent_to_bobgo: 2, shipped: 3, delivered: 4 };

const digits = (v: string) => v.replace(/\D/g, '');
// Webhook statuses look like "in-transit"; show them as "In transit".
const pretty = (v: string | null) => (v ? v.replace(/[-_]+/g, ' ').replace(/^./, (c) => c.toUpperCase()) : '');

// "Track My Order": the customer proves it's their order with the order number plus the email or phone used.
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const num = Number(String(b.order ?? '').trim().replace(/^#/, '').replace(/^nuv/i, ''));
  const who = String(b.contact ?? '').trim().toLowerCase();
  if (!Number.isInteger(num) || num <= 0 || who.length < 5) {
    return NextResponse.json({ error: 'Enter your order number (e.g. NUV1001) and the email address or phone number you ordered with.' }, { status: 400 });
  }
  try {
    if (await overLimit('track', clientIp(req), 12, 15)) {
      return NextResponse.json({ error: 'Too many attempts. Please wait 15 minutes and try again.' }, { status: 429 });
    }
    const o = await one(`SELECT id, access_token, order_number, status, payment_method, email, phone, items, total, shipping_method,
                                address_suburb, address_city, created_at, paid_at, tracking_reference, tracking_status, tracking_url
                           FROM orders WHERE order_number = ?`, [num]);
    const matches = o && (who.includes('@') ? o.email.toLowerCase() === who : digits(who).length >= 9 && digits(o.phone).slice(-9) === digits(who).slice(-9));
    if (!o || !matches) {
      return NextResponse.json({ error: 'We couldn\'t find an order with those details. Check the order number and use the same email or phone number as at checkout.' }, { status: 404 });
    }
    const events = await rows<{ kind: string; created_at: string }>(
      "SELECT kind, created_at FROM order_events WHERE order_id = ? AND kind IN ('created','paid','bobgo','shipped','delivered','tracking') ORDER BY created_at", [o.id]);
    const live = o.tracking_reference ? await getTracking(o.tracking_reference) : null;
    const items = (o.items as { description: string }[]).map((i) => i.description);
    return NextResponse.json({
      order: `NUV${o.order_number}`,
      status: CUSTOMER_STATUS[o.status] || o.status,
      step: STEP[o.status] ?? -1,
      closed: ['expired', 'cancelled'].includes(o.status),
      placed: o.created_at,
      paid: o.paid_at,
      items,
      total: Number(o.total),
      shipping: o.shipping_method,
      area: [o.address_suburb, o.address_city].filter(Boolean).join(', '),
      tracking: o.tracking_reference ? {
        reference: o.tracking_reference,
        status: live?.status || pretty(o.tracking_status),
        courier: live?.courier || '',
        url: o.tracking_url || '',
        estimateFrom: live?.estimateFrom || '',
        estimateTo: live?.estimateTo || '',
        checkpoints: live?.checkpoints || [],
      } : null,
      events: events.map((e) => ({ kind: e.kind, at: e.created_at })),
      orderUrl: `/order/${o.id}?t=${o.access_token}`,
    });
  } catch (e) {
    console.error('track failed', e);
    return NextResponse.json({ error: 'Tracking is not available right now. Please try again shortly.' }, { status: 500 });
  }
}
