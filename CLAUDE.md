# Nuvé store: notes for Claude Code

Live SnapBun store (Next.js 14 App Router + MySQL 8 + PayFast + Bob Go) running on a DigitalOcean server.

## How it runs on this server
- Code: `~/nuve-store` (user `nuve`). Settings and secrets: `~/nuve-store/.env`. Never print, commit or paste `.env` values.
- Service: `nuve-store` (systemd) runs `next start` on 127.0.0.1:3000. Caddy serves it over HTTPS (`/etc/caddy/Caddyfile`, written by `deploy/caddy.sh`, run as root).
- Cloudflare proxies the domain (SSL mode Full (strict)). Caddy sets `X-Forwarded-For` to `CF-Connecting-IP` only for requests from Cloudflare's IP ranges, so the app's first X-Forwarded-For entry is the real visitor (PayFast ITN IP check, rate limits, Meta). Never turn on Cloudflare Bot Fight Mode or challenges for `/api/` (PayFast and Bob Go webhooks).
- Every minute, `deploy/cron.sh` calls `/api/cron/expire`: expires unpaid EFT orders and retries Bob Go sends.
- Database: MySQL on this server, database `nuve`. `mysql` connects directly using `~/.my.cnf`.
- Uploads: `~/nuve-data/media` holds public images and videos, served at `/media/...`. `~/nuve-data/proofs` holds proofs of payment and is admin only. Code: `src/lib/files.ts`.
- Store videos: the cron compresses each uploaded video in the background (`src/lib/video.ts`, ffmpeg, 720px H.264, no audio, faststart, auto cover image), swaps it in and deletes the original; progress in table `video_jobs`. The store loads each clip only when it scrolls near the screen; clips are not clickable.
- Store photos: `/img/<width>/images/...` and `/img/<width>/media/...` (`src/app/img/[...p]/route.ts`, sharp) serve resized WebP copies, cached in `~/nuve-data/cache/img` (not backed up). Use `imgProps(src, sizes)` from `src/lib/img.ts` for every store `<img>`. `deploy/warm-images.sh` pre-makes them after each update. Fonts are self-hosted (@fontsource), no Google Fonts link. The Meta Pixel script loads on first scroll/tap or after 3.5 s (events queue until then).
- Backups: `deploy/backup.sh` runs nightly at 02:30 and writes to `~/backups`, keeping 14 days.
- Logs: `sudo journalctl -u nuve-store -n 100`.

## Making a change
1. Edit the code. Check it with `npm run typecheck` and `npm test`.
2. Run `deploy/update.sh --local`. It builds next to the live version, then swaps it in, so the store is down for a few seconds. If the new version doesn't start, it puts the old one back.
3. Open the changed page with `curl` to confirm it works.
4. Commit and `git push`, so GitHub keeps the latest version.
- After changing `.env`, run `deploy/update.sh --local`. `NEXT_PUBLIC_*` values are built into the pages, so a restart alone isn't enough.
- Database changes go in `mysql/schema.sql`, and `update.sh` applies them. Write them so they're safe to run again (`CREATE TABLE IF NOT EXISTS`). Change existing tables with a one-off `mysql` command, and add the same change to schema.sql for new installs.
- SQL lives in plain queries through `src/lib/db.ts` (`rows`, `one`, `exec`, `insert`, `tx`). Always use `?` placeholders and never build SQL from user input.

## Code map
- `src/lib/`: payfast.ts (signatures, ITN checks), bobgo.ts, orders.ts (status changes, Bob Go sending), settings.ts (packs, prices, bank), auth.ts (admin cookie), env.ts.
- `src/app/`: the store page (`page.tsx`), `checkout/`, `order/[id]/` (EFT countdown and proof upload), `admin/` (orders, Pending EFT, customers, content, settings), and `api/`.
- Prices, copy and bank details live in the admin under Store settings (database), not in the code.
- Free delivery: `freeShipMinQty` (Store settings, default 2). `src/lib/free-delivery.ts` makes the cheapest door rate R0 and others cost the difference; the real courier quote is logged as an order event ('delivery'). `settings.ts` has a one-time upgrade that switched it on and added the delivery cost into 2+ pack prices (R350→R459, R475→R589). Delivery quotes are rounded up to whole rands, and checkout charges the delivery price the shopper saw (if within R5 of a fresh quote).
- Footer pop-ups (`src/components/footer.tsx`, `footer-links.tsx`): Track My Order (`/api/track`, order number + email/phone, live Bob Go `GET /tracking`), Contact Us (`/api/contact` → `messages` table → admin Messages), and policies from `src/lib/policies.ts` (templates filled from settings; custom text in admin Policies & contact). Opening `/#track`, `/#contact`, `/#terms`, `/#privacy` or `/#shipping` opens the pop-up.

- Customer order app (PWA): `/my/[id]?t=<token>` (`src/app/my/[id]/`: app.tsx, road.tsx animated van map, manifest per order) with data from `/api/my/[id]` (journey stages in `src/lib/journey.ts`, live Bob Go tracking cached 60s, chat). Customer messages land in `messages` (topic 'Order app'); admin replies go in `message_replies` via `/api/admin/messages/[id]/reply`. Service worker `public/sw.js` is scoped to `/my/`. The order page links to it.

- Facebook comment auto-replies: `src/lib/fbauto.ts`, run by the cron every minute. Polls the Page's `feed` and `ads_posts` via the Graph API (token `META_PAGE_TOKEN`, Page `META_PAGE_ID`, set in Server settings), matches keyword topics (settings key `fbauto`), replies / hides / flags, logs to `fb_comments`. Admin page: Facebook replies. Test mode logs without posting. Only comments newer than when it was switched on are handled.

- Emails: `src/lib/email.ts` (+ `email-templates.ts`) send through Resend's HTTPS API (DigitalOcean blocks SMTP). Keys `RESEND_API_KEY`, `EMAIL_FROM` in Server settings. `orderEmails(id)` works out which emails an order is due (eft, confirmed, shipped, delivered, admin_new, admin_proof) and sends each once, deduped in `email_log` (ref, kind); hooks call it at each step and the cron (`runEmailOutbox`) catches misses and retries. Only events after `email_since` (settings) are emailed. Owner alerts go to bizEmail (Policies & contact). Contact/order-app messages are copied to the owner; admin replies are emailed to the customer. Test button and recent log: Server settings.

- Meta tracking: browser Pixel (`src/components/meta-pixel.tsx`, `src/lib/track.ts`, loaded from the footer) plus Conversions API from the server (`src/lib/meta.ts`, `/api/meta/event`). Browser and server copies share an event_id. Purchase is sent by the server when an order is marked paid (`markPaid` → `sendPurchase`, retried by the cron), using browser details saved at checkout in `order_tracking`. Skipped in PayFast sandbox unless `META_TEST_EVENT_CODE` is set. Visitors who decline the cookie notice (`nuve_consent=no`) are not tracked.

## Rules
- Keep PayFast signature code unchanged unless `npm test` still passes against `tests/vectors.jsonl`.
- Status updates in orders.ts are conditional on purpose, to stop double payments and double Bob Go sends. Keep them atomic.
- Never switch `PAYFAST_SANDBOX` or `BOBGO_SANDBOX` to `false` unless the owner asks.
