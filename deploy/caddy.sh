#!/usr/bin/env bash
# Writes /etc/caddy/Caddyfile for the store and reloads Caddy. Run as root:
#   ~nuve/nuve-store/deploy/caddy.sh            (keeps the current domain)
#   ~nuve/nuve-store/deploy/caddy.sh shop.example.co.za
#
# Works with or without Cloudflare in front:
# - Requests that come from Cloudflare's servers get the visitor's real IP from the CF-Connecting-IP
#   header (needed for PayFast payment checks, rate limits, admin login protection and Meta tracking).
# - Requests from anywhere else use the connection's own IP, so nobody can fake it by sending headers.
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "Run this as root."; exit 1; }

DOMAIN="${1:-}"
if [ -z "$DOMAIN" ] && [ -f /etc/caddy/Caddyfile ]; then
  DOMAIN="$(awk 'NR==1{print $1}' /etc/caddy/Caddyfile)"
fi
[[ "$DOMAIN" == *.* ]] || { echo "Give the store's domain: deploy/caddy.sh shop.example.co.za"; exit 1; }

# Cloudflare's server addresses (https://www.cloudflare.com/ips). Fetched fresh; the list below is the fallback.
FALLBACK="173.245.48.0/20 103.21.244.0/22 103.22.200.0/22 103.31.4.0/22 141.101.64.0/18 108.162.192.0/18 190.93.240.0/20 188.114.96.0/20 197.234.240.0/22 198.41.128.0/17 162.158.0.0/15 104.16.0.0/13 104.24.0.0/14 172.64.0.0/13 131.0.72.0/22 2400:cb00::/32 2606:4700::/32 2803:f800::/32 2405:b500::/32 2405:8100::/32 2a06:98c0::/29 2c0f:f248::/32"
CF="$( { curl -fsS -m 10 https://www.cloudflare.com/ips-v4; echo; curl -fsS -m 10 https://www.cloudflare.com/ips-v6; } 2>/dev/null | grep -E '^[0-9a-f:.]+/[0-9]+$' | tr '\n' ' ' || true)"
[ "$(echo "$CF" | wc -w)" -ge 10 ] || CF="$FALLBACK"

NEW="$(mktemp)"
cat > "$NEW" <<EOF
$DOMAIN {
  encode zstd gzip
  request_body {
    max_size 60MB
  }

  @cloudflare remote_ip $CF
  handle @cloudflare {
    reverse_proxy 127.0.0.1:3000 {
      header_up X-Forwarded-For {http.request.header.CF-Connecting-IP}
      header_up X-Real-IP {http.request.header.CF-Connecting-IP}
    }
  }
  handle {
    reverse_proxy 127.0.0.1:3000
  }
}
EOF

caddy validate --adapter caddyfile --config "$NEW" >/dev/null 2>&1 || { caddy validate --adapter caddyfile --config "$NEW"; echo "Caddyfile not changed."; rm -f "$NEW"; exit 1; }
[ -f /etc/caddy/Caddyfile ] && cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak
install -m 644 "$NEW" /etc/caddy/Caddyfile
rm -f "$NEW"
systemctl reload caddy || systemctl restart caddy
echo "==> Caddy updated for https://$DOMAIN (Cloudflare-ready)."
