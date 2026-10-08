#!/usr/bin/env bash
# Nightly backup (run by /etc/cron.d/nuve-store as the "nuve" user, or by hand any time).
# Saves the database and the uploaded files to ~/backups and keeps the last 14 days.
# These copies live on the same server. Also switch on Backups for the droplet in DigitalOcean,
# so there is a copy somewhere else if the server itself is lost.
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."

OUT="$HOME/backups"
DATA="$(grep -E '^DATA_DIR=' .env | cut -d= -f2- | tr -d '"'"'"' \r')"
DATA="${DATA:-$HOME/nuve-data}"
STAMP="$(date -u +%Y-%m-%d_%H%M)"
mkdir -p "$OUT"
chmod 700 "$OUT"

mysqldump --single-transaction --no-tablespaces --routines nuve | gzip > "$OUT/db-$STAMP.sql.gz"
tar -czf "$OUT/files-$STAMP.tar.gz" -C "$(dirname "$DATA")" "$(basename "$DATA")"

find "$OUT" -name 'db-*.sql.gz' -mtime +14 -delete
find "$OUT" -name 'files-*.tar.gz' -mtime +14 -delete
echo "$(date -u +%FT%TZ) backup ok: db-$STAMP.sql.gz files-$STAMP.tar.gz"
