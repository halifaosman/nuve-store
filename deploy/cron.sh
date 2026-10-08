#!/usr/bin/env bash
# Runs every minute (from /etc/cron.d/nuve-store): expires unpaid EFT orders on time
# and retries any paid orders that didn't reach Bob Go.
cd "$(dirname "$0")/.."
SECRET="$(grep -E '^CRON_SECRET=' .env | head -1 | cut -d= -f2- | tr -d '"'"'"' \r')"
[ -n "$SECRET" ] || exit 0
curl -fsS -m 50 -H "Authorization: Bearer $SECRET" http://127.0.0.1:3000/api/cron/expire >/dev/null
