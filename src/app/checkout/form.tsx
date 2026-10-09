'use client';
import { useEffect, useRef, useState } from 'react';
import type { Bundle } from '@/lib/settings';
import { track } from '@/lib/track';
import { useWhenTracking } from '@/components/meta-pixel';

const PRODUCT = 'SNAPBUN-BLK';

const PROVINCES = ['Eastern Cape', 'Free State', 'Gauteng', 'KwaZulu-Natal', 'Limpopo', 'Mpumalanga', 'North West', 'Northern Cape', 'Western Cape'];
type Rate = { service_name: string; total_price: number; description: string; min: string | null; max: string | null };
const rand = (n: number) => 'R' + n.toLocaleString('en-ZA', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
const KEY = 'nuve-checkout';

export default function CheckoutForm({ bundles, initialPack, eftAvailable, eftMinutes }: { bundles: Bundle[]; initialPack: number; eftAvailable: boolean; eftMinutes: number }) {
  const [pack, setPack] = useState(bundles.some((b) => b.qty === initialPack) ? initialPack : bundles[0].qty);
  const [f, setF] = useState({ first: '', last: '', email: '', phone: '', company: '', street: '', suburb: '', city: '', province: '', postal: '' });
  const [rates, setRates] = useState<Rate[] | null>(null);
  const [rateErr, setRateErr] = useState('');
  const [ship, setShip] = useState('');
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
        setShip((cur) => (j.rates.some((x: Rate) => x.service_name === cur) ? cur : j.rates[0]?.service_name || ''));
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
      const r = await fetch('/api/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...f, pack, shipping: ship, payment, pageUrl: location.href }) });
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
          {!addrReady && <p className="muted" style={{ margin: 0 }}>Enter your address to see delivery options and prices.</p>}
          {addrReady && !rates && !rateErr && <p className="muted" style={{ margin: 0 }}>Finding delivery options…</p>}
          {rateErr && <p className="err">{rateErr}</p>}
          {rates?.map((r) => (
            <label key={r.service_name} className={'opt' + (ship === r.service_name ? ' on' : '')}>
              <span style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <input type="radio" name="ship" checked={ship === r.service_name} onChange={() => setShip(r.service_name)} />
                <span><b>{r.service_name}</b>{(r.description || r.max) && <span className="muted" style={{ display: 'block', fontSize: 13 }}>{r.description || `Arrives by ${new Date(r.max as string).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}`}</span>}</span>
              </span>
              <b>{rand(r.total_price)}</b>
            </label>
          ))}
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
        <div className="sumline"><span>Delivery</span><span>{rate ? rand(rate.total_price) : '—'}</span></div>
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
