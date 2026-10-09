import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { expireStale, retryBobGo, retryMetaPurchases } from '@/lib/orders';
import { compressNextVideo } from '@/lib/video';

// deploy/cron.sh calls this every minute with "Authorization: Bearer <CRON_SECRET>".
export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${env.cronSecret()}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await expireStale();
  await retryBobGo(20);
  await retryMetaPurchases(10);
  void compressNextVideo(); // runs in the background; one video at a time
  return NextResponse.json({ ok: true });
}
