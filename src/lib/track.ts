'use client';
// Browser-side tracking: fires the Meta Pixel event and sends the same event (same event_id) to our server,
// which forwards it to the Conversions API. Does nothing until <MetaPixel> has set things up, or if the
// visitor declined tracking.

type Data = { value?: number; content_ids?: string[]; num_items?: number; payment_type?: string; currency?: string; content_type?: string; contents?: { id: string; quantity: number }[]; order_id?: string };
type User = { email?: string; phone?: string; first?: string; last?: string; city?: string; province?: string; postal?: string };
type W = Window & { fbq?: (...a: unknown[]) => void; __nuveTrack?: { on: boolean; sandbox: boolean } };

export const newEventId = (name: string) => `${name.toLowerCase()}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export function trackingOn(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(window as W).__nuveTrack?.on;
}

export function track(event: string, data: Data = {}, opts: { eventId?: string; user?: User; browserOnly?: boolean } = {}) {
  if (!trackingOn()) return;
  const w = window as W;
  const eventId = opts.eventId || newEventId(event);
  const payload = { currency: 'ZAR', content_type: 'product', ...data };
  try { w.fbq?.('track', event, payload, { eventID: eventId }); } catch { /* pixel blocked */ }
  if (opts.browserOnly) return;
  const body = JSON.stringify({ event, eventId, url: location.href, data: payload, user: opts.user });
  try {
    if (!navigator.sendBeacon?.('/api/meta/event', new Blob([body], { type: 'application/json' }))) {
      fetch('/api/meta/event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
    }
  } catch { /* offline */ }
}
