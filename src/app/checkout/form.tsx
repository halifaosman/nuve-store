'use client';
import { useEffect, useRef, useState } from 'react';
import type { Bundle } from '@/lib/settings';
import { track } from '@/lib/track';
import { useWhenTracking } from '@/components/meta-pixel';
import { isPickupName } from '@/lib/free-delivery';

const PRODUCT = 'SNAPBUN-BLK';

const PROVINCES = ['Eastern Cape', 'Free State', 'Gauteng', 'KwaZulu-Natal', 'Limpopo', 'Mpumalanga', 'North West', 'Northern Cape', 'Western Cape'];
type Rate = { service_name: string; total_price: number; description: string; min: string | null; max: string | null };
const rand = (n: number) => 'R' + n.toLocaleString('en-ZA', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
const fee = (n: number) => (n > 0 ? rand(n) : 'FREE');
const KEY = 'nuve-checkout';

// Pickup points (lockers, Pargo, PAXI…) vs courier to the door. Door delivery is listed first.
const isPickup = (r: Rate) => isPickupName(r.service_name);
const km = (r: Rate) => { const m = /approx\.?\s*([\d.,]+)\s*km/i.exec(r.service_name); return m ? parseFloat(m[1].replace(',', '.')) : 999; };
const day = (v: string) => new Date(v).toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' });
/** Plain-language line under a delivery option. */
function blurb(r: Rate): { main: string; extra?: string } {
  const when = r.min && r.max && day(r.min) !== day(r.max) ? `Arrives ${day(r.min)} – ${day(r.max)}` : r.max ? `Arrives by ${day(r.max)}` : '';
  if (isPickup(r)) {
    const [where, ...rest] = (r.description || '').split('|').map((x) => x.trim()).filter(Boolean);
    return { main: [where, when].filter(Boolean).join(' · '), extra: rest.join(' · ') };
  }
  const generic = !r.description || /^default /i.test(r.description);
  const what = /express/i.test(r.service_name) ? 'Faster courier to your door' : 'Courier to your door';
  return { main: [generic ? what : r.description, when].filter(Boolean).join(' · ') };
}

export default function CheckoutForm({ bundles, initialPack, eftAvailable, eftMinutes, freeFrom = 0 }: { bundles: Bundle[]; initialPack: number; eftAvailable: boolean; eftMinutes: number; freeFrom?: number }) {
  const [pack, setPack] = useState(bundles.some((b) => b.qty === initialPack) ? initialPack : bundles[0].qty);
  const [f, setF] = useState({ first: '', last: '', email: '', phone: '', company: '', street: '', suburb: '', city: '', province: '', postal: '' });
  const [rates, setRates] = useState<Rate[] | null>(null);
  const [rateErr, setRateErr] = useState('');
  const [ship, setShip] = useState('');
  const [allPickups, setAllPickups] = useState(false);
  const free = freeFrom > 0 && pack >= freeFrom;
  const [payment, setPayment] = useState<'payfast' | 'eft'>('payfast');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [pf, setPf] = useState<{ action: string; fields: Record<string, string> } | null>(null);
  const pfRef = useRef<HTMLFormElement>(null);

  // Keep the shopper's details if they come back from a cancelled card payment (this browser only).
  useEffect(() => { try { const saved = localStorage.getItem(KEY); if (saved) setF((x) => ({ ...x, ...JSON.parse(saved) })); } catch { /* storage unavailable */ } }, []);
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(f)); } catch { /* storage unavailable */ } }, [f]);

  const bundle = bundles.find((b) => b.qty === pack) || bundles[0];
  const rate = rates?.find((r) => r.service_name === ship);
  const addrKey = [f.street, f.suburb, f.city, f.province, f.postal, pack].join('|');
  const addrReady = !!(f.street && f.city && f.province && /^\d{4}$/.test(f.postal));

  useEffect(() => {
    if (!addrReady) { setRates(null); return; }
    const t = setTimeout(async () => {
      setRateErr('');
      try {
        const r = await fetch('/api/checkout/rates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...f, pack }) });
        const j = await r.json();
        if (!r.ok) { setRateErr(j.error || 'Could not load delivery options.'); setRates(null); return; }
        setRates(j.rates);
        // Keep the shopper's choice if it's still offered; otherwise pick the cheapest door delivery.
        const door = (j.rates as Rate[]).filter((x) => !isPickup(x)).sort((a, b) => a.total_price - b.total_price);
        setShip((cur) => (j.rates.some((x: Rate) => x.service_name === cur) ? cur : (door[0] || j.rates[0])?.service_name || ''));
      } catch { setRateErr('Could not load delivery options. Check your connection.'); }
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addrKey]);

  useEffect(() => { if (pf && pfRef.current) pfRef.current.submit(); }, [pf]);
  useWhenTracking(() => track('InitiateCheckout', { value: bundle.price, content_ids: [PRODUCT], contents: [{ id: PRODUCT, quantity: bundle.qty }], num_items: bundle.qty }));

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    if (!rate) { setErr('Choose a delivery option.'); return; }
    setBusy(true);
    track('AddPaymentInfo', { value: bundle.price + Number(rate.total_price || 0), content_ids: [PRODUCT], num_items: bundle.qty, payment_type: payment === 'eft' ? 'bank_transfer' : 'payfast' },
      { user: { email: f.email, phone: f.phone, first: f.first, last: f.last, city: f.city, province: f.province, postal: f.postal } });
    try {
      const r = await fetch('/api/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...f, pack, shipping: ship, shippingPrice: rate.total_price, payment, pageUrl: location.href }) });
      const j = await r.json();
      if (!r.ok) {
        setErr(j.error || 'Something went wrong. Please try again.');
        if (j.rates) setRates(j.rates.map((x: Rate) => ({ ...x, description: x.description || '' })));
        setBusy(false);
        return;
      }
      if (j.kind === 'eft') { window.location.href = j.url; return; }
      setPf({ action: j.action, fields: j.fields });
    } catch {
      setErr('Could not reach the store. Check your connection and try again.');
      setBusy(false);
    }
  }

  const total = bundle.price + (rate?.total_price || 0);

  return (
    <>
    <form className="co" onSubmit={submit} noValidate>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <b>Your details</b>
          <div className="row2">
            <div className="f"><label htmlFor="first">First name</label><input id="first" autoComplete="given-name" value={f.first} onChange={set('first')} required /></div>
            <div className="f"><label htmlFor="last">Last name</label><input id="last" autoComplete="family-name" value={f.last} onChange={set('last')} required /></div>
          </div>
          <div className="row2">
            <div className="f"><label htmlFor="email">Email</label><input id="email" type="email" autoComplete="email" value={f.email} onChange={set('email')} required /></div>
            <div className="f"><label htmlFor="phone">Cellphone</label><input id="phone" type="tel" autoComplete="tel" placeholder="082 123 4567" value={f.phone} onChange={set('phone')} required /></div>
          </div>
        </div>

        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <b>Delivery address</b>
          <div className="f"><label htmlFor="street">Street address</label><input id="street" autoComplete="address-line1" value={f.street} onChange={set('street')} required /></div>
          <div className="row2">
            <div className="f"><label htmlFor="suburb">Suburb</label><input id="suburb" autoComplete="address-level3" value={f.suburb} onChange={set('suburb')} required /></div>
            <div className="f"><label htmlFor="city">City or town</label><input id="city" autoComplete="address-level2" value={f.city} onChange={set('city')} required /></div>
          </div>
          <div className="row3">
            <div className="f"><label htmlFor="province">Province</label>
              <select id="province" value={f.province} onChange={set('province')} required><option value="">Choose…</option>{PROVINCES.map((p) => <option key={p}>{p}</option>)}</select></div>
            <div className="f"><label htmlFor="postal">Postal code</label><input id="postal" inputMode="numeric" maxLength={4} autoComplete="postal-code" value={f.postal} onChange={set('postal')} required /></div>
            <div className="f"><label htmlFor="company">Business name (optional)</label><input id="company" autoComplete="organization" value={f.company} onChange={set('company')} /></div>
          </div>
        </div>

        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <b>Delivery</b>
          {free && <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--ok)' }}>Your delivery is free. Faster or pickup options cost only the difference.</p>}
          {!addrReady && <p className="muted" style={{ margin: 0 }}>Enter your address to see delivery options and prices.</p>}
          {addrReady && !rates && !rateErr && <p className="muted" style={{ margin: 0 }}>Finding delivery options…</p>}
          {rateErr && <p className="err">{rateErr}</p>}
          {rates && (() => {
            const door = rates.filter((r) => !isPickup(r)).sort((a, b) => a.total_price - b.total_price);
            const pickups = rates.filter(isPickup).sort((a, b) => km(a) - km(b) || a.total_price - b.total_price);
            // The 2 nearest, plus the cheapest if it isn't one of them.
            const cheapest = [...pickups].sort((x, y) => x.total_price - y.total_price)[0];
            const shown = allPickups ? pickups : pickups.slice(0, 2).concat(cheapest && !pickups.slice(0, 2).includes(cheapest) ? [cheapest] : []);
            if (!allPickups && ship && !shown.some((r) => r.service_name === ship) && pickups.some((r) => r.service_name === ship)) shown.push(pickups.find((r) => r.service_name === ship)!);
            const opt = (r: Rate) => {
              const t = blurb(r);
              return (
                <label key={r.service_name} className={'opt' + (ship === r.service_name ? ' on' : '')}>
                  <span style={{ display: 'flex', gap: 12, alignItems: 'center', minWidth: 0 }}>
                    <input type="radio" name="ship" checked={ship === r.service_name} onChange={() => setShip(r.service_name)} />
                    <span style={{ minWidth: 0 }}>
                      <b>{r.service_name.replace(/\s*\(approx\.?\s*[\d.,]+\s*km\)/i, '')}</b>
                      {isPickup(r) && km(r) < 999 && <span className="muted" style={{ fontSize: 13 }}> · {km(r)} km away</span>}
                      {t.main && <span className="muted" style={{ display: 'block', fontSize: 13 }}>{t.main}</span>}
                      {t.extra && ship === r.service_name && <span className="muted" style={{ display: 'block', fontSize: 12 }}>{t.extra}</span>}
                    </span>
                  </span>
                  <b style={r.total_price === 0 ? { color: 'var(--ok)' } : undefined}>{free && r.total_price > 0 ? `+${rand(r.total_price)}` : fee(r.total_price)}</b>
                </label>
              );
            };
            return (
              <>
                {door.map(opt)}
                {pickups.length > 0 && (
                  <>
                    <p className="muted" style={{ margin: door.length ? '8px 0 0' : 0, fontSize: 14, fontWeight: 700 }}>{door.length ? 'Or collect from a pickup point near you' : 'Collect from a pickup point near you'}</p>
                    {shown.map(opt)}
                    {!allPickups && pickups.length > shown.length && (
                      <button type="button" className="ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setAllPickups(true)}>Show {pickups.length - shown.length} more pickup points</button>
                    )}
                  </>
                )}
              </>
            );
          })()}
        </div>

        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <b>Payment</b>
          <label className={'opt' + (payment === 'payfast' ? ' on' : '')}>
            <span style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <input type="radio" name="pay" checked={payment === 'payfast'} onChange={() => setPayment('payfast')} />
              <span><b>Card, Instant EFT or SnapScan</b><span className="muted" style={{ display: 'block', fontSize: 13 }}>Secure payment through PayFast</span></span>
            </span>
          </label>
          {eftAvailable && (
            <label className={'opt' + (payment === 'eft' ? ' on' : '')}>
              <span style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <input type="radio" name="pay" checked={payment === 'eft'} onChange={() => setPayment('eft')} />
                <span><b>Bank transfer (manual EFT)</b><span className="muted" style={{ display: 'block', fontSize: 13 }}>Your order is held for {eftMinutes} minutes while you pay and upload proof of payment</span></span>
              </span>
            </label>
          )}
        </div>
      </div>

      <aside className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14, position: 'sticky', top: 16 }}>
        <b>Your order</b>
        <div className="f"><label htmlFor="pack">Pack</label>
          <select id="pack" value={pack} onChange={(e) => setPack(Number(e.target.value))}>
            {bundles.map((b) => <option key={b.qty} value={b.qty}>{b.label} — {rand(b.price)}</option>)}
          </select></div>
        <div className="sumline"><span>{bundle.label}</span><span>{rand(bundle.price)}</span></div>
        <div className="sumline"><span>Delivery</span><span style={rate && rate.total_price === 0 ? { color: 'var(--ok)', fontWeight: 800 } : undefined}>{rate ? fee(rate.total_price) : '—'}</span></div>
        {freeFrom > 0 && pack < freeFrom && bundles.some((b) => b.qty >= freeFrom) && (() => {
          const up = bundles.filter((b) => b.qty >= freeFrom).sort((a, b) => a.qty - b.qty)[0];
          return (
            <button type="button" className="upsell" onClick={() => setPack(up.qty)}>
              <b>Get free delivery</b>
              <span>Switch to {up.label} for {rand(up.price)} and delivery is free.</span>
            </button>
          );
        })()}
        <div className="sumline total"><span>Total</span><span>{rand(total)}</span></div>
        {err && <p className="err" role="alert">{err}</p>}
        <button className="btn" type="submit" disabled={busy || !rate} style={{ width: '100%' }}>
          {busy ? 'Please wait…' : payment === 'eft' ? 'Place order and get bank details' : `Pay ${rand(total)}`}
        </button>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>30-day &ldquo;Perfect Bun&rdquo; guarantee.</p>
      </aside>
    </form>
      {pf && (
        <form ref={pfRef} action={pf.action} method="post" style={{ display: 'none' }}>
          {Object.entries(pf.fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        </form>
      )}
    </>
  );
}
