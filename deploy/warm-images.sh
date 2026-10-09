#!/usr/bin/env bash
# Makes the small phone-sized copies of every store photo ahead of time (see src/app/img/[...p]/route.ts),
# so the first real visitor doesn't wait for them. Safe to run any time; existing copies are reused.
URLS="$(curl -fsS http://127.0.0.1:${PORT:-3000}/ | grep -o '/img/[0-9]*/[^" ,]*' | sort -u)"
n=0
for u in $URLS; do curl -fsS -o /dev/null "http://127.0.0.1:${PORT:-3000}$u" && n=$((n+1)); done
echo "Phone-sized photos ready: $n"
