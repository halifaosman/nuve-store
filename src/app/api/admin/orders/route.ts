import { NextRequest, NextResponse } from 'next/server';
import { rows } from '@/lib/db';
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
  try {
    await expireStale();
    const p = req.nextUrl.searchParams;
    const where: string[] = [];
    const params: unknown[] = [];
    const g = p.get('group');
    if (g && GROUPS[g]) { where.push('status IN (?)'); params.push(GROUPS[g]); }
    const search = (p.get('q') || '').trim().slice(0, 100);
    if (search) {
      const n = Number(search.replace(/^nuv/i, ''));
      if (Number.isInteger(n) && n > 0) { where.push('order_number = ?'); params.push(n); }
      else {
        const like = `%${search.replace(/[\\%_]/g, (c) => '\\' + c)}%`;
        where.push('(email LIKE ? OR customer_first LIKE ? OR customer_last LIKE ? OR phone LIKE ?)');
        params.push(like, like, like, like);
      }
    }
    const orders = await rows(
      `SELECT id, order_number, status, payment_method, customer_first, customer_last, email, phone, total, created_at, expires_at,
              pop_path, bobgo_order_id, bobgo_error, tracking_reference
         FROM orders ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC LIMIT 200`, params);
    return NextResponse.json({ orders });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Database error' }, { status: 500 });
  }
}
