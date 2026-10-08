import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { expireStale } from '@/lib/orders';

export const dynamic = 'force-dynamic';

const GROUPS: Record<string, string[]> = {
  eft: ['awaiting_eft', 'eft_review'],
  open: ['paid', 'sending', 'sent_to_bobgo'],
  shipped: ['shipped', 'delivered'],
  closed: ['expired', 'cancelled'],
  unpaid: ['pending_payment', 'awaiting_eft', 'eft_review'],
};

export async function GET(req: NextRequest) {
  await expireStale();
  const p = req.nextUrl.searchParams;
  let q = db().from('orders')
    .select('id, order_number, status, payment_method, customer_first, customer_last, email, phone, total, created_at, expires_at, pop_path, bobgo_order_id, bobgo_error, tracking_reference')
    .order('created_at', { ascending: false }).limit(200);
  const g = p.get('group');
  if (g && GROUPS[g]) q = q.in('status', GROUPS[g]);
  const search = (p.get('q') || '').trim().replace(/[%,()]/g, '');
  if (search) {
    const n = Number(search.replace(/^nuv/i, ''));
    q = Number.isInteger(n) && n > 0
      ? q.eq('order_number', n)
      : q.or(`email.ilike.%${search}%,customer_first.ilike.%${search}%,customer_last.ilike.%${search}%,phone.ilike.%${search}%`);
  }
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ orders: data });
}
