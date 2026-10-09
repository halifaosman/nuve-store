'use client';
import { useEffect, useState } from 'react';
import { newEventId, track } from '@/lib/track';

type W = Window & { fbq?: ((...a: unknown[]) => void) & { callMethod?: unknown; queue?: unknown[]; loaded?: boolean; version?: string; push?: unknown }; _fbq?: unknown; __nuveTrack?: { on: boolean; sandbox: boolean } };

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
  const s = document.createElement('script'); s.async = true; s.src = 'https://connect.facebook.net/en_US/fbevents.js';
  document.head.appendChild(s);
  n('init', pixelId);
}

// If the visitor arrived from a Meta ad (?fbclid=...), keep the click id even if the Pixel script is blocked.
function keepClickId() {
  const id = new URLSearchParams(location.search).get('fbclid');
  if (id && !/(?:^|;\s*)_fbc=/.test(document.cookie)) {
    document.cookie = `_fbc=fb.1.${Date.now()}.${id}; path=/; max-age=${90 * 86400}; samesite=lax${location.protocol === 'https:' ? '; secure' : ''}`;
  }
}

/**
 * Meta Pixel + cookie notice. mode 'notice': tracks unless the visitor says no.
 * mode 'optin': tracks only after the visitor says yes. Renders nothing if no Pixel ID is set.
 */
export default function MetaPixel({ pixelId, mode, sandbox }: { pixelId: string; mode: 'notice' | 'optin'; sandbox: boolean }) {
  const [ask, setAsk] = useState(false);
  useEffect(() => {
    if (!pixelId) return;
    const w = window as W;
    const c = getConsent();
    const on = mode === 'optin' ? c === 'yes' : c !== 'no';
    w.__nuveTrack = { on, sandbox };
    if (c === null) setAsk(true);
    if (!on) return;
    keepClickId();
    loadPixel(pixelId);
    track('PageView', {}, { eventId: newEventId('PageView') });
    window.dispatchEvent(new Event('nuve-track-ready'));
  }, [pixelId, mode, sandbox]);

  if (!pixelId || !ask) return null;
  const choose = (v: 'yes' | 'no') => {
    setConsent(v); setAsk(false);
    const w = window as W;
    if (v === 'no') { if (w.__nuveTrack) w.__nuveTrack.on = false; return; }
    if (!w.__nuveTrack?.on) {
      w.__nuveTrack = { on: true, sandbox };
      keepClickId(); loadPixel(pixelId);
      track('PageView', {}, { eventId: newEventId('PageView') });
      window.dispatchEvent(new Event('nuve-track-ready'));
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
