import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { expireStale, retryBobGo } from '@/lib/orders';

// Vercel Cron calls this with "Authorization: Bearer <CRON_SECRET>".
export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${env.cronSecret()}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await expireStale();
  await retryBobGo(20);
  return NextResponse.json({ ok: true });
}
