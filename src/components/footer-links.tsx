'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { track } from '@/lib/track';

type Panel = 'privacy' | 'terms' | 'shipping' | 'contact' | 'track';
type Policy = { title: string; text: string };
const LINKS: [Panel, string][] = [
  ['track', 'Track My Order'],
  ['contact', 'Contact Us'],
  ['shipping', 'Shipping Policy'],
  ['terms', 'Terms and Conditions'],
  ['privacy', 'Privacy Policy'],
];
const TITLES: Record<Panel, string> = { track: 'Track My Order', contact: 'Contact Us', shipping: 'Shipping Policy', terms: 'Terms and Conditions', privacy: 'Privacy Policy' };

/** Renders policy text: "## " headings, "- " bullets, blank lines between paragraphs. */
function PolicyBody({ text }: { text: string }) {
  const blocks = text.replace(/\r/g, '').split(/\n{2,}/);
  return (
    <div className="policy">
      {blocks.map((blk, i) => {
        const lines = blk.split('\n').filter((l) => l.trim());
        const out: React.ReactNode[] = [];
        let bullets: string[] = [];
        const flush = (k: string) => { if (bullets.length) { out.push(<ul key={k}>{bullets.map((b, j) => <li key={j}>{b}</li>)}</ul>); bullets = []; } };
        lines.forEach((l, j) => {
          if (l.startsWith('## ')) { flush(`u${j}`); out.push(<h3 key={j}>{l.slice(3)}</h3>); }
          else if (/^[-•]\s/.test(l)) bullets.push(l.replace(/^[-•]\s/, ''));
          else { flush(`u${j}`); out.push(<p key={j}>{l}</p>); }
        });
        flush('end');
        return <div key={i}>{out}</div>;
      })}
    </div>
  );
}

const TOPICS = ['My order', 'Delivery', 'Returns and refunds', 'Product question', 'Something else'];

function ContactForm({ email, phone }: { email: string; phone: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true); setErr('');
    try {
      const r = await fetch('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(f)) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setErr(j.error || 'Your message could not be sent. Please try again.');
      else { setDone(true); track('Contact'); }
    } catch { setErr('Your message could not be sent. Check your connection and try again.'); }
    setBusy(false);
  }
  if (done) {
    return (
      <div className="m-done">
        <b>Thanks, we&apos;ve got your message.</b>
        <p>We usually reply within one business day, to the email address you gave us.</p>
      </div>
    );
  }
  return (
    <form className="m-form" onSubmit={submit} noValidate>
      {(email || phone) && <p className="muted" style={{ margin: 0 }}>You can also reach us {email && <>at <a href={`mailto:${email}`}>{email}</a></>}{email && phone && ' or '}{phone && <>on <a href={`tel:${phone.replace(/\s/g, '')}`}>{phone}</a></>}.</p>}
      <div className="row2">
        <div className="f"><label htmlFor="c-name">Name</label><input id="c-name" name="name" autoComplete="name" required /></div>
        <div className="f"><label htmlFor="c-email">Email</label><input id="c-email" name="email" type="email" autoComplete="email" required /></div>
        <div className="f"><label htmlFor="c-phone">Phone (optional)</label><input id="c-phone" name="phone" type="tel" autoComplete="tel" /></div>
        <div className="f"><label htmlFor="c-order">Order number (optional)</label><input id="c-order" name="order" placeholder="e.g. NUV1001" /></div>
      </div>
      <div className="f"><label htmlFor="c-topic">What is it about?</label><select id="c-topic" name="topic" defaultValue="My order">{TOPICS.map((t) => <option key={t}>{t}</option>)}</select></div>
      <div className="f"><label htmlFor="c-msg">Message</label><textarea id="c-msg" name="message" rows={5} required /></div>
      <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: 'absolute', left: -9999, width: 1, height: 1 }} />
      {err && <p className="err" role="alert">{err}</p>}
      <button className="btn" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send message'}</button>
    </form>
  );
}

type Track = {
  order: string; status: string; step: number; closed: boolean; placed: string; paid: string | null; items: string[]; total: number;
  shipping: string; area: string; orderUrl: string; events: { kind: string; at: string }[];
  tracking: null | { reference: string; status: string; courier: string; url: string; estimateFrom: string; estimateTo: string; checkpoints: { time: string; status: string; message: string; location: string }[] };
};
const when = (iso: string) => {
  const d = new Date(iso);
  return isNaN(+d) ? iso : d.toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Johannesburg' });
};
const dateOnly = (v: string) => {
  const d = new Date(v);
  return isNaN(+d) ? v : d.toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Africa/Johannesburg' });
};
const STEPS = ['Ordered', 'Paid', 'Packed', 'Shipped', 'Delivered'];

function TrackForm() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [res, setRes] = useState<Track | null>(null);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true); setErr('');
    try {
      const r = await fetch('/api/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(f)) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(j.error || 'Tracking is not available right now.'); setRes(null); }
      else setRes(j);
    } catch { setErr('Tracking is not available right now. Check your connection and try again.'); }
    setBusy(false);
  }
  if (res) {
    const t = res.tracking;
    return (
      <div className="trk">
        <div className="trk-head">
          <span className="muted">Order {res.order}</span>
          <b>{res.status}</b>
        </div>
        {!res.closed && (
          <ol className="trk-steps" aria-label="Order progress">
            {STEPS.map((s, i) => <li key={s} className={i <= res.step ? 'on' : ''}><span />{s}</li>)}
          </ol>
        )}
        {t && (
          <div className="trk-box">
            <div className="trk-row"><span>Tracking number</span><b>{t.reference}</b></div>
            {t.courier && <div className="trk-row"><span>Courier</span><b>{t.courier}</b></div>}
            {t.status && <div className="trk-row"><span>Courier status</span><b>{t.status}</b></div>}
            {(t.estimateFrom || t.estimateTo) && <div className="trk-row"><span>Estimated delivery</span><b>{[t.estimateFrom, t.estimateTo].filter(Boolean).map(dateOnly).filter((v, i, a) => a.indexOf(v) === i).join(' – ')}</b></div>}
            {t.checkpoints.length > 0 && (
              <ul className="trk-cps">
                {t.checkpoints.map((c, i) => (
                  <li key={i}><b>{c.status || c.message}</b>{c.message && c.status && <span>{c.message}</span>}<small>{[when(c.time), c.location].filter(Boolean).join(' · ')}</small></li>
                ))}
              </ul>
            )}
            {t.url && <a className="btn ghostbtn" href={t.url} target="_blank" rel="noopener noreferrer">Open courier tracking</a>}
          </div>
        )}
        {!t && !res.closed && res.step >= 1 && <p className="muted" style={{ margin: 0 }}>Your tracking number appears here as soon as the courier collects your parcel. You&apos;ll also get it by email and SMS.</p>}
        <div className="trk-box">
          <div className="trk-row"><span>Ordered</span><b>{when(res.placed)}</b></div>
          {res.paid && <div className="trk-row"><span>Payment confirmed</span><b>{when(res.paid)}</b></div>}
          <div className="trk-row"><span>Items</span><b>{res.items.join(', ')}</b></div>
          <div className="trk-row"><span>Delivery</span><b>{[res.shipping, res.area].filter(Boolean).join(' to ')}</b></div>
          <div className="trk-row"><span>Total</span><b>R{res.total.toFixed(2)}</b></div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <a className="btn" href={res.orderUrl}>View full order</a>
          <button type="button" className="btn ghostbtn" onClick={() => setRes(null)}>Track another order</button>
        </div>
      </div>
    );
  }
  return (
    <form className="m-form" onSubmit={submit} noValidate>
      <p className="muted" style={{ margin: 0 }}>Enter your order number and the email address or phone number you used at checkout.</p>
      <div className="f"><label htmlFor="t-order">Order number</label><input id="t-order" name="order" placeholder="e.g. NUV1001" autoComplete="off" required /></div>
      <div className="f"><label htmlFor="t-contact">Email or phone number</label><input id="t-contact" name="contact" autoComplete="email" required /></div>
      {err && <p className="err" role="alert">{err}</p>}
      <button className="btn" type="submit" disabled={busy}>{busy ? 'Looking it up…' : 'Track order'}</button>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>Your order number is in your confirmation email and on your order page, e.g. NUV1001.</p>
    </form>
  );
}

export default function FooterLinks({ policies, email, phone }: { policies: Record<'privacy' | 'terms' | 'shipping', Policy>; email: string; phone: string }) {
  const [open, setOpen] = useState<Panel | null>(null);
  const dlg = useRef<HTMLDialogElement>(null);

  const show = useCallback((p: Panel) => {
    setOpen(p);
    if (dlg.current && !dlg.current.open) dlg.current.showModal();
    if (location.hash !== `#${p}`) history.replaceState(null, '', `#${p}`);
  }, []);
  const close = () => dlg.current?.close();

  // Links like nuve.co.za/#track or #privacy open the matching pop-up (handy for emails and ads).
  useEffect(() => {
    const fromHash = () => { const h = location.hash.slice(1) as Panel; if (h in TITLES) show(h); };
    fromHash();
    window.addEventListener('hashchange', fromHash);
    return () => window.removeEventListener('hashchange', fromHash);
  }, [show]);

  return (
    <>
      <nav className="foot-links" aria-label="Help and policies">
        {LINKS.map(([k, l]) => <a key={k} href={`#${k}`} onClick={(e) => { e.preventDefault(); show(k); }}>{l}</a>)}
      </nav>
      <dialog
        ref={dlg}
        className="modal"
        aria-labelledby="modal-title"
        onClose={() => { setOpen(null); if (location.hash) history.replaceState(null, '', location.pathname + location.search); }}
        onClick={(e) => { if (e.target === dlg.current) close(); }}
      >
        {open && (
          <div className="modal-in">
            <div className="modal-top">
              <h2 id="modal-title">{TITLES[open]}</h2>
              <button type="button" className="modal-x" aria-label="Close" onClick={close}>
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </div>
            <div className="modal-body">
              {open === 'contact' ? <ContactForm email={email} phone={phone} />
                : open === 'track' ? <TrackForm />
                : <PolicyBody text={policies[open].text} />}
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}
