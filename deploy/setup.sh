#!/usr/bin/env bash
# One-time setup of the Nuvé store on a fresh Ubuntu 24.04 server (DigitalOcean droplet).
# Run as root:   bash setup.sh your-domain.co.za
# No domain yet? Run without one and the store gets a free https://<ip>.sslip.io address.
#
# What it does: adds swap, installs Node 22, git, GitHub CLI and Caddy (automatic HTTPS),
# creates a "nuve" user that owns the app, clones the repo, writes .env, builds,
# runs the store as a service, sets up the every-minute expiry job and a firewall.
set -euo pipefail

REPO="halifaosman/nuve-store"
APP_USER="nuve"
APP_DIR="/home/$APP_USER/nuve-store"

[ "$(id -u)" = 0 ] || { echo "Run this as root (on DigitalOcean the console logs you in as root)."; exit 1; }

IP="$(curl -fsS4 https://api.ipify.org || hostname -I | awk '{print $1}')"
DOMAIN="${1:-${IP//./-}.sslip.io}"
echo "==> Setting up the store at https://$DOMAIN"

# ---------- System ----------
export DEBIAN_FRONTEND=noninteractive
if ! swapon --show | grep -q /swapfile; then
  echo "==> Adding 2 GB swap (keeps builds from running out of memory)"
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "==> Installing packages"
apt-get update -y
apt-get install -y ca-certificates curl gnupg git ufw debian-keyring debian-archive-keyring apt-transport-https

if ! command -v node >/dev/null || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

if ! command -v gh >/dev/null; then
  install -d -m 0755 /etc/apt/keyrings
  curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg -o /etc/apt/keyrings/githubcli-archive-keyring.gpg
  chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list
  apt-get update -y && apt-get install -y gh
fi

if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y && apt-get install -y caddy
fi

# ---------- App user ----------
id "$APP_USER" >/dev/null 2>&1 || useradd -m -s /bin/bash "$APP_USER"
# Let the app user (and Claude Code running as it) restart the store, nothing else.
cat > /etc/sudoers.d/nuve-store <<EOF
$APP_USER ALL=(root) NOPASSWD: /usr/bin/systemctl restart nuve-store, /usr/bin/systemctl status nuve-store, /usr/bin/journalctl -u nuve-store *
EOF
chmod 440 /etc/sudoers.d/nuve-store

# ---------- Code ----------
if [ ! -d "$APP_DIR/.git" ]; then
  echo
  echo "==> Log in to GitHub so the server can download (and later push) the store code."
  echo "    Choose: GitHub.com -> HTTPS -> Yes -> Login with a web browser."
  echo "    It shows a code; open https://github.com/login/device on your phone or computer and enter it."
  sudo -iu "$APP_USER" gh auth login --hostname github.com --git-protocol https --web
  sudo -iu "$APP_USER" gh auth setup-git
  sudo -iu "$APP_USER" git clone "https://github.com/$REPO.git" "$APP_DIR"
fi

# ---------- Settings (.env) ----------
ENV_FILE="$APP_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
  rand() { openssl rand -hex 32; }
  sed -e "s#^SITE_URL=.*#SITE_URL=https://$DOMAIN#" \
      -e "s#^SESSION_SECRET=.*#SESSION_SECRET=$(rand)#" \
      -e "s#^CRON_SECRET=.*#CRON_SECRET=$(rand)#" \
      "$APP_DIR/.env.example" > "$ENV_FILE"
  chown "$APP_USER:$APP_USER" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  echo
  echo "==> Now fill in your settings. The editor opens next."
  echo "    Fill in: ADMIN_PASSWORD, the three Supabase values, BOBGO_API_KEY."
  echo "    SITE_URL, SESSION_SECRET and CRON_SECRET are already filled in for you."
  echo "    Save with Ctrl+O then Enter, exit with Ctrl+X."
  read -rp "    Press Enter to open the editor... " _
  nano "$ENV_FILE"
fi

# ---------- Build ----------
echo "==> Installing and building (takes a few minutes)"
sudo -iu "$APP_USER" bash -c "cd '$APP_DIR' && npm ci && npm run build"

# ---------- Service ----------
cat > /etc/systemd/system/nuve-store.service <<EOF
[Unit]
Description=Nuve store (Next.js)
After=network-online.target
Wants=network-online.target

[Service]
User=$APP_USER
WorkingDirectory=$APP_DIR
Environment=NODE_ENV=production
ExecStart=/usr/bin/node node_modules/next/dist/bin/next start -H 127.0.0.1 -p 3000
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now nuve-store
systemctl restart nuve-store

# ---------- HTTPS ----------
cat > /etc/caddy/Caddyfile <<EOF
$DOMAIN {
  encode gzip
  request_body {
    max_size 60MB
  }
  reverse_proxy 127.0.0.1:3000
}
EOF
systemctl reload caddy || systemctl restart caddy

# ---------- Expire unpaid EFT orders + retry Bob Go, every minute ----------
cat > /etc/cron.d/nuve-store <<EOF
* * * * * $APP_USER $APP_DIR/deploy/cron.sh >/dev/null 2>&1
EOF
chmod +x "$APP_DIR/deploy/"*.sh

# ---------- Firewall ----------
ufw allow OpenSSH >/dev/null
ufw allow 80,443/tcp >/dev/null
ufw --force enable >/dev/null

echo
echo "==> Done. Your store: https://$DOMAIN   Admin: https://$DOMAIN/admin"
echo "    (HTTPS can take a minute to switch on the first time.)"
echo "    Install Claude Code next:  su - $APP_USER  then  curl -fsSL https://claude.ai/install.sh | bash"
