import { NextRequest, NextResponse } from 'next/server';
import { getSettings } from '@/lib/settings';
import { ratesAtCheckout } from '@/lib/bobgo';
import { freeDelivery } from '@/lib/free-delivery';
import { PROVINCES } from '@/lib/validate';

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const s = await getSettings();
  const bundle = s.bundles.find((x) => x.qty === Number(b.pack)) || s.bundles[0];
  if (!b.street || !b.city || !/^\d{4}$/.test(String(b.postal || '')) || !PROVINCES.includes(b.province)) {
    return NextResponse.json({ error: 'Enter your full address to see delivery options.' }, { status: 400 });
  }
  const rates = await ratesAtCheckout(s, { street: b.street, suburb: b.suburb || '', city: b.city, province: b.province, postal: String(b.postal), company: b.company || '' }, bundle.qty, bundle.price);
  return NextResponse.json({ rates: rates.map((r) => ({ service_name: r.service_name, total_price: r.total_price, description: r.description || '', min: r.min_delivery_date || null, max: r.max_delivery_date || null })), free: freeDelivery(s, bundle.qty), freeFrom: s.freeShipMinQty || 0 });
}
