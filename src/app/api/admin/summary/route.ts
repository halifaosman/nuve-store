import { NextResponse } from 'next/server';
import { one } from '@/lib/db';
import { expireStale, retryBobGo } from '@/lib/orders';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await expireStale();
    await retryBobGo(3).catch(() => {});
    const c = await one<{ eft: number; review: number; toShip: number; bobgoErrors: number }>(`
      SELECT SUM(status = 'awaiting_eft') AS eft,
             SUM(status = 'eft_review') AS review,
             SUM(status IN ('paid','sending','sent_to_bobgo')) AS toShip,
             SUM(bobgo_error IS NOT NULL AND bobgo_order_id IS NULL) AS bobgoErrors
        FROM orders`);
    const m = await one<{ n: number }>("SELECT COUNT(*) AS n FROM messages WHERE status = 'new'").catch(() => null);
    return NextResponse.json({ eft: Number(c?.eft || 0), review: Number(c?.review || 0), toShip: Number(c?.toShip || 0), bobgoErrors: Number(c?.bobgoErrors || 0), messages: Number(m?.n || 0) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Database error' }, { status: 500 });
  }
}
