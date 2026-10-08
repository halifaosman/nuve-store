# Nuvé store: notes for Claude Code

Live SnapBun store (Next.js 14 App Router + MySQL 8 + PayFast + Bob Go) running on a DigitalOcean server.

## How it runs on this server
- Code: `~/nuve-store` (user `nuve`). Settings and secrets: `~/nuve-store/.env`. Never print, commit or paste `.env` values.
- Service: `nuve-store` (systemd) runs `next start` on 127.0.0.1:3000. Caddy serves it over HTTPS (`/etc/caddy/Caddyfile`).
- Every minute, `deploy/cron.sh` calls `/api/cron/expire`: expires unpaid EFT orders and retries Bob Go sends.
- Database: MySQL on this server, database `nuve`. `mysql` connects directly using `~/.my.cnf`.
- Uploads: `~/nuve-data/media` holds public images and videos, served at `/media/...`. `~/nuve-data/proofs` holds proofs of payment and is admin only. Code: `src/lib/files.ts`.
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

## Rules
- Keep PayFast signature code unchanged unless `npm test` still passes against `tests/vectors.jsonl`.
- Status updates in orders.ts are conditional on purpose, to stop double payments and double Bob Go sends. Keep them atomic.
- Never switch `PAYFAST_SANDBOX` or `BOBGO_SANDBOX` to `false` unless the owner asks.
