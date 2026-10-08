# Nuvé store

Storefront, checkout and order admin for the Nuvé SnapBun.

- **Store:** landing page, pack pricing, checkout with live Bob Go delivery rates.
- **Payments:** PayFast (card, Instant EFT, SnapScan) and manual bank transfer with a timed payment window and proof-of-payment upload.
- **Admin (`/admin`):** orders, Pending EFT queue, customers, page content (reviews, videos, photos, logos, sections) and store settings.
- **Fulfilment:** paid orders are pushed to Bob Go automatically; tracking comes back by webhook.

Stack: Next.js 14 (App Router), Supabase (Postgres + storage), hosted on Vercel.

**Start here:** [SETUP.md](SETUP.md).

```bash
npm install
cp .env.example .env.local   # fill in values
npm run dev                  # http://localhost:3000
npm test                     # PayFast signature + Bob Go webhook checks
```
