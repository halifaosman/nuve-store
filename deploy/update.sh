#!/usr/bin/env bash
# Rebuild and restart the store after a code or .env change. Run as the "nuve" user:
#   ~/nuve-store/deploy/update.sh          (pulls the latest code from GitHub first)
#   ~/nuve-store/deploy/update.sh --local  (uses the code as it is on this server)
set -euo pipefail
cd "$(dirname "$0")/.."

if [ "${1:-}" != "--local" ]; then
  git pull --ff-only
fi
npm ci --no-audit --no-fund
npm run build
sudo /usr/bin/systemctl restart nuve-store
sleep 4
if curl -fsS -o /dev/null http://127.0.0.1:3000/; then
  echo "Store restarted and responding."
else
  echo "Store did not respond. See the log: sudo journalctl -u nuve-store -n 50"
  exit 1
fi
