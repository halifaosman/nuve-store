import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { sendTikTok, tiktokEnabled, ttBrowserFrom, ttProps, ttUser } from '@/lib/tiktok';

export const dynamic = 'force-dynamic';

// Sends one test ViewContent to TikTok from the server, to check the Pixel ID and access token work.
// With {"kind":"activate"}: sends one real InitiateCheckout and one real CompletePayment (R195, no test code),
// so TikTok marks them active and lets you pick them as a campaign goal. No order is made and nothing ships.
export async function POST(req: NextRequest) {
  if (!tiktokEnabled()) return NextResponse.json({ ok: false, result: 'Add the TikTok Pixel ID and Events API access token under Server settings first.' });
  const body = await req.json().catch(() => ({}));
  if (body.kind === 'activate') {
    const user = ttUser({}, ttBrowserFrom(req));
    const stamp = Date.now();
    const result = await sendTikTok([
      { event: 'InitiateCheckout', event_id: `admin-activate-ic-${stamp}`, user, properties: ttProps({ value: 195, qty: 1 }), page: { url: env.siteUrl() + '/checkout?pack=1' } },
      { event: 'CompletePayment', event_id: `admin-activate-cp-${stamp}`, user, properties: ttProps({ value: 195, qty: 1, orderId: `SETUP${stamp}` }), page: { url: env.siteUrl() + '/checkout?pack=1' } },
    ], { live: true });
    return NextResponse.json({
      ok: result.startsWith('ok'),
      result,
      hint: 'Sent as real events. In TikTok Events Manager they can take up to an hour to show as active; then refresh the campaign set-up page.',
    });
  }
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
