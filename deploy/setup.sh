#!/usr/bin/env bash
# Sets up the Nuvé store on a fresh Ubuntu 24.04 server (DigitalOcean droplet). Safe to run again.
# Run as root:   bash setup.sh your-domain.co.za
# No domain yet? Run without one and the store gets a free https://<ip>.sslip.io address.
#
# What it does: adds swap, installs Node 22, MySQL, git, GitHub CLI and Caddy (automatic HTTPS),
# creates a "nuve" user that owns the app, creates the database, clones the repo, writes .env,
# builds, runs the store as a service, and sets up the every-minute expiry job, nightly backups and a firewall.
set -euo pipefail

REPO="halifaosman/nuve-store"
APP_USER="nuve"
HOME_DIR="/home/$APP_USER"
APP_DIR="$HOME_DIR/nuve-store"
DATA_DIR="$HOME_DIR/nuve-data"
DB_NAME="nuve"

[ "$(id -u)" = 0 ] || { echo "Run this as root (on DigitalOcean the console logs you in as root)."; exit 1; }

IP="$(curl -fsS4 https://api.ipify.org || hostname -I | awk '{print $1}')"
DOMAIN="${1:-}"
if [ -z "$DOMAIN" ] && [ -f /etc/caddy/Caddyfile ]; then
  DOMAIN="$(awk 'NR==1{print $1}' /etc/caddy/Caddyfile)"   # keep the address from an earlier run
  [[ "$DOMAIN" == *.* ]] || DOMAIN=""
fi
DOMAIN="${DOMAIN:-${IP//./-}.sslip.io}"
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
apt-get install -y ca-certificates curl gnupg git ufw nano mysql-server debian-keyring debian-archive-keyring apt-transport-https

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
# Let the app user (and Claude Code running as it) restart the store and read its logs, nothing else.
cat > /etc/sudoers.d/nuve-store <<EOF
$APP_USER ALL=(root) NOPASSWD: /usr/bin/systemctl restart nuve-store, /usr/bin/systemctl status nuve-store, /usr/bin/journalctl -u nuve-store *
EOF
chmod 440 /etc/sudoers.d/nuve-store
install -d -o "$APP_USER" -g "$APP_USER" -m 700 "$DATA_DIR" "$DATA_DIR/media" "$DATA_DIR/proofs" "$HOME_DIR/backups"

# ---------- Database (MySQL, only reachable from this server) ----------
systemctl enable --now mysql
MYCNF="$HOME_DIR/.my.cnf"
if [ ! -f "$MYCNF" ]; then
  DB_PASS="$(openssl rand -hex 24)"
  mysql <<EOF
CREATE DATABASE IF NOT EXISTS $DB_NAME CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER IF NOT EXISTS '$APP_USER'@'localhost' IDENTIFIED BY '$DB_PASS';
ALTER USER '$APP_USER'@'localhost' IDENTIFIED BY '$DB_PASS';
GRANT ALL PRIVILEGES ON $DB_NAME.* TO '$APP_USER'@'localhost';
FLUSH PRIVILEGES;
EOF
  printf '[client]\nuser=%s\npassword=%s\nhost=127.0.0.1\n\n[mysql]\ndatabase=%s\n' \
    "$APP_USER" "$DB_PASS" "$DB_NAME" > "$MYCNF"
  chown "$APP_USER:$APP_USER" "$MYCNF"
  chmod 600 "$MYCNF"
fi
DB_PASS="$(awk -F= '/^password=/{print $2; exit}' "$MYCNF")"
DATABASE_URL="mysql://$APP_USER:$DB_PASS@127.0.0.1:3306/$DB_NAME"

# ---------- Code ----------
if [ ! -d "$APP_DIR/.git" ]; then
  echo
  echo "==> Log in to GitHub so the server can download (and later push) the store code."
  echo "    Choose: GitHub.com -> HTTPS -> Yes -> Login with a web browser."
  echo "    It shows a code; open https://github.com/login/device on your phone or computer and enter it."
  sudo -iu "$APP_USER" gh auth login --hostname github.com --git-protocol https --web
  sudo -iu "$APP_USER" gh auth setup-git
  sudo -iu "$APP_USER" git clone "https://github.com/$REPO.git" "$APP_DIR"
else
  sudo -iu "$APP_USER" git -C "$APP_DIR" pull --ff-only
fi

echo "==> Creating database tables"
sudo -iu "$APP_USER" bash -c "mysql < '$APP_DIR/mysql/schema.sql'"

# ---------- Settings (.env) ----------
ENV_FILE="$APP_DIR/.env"
set_env() {  # set_env NAME VALUE: replace the line if present, otherwise add it
  if grep -qE "^$1=" "$ENV_FILE"; then sed -i "s#^$1=.*#$1=$2#" "$ENV_FILE"; else echo "$1=$2" >> "$ENV_FILE"; fi
}
NEW_ENV=0
if [ ! -f "$ENV_FILE" ]; then
  cp "$APP_DIR/.env.example" "$ENV_FILE"
  set_env SITE_URL "https://$DOMAIN"
  set_env SESSION_SECRET "$(openssl rand -hex 32)"
  set_env CRON_SECRET "$(openssl rand -hex 32)"
  NEW_ENV=1
fi
set_env DATABASE_URL "$DATABASE_URL"
set_env DATA_DIR "$DATA_DIR"
sed -i '/^NEXT_PUBLIC_SUPABASE_/d; /^SUPABASE_SERVICE_ROLE_KEY=/d; /^# ---- Supabase/d; /^# Server only. Never expose this in the browser./d' "$ENV_FILE"
chown "$APP_USER:$APP_USER" "$ENV_FILE"
chmod 600 "$ENV_FILE"

if [ "$NEW_ENV" = 1 ] || ! grep -qE '^ADMIN_PASSWORD=.+' "$ENV_FILE"; then
  echo
  echo "==> Now fill in your settings. The editor opens next."
  echo "    Fill in: ADMIN_PASSWORD (the password for /admin) and BOBGO_API_KEY (your Bob Go sandbox key)."
  echo "    Everything else, including the database, is already filled in for you."
  echo "    Save with Ctrl+O then Enter, exit with Ctrl+X."
  read -rp "    Press Enter to open the editor... " _
  nano "$ENV_FILE"
fi

# ---------- Build ----------
echo "==> Installing and building (takes a few minutes)"
sudo -iu "$APP_USER" bash -c "cd '$APP_DIR' && npm ci --no-audit --no-fund && npm run build"

# ---------- Service ----------
cat > /etc/systemd/system/nuve-store.service <<EOF
[Unit]
Description=Nuve store (Next.js)
After=network-online.target mysql.service
Wants=network-online.target
Requires=mysql.service

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
systemctl enable nuve-store
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

# ---------- Scheduled jobs ----------
chmod +x "$APP_DIR/deploy/"*.sh
cat > /etc/cron.d/nuve-store <<EOF
# Every minute: expire unpaid EFT orders, retry Bob Go sends
* * * * * $APP_USER $APP_DIR/deploy/cron.sh >/dev/null 2>&1
# Every night at 02:30: back up the database and uploaded files to $HOME_DIR/backups
30 2 * * * $APP_USER $APP_DIR/deploy/backup.sh >> $HOME_DIR/backups/backup.log 2>&1
EOF

# ---------- Firewall ----------
ufw allow OpenSSH >/dev/null
ufw allow 80,443/tcp >/dev/null
ufw --force enable >/dev/null

sleep 4
if curl -fsS -o /dev/null http://127.0.0.1:3000/; then
  echo
  echo "==> Done. Your store: https://$DOMAIN   Admin: https://$DOMAIN/admin"
  echo "    (HTTPS can take a minute to switch on the first time.)"
  echo "    Install Claude Code next:  su - $APP_USER  then  curl -fsSL https://claude.ai/install.sh | bash"
else
  echo
  echo "==> The store did not start. Show the error with:  journalctl -u nuve-store -n 50"
  exit 1
fi
