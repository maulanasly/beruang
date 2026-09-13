#!/usr/bin/env bash
# rollback.sh — restore previous binary and restart. Run as root.
# Usage: sudo bash /opt/beruang/scripts/rollback.sh
# Beruang keeps no server-side state, so rollback is binary-only.
set -euo pipefail

APP_BIN="/usr/local/bin/beruang-gateway"
APP_PREV="/usr/local/bin/beruang-gateway.prev"
SERVICE="beruang"

if [ -f "$APP_PREV" ]; then
  echo "Restoring binary $APP_PREV -> $APP_BIN"
  cp -a "$APP_PREV" "$APP_BIN"
else
  echo "warning: no previous binary at $APP_PREV" >&2
fi

systemctl restart "$SERVICE"
sleep 3
curl -fsS --max-time 5 http://127.0.0.1:8000/health >/dev/null \
  && echo "Rollback OK — service healthy." \
  || { echo "Rollback healthcheck FAILED" >&2; exit 1; }
