import { applyFreeDelivery, freeDelivery } from './free-delivery';
import crypto from 'node:crypto';
import { env } from './env';
import type { SiteSettings } from './settings';

export type Rate = { service_name: string; total_price: number; description: string; min_delivery_date?: string; max_delivery_date?: string; full_price?: number };
export type DeliveryAddress = { street: string; suburb: string; city: string; province: string; postal: string; company?: string };

function base(): string {
  return env.bobgoSandbox() ? 'https://api.sandbox.bobgo.co.za/v2' : 'https://api.bobgo.co.za/v2';
}

export function bobgoConfigured(): boolean {
  return !!env.bobgoKey();
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(base() + path, {
    method,
    headers: { Authorization: `Bearer ${env.bobgoKey()}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
    signal: AbortSignal.timeout(25000),
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = text.slice(0, 300);
    try { const j = JSON.parse(text); msg = j.message || j.error || msg; } catch { /* plain text */ }
    throw new Error(`Bob Go ${res.status}: ${msg}`);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

function addr(a: DeliveryAddress) {
  return {
    type: a.company ? 'business' : 'residential',
    company: a.company || '',
    street_address: a.street,
    local_area: a.suburb,
    city: a.city,
    zone: a.province,
    country: 'ZA',
    code: a.postal,
  };
}

export async function ratesAtCheckout(s: SiteSettings, to: DeliveryAddress, qty: number, orderTotal: number): Promise<Rate[]> {
  const rates = await quoteRates(s, to, qty, orderTotal);
  return freeDelivery(s, qty) ? applyFreeDelivery(rates) : rates;
}

async function quoteRates(s: SiteSettings, to: DeliveryAddress, qty: number, orderTotal: number): Promise<Rate[]> {
  const fallback: Rate[] = [{ service_name: s.fallbackShippingName, total_price: s.fallbackShippingPrice, description: '' }];
  if (!bobgoConfigured() || !s.collection.street_address) return fallback;
  try {
    const out = await call<{ rates: Rate[] | null }>('POST', '/rates-at-checkout', {
      collection_address: { type: 'business', country: 'ZA', ...s.collection },
      delivery_address: addr(to),
      items: [{
        description: 'Nuvé SnapBun', sku: 'SNAPBUN-BLK', price: orderTotal / Math.max(qty, 1), quantity: qty,
        length_cm: s.unitLengthCm, width_cm: s.unitWidthCm, height_cm: s.unitHeightCm, weight_kg: s.unitWeightKg,
      }],
      order_total_price: orderTotal,
      handling_time: s.handlingDays,
    });
    // Rounded up to whole rands: R87 reads better than R86,54, and the tiny moves between two Bob Go quotes
    // (e.g. R86,54 on the page, R86,94 a minute later) no longer change the total the customer sees.
    const rates = (out.rates || []).filter((r) => r && r.service_name && typeof r.total_price === 'number')
      .map((r) => ({ ...r, total_price: Math.ceil(r.total_price - 0.001) }));
    return rates.length ? rates : fallback;
  } catch (e) {
    console.error('Bob Go rates failed', e);
    return fallback;
  }
}

export const channelOrderNumber = (n: number | string) => `NUV${n}`;
export const orderNumberFromChannel = (v: unknown): number | null => {
  const m = String(v ?? '').match(/^NUV(\d+)$/);
  return m ? Number(m[1]) : null;
};

export async function findBobGoOrderId(channelNumber: string): Promise<number | null> {
  const out = await call<unknown>('GET', `/orders?channel_order_number=${encodeURIComponent(channelNumber)}&limit=1`);
  const list = Array.isArray(out) ? out : ((out as { orders?: unknown[] }).orders || []);
  const first = list[0] as { id?: number; channel_order_number?: string } | undefined;
  return first?.id && (!first.channel_order_number || first.channel_order_number === channelNumber) ? first.id : null;
}

export type OrderRow = {
  id: string; order_number: number; customer_first: string; customer_last: string; email: string; phone: string;
  address_street: string; address_suburb: string; address_city: string; address_province: string; address_postal: string; address_company: string | null;
  items: { description: string; sku: string; qty: number; unit_price: number; pack_price?: number }[];
  shipping_cost: number; shipping_method: string | null; status: string; bobgo_order_id: number | null;
};

export async function createBobGoOrder(o: OrderRow, s: SiteSettings): Promise<number> {
  const res = await call<{ id?: number; order?: { id: number } }>('POST', '/orders', {
    channel_order_number: channelOrderNumber(o.order_number),
    customer_name: o.customer_first,
    customer_surname: o.customer_last,
    customer_email: o.email,
    customer_phone: o.phone,
    currency: 'ZAR',
    buyer_selected_shipping_cost: Number(o.shipping_cost),
    buyer_selected_shipping_method: o.shipping_method || s.fallbackShippingName,
    payment_status: 'paid',
    delivery_address: addr({
      street: o.address_street, suburb: o.address_suburb, city: o.address_city, province: o.address_province,
      postal: o.address_postal, company: o.address_company || '',
    }),
    order_items: o.items.map((i) => ({
      description: i.description, sku: i.sku, vendor: 'Nuvé', qty: i.qty,
      // exact pack value per unit (unrounded) so qty x unit_price equals what the customer paid
      unit_price: i.pack_price ? Number((i.pack_price / i.qty).toFixed(6)) : Number(i.unit_price),
      unit_weight_kg: s.unitWeightKg, unit_length_cm: s.unitLengthCm, unit_width_cm: s.unitWidthCm, unit_height_cm: s.unitHeightCm,
    })),
  });
  const id = res.id ?? res.order?.id;
  if (!id) throw new Error('Bob Go accepted the order but did not return an order id.');
  return id;
}

export function webhookSignatureValid(rawBody: string, header: string | null): boolean {
  const secret = env.bobgoWebhookSecret();
  if (!secret) return false;
  if (!header) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64');
  const a = Buffer.from(expected), b = Buffer.from(header.trim());
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export type TrackingInfo = {
  status: string;
  courier: string;
  estimateFrom: string;
  estimateTo: string;
  checkpoints: { time: string; status: string; message: string; location: string }[];
};

/** Live courier tracking from Bob Go (GET /tracking). Returns null if it can't be fetched. */
export async function getTracking(reference: string): Promise<TrackingInfo | null> {
  if (!bobgoConfigured() || !reference) return null;
  try {
    const res = await fetch(`${base()}/tracking?tracking_reference=${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${env.bobgoKey()}`, Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const list = await res.json();
    const t = Array.isArray(list) ? list[0] : list;
    if (!t) return null;
    const cps = (Array.isArray(t.checkpoints) ? t.checkpoints : []) as Record<string, string>[];
    return {
      status: String(t.status_friendly || t.status || ''),
      courier: String(t.courier_name || ''),
      estimateFrom: String(t.shipment_estimated_delivery_date_from || ''),
      estimateTo: String(t.shipment_estimated_delivery_date_to || ''),
      checkpoints: cps
        .map((c) => ({
          time: String(c.time || ''),
          status: String(c.status_friendly || c.status || ''),
          message: String(c.message || ''),
          location: [c.location, c.city].filter(Boolean).join(', '),
        }))
        .sort((a, b) => (Date.parse(b.time) || 0) - (Date.parse(a.time) || 0))
        .slice(0, 15),
    };
  } catch {
    return null;
  }
}
