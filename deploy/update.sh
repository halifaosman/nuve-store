#!/usr/bin/env bash
# Rebuild and restart the store after a code or .env change. Run as the "nuve" user:
#   ~/nuve-store/deploy/update.sh          (pulls the latest code from GitHub first)
#   ~/nuve-store/deploy/update.sh --local  (uses the code as it is on this server)
# The new version is built next to the live one and swapped in, so the store is only down for a few seconds.
# If the new version fails to start, the previous one is put back automatically.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ "${1:-}" != "--local" ]; then
  git pull --ff-only
fi
mysql < mysql/schema.sql   # adds any new tables (uses ~/.my.cnf)
npm ci --no-audit --no-fund
rm -rf .next-new
NEXT_DIST_DIR=.next-new npm run build

up() { for _ in 1 2 3 4 5 6 7 8 9 10; do curl -fsS -o /dev/null http://127.0.0.1:3000/ && return 0; sleep 2; done; return 1; }

rm -rf .next-old
[ -d .next ] && mv .next .next-old
mv .next-new .next
sudo /usr/bin/systemctl restart nuve-store
if up; then
  echo "Store updated and responding."
else
  echo "The new version did not start. Putting the previous version back."
  if [ -d .next-old ]; then
    rm -rf .next-failed && mv .next .next-failed && mv .next-old .next
    sudo /usr/bin/systemctl restart nuve-store
    up && echo "Previous version is running again."
  fi
  echo "See what went wrong: sudo journalctl -u nuve-store -n 50"
  exit 1
fi
