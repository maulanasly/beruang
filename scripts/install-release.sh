#!/usr/bin/env bash
# install-release.sh — install a GitHub-built beruang binary on the VPS.
# Usage (run as root, typically via `sudo` from the `deploy` user):
#   sudo bash /tmp/install-release-<run>.sh /tmp/beruang-new-<run> [/tmp/beruang-<run>.service]
#
# Steps: keep .prev binary → install → refresh unit → restart systemd →
# healthcheck. Beruang keeps no server-side state (ledgers live in the
# browser) and needs no secrets, so there is no DB backup or env staging.
set -euo pipefail

BIN_SRC="${1:?usage: install-release.sh <path-to-new-binary> [path-to-staged-unit]}"
STAGED_UNIT="${2:-/tmp/beruang.service}"
APP_BIN="/usr/local/bin/beruang-gateway"
APP_PREV="/usr/local/bin/beruang-gateway.prev"
SERVICE="beruang"
HEALTH_URL="http://127.0.0.1:8000/health"

if [ ! -f "$BIN_SRC" ]; then
  echo "error: binary not found: $BIN_SRC" >&2
  exit 1
fi

chmod 755 "$BIN_SRC"

# 1. Keep previous binary for rollback.
if [ -f "$APP_BIN" ]; then
  echo "Saving previous binary -> $APP_PREV"
  cp -a "$APP_BIN" "$APP_PREV"
fi

# 2. Install new binary.
echo "Installing $BIN_SRC -> $APP_BIN"
install -m 755 "$BIN_SRC" "$APP_BIN"

# 3. Refresh systemd unit if the repo version changed (e.g. new Environment).
# The live unit predates repo changes otherwise.
LIVE_UNIT="/etc/systemd/system/beruang.service"
if [ -f "$STAGED_UNIT" ]; then
  if ! cmp -s "$STAGED_UNIT" "$LIVE_UNIT"; then
    echo "Updating systemd unit -> $LIVE_UNIT"
    install -m 644 "$STAGED_UNIT" "$LIVE_UNIT"
  else
    echo "Systemd unit unchanged."
  fi
  rm -f "$STAGED_UNIT"
fi

# 4. Restart service.
echo "Restarting $SERVICE"
systemctl daemon-reload || true
systemctl enable "$SERVICE" >/dev/null 2>&1 || true
systemctl restart "$SERVICE"

# 5. Healthcheck (the binary boots in well under a second; no migrations).
echo "Healthchecking $HEALTH_URL"
for i in $(seq 1 20); do
  if curl -fsS --max-time 5 "$HEALTH_URL" >/dev/null 2>&1; then
    echo "Healthy."
    break
  fi
  if [ "$i" -eq 20 ]; then
    echo "Healthcheck FAILED after 20 tries — see: journalctl -u $SERVICE" >&2
    systemctl status "$SERVICE" --no-pager || true
    exit 1
  fi
  sleep 3
done

echo "Deploy OK: $(basename "$BIN_SRC") active."
