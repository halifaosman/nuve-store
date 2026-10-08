import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { insert, one } from '@/lib/db';
import { getSettings, bankReady } from '@/lib/settings';
import { ratesAtCheckout } from '@/lib/bobgo';
import { readCheckout } from '@/lib/validate';
import { buildPaymentForm } from '@/lib/payfast';
import { expireStale, logEvent } from '@/lib/orders';
import { round2 } from '@/lib/money';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { data, errors } = readCheckout(body);
  if (errors.length) return NextResponse.json({ error: errors.join(' ') }, { status: 400 });

  const s = await getSettings();
  const bundle = s.bundles.find((b) => b.qty === Number(body.pack));
  if (!bundle) return NextResponse.json({ error: 'Choose a pack before checking out.' }, { status: 400 });

  const method = body.payment === 'eft' ? 'eft' : 'payfast';
  if (method === 'eft' && !bankReady(s)) return NextResponse.json({ error: 'Bank transfer is not available right now. Please pay by card or Instant EFT.' }, { status: 400 });

  // Re-quote delivery on the server so the price can't be changed in the browser.
  const rates = await ratesAtCheckout(s, { street: data.street, suburb: data.suburb, city: data.city, province: data.province, postal: data.postal, company: data.company }, bundle.qty, bundle.price);
  const rate = rates.find((r) => r.service_name === String(body.shipping || ''));
  if (!rate) return NextResponse.json({ error: 'Delivery options changed. Please choose a delivery option again.', rates }, { status: 409 });

  await expireStale();

  const unit = round2(bundle.price / bundle.qty);
  const items = [{ description: `Nuvé SnapBun (${bundle.label})`, sku: 'SNAPBUN-BLK', qty: bundle.qty, unit_price: unit, pack_price: bundle.price }];
  const shipping = round2(Number(rate.total_price));
  const total = round2(bundle.price + shipping);

  const id = crypto.randomUUID();
  const accessToken = randomBytes(18).toString('hex');
  let order: { id: string; order_number: number; access_token: string } | null = null;
  try {
    await insert('orders', {
      id, access_token: accessToken,
      status: method === 'eft' ? 'awaiting_eft' : 'pending_payment',
      payment_method: method,
      customer_first: data.first, customer_last: data.last, email: data.email, phone: data.phone,
      address_company: data.company || null, address_street: data.street, address_suburb: data.suburb, address_city: data.city,
      address_province: data.province, address_postal: data.postal,
      items, subtotal: bundle.price, shipping_cost: shipping, shipping_method: rate.service_name, total,
      expires_at: method === 'eft' ? new Date(Date.now() + s.eftMinutes * 60e3) : null,
    });
    order = await one<{ id: string; order_number: number; access_token: string }>('SELECT id, order_number, access_token FROM orders WHERE id = ?', [id]);
  } catch (e) {
    console.error('Order insert failed', e);
  }
  if (!order) {
    return NextResponse.json({ error: 'We could not create your order. Please try again.' }, { status: 500 });
  }
  await logEvent(order.id, 'created', `Order placed (${method === 'eft' ? 'bank transfer' : 'PayFast'}), total R${total.toFixed(2)}`);

  if (method === 'eft') {
    return NextResponse.json({ kind: 'eft', url: `/order/${order.id}?t=${order.access_token}` });
  }
  const form = buildPaymentForm({
    orderId: order.id, orderNumber: order.order_number, amount: total, first: data.first, last: data.last, email: data.email,
    phone: data.phone, itemName: `Nuvé order #${order.order_number}`, token: order.access_token,
  });
  return NextResponse.json({ kind: 'payfast', ...form });
}
