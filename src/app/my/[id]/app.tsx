'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Road from './road';

type Data = {
  now: number; order: string; first: string; status: string; method: string; placed: string; paid: string | null;
  items: string[]; total: number; shipping: string | null; address: string;
  journey: { stage: number; closed: '' | 'expired' | 'cancelled'; problem: string; headline: string; sub: string };
  tracking: null | { reference: string; url: string; courier: string; estimateFrom: string; estimateTo: string; checkpoints: { time: string; status: string; message: string; location: string }[] };
  chat: { from: 'you' | 'nuve'; text: string; at: string }[];
};
const STAGES = ['Order placed', 'Payment confirmed', 'Packed for the courier', 'Collected by the courier', 'On the road', 'Out for delivery', 'Delivered'];
const POSITION = [0, 0.1, 0.22, 0.38, 0.6, 0.86, 1];

const tz = { timeZone: 'Africa/Johannesburg' } as const;
const day = (v: string) => { const d = new Date(v); return isNaN(+d) ? v : d.toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short', ...tz }); };
const when = (v: string) => { const d = new Date(v); return isNaN(+d) ? v : d.toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', ...tz }); };
const rand = (n: number) => 'R' + n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type BIP = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

export default function OrderApp({ id, token }: { id: string; token: string }) {
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState<'track' | 'help' | 'order'>('track');
  const [msg, setMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [chatErr, setChatErr] = useState('');
  const [install, setInstall] = useState<BIP | null>(null);
  const [iosHint, setIosHint] = useState(false);
  const [standalone, setStandalone] = useState(true);
  const chatEnd = useRef<HTMLDivElement>(null);
  const api = `/api/my/${id}?t=${encodeURIComponent(token)}`;

  const load = useCallback(async () => {
    try {
      const r = await fetch(api, { cache: 'no-store' });
      if (!r.ok) { setErr(r.status === 404 ? 'We could not find this order. Open the link from your order confirmation again.' : 'Could not load your order. Pull down to try again.'); return; }
      setD(await r.json()); setErr('');
    } catch { setErr('You seem to be offline. Your order details will update when you reconnect.'); }
  }, [api]);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    const vis = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', vis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', vis); };
  }, [load]);

  // Home-screen install: Android shows a button; iPhone gets Share → Add to Home Screen steps.
  useEffect(() => {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setStandalone(isStandalone);
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js', { scope: '/my/' }).catch(() => {});
    const h = (e: Event) => { e.preventDefault(); setInstall(e as BIP); };
    window.addEventListener('beforeinstallprompt', h);
    try { localStorage.setItem('nuve_last_order', location.pathname + location.search); } catch { /* storage blocked */ }
    return () => window.removeEventListener('beforeinstallprompt', h);
  }, []);
  const isIOS = typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);

  useEffect(() => { if (tab === 'help') chatEnd.current?.scrollIntoView({ block: 'end' }); }, [tab, d?.chat.length]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!msg.trim()) return;
    setSending(true); setChatErr('');
    try {
      const r = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: msg }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setChatErr(j.error || 'Your message was not sent. Try again.');
      else { setMsg(''); await load(); }
    } catch { setChatErr('Your message was not sent. Check your connection and try again.'); }
    setSending(false);
  }

  if (!d) {
    return (
      <div className="mapp">
        <header className="m-top"><img src="/brand/nuve-logo-white.svg" alt="Nuvé" /></header>
        <main className="m-main">{err ? <p className="m-err">{err}</p> : <div className="m-skel" aria-label="Loading your order" />}</main>
      </div>
    );
  }

  const j = d.journey;
  const t = d.tracking;
  const stage = j.stage;
  const eta = t && (t.estimateFrom || t.estimateTo) ? [t.estimateFrom, t.estimateTo].filter(Boolean).map(day).filter((v, i, a) => a.indexOf(v) === i).join(' – ') : '';

  return (
    <div className="mapp">
      <header className="m-top">
        <img src="/brand/nuve-logo-white.svg" alt="Nuvé" />
        <span>{d.order}</span>
      </header>

      <main className="m-main">
        {tab === 'track' && (
          <>
            <section className="m-map">
              {j.closed ? <div className="m-closed">{j.headline}</div> : (
                <Road progress={POSITION[Math.max(0, stage)]} moving={stage >= 3 && stage <= 5 && !j.problem} delivered={stage === 6} problem={!!j.problem} />
              )}
              {!j.closed && <div className="m-eta">{stage === 6 ? 'At your door' : stage === 5 ? 'Arriving today' : eta ? `Expected ${eta}` : stage >= 3 ? 'With the courier' : 'Being prepared'}</div>}
            </section>

            <section className="m-status" aria-live="polite">
              <h1>{stage === 6 && d.first ? `Delivered, ${d.first}!` : j.headline}</h1>
              <p className={j.problem ? 'm-warn' : ''}>{j.sub}</p>
              {d.status === 'awaiting_eft' && <a className="m-btn" href={`/order/${id}?t=${encodeURIComponent(token)}`}>See bank details and upload proof</a>}
            </section>

            {!j.closed && (
              <section className="m-card">
                <h2>Progress</h2>
                <ol className="m-steps">
                  {STAGES.map((s, i) => (
                    <li key={s} className={i < stage ? 'done' : i === stage ? 'now' : ''} aria-current={i === stage ? 'step' : undefined}>
                      <span className="dot" aria-hidden="true" />
                      <span>{s}</span>
                      {i === 0 && <small>{when(d.placed)}</small>}
                      {i === 1 && d.paid && <small>{when(d.paid)}</small>}
                    </li>
                  ))}
                </ol>
              </section>
            )}

            {t && (
              <section className="m-card">
                <h2>Courier tracking</h2>
                <dl className="m-dl">
                  <div><dt>Tracking number</dt><dd>{t.reference}</dd></div>
                  {t.courier && <div><dt>Courier</dt><dd>{t.courier}</dd></div>}
                  {eta && <div><dt>Expected</dt><dd>{eta}</dd></div>}
                </dl>
                {t.checkpoints.length > 0 ? (
                  <ul className="m-cps">
                    {t.checkpoints.map((c, i) => (
                      <li key={i}><b>{c.status || c.message}</b>{c.message && c.status && c.message !== c.status && <span>{c.message}</span>}<small>{[when(c.time), c.location].filter(Boolean).join(', ')}</small></li>
                    ))}
                  </ul>
                ) : <p className="m-muted">Courier updates appear here as your parcel moves.</p>}
                {t.url && <a className="m-link" href={t.url} target="_blank" rel="noopener noreferrer">Open the courier&apos;s tracking page</a>}
              </section>
            )}
          </>
        )}

        {tab === 'help' && (
          <section className="m-chat">
            <h1>Ask us anything</h1>
            <p className="m-muted">Questions about order {d.order}? Send them here and we&apos;ll reply in this app, usually within one business day.</p>
            <div className="m-thread">
              {d.chat.length === 0 && <p className="m-muted m-empty">No messages yet. Ask about delivery, your order or using your SnapBun.</p>}
              {d.chat.map((c, i) => (
                <div key={i} className={`m-bubble ${c.from}`}>
                  <p>{c.text}</p>
                  <small>{c.from === 'nuve' ? 'Nuvé' : 'You'}, {when(c.at)}</small>
                </div>
              ))}
              <div ref={chatEnd} />
            </div>
            <form className="m-send" onSubmit={send}>
              <label htmlFor="m-msg" className="sr">Your message</label>
              <textarea id="m-msg" rows={2} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Type your question…" maxLength={2000} />
              <button className="m-btn" type="submit" disabled={sending || !msg.trim()}>{sending ? 'Sending…' : 'Send'}</button>
            </form>
            {chatErr && <p className="m-err" role="alert">{chatErr}</p>}
          </section>
        )}

        {tab === 'order' && (
          <section className="m-card m-order">
            <h1>Order {d.order}</h1>
            <dl className="m-dl">
              <div><dt>Items</dt><dd>{d.items.join(', ')}</dd></div>
              <div><dt>Total</dt><dd>{rand(d.total)}</dd></div>
              <div><dt>Payment</dt><dd>{d.method === 'eft' ? 'Bank transfer' : 'Card / Instant EFT'}{d.paid ? ', paid' : ', not paid yet'}</dd></div>
              <div><dt>Delivery</dt><dd>{d.shipping}</dd></div>
              <div><dt>Delivering to</dt><dd>{d.address}</dd></div>
              <div><dt>Ordered</dt><dd>{when(d.placed)}</dd></div>
            </dl>
            <a className="m-link" href={`/order/${id}?t=${encodeURIComponent(token)}`}>Full order details</a>
            <a className="m-link" href="/">Visit the Nuvé store</a>
          </section>
        )}

        {err && <p className="m-err">{err}</p>}

        {!standalone && (install || isIOS) && (
          <section className="m-install">
            <img src="/brand/app-192.png" alt="" width={44} height={44} />
            <div>
              <b>Add this to your home screen</b>
              <span>Check your delivery in one tap, like an app.</span>
            </div>
            {install
              ? <button className="m-btn" onClick={async () => { await install.prompt(); await install.userChoice.catch(() => null); setInstall(null); }}>Add</button>
              : <button className="m-btn" onClick={() => setIosHint(true)}>How</button>}
          </section>
        )}
        {iosHint && (
          <div className="m-sheet" role="dialog" aria-label="Add to home screen" onClick={() => setIosHint(false)}>
            <div onClick={(e) => e.stopPropagation()}>
              <b>Add to your home screen</b>
              <ol>
                <li>Tap the <b>Share</b> button <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 15V3M8 7l4-4 4 4M5 11v9h14v-9" /></svg> at the bottom of Safari.</li>
                <li>Scroll down and tap <b>Add to Home Screen</b>.</li>
                <li>Tap <b>Add</b>. Your Nuvé order is now one tap away.</li>
              </ol>
              <button className="m-btn" onClick={() => setIosHint(false)}>Got it</button>
            </div>
          </div>
        )}
      </main>

      <nav className="m-tabs" aria-label="Sections">
        {([['track', 'Track', 'M3 12h4l3-8 4 16 3-8h4'], ['help', 'Help', 'M4 5h16v11H8l-4 4z'], ['order', 'Order', 'M6 7h12l-1 13H7L6 7zM9 7a3 3 0 0 1 6 0']] as const).map(([k, l, icon]) => (
          <button key={k} className={tab === k ? 'on' : ''} aria-current={tab === k ? 'page' : undefined} onClick={() => setTab(k)}>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={icon} /></svg>
            {l}
            {k === 'help' && d.chat.length > 0 && d.chat[d.chat.length - 1].from === 'nuve' && tab !== 'help' && <i aria-label="New reply" />}
          </button>
        ))}
      </nav>
    </div>
  );
}
