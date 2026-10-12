'use client';
import { useEffect, useState } from 'react';
import { newEventId, track } from '@/lib/track';

type TTQ = unknown[] & Record<string, unknown>;
type W = Window & { ttq?: TTQ; TiktokAnalyticsObject?: string; fbq?: ((...a: unknown[]) => void) & { callMethod?: unknown; queue?: unknown[]; loaded?: boolean; version?: string; push?: unknown }; _fbq?: unknown; __nuveTrack?: { on: boolean; sandbox: boolean } };

const getConsent = () => {
  const m = /(?:^|;\s*)nuve_consent=(yes|no)/.exec(document.cookie);
  return m ? m[1] : null;
};
const setConsent = (v: 'yes' | 'no') => {
  document.cookie = `nuve_consent=${v}; path=/; max-age=${365 * 86400}; samesite=lax${location.protocol === 'https:' ? '; secure' : ''}`;
};

function loadPixel(pixelId: string) {
  const w = window as W;
  if (w.fbq) return;
  // Meta's standard base code, written out so it runs only after consent rules allow it.
  const n = function (...args: unknown[]) { (n.callMethod ? (n.callMethod as (...a: unknown[]) => void).apply(n, args) : n.queue!.push(args)); } as NonNullable<W['fbq']>;
  w.fbq = n; if (!w._fbq) w._fbq = n;
  n.push = n; n.loaded = true; n.version = '2.0'; n.queue = [];
  n('init', pixelId);
  // Meta's script is big. Events wait in the queue above (and the server copy goes straight away), so load it
  // only once the visitor scrolls/taps or after a few seconds. That keeps it from slowing the first view on phones.
  let done = false;
  const go = () => {
    if (done) return; done = true;
    ['scroll', 'pointerdown', 'keydown', 'touchstart'].forEach((ev) => window.removeEventListener(ev, go));
    const s = document.createElement('script'); s.async = true; s.src = 'https://connect.facebook.net/en_US/fbevents.js';
    document.head.appendChild(s);
  };
  ['scroll', 'pointerdown', 'keydown', 'touchstart'].forEach((ev) => window.addEventListener(ev, go, { once: true, passive: true }));
  setTimeout(go, 3500);
}

// TikTok's standard base code (the snippet from TikTok Events Manager), split so the queue exists straight away
// and events.js is only fetched on first scroll/tap or after a few seconds, like the Meta script above.
const TT_METHODS = ['page', 'track', 'identify', 'instances', 'debug', 'on', 'off', 'once', 'ready', 'alias', 'group', 'enableCookie', 'disableCookie', 'holdConsent', 'revokeConsent', 'grantConsent'];
function loadTikTok(pixelId: string) {
  const w = window as W;
  if (w.ttq) return;
  w.TiktokAnalyticsObject = 'ttq';
  const ttq = [] as unknown as TTQ;
  w.ttq = ttq;
  ttq.methods = TT_METHODS;
  const setAndDefer = (t: TTQ, e: string) => { t[e] = (...a: unknown[]) => { t.push([e, ...a]); }; };
  TT_METHODS.forEach((m) => setAndDefer(ttq, m));
  ttq.instance = (id: string) => { const e = ((ttq._i as Record<string, TTQ>)[id] || []) as TTQ; TT_METHODS.forEach((m) => setAndDefer(e, m)); return e; };
  const src = 'https://analytics.tiktok.com/i18n/pixel/events.js';
  const i = (ttq._i = {} as Record<string, unknown>) as Record<string, TTQ>;
  i[pixelId] = [] as unknown as TTQ; i[pixelId]._u = src;
  ttq._t = { [pixelId]: +new Date() };
  ttq._o = { [pixelId]: {} };
  let done = false;
  const go = () => {
    if (done) return; done = true;
    ['scroll', 'pointerdown', 'keydown', 'touchstart'].forEach((ev) => window.removeEventListener(ev, go));
    const s = document.createElement('script'); s.async = true; s.src = `${src}?sdkid=${pixelId}&lib=ttq`;
    document.head.appendChild(s);
  };
  ['scroll', 'pointerdown', 'keydown', 'touchstart'].forEach((ev) => window.addEventListener(ev, go, { once: true, passive: true }));
  setTimeout(go, 3500);
}

// If the visitor arrived from a Meta ad (?fbclid=...), keep the click id even if the Pixel script is blocked.
function keepClickId() {
  const id = new URLSearchParams(location.search).get('fbclid');
  if (id && !/(?:^|;\s*)_fbc=/.test(document.cookie)) {
    document.cookie = `_fbc=fb.1.${Date.now()}.${id}; path=/; max-age=${90 * 86400}; samesite=lax${location.protocol === 'https:' ? '; secure' : ''}`;
  }
  // Same for TikTok ads (?ttclid=...): kept for the server's TikTok events, including the paid-order event.
  const tt = new URLSearchParams(location.search).get('ttclid');
  if (tt && /^[\w.-]{4,500}$/.test(tt)) {
    document.cookie = `nuve_ttclid=${tt}; path=/; max-age=${30 * 86400}; samesite=lax${location.protocol === 'https:' ? '; secure' : ''}`;
  }
}

function start(pixelId: string, tiktokId: string) {
  keepClickId();
  if (pixelId) loadPixel(pixelId);
  if (tiktokId) loadTikTok(tiktokId);
  track('PageView', {}, { eventId: newEventId('PageView') });
  window.dispatchEvent(new Event('nuve-track-ready'));
}

/**
 * Meta Pixel + TikTok Pixel + cookie notice. mode 'notice': tracks unless the visitor says no.
 * mode 'optin': tracks only after the visitor says yes. Renders nothing if neither Pixel ID is set.
 */
export default function MetaPixel({ pixelId, tiktokId = '', mode, sandbox }: { pixelId: string; tiktokId?: string; mode: 'notice' | 'optin'; sandbox: boolean }) {
  const [ask, setAsk] = useState(false);
  useEffect(() => {
    if (!pixelId && !tiktokId) return;
    const w = window as W;
    const c = getConsent();
    const on = mode === 'optin' ? c === 'yes' : c !== 'no';
    w.__nuveTrack = { on, sandbox };
    if (c === null) setAsk(true);
    if (!on) return;
    start(pixelId, tiktokId);
  }, [pixelId, tiktokId, mode, sandbox]);

  if ((!pixelId && !tiktokId) || !ask) return null;
  const choose = (v: 'yes' | 'no') => {
    setConsent(v); setAsk(false);
    const w = window as W;
    if (v === 'no') { if (w.__nuveTrack) w.__nuveTrack.on = false; return; }
    if (!w.__nuveTrack?.on) {
      w.__nuveTrack = { on: true, sandbox };
      start(pixelId, tiktokId);
    }
  };
  return (
    <div className="consent" role="region" aria-label="Cookie notice">
      <p>We use cookies to see which of our ads work, so we can show you fewer irrelevant ones. <a href="#privacy">Privacy Policy</a></p>
      <div>
        <button type="button" className="ghost" onClick={() => choose('no')}>No thanks</button>
        <button type="button" className="btn small" onClick={() => choose('yes')}>OK</button>
      </div>
    </div>
  );
}

/** Runs fn once tracking is ready (straight away if it already is). */
export function useWhenTracking(fn: () => void, deps: unknown[] = []) {
  useEffect(() => {
    const w = window as W;
    if (w.__nuveTrack?.on) { fn(); return; }
    const h = () => fn();
    window.addEventListener('nuve-track-ready', h, { once: true });
    return () => window.removeEventListener('nuve-track-ready', h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
