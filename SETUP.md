# Nuvé store: setup guide

Everything runs on one server you own: the store, the MySQL database and the uploaded files.
It goes live in test mode first (no real money, no real couriers), then switches to live.
Allow about 30 minutes. You need a DigitalOcean account, a GitHub account and a Bob Go sandbox account.

---

## 1. Get your test keys
- **PayFast sandbox:** the test merchant details are already in `.env.example` (merchant ID `10000100`). Test payments use the sandbox wallet, so no card is charged.
- **Bob Go sandbox:** sign up at **sandbox.bobgo.co.za** → **Settings → API keys** → create a key. Keep the page open.

## 2. Create the server
On digitalocean.com, go to **Create → Droplets**:
- **Region:** London or Frankfurt (DigitalOcean has no Africa region).
- **Image:** Ubuntu 24.04 LTS.
- **Size:** Basic, Regular, **4 GB RAM** (Claude Code needs 4 GB).
- **Authentication:** Password (simplest), or an SSH key if you have one.
- **Backups:** tick **Enable automated backups**. This keeps copies off the server, in case the server itself is lost.

Click **Create Droplet** and wait for its IP address to appear.

## 3. Run the setup
1. Open the droplet and click **Access → Launch Droplet Console**. A terminal opens, logged in as root.
2. Paste this and press Enter:
   ```
   curl -fsSLO https://raw.githubusercontent.com/halifaosman/nuve-store/main/deploy/setup.sh && bash setup.sh
   ```
   If your domain already points at the droplet (an A record set to its IP), add the domain to the end: `bash setup.sh nuve.co.za`. Without one, the store gets a free `https://<ip>.sslip.io` address you can swap later.
3. The script logs you in to GitHub. It shows a code: open **github.com/login/device** on your phone and enter it.
4. Then it opens your settings file. Fill in two lines:
   - `ADMIN_PASSWORD=`: the password you'll use at `/admin` (16+ characters).
   - `BOBGO_API_KEY=`: your Bob Go sandbox key.

   The database, secrets and address are already filled in. Save with **Ctrl+O, Enter**, then exit with **Ctrl+X**.
5. When it prints **Done**, open the address it shows.

Already ran an older version of the setup? Run the same command again. It adds MySQL and removes the old Supabase settings without touching anything else.

## 4. Install Claude Code on the server
```
su - nuve
curl -fsSL https://claude.ai/install.sh | bash
cd ~/nuve-store && claude
```
Log in when it asks. It gives you a link to open on your phone or computer, and needs a paid Claude plan.
Claude Code reads `CLAUDE.md` in the project, so it already knows how to change, rebuild, back up and restart the store.

## 5. Connect Bob Go tracking updates
1. In Bob Go sandbox, go to **Settings → Webhook subscriptions**, generate a **secret** and copy it.
2. Add it to the server. In the console, as the `nuve` user:
   ```
   nano ~/nuve-store/.env
   ```
   Paste the secret after `BOBGO_WEBHOOK_SECRET=`, save, then run `~/nuve-store/deploy/update.sh --local`.
3. Add three subscriptions in Bob Go, all pointing to `https://YOUR-SITE/api/webhooks/bobgo`:
   `fulfillment/created`, `tracking/updated`, `order/updated`.

## 6. Fill in the store settings
1. Go to `https://YOUR-SITE/admin` and log in with your `ADMIN_PASSWORD`.
2. **Store settings:**
   - **Bank transfer:** your bank name, account name, account number and branch code. The EFT option only shows at checkout once these are filled in.
   - **Shipping:** your **collection address** (where the courier collects) and the weight and size of one SnapBun.
   - **Connections box:** check it at the top. Every dot should be green except PayFast. PayFast shows red while it's still in test mode, which is right for now.
3. **Page content:** add real reviews, videos, photos and logos as you get them. Uploads are saved on your server.

## 7. Test the whole flow (sandbox)
- **Card order:** buy a pack, choose PayFast, and pay with the sandbox wallet (`sbtu01@payfast.io` / `clientpass`). Back on the store, the order page should switch to "Payment received" within a few seconds. In `/admin` the order shows **In Bob Go**, and it appears in your Bob Go sandbox dashboard.
- **EFT order:** choose bank transfer. You should see the bank details and a 30-minute timer. Upload any screenshot as proof. The order moves to **Pending EFT → Proof uploaded** in the admin. Press **Mark as paid** and it goes to Bob Go.
- **Expiry:** place another EFT order and leave it. After 30 minutes it shows as **Expired** in both places.
- **Tracking:** in Bob Go sandbox, fulfil one of the orders. The admin should show the tracking number and **Shipped**.

## 8. Go live
1. **PayFast:** in your live PayFast account → **Settings**, set a **Salt Passphrase**.
2. **Bob Go:** at bobgo.co.za, create a live API key and webhook secret, then repeat step 5 on the live account.
3. **Server settings:** in `~/nuve-store/.env` set:
   - `PAYFAST_SANDBOX=false` and your live `PAYFAST_MERCHANT_ID`, `PAYFAST_MERCHANT_KEY` and `PAYFAST_PASSPHRASE`.
   - `BOBGO_SANDBOX=false` and your live `BOBGO_API_KEY` and `BOBGO_WEBHOOK_SECRET`.

   Then run `~/nuve-store/deploy/update.sh --local`.
4. **Test it for real:** place one small real order end to end, then refund it in PayFast.

## Your own domain (any time)
1. At your domain registrar, point an **A record** at the droplet's IP.
2. As root, run `bash setup.sh your-domain.co.za` again. It switches HTTPS to the new domain.
3. Change `SITE_URL` in `.env` to the new address, and update the Bob Go webhook addresses.

## Day-to-day
- **Pending EFT tab:** check proofs against your actual bank account before pressing **Mark as paid**. A screenshot alone can be faked.
- **Red banner in the admin:** a paid order didn't reach Bob Go, usually because Bob Go was briefly down. The server retries every minute. You can also press **Send to Bob Go** on the order.
- **Fulfil in Bob Go** as usual. Tracking numbers and delivery status flow back into the admin, and Bob Go sends the customer tracking emails and SMS.
- **Change prices, copy or bank details** in **Store settings**. Changes are live immediately.
- **Backups:** every night at 02:30 the server saves the database and uploads to `~/backups` and keeps 14 days. DigitalOcean's droplet backups keep a copy off the server.
- **Code changes:** ask Claude Code on the server, or run `~/nuve-store/deploy/update.sh` after pushing to GitHub.
