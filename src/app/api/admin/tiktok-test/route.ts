import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { sendTikTok, tiktokEnabled, ttBrowserFrom, ttProps, ttUser } from '@/lib/tiktok';

export const dynamic = 'force-dynamic';

// Sends one test ViewContent to TikTok from the server, to check the Pixel ID and access token work.
export async function POST(req: NextRequest) {
  if (!tiktokEnabled()) return NextResponse.json({ ok: false, result: 'Add the TikTok Pixel ID and Events API access token under Server settings first.' });
  const result = await sendTikTok([{
    event: 'ViewContent',
    event_id: `admin-test-${Date.now()}`,
    user: ttUser({}, ttBrowserFrom(req)),
    properties: ttProps({ value: 0, qty: 1 }),
    page: { url: env.siteUrl() + '/' },
  }]);
  return NextResponse.json({
    ok: result.startsWith('ok'),
    result,
    hint: env.tiktokTestCode() ? 'Look for it in TikTok Events Manager → your pixel → Test events.' : 'Without a test event code it counts as a real ViewContent. Add one under Server settings to see it in TikTok Events Manager → Test events.',
  });
}
