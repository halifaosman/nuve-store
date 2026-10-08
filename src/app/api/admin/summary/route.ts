import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { expireStale, retryBobGo } from '@/lib/orders';

export const dynamic = 'force-dynamic';

export async function GET() {
  await expireStale();
  await retryBobGo(3).catch(() => {});
  const count = async (statuses: string[]) => (await db().from('orders').select('id', { count: 'exact', head: true }).in('status', statuses)).count || 0;
  const [eft, review, toShip, bobErr] = await Promise.all([
    count(['awaiting_eft']), count(['eft_review']), count(['paid', 'sending', 'sent_to_bobgo']),
    db().from('orders').select('id', { count: 'exact', head: true }).not('bobgo_error', 'is', null).is('bobgo_order_id', null),
  ]);
  return NextResponse.json({ eft, review, toShip, bobgoErrors: bobErr.count || 0 });
}
