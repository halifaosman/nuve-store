import { NextResponse } from 'next/server';
import { rows } from '@/lib/db';

export const dynamic = 'force-dynamic';
const PAID = ['paid', 'sending', 'sent_to_bobgo', 'shipped', 'delivered'];
type O = { id: string; order_number: number; status: string; email: string; customer_first: string; customer_last: string; phone: string; address_city: string; address_province: string; total: number; created_at: string };

export async function GET() {
  let data: O[];
  try {
    data = await rows<O>(`SELECT id, order_number, status, email, customer_first, customer_last, phone, address_city, address_province, total, created_at
      FROM orders ORDER BY created_at DESC LIMIT 5000`);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Database error' }, { status: 500 });
  }
  const map = new Map<string, { email: string; name: string; phone: string; city: string; orders: number; paidOrders: number; spent: number; last: string; orderList: { id: string; number: number; status: string; total: number; date: string }[] }>();
  for (const o of data) {
    const k = o.email.toLowerCase();
    const c = map.get(k) || { email: k, name: `${o.customer_first} ${o.customer_last}`, phone: o.phone, city: `${o.address_city}, ${o.address_province}`, orders: 0, paidOrders: 0, spent: 0, last: o.created_at, orderList: [] as { id: string; number: number; status: string; total: number; date: string }[] };
    c.orders++;
    if (PAID.includes(o.status)) { c.paidOrders++; c.spent += Number(o.total); }
    c.orderList.push({ id: o.id, number: o.order_number, status: o.status, total: Number(o.total), date: o.created_at });
    map.set(k, c);
  }
  const customers = Array.from(map.values()).sort((a, b) => b.last.localeCompare(a.last));
  return NextResponse.json({ customers });
}
