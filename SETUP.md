# Nuvé store: setup guide

This gets the store live in test mode first (no real money, no real couriers), then switches it to live.
Allow about an hour. You need: a GitHub account, and free accounts at vercel.com and supabase.com.

---

## 1. Put the code on GitHub
1. On github.com, create a new **private** repository called `nuve-store`. Leave it empty.
2. Upload this folder to it (or let Claude push it once GitHub is connected in claude.ai).

## 2. Create the database (Supabase)
1. On supabase.com, click **New project**. Pick the **Africa (Cape Town)** or nearest region and set a database password (keep it safe).
2. When it's ready, open **SQL Editor → New query**, paste everything from `supabase/schema.sql`, and press **Run**. You should see "Success".
3. Optional but recommended: **Database → Extensions**, enable `pg_cron`, then run the commented-out block at the bottom of `schema.sql` (remove the `--` first). This expires unpaid EFT orders exactly on time even when nobody is visiting the site.
4. Open **Project Settings → API** and keep this page open. You'll copy three values from it in step 4:
   - Project URL
   - `anon` `public` key
   - `service_role` key (secret: never share it or put it in the browser)

## 3. Get your test keys
- **PayFast sandbox:** the test merchant details are already in `.env.example` (merchant ID `10000100`). Test payments use the sandbox wallet, so no card is charged.
- **Bob Go sandbox:** sign up at **sandbox.bobgo.co.za** → **Settings → API keys** → create a key.

## 4 (option A). Deploy on your own DigitalOcean server, with Claude Code
1. On digitalocean.com, go to **Create → Droplets**:
   - **Region:** London or Frankfurt (DigitalOcean has no Africa region).
   - **Image:** Ubuntu 24.04 LTS.
   - **Size:** Basic, Regular, **4 GB RAM** (Claude Code needs 4 GB).
   - **Authentication:** Password (simplest), or an SSH key if you have one.
   - Click **Create Droplet** and wait for its IP address to appear.
2. Open the droplet and click **Access → Launch Droplet Console**. A terminal opens, logged in as root.
3. Paste this and press Enter:
   ```
   curl -fsSLO https://raw.githubusercontent.com/halifaosman/nuve-store/main/deploy/setup.sh && bash setup.sh
   ```
   If your domain already points at the droplet (an A record set to its IP), add the domain to the end: `bash setup.sh nuve.co.za`. Without one, the store gets a free `https://<ip>.sslip.io` address you can swap later.
4. The script asks you to log in to GitHub (it shows a code to enter at github.com/login/device). Then it opens your settings file. Fill in `ADMIN_PASSWORD`, the three Supabase values and `BOBGO_API_KEY`, then save with **Ctrl+O, Enter, Ctrl+X**. Everything else is done for you.
5. When it prints **Done**, open the address it shows.
6. Install Claude Code on the server:
   ```
   su - nuve
   curl -fsSL https://claude.ai/install.sh | bash
   cd ~/nuve-store && claude
   ```
   Log in when asked: it gives you a link to open on your phone or computer. Claude Code reads `CLAUDE.md` in the project, so it already knows how to rebuild and restart the store.

Later changes: run `~/nuve-store/deploy/update.sh` as the `nuve` user. To change a setting, edit `~/nuve-store/.env` with `nano`, then run the same command.
Using your own domain later: point its A record at the droplet, replace the address in `/etc/caddy/Caddyfile` (as root), run `systemctl reload caddy`, change `SITE_URL` in `.env`, then run `update.sh`.

Then skip step 5 below and carry on at step 6, using your server's address.

## 4 (option B). Deploy on Vercel
1. On vercel.com, click **Add New → Project** and import the `nuve-store` repository.
2. Before pressing Deploy, open **Environment Variables** and add every line from `.env.example`:

| Name | What to put |
|---|---|
| `SITE_URL` | Leave as `https://nuve-store.vercel.app` for now; fix it after the first deploy (step 5) |
| `ADMIN_PASSWORD` | A long password you'll use at `/admin` (16+ characters) |
| `SESSION_SECRET` | 64 random characters. Generate one at https://www.random.org/strings or with `openssl rand -hex 32` |
| `CRON_SECRET` | Another long random string |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase `anon` key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase `service_role` key |
| `PAYFAST_SANDBOX` | `true` |
| `PAYFAST_MERCHANT_ID` / `PAYFAST_MERCHANT_KEY` / `PAYFAST_PASSPHRASE` | The sandbox values from `.env.example` |
| `BOBGO_SANDBOX` | `true` |
| `BOBGO_API_KEY` | Your Bob Go **sandbox** API key |
| `BOBGO_WEBHOOK_SECRET` | Fill in at step 6 |

3. Press **Deploy**.

## 5. Point the site at its own address
1. After the deploy, copy the address Vercel gives you (e.g. `https://nuve-store-abc.vercel.app`) or your own domain.
2. In Vercel → **Settings → Environment Variables**, set `SITE_URL` to it (no slash at the end), then **Deployments → ⋯ → Redeploy**.

## 6. Connect Bob Go tracking updates
1. In Bob Go sandbox: **Settings → Webhook subscriptions**. Generate a **secret** and copy it into Vercel as `BOBGO_WEBHOOK_SECRET` (then redeploy).
2. Add three subscriptions, all pointing to `https://YOUR-SITE/api/webhooks/bobgo`:
   `fulfillment/created`, `tracking/updated`, `order/updated`.

## 7. Fill in the store settings
1. Go to `https://YOUR-SITE/admin` and log in with `ADMIN_PASSWORD`.
2. **Store settings:**
   - **Bank transfer:** your bank name, account name, account number, branch code. The EFT option only shows at checkout once these are filled in.
   - **Shipping:** your **collection address** (where the courier collects), the weight and size of one SnapBun.
   - Check the **Connections** box at the top: every dot should be green except PayFast (red = still in test mode, which is right for now).
3. **Page content:** add real reviews, videos, photos and logos as you get them.

## 8. Test the whole flow (sandbox)
- **Card order:** buy a pack, choose PayFast, pay with the sandbox wallet (`sbtu01@payfast.io` / `clientpass`). Back on the store, the order page should switch to "Payment received" within a few seconds. In `/admin` the order shows **In Bob Go**, and it appears in your Bob Go sandbox dashboard.
- **EFT order:** choose bank transfer. You should see the bank details and a 30-minute timer. Upload any screenshot as proof → it moves to **Pending EFT → Proof uploaded** in the admin. Press **Mark as paid** → it goes to Bob Go.
- **Expiry:** place another EFT order and leave it. After 30 minutes it shows as **Expired** in both places.
- **Tracking:** in Bob Go sandbox, fulfil one of the orders. The admin should show the tracking number and **Shipped**.

## 9. Go live
1. **PayFast:** in your live PayFast account → **Settings**, set a **Salt Passphrase**. In Vercel set `PAYFAST_SANDBOX=false` and your live `PAYFAST_MERCHANT_ID`, `PAYFAST_MERCHANT_KEY`, `PAYFAST_PASSPHRASE`.
2. **Bob Go:** create a live API key and webhook secret at bobgo.co.za, repeat step 6 on the live account, and set `BOBGO_SANDBOX=false`, `BOBGO_API_KEY`, `BOBGO_WEBHOOK_SECRET`.
3. Redeploy. On the live site, a missing `PAYFAST_SANDBOX` / `BOBGO_SANDBOX` setting stops checkout with a clear message instead of silently staying in test mode.
4. Place one small real order end to end, then refund it in PayFast.

## Day-to-day
- **Pending EFT tab:** check proofs against your actual bank account before pressing **Mark as paid**. A screenshot alone can be faked.
- **Red banner in the admin** = a paid order didn't reach Bob Go (usually Bob Go was briefly down). The admin retries automatically every few minutes while it's open; you can also press **Send to Bob Go** on the order.
- **Fulfil in Bob Go** as usual. Tracking numbers and delivery status flow back into the admin, and Bob Go sends the customer tracking emails/SMS.
- **Change prices, copy or bank details** in **Store settings**. Changes are live immediately.
