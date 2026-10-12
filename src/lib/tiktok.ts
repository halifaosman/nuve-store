import crypto from 'node:crypto';
import { NextRequest } from 'next/server';
import { env } from './env';
import { exec, one } from './db';
import { normPhone, PRODUCT_ID } from './meta';

// TikTok Events API: server-to-server events that mirror the browser TikTok Pixel (same idea as meta.ts).
// Each event carries the same event_id as its browser twin, so TikTok counts it once.
// Docs: https://business-api.tiktok.com/portal/docs?id=1771100865818625
const API = process.env.TIKTOK_API_BASE || 'https://business-api.tiktok.com/open_api/v1.3'; // override only for local testing

export const tiktokEnabled = () => !!(env.tiktokPixelId() && env.tiktokToken());

const sha = (v: string) => crypto.createHash('sha256').update(v).digest('hex');

/** Our event names (Meta's) to TikTok's standard events. PageView is browser-only (ttq.page()). */
export const TT_EVENT: Record<string, string> = {
  ViewContent: 'ViewContent', AddToCart: 'AddToCart', InitiateCheckout: 'InitiateCheckout',
  AddPaymentInfo: 'AddPaymentInfo', Contact: 'Contact', Purchase: 'CompletePayment',
};

export type TtPerson = { email?: string; phone?: string };
export type TtBrowser = { ip?: string; ua?: string; ttclid?: string; ttp?: string };

export function ttUser(p: TtPerson, b: TtBrowser) {
  const u: Record<string, string> = {};
  const email = (p.email || '').trim().toLowerCase();
  if (email) { u.email = sha(email); u.external_id = sha(email); }
  const ph = normPhone(p.phone || '');
  if (ph.length >= 9) u.phone = sha('+' + ph); // TikTok wants E.164 (+27...) before hashing
  if (b.ip) u.ip = b.ip;
  if (b.ua) u.user_agent = b.ua;
  if (b.ttclid) u.ttclid = b.ttclid;
  if (b.ttp) u.ttp = b.ttp;
  return u;
}

/** TikTok click id (from ?ttclid= or the cookie the store sets) and TikTok's _ttp browser cookie. */
export function ttBrowserFrom(req: NextRequest, sourceUrl?: string): TtBrowser {
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || undefined;
  let ttclid = req.cookies.get('nuve_ttclid')?.value;
  if (sourceUrl) {
    try { const id = new URL(sourceUrl).searchParams.get('ttclid'); if (id) ttclid = id; } catch { /* bad url */ }
  }
  return { ip, ua: req.headers.get('user-agent') || undefined, ttclid: ttclid?.slice(0, 500), ttp: req.cookies.get('_ttp')?.value?.slice(0, 200) };
}

export type TtEvent = {
  event: string;
  event_id: string;
  event_time?: number;
  user: Record<string, string>;
  properties?: Record<string, unknown>;
  page?: { url?: string };
};

/** Sends events to TikTok. Never throws: tracking must not break checkout. Returns a short result for logs. */
export async function sendTikTok(events: TtEvent[], opts: { live?: boolean } = {}): Promise<string> {
  if (!tiktokEnabled() || !events.length) return 'not configured';
  const body: Record<string, unknown> = {
    event_source: 'web',
    event_source_id: env.tiktokPixelId(),
    data: events.map((e) => ({ event_time: e.event_time || Math.floor(Date.now() / 1000), ...e })),
  };
  const test = opts.live ? '' : env.tiktokTestCode(); // live: skip the test code so TikTok counts it as a real event
  if (test) body.test_event_code = test;
  try {
    const r = await fetch(`${API}/event/track/`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Access-Token': env.tiktokToken() },
      body: JSON.stringify(body), cache: 'no-store', signal: AbortSignal.timeout(10000),
    });
    const j = (await r.json().catch(() => ({}))) as { code?: number; message?: string };
    if (!r.ok || j.code !== 0) {
      const msg = j.message || `HTTP ${r.status}`;
      console.warn('TikTok Events API rejected', events.map((e) => e.event).join(','), msg);
      return `error: ${msg}`.slice(0, 280);
    }
    return `ok (${events.length} sent${test ? `, test code ${test}` : ''})`;
  } catch (e) {
    console.warn('TikTok Events API failed', e instanceof Error ? e.message : e);
    return `error: ${e instanceof Error ? e.message : 'network'}`.slice(0, 280);
  }
}

/** TikTok's properties for the product, from our (Meta-style) event data. */
export function ttProps(d: { value?: number; qty?: number; orderId?: string }): Record<string, unknown> {
  const qty = Math.max(1, Math.min(99, Math.round(d.qty || 1)));
  const p: Record<string, unknown> = {
    content_type: 'product', currency: 'ZAR',
    contents: [{ content_id: PRODUCT_ID, content_name: 'SnapBun', quantity: qty }],
  };
  if (typeof d.value === 'number' && d.value >= 0 && d.value < 100000) p.value = d.value;
  if (d.orderId) p.order_id = d.orderId;
  return p;
}

/**
 * Sends CompletePayment for a paid order, once (TikTok's Purchase). Same rules as sendPurchase in meta.ts:
 * event_id purchase-<order id> (matches the order page's browser event), skipped in PayFast test mode
 * unless a TikTok test event code is set, and never for visitors who declined tracking.
 */
export async function sendTikTokPurchase(orderId: string): Promise<void> {
  if (!tiktokEnabled()) return;
  if (env.payfastSandbox() && !env.tiktokTestCode()) return;
  const claimed = await exec(
    `UPDATE tiktok_tracking k JOIN order_tracking t ON t.order_id = k.order_id
        SET k.purchase_sent_at = UTC_TIMESTAMP(3)
      WHERE k.order_id = ? AND k.purchase_sent_at IS NULL AND t.consent <> 'no'`, [orderId]);
  if (!claimed) return; // already sent, declined, or no tracking row
  const o = await one<{ order_number: number; email: string; phone: string; items: { qty: number }[]; total: number; paid_at: string | null }>(
    'SELECT order_number, email, phone, items, total, paid_at FROM orders WHERE id = ?', [orderId]);
  const t = await one<{ ttclid: string | null; ttp: string | null; client_ip: string | null; user_agent: string | null; source_url: string | null }>(
    `SELECT k.ttclid, k.ttp, t.client_ip, t.user_agent, t.source_url
       FROM tiktok_tracking k JOIN order_tracking t ON t.order_id = k.order_id WHERE k.order_id = ?`, [orderId]);
  if (!o || !t) return;
  const qty = (o.items || []).reduce((n, i) => n + Number(i.qty || 0), 0) || 1;
  const result = await sendTikTok([{
    event: 'CompletePayment',
    event_id: `purchase-${orderId}`,
    event_time: o.paid_at ? Math.floor(Date.parse(o.paid_at) / 1000) : undefined,
    user: ttUser({ email: o.email, phone: o.phone },
      { ip: t.client_ip || undefined, ua: t.user_agent || undefined, ttclid: t.ttclid || undefined, ttp: t.ttp || undefined }),
    properties: ttProps({ value: Number(o.total), qty, orderId: `NUV${o.order_number}` }),
    page: t.source_url ? { url: t.source_url } : undefined,
  }]);
  await exec('UPDATE tiktok_tracking SET purchase_result = ? WHERE order_id = ?', [result, orderId]).catch(() => {});
  await exec('INSERT INTO order_events (order_id, kind, message) VALUES (?, ?, ?)', [orderId, 'tiktok', `TikTok CompletePayment event: ${result}`]).catch(() => {});
  if (result.startsWith('error')) {
    await exec('UPDATE tiktok_tracking SET purchase_sent_at = NULL WHERE order_id = ?', [orderId]).catch(() => {});
  }
}
