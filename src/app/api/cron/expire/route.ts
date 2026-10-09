import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { expireStale, retryBobGo, retryMetaPurchases } from '@/lib/orders';

// deploy/cron.sh calls this every minute with "Authorization: Bearer <CRON_SECRET>".
export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${env.cronSecret()}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await expireStale();
  await retryBobGo(20);
  await retryMetaPurchases(10);
  return NextResponse.json({ ok: true });
}
