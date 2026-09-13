#!/usr/bin/env bash
# bootstrap-server.sh — one-time beruang setup on the shared VPS (monthly-logs
# already provides the `deploy` SSH user and nginx; this adds only what
# beruang needs). Run as root on 43.173.12.145.
# Usage:
#   # copy this file + deploy/beruang.service + deploy/nginx-beruang.conf
#   # + scripts/setup-nginx.sh to the server, then:
#   bash bootstrap-server.sh
#
# Creates: beruang (runtime) user, dirs, sudoers, systemd unit,
# nginx reverse proxy (80 -> 127.0.0.1:8000).
# Does NOT install the app binary (CD does that on release).
set -euo pipefail

echo "==> Installing runtime deps (no Rust toolchain needed — GitHub builds)"
apt-get update -y
apt-get install -y ca-certificates curl openssh-server

echo "==> Creating runtime user"
id beruang >/dev/null 2>&1 || useradd -r -s /usr/sbin/nologin -d /var/lib/beruang beruang

echo "==> Creating dirs"
mkdir -p /var/lib/beruang /opt/beruang/scripts
chown -R beruang:beruang /var/lib/beruang
chown -R deploy:deploy /opt/beruang 2>/dev/null || chown -R root:root /opt/beruang
chmod 750 /var/lib/beruang

echo "==> Sudoers for deploy (least privilege)"
cat > /etc/sudoers.d/deploy-beruang <<'EOF'
deploy ALL=(root) NOPASSWD: /bin/bash /tmp/install-release*.sh *, /usr/bin/bash /tmp/install-release*.sh *, /bin/bash /opt/beruang/scripts/install-release.sh *, /usr/bin/bash /opt/beruang/scripts/install-release.sh *, /bin/systemctl * beruang*, /usr/bin/systemctl * beruang*, /bin/systemctl daemon-reload, /usr/bin/systemctl daemon-reload, /usr/bin/install * /usr/local/bin/beruang-gateway*, /bin/install * /usr/local/bin/beruang-gateway*
EOF
chmod 440 /etc/sudoers.d/deploy-beruang
visudo -c

echo "==> Installing systemd unit (expects deploy/beruang.service next to this script)"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
UNIT_SRC=""
for cand in "$SCRIPT_DIR/beruang.service" "$SCRIPT_DIR/../deploy/beruang.service" /tmp/beruang.service; do
  if [ -f "$cand" ]; then UNIT_SRC="$cand"; break; fi
done
if [ -n "$UNIT_SRC" ]; then
  cp "$UNIT_SRC" /etc/systemd/system/beruang.service
  systemctl daemon-reload
  systemctl enable beruang || true
  echo "Unit installed from $UNIT_SRC"
else
  echo "warning: beruang.service not found next to bootstrap script — install it manually" >&2
fi

echo "==> nginx reverse proxy (80 -> 127.0.0.1:8000)"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
NGINX_SETUP=""
for cand in "$SCRIPT_DIR/setup-nginx.sh" "$SCRIPT_DIR/../scripts/setup-nginx.sh" /tmp/setup-nginx.sh; do
  if [ -f "$cand" ]; then NGINX_SETUP="$cand"; break; fi
done
if [ -n "$NGINX_SETUP" ]; then
  bash "$NGINX_SETUP" || echo "warning: nginx setup failed (app binary may be missing) — re-run $NGINX_SETUP later" >&2
else
  echo "warning: setup-nginx.sh not found next to bootstrap script — run it manually" >&2
fi

echo "==> Firewall (public :80 and :443 for the app)"
if command -v ufw >/dev/null 2>&1; then
  ufw allow 80/tcp || true
  ufw allow 443/tcp || true
  ufw allow OpenSSH || true
  echo "ufw rules updated (not enabling ufw automatically — run 'ufw enable' if desired)"
else
  echo "ufw not installed — ensure cloud firewall allows tcp/22, tcp/80 and tcp/443"
fi

echo "Bootstrap OK. Next: cut a GitHub Release (CD builds + installs), then curl http://43.173.12.145/health"
