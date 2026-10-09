'use client';
import { useEffect, useState } from 'react';
import { track } from '@/lib/track';
import { useWhenTracking } from '@/components/meta-pixel';

type Bank = { name: string; holder: string; number: string; branch: string; type: string };
type Props = {
  id: string; token: string; method: string; initialStatus: string; expiresAt: string | null; reference: string; total: number;
  fromPayfast: boolean; bank: Bank; qty?: number; orderNumber?: number; popEmail: string; trackingUrl: string | null; trackingRef: string | null; serverNow: number;
};
const rand = (n: number) => 'R' + n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const PAID = ['paid', 'sending', 'sent_to_bobgo', 'shipped', 'delivered'];

function Copy({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="copy" onClick={() => {
      navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }).catch(() => {});
    }}>{done ? 'Copied' : 'Copy'}</button>
  );
}

export default function OrderLive(p: Props) {
  const [status, setStatus] = useState(p.initialStatus);
  const [tracking, setTracking] = useState({ url: p.trackingUrl, ref: p.trackingRef });
  const [left, setLeft] = useState<number | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [expiresAt, setExpiresAt] = useState(p.expiresAt);
  const [trackReady, setTrackReady] = useState(false);
  useWhenTracking(() => setTrackReady(true));
  // Browser Purchase event (once per order). The server sends the same event with the same id; Meta keeps one.
  // Skipped while PayFast is in test mode so test orders don't count as sales.
  useEffect(() => {
    if (!trackReady || !PAID.includes(status)) return;
    const w = window as Window & { __nuveTrack?: { sandbox: boolean } };
    if (w.__nuveTrack?.sandbox) return;
    const key = `nuve_px_${p.id}`;
    try { if (localStorage.getItem(key)) return; localStorage.setItem(key, '1'); } catch { /* storage blocked: may send twice, Meta dedupes */ }
    const qty = p.qty || 1;
    track('Purchase', { value: p.total, content_ids: ['SNAPBUN-BLK'], contents: [{ id: 'SNAPBUN-BLK', quantity: qty }], num_items: qty, order_id: p.orderNumber ? `NUV${p.orderNumber}` : undefined },
      { eventId: `purchase-${p.id}`, browserOnly: true });
  }, [trackReady, status, p.id, p.total, p.qty, p.orderNumber]);
  // Difference between the server's clock and this device's, so a wrong phone clock doesn't skew the timer.
  const [offset, setOffset] = useState(0);
  useEffect(() => { setOffset(p.serverNow - Date.now()); }, [p.serverNow]);

  async function refresh() {
    try {
      const r = await fetch(`/api/orders/${p.id}?t=${p.token}`, { cache: 'no-store' });
      if (!r.ok) return;
      const j = await r.json();
      if (j.now) setOffset(j.now - Date.now());
      setStatus(j.status);
      setExpiresAt(j.expires_at);
      setTracking({ url: j.tracking_url, ref: j.tracking_reference });
    } catch { /* offline; try again next tick */ }
  }

  useEffect(() => {
    if (!expiresAt || status !== 'awaiting_eft') { setLeft(null); return; }
    const end = new Date(expiresAt).getTime();
    let asked = false;
    const tick = () => {
      const ms = end - (Date.now() + offset);
      setLeft(Math.max(0, ms));
      if (ms <= 0 && !asked) { asked = true; refresh(); } // let the server decide whether it has expired
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expiresAt, status, offset]);

  // Poll for payment confirmation (PayFast) or admin approval (EFT). Expired orders are still watched,
  // because the shop can mark a late payment as received.
  useEffect(() => {
    if (['cancelled', 'delivered'].includes(status)) return;
    const t = setInterval(refresh, status === 'expired' ? 30000 : 8000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.id, p.token, status]);

  async function upload() {
    if (!file) { setErr('Choose your proof of payment first.'); return; }
    setBusy(true); setErr('');
    const fd = new FormData();
    fd.append('file', file);
    try {
      const r = await fetch(`/api/orders/${p.id}/pop?t=${p.token}`, { method: 'POST', body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(j.error || 'Upload failed. Please try again.'); if (r.status === 410) setStatus('expired'); }
      else setStatus('eft_review');
    } catch { setErr('Upload failed. Check your connection and try again.'); }
    setBusy(false);
  }

  const mm = left !== null ? String(Math.floor(left / 60000)).padStart(2, '0') : '';
  const ss = left !== null ? String(Math.floor((left % 60000) / 1000)).padStart(2, '0') : '';

  if (PAID.includes(status)) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 8 }}>
        <h1 className="h2">{status === 'delivered' ? 'Delivered. Enjoy your SnapBun!' : status === 'shipped' ? 'Your order is on its way' : 'Payment received. Thank you!'}</h1>
        <p className="lede">We&apos;re packing your SnapBun. You&apos;ll get tracking details by email and SMS from our courier partner once it ships.</p>
        {tracking.ref && (
          <div className="card"><b>Tracking number:</b> {tracking.ref}{' '}{tracking.url && <a href={tracking.url} target="_blank" rel="noopener noreferrer">Track your parcel</a>}</div>
        )}
      </div>
    );
  }
  if (status === 'expired') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 8 }}>
        <h1 className="h2">This order has expired</h1>
        <p className="lede">We didn&apos;t receive payment in time, so the order was released. If you already paid, contact us with reference <b>{p.reference}</b> and we&apos;ll sort it out.</p>
        <a className="btn" href="/checkout" style={{ alignSelf: 'flex-start' }}>Place a new order</a>
      </div>
    );
  }
  if (status === 'cancelled') {
    return <div style={{ marginTop: 8 }}><h1 className="h2">This order was cancelled</h1><p className="lede">Contact us with reference {p.reference} if you have questions.</p></div>;
  }
  if (p.method === 'payfast') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 8 }}>
        <h1 className="h2">{p.fromPayfast ? 'Confirming your payment…' : 'Waiting for payment'}</h1>
        <p className="lede">{p.fromPayfast ? 'This usually takes a few seconds. This page updates on its own.' : 'Your card payment has not come through yet.'}</p>
      </div>
    );
  }
  if (status === 'eft_review') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 8 }}>
        <h1 className="h2">Proof of payment received</h1>
        <p className="lede">Thanks! We&apos;ll check it against our bank account and confirm your order, usually within one business day. This page updates once it&apos;s confirmed.</p>
      </div>
    );
  }
  // awaiting_eft
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginTop: 8 }}>
      <h1 className="h2">Pay by bank transfer</h1>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center', textAlign: 'center', background: 'var(--berry-tint)', borderColor: 'var(--berry)' }}>
        <span className="muted" style={{ fontWeight: 700 }}>Time left to pay</span>
        <span className="countdown" aria-live="polite">{mm}:{ss}</span>
        <span className="muted" style={{ fontSize: 14 }}>Your order is cancelled automatically if payment isn&apos;t made in time.</span>
      </div>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <b>1. Pay {rand(p.total)} into this account</b>
        <dl className="bank">
          <dt>Bank</dt><dd>{p.bank.name}</dd><span />
          <dt>Account name</dt><dd>{p.bank.holder}</dd><span />
          <dt>Account number</dt><dd>{p.bank.number}</dd><Copy text={p.bank.number} />
          <dt>Branch code</dt><dd>{p.bank.branch}</dd><Copy text={p.bank.branch} />
          <dt>Account type</dt><dd>{p.bank.type}</dd><span />
          <dt>Reference</dt><dd style={{ color: 'var(--berry)' }}>{p.reference}</dd><Copy text={p.reference} />
          <dt>Amount</dt><dd>{rand(p.total)}</dd><Copy text={p.total.toFixed(2)} />
        </dl>
        <p className="muted" style={{ margin: 0, fontSize: 14 }}>Use the reference exactly as shown so we can match your payment.</p>
      </div>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <b>2. Upload your proof of payment</b>
        <div className="f">
          <label htmlFor="pop">Screenshot or PDF from your banking app (max 4 MB)</label>
          <input id="pop" type="file" accept="application/pdf,image/jpeg,image/png,image/webp,image/heic" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        </div>
        {err && <p className="err" role="alert">{err}</p>}
        <button className="btn" type="button" onClick={upload} disabled={busy} style={{ alignSelf: 'flex-start' }}>{busy ? 'Uploading…' : 'Upload proof of payment'}</button>
        {p.popEmail && <p className="muted" style={{ margin: 0, fontSize: 14 }}>Trouble uploading? Email it to {p.popEmail} with reference {p.reference}.</p>}
      </div>
    </div>
  );
}
