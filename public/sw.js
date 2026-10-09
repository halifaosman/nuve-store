// Nuvé order app service worker. Scope: /my/ only.
// It makes the order app installable and shows a simple offline screen; order data always comes
// fresh from the network, so customers never see an old delivery status as if it were current.
const OFFLINE = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Nuvé</title>'
  + '<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#1E1714;color:#FBF8F6;font:16px/1.5 system-ui,sans-serif;text-align:center;padding:24px">'
  + '<div><p style="font-size:22px;margin:0 0 8px">You\'re offline</p><p style="opacity:.75;margin:0 0 20px">Connect to the internet to see where your order is.</p>'
  + '<button onclick="location.reload()" style="font:inherit;font-weight:700;border:0;border-radius:999px;padding:12px 24px;background:#A3324A;color:#fff">Try again</button></div>';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  if (e.request.mode !== 'navigate') return; // let the browser handle everything else normally
  e.respondWith(fetch(e.request).catch(() => new Response(OFFLINE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })));
});
