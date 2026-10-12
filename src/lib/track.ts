'use client';
// Browser-side tracking: fires the Meta Pixel and TikTok Pixel events and sends the same event (same event_id)
// to our server, which forwards it to Meta's Conversions API and TikTok's Events API. Does nothing until <MetaPixel> has set things up, or if the
// visitor declined tracking.

type Data = { value?: number; content_ids?: string[]; num_items?: number; payment_type?: string; currency?: string; content_type?: string; contents?: { id: string; quantity: number }[]; order_id?: string };
type User = { email?: string; phone?: string; first?: string; last?: string; city?: string; province?: string; postal?: string };
type TTQ = { page: () => void; track: (e: string, p: unknown, o: unknown) => void; identify: (u: unknown) => void };
type W = Window & { ttq?: TTQ; fbq?: (...a: unknown[]) => void; __nuveTrack?: { on: boolean; sandbox: boolean } };

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
  try { tiktok(w.ttq, event, payload, eventId, opts.user); } catch { /* pixel blocked */ }
  if (opts.browserOnly) return;
  const body = JSON.stringify({ event, eventId, url: location.href, data: payload, user: opts.user });
  try {
    if (!navigator.sendBeacon?.('/api/meta/event', new Blob([body], { type: 'application/json' }))) {
      fetch('/api/meta/event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
    }
  } catch { /* offline */ }
}

// Meta event names → TikTok standard events. TikTok's own name for a purchase is CompletePayment.
const TT: Record<string, string> = { ViewContent: 'ViewContent', AddToCart: 'AddToCart', InitiateCheckout: 'InitiateCheckout', AddPaymentInfo: 'AddPaymentInfo', Contact: 'Contact', Purchase: 'CompletePayment' };

function tiktok(ttq: TTQ | undefined, event: string, d: Data, eventId: string, user?: User) {
  if (!ttq) return;
  if (event === 'PageView') { ttq.page(); return; }
  const name = TT[event];
  if (!name) return;
  // TikTok's pixel hashes these itself before sending.
  if (user?.email || user?.phone) {
    const ph = (user.phone || '').replace(/\D/g, '').replace(/^0/, '27');
    ttq.identify({ ...(user.email ? { email: user.email.trim().toLowerCase() } : {}), ...(ph.length >= 9 ? { phone_number: '+' + ph } : {}) });
  }
  const contents = (d.contents || (d.content_ids || []).map((id) => ({ id, quantity: d.num_items || 1 })))
    .map((c) => ({ content_id: c.id, content_name: 'SnapBun', quantity: c.quantity }));
  const props: Record<string, unknown> = { content_type: 'product', currency: d.currency || 'ZAR' };
  if (contents.length) props.contents = contents;
  if (typeof d.value === 'number') props.value = d.value;
  if (d.order_id) props.order_id = d.order_id;
  ttq.track(name, props, { event_id: eventId });
}
