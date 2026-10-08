# Nuvé store: notes for Claude Code

Live SnapBun store (Next.js 14 App Router + Supabase + PayFast + Bob Go) running on a DigitalOcean server.

## How it runs on this server
- Code: `~/nuve-store` (user `nuve`). Settings and secrets: `~/nuve-store/.env`. Never print, commit or paste `.env` values.
- Service: `nuve-store` (systemd) runs `next start` on 127.0.0.1:3000. Caddy serves it over HTTPS (`/etc/caddy/Caddyfile`).
- Every minute, `deploy/cron.sh` calls `/api/cron/expire`: expires unpaid EFT orders and retries Bob Go sends.
- Logs: `sudo journalctl -u nuve-store -n 100`.

## Making a change
1. Edit the code. Check it with `npm run typecheck` and `npm test`.
2. Run `deploy/update.sh --local`. This builds and restarts, and the store is down for a few seconds.
3. Open the changed page with `curl` to confirm it works.
4. Commit and `git push`, so GitHub keeps the latest version.
- After changing `.env`, run `deploy/update.sh --local`. `NEXT_PUBLIC_*` values are built into the pages, so a restart alone isn't enough.
- Database changes go in `supabase/schema.sql` and are run by the owner in the Supabase SQL editor.

## Code map
- `src/lib/`: payfast.ts (signatures, ITN checks), bobgo.ts, orders.ts (status changes, Bob Go sending), settings.ts (packs, prices, bank), auth.ts (admin cookie), env.ts.
- `src/app/`: the store page (`page.tsx`), `checkout/`, `order/[id]/` (EFT countdown and proof upload), `admin/` (orders, Pending EFT, customers, content, settings), and `api/`.
- Prices, copy and bank details live in the admin under Store settings (database), not in the code.

## Rules
- Keep PayFast signature code unchanged unless `npm test` still passes against `tests/vectors.jsonl`.
- Status updates in orders.ts are conditional on purpose, to stop double payments and double Bob Go sends. Keep them atomic.
- Never switch `PAYFAST_SANDBOX` or `BOBGO_SANDBOX` to `false` unless the owner asks.
