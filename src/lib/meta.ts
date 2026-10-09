import crypto from 'node:crypto';
import { NextRequest } from 'next/server';
import { env } from './env';
import { exec, one } from './db';

// Meta (Facebook) Conversions API: server-to-server events that mirror the browser Pixel.
// Each event carries the same event_id as its browser twin, so Meta counts it once.
// Docs: https://developers.facebook.com/docs/marketing-api/conversions-api
const GRAPH = process.env.META_GRAPH_BASE || 'https://graph.facebook.com/v25.0'; // override only for local testing

export const metaEnabled = () => !!(env.metaPixelId() && env.metaToken());

const sha = (v: string) => crypto.createHash('sha256').update(v).digest('hex');
const clean = (v: string) => v.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** South African numbers in international form without +: 0821234567 -> 27821234567. */
export function normPhone(p: string): string {
  let d = (p || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('0')) d = '27' + d.slice(1);
  return d;
}

export type Person = { email?: string; phone?: string; first?: string; last?: string; city?: string; province?: string; postal?: string };
export type Browser = { ip?: string; ua?: string; fbp?: string; fbc?: string };

export function userData(p: Person, b: Browser) {
  const u: Record<string, unknown> = { country: [sha('za')] };
  const email = (p.email || '').trim().toLowerCase();
  if (email) { u.em = [sha(email)]; u.external_id = [sha(email)]; }
  const ph = normPhone(p.phone || '');
  if (ph.length >= 9) u.ph = [sha(ph)];
  if (p.first) u.fn = [sha(clean(p.first))];
  if (p.last) u.ln = [sha(clean(p.last))];
  if (p.city) u.ct = [sha(clean(p.city))];
  if (p.province) u.st = [sha(clean(p.province))];
  if (p.postal) u.zp = [sha(clean(p.postal))];
  if (b.ip) u.client_ip_address = b.ip;
  if (b.ua) u.client_user_agent = b.ua;
  if (b.fbp) u.fbp = b.fbp;
  if (b.fbc) u.fbc = b.fbc;
  return u;
}

/** Browser details from a request: real IP (from Caddy), user agent, and the _fbp / _fbc cookies. */
export function browserFrom(req: NextRequest, sourceUrl?: string): Browser {
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || undefined;
  let fbc = req.cookies.get('_fbc')?.value;
  if (!fbc && sourceUrl) {
    try { const id = new URL(sourceUrl).searchParams.get('fbclid'); if (id) fbc = `fb.1.${Date.now()}.${id}`; } catch { /* bad url */ }
  }
  return { ip, ua: req.headers.get('user-agent') || undefined, fbp: req.cookies.get('_fbp')?.value, fbc };
}

/** Visitor said no to ad tracking (cookie set by the store's cookie notice). */
export const declined = (req: NextRequest) => req.cookies.get('nuve_consent')?.value === 'no';

export type MetaEvent = {
  event_name: string;
  event_id: string;
  event_time?: number;
  event_source_url?: string;
  user_data: Record<string, unknown>;
  custom_data?: Record<string, unknown>;
};

/** Sends events to Meta. Never throws: tracking must not break checkout. Returns a short result for logs. */
export async function sendEvents(events: MetaEvent[]): Promise<string> {
  if (!metaEnabled() || !events.length) return 'not configured';
  const body: Record<string, unknown> = {
    data: events.map((e) => ({ action_source: 'website', event_time: e.event_time || Math.floor(Date.now() / 1000), ...e })),
  };
  const test = env.metaTestCode();
  if (test) body.test_event_code = test;
  try {
    const r = await fetch(`${GRAPH}/${env.metaPixelId()}/events?access_token=${encodeURIComponent(env.metaToken())}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store', signal: AbortSignal.timeout(10000),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = (j as { error?: { message?: string } }).error?.message || `HTTP ${r.status}`;
      console.warn('Meta CAPI rejected', events.map((e) => e.event_name).join(','), msg);
      return `error: ${msg}`.slice(0, 280);
    }
    return `ok (${(j as { events_received?: number }).events_received ?? events.length} received${test ? `, test code ${test}` : ''})`;
  } catch (e) {
    console.warn('Meta CAPI failed', e instanceof Error ? e.message : e);
    return `error: ${e instanceof Error ? e.message : 'network'}`.slice(0, 280);
  }
}

export const PRODUCT_ID = 'SNAPBUN-BLK';

/**
 * Sends the Purchase event for a paid order, once. Uses the browser details saved at checkout,
 * and the same event_id the order page uses for the browser Pixel (purchase-<order id>).
 * Skipped while PayFast is in test mode unless a Meta test event code is set, so test orders
 * never count as real sales in your ads.
 */
export async function sendPurchase(orderId: string): Promise<void> {
  if (!metaEnabled()) return;
  if (env.payfastSandbox() && !env.metaTestCode()) return;
  const claimed = await exec(
    "UPDATE order_tracking SET purchase_sent_at = UTC_TIMESTAMP(3) WHERE order_id = ? AND purchase_sent_at IS NULL AND consent <> 'no'", [orderId]);
  if (!claimed) return; // already sent, declined, or no tracking row
  const o = await one<{ order_number: number; email: string; phone: string; customer_first: string; customer_last: string; address_city: string; address_province: string; address_postal: string; items: { qty: number }[]; total: number; paid_at: string | null }>(
    'SELECT order_number, email, phone, customer_first, customer_last, address_city, address_province, address_postal, items, total, paid_at FROM orders WHERE id = ?', [orderId]);
  const t = await one<{ fbp: string | null; fbc: string | null; client_ip: string | null; user_agent: string | null; source_url: string | null }>(
    'SELECT fbp, fbc, client_ip, user_agent, source_url FROM order_tracking WHERE order_id = ?', [orderId]);
  if (!o || !t) return;
  const qty = (o.items || []).reduce((n, i) => n + Number(i.qty || 0), 0) || 1;
  const result = await sendEvents([{
    event_name: 'Purchase',
    event_id: `purchase-${orderId}`,
    event_time: o.paid_at ? Math.floor(Date.parse(o.paid_at) / 1000) : undefined,
    event_source_url: t.source_url || undefined,
    user_data: userData(
      { email: o.email, phone: o.phone, first: o.customer_first, last: o.customer_last, city: o.address_city, province: o.address_province, postal: o.address_postal },
      { ip: t.client_ip || undefined, ua: t.user_agent || undefined, fbp: t.fbp || undefined, fbc: t.fbc || undefined }),
    custom_data: {
      currency: 'ZAR', value: Number(o.total), order_id: `NUV${o.order_number}`,
      content_type: 'product', content_ids: [PRODUCT_ID], contents: [{ id: PRODUCT_ID, quantity: qty }], num_items: qty,
    },
  }]);
  await exec('UPDATE order_tracking SET purchase_result = ? WHERE order_id = ?', [result, orderId]).catch(() => {});
  await exec('INSERT INTO order_events (order_id, kind, message) VALUES (?, ?, ?)', [orderId, 'meta', `Meta Purchase event: ${result}`]).catch(() => {});
  if (result.startsWith('error')) {
    // Let the next payment/cron retry pick it up again.
    await exec('UPDATE order_tracking SET purchase_sent_at = NULL WHERE order_id = ?', [orderId]).catch(() => {});
  }
}
