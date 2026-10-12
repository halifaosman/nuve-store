import { NextRequest, NextResponse } from 'next/server';
import { browserFrom, declined, metaEnabled, sendEvents, userData } from '@/lib/meta';
import { sendTikTok, tiktokEnabled, ttBrowserFrom, ttProps, ttUser, TT_EVENT } from '@/lib/tiktok';

export const dynamic = 'force-dynamic';

// Server copy of a browser Pixel event, sent to Meta (Conversions API) and TikTok (Events API).
// Same event_id as the browser events, so each platform de-duplicates.
// Purchase is NOT accepted here: it is sent by the server itself when the payment is confirmed.
const ALLOWED = new Set(['PageView', 'ViewContent', 'AddToCart', 'InitiateCheckout', 'AddPaymentInfo', 'Contact']);
const s = (v: unknown, max = 300) => String(v ?? '').slice(0, max);

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const name = s(b.event, 40);
  const id = s(b.eventId, 80);
  if (!ALLOWED.has(name) || !/^[A-Za-z0-9_.:-]{8,80}$/.test(id)) return NextResponse.json({ ok: false }, { status: 400 });
  const res = NextResponse.json({ ok: true });
  if (declined(req)) return res;
  const url = s(b.url, 500);
  const p = (b.user || {}) as Record<string, unknown>;
  const data = (b.data || {}) as Record<string, unknown>;

  // TikTok (PageView is browser-only for TikTok: ttq.page()).
  if (tiktokEnabled() && TT_EVENT[name]) {
    const tb = ttBrowserFrom(req, url);
    if (tb.ttclid && req.cookies.get('nuve_ttclid')?.value !== tb.ttclid) {
      res.cookies.set('nuve_ttclid', tb.ttclid, { path: '/', maxAge: 30 * 86400, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
    }
    const qty = typeof data.num_items === 'number' ? data.num_items
      : Array.isArray(data.contents) ? Number((data.contents[0] as { quantity?: number })?.quantity) || 1 : 1;
    void sendTikTok([{
      event: TT_EVENT[name],
      event_id: id,
      user: ttUser({ email: s(p.email, 200), phone: s(p.phone, 30) }, tb),
      properties: ttProps({ value: typeof data.value === 'number' ? data.value : undefined, qty }),
      page: url ? { url } : undefined,
    }]);
  }
  if (!metaEnabled()) return res;

  const browser = browserFrom(req, url);
  // Ad blockers often stop the Pixel from setting _fbp; set it ourselves (Meta's documented format) so events still match.
  if (!browser.fbp) {
    browser.fbp = `fb.1.${Date.now()}.${Math.floor(Math.random() * 1e10)}`;
    res.cookies.set('_fbp', browser.fbp, { path: '/', maxAge: 90 * 86400, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
  }
  if (browser.fbc && !req.cookies.get('_fbc')) {
    res.cookies.set('_fbc', browser.fbc, { path: '/', maxAge: 90 * 86400, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
  }
  const custom: Record<string, unknown> = {};
  if (typeof data.value === 'number' && data.value >= 0 && data.value < 100000) { custom.value = data.value; custom.currency = 'ZAR'; }
  if (Array.isArray(data.content_ids)) { custom.content_ids = data.content_ids.slice(0, 5).map((x: unknown) => s(x, 40)); custom.content_type = 'product'; }
  if (typeof data.num_items === 'number') custom.num_items = Math.min(99, Math.max(0, Math.round(data.num_items)));
  if (data.payment_type) custom.payment_type = s(data.payment_type, 30);

  // Fire and forget: the shopper never waits for Meta.
  void sendEvents([{
    event_name: name,
    event_id: id,
    event_source_url: url || undefined,
    user_data: userData({ email: s(p.email, 200), phone: s(p.phone, 30), first: s(p.first, 100), last: s(p.last, 100), city: s(p.city, 100), province: s(p.province, 60), postal: s(p.postal, 10) }, browser),
    custom_data: Object.keys(custom).length ? custom : undefined,
  }]);
  return res;
}
