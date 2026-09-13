#!/usr/bin/env bash
# setup-nginx.sh — install nginx server block for kalkulator.rayakala.ink
# (80 -> 127.0.0.1:8000), coexisting with the monthly-logs vhost.
# Idempotent. Run as root on an already-bootstrapped server:
#   bash setup-nginx.sh   (expects nginx-beruang.conf next to this script,
#                          or ../deploy/nginx-beruang.conf, or /tmp/nginx-beruang.conf)
set -euo pipefail

echo "==> Installing nginx"
apt-get update -y
apt-get install -y nginx curl

echo "==> Installing site config"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONF_SRC=""
for cand in "$SCRIPT_DIR/nginx-beruang.conf" "$SCRIPT_DIR/../deploy/nginx-beruang.conf" /tmp/nginx-beruang.conf; do
  if [ -f "$cand" ]; then CONF_SRC="$cand"; break; fi
done
if [ -z "$CONF_SRC" ]; then
  echo "error: nginx-beruang.conf not found" >&2
  exit 1
fi
cp "$CONF_SRC" /etc/nginx/sites-available/beruang
ln -sf /etc/nginx/sites-available/beruang /etc/nginx/sites-enabled/beruang

echo "==> Testing + reloading"
nginx -t
systemctl enable nginx >/dev/null 2>&1 || true
systemctl restart nginx

DOMAIN="${DOMAIN:-kalkulator.rayakala.ink}"
echo "==> Healthcheck via nginx (Host: $DOMAIN)"
for i in $(seq 1 10); do
  if curl -fsS --max-time 5 -H "Host: $DOMAIN" http://127.0.0.1/health >/dev/null 2>&1; then
    echo "nginx proxy healthy."
    break
  fi
  if [ "$i" -eq 10 ]; then
    echo "Healthcheck FAILED — see: journalctl -u nginx; nginx -T" >&2
    exit 1
  fi
  sleep 2
done

echo "==> Domain check for $DOMAIN (warning-only before DNS/TLS is live)"
if getent hosts "$DOMAIN" >/dev/null 2>&1; then
  curl -fsS --max-time 5 -H "Host: $DOMAIN" http://127.0.0.1/health >/dev/null 2>&1 \
    && echo "Host $DOMAIN serves via nginx." \
    || echo "warning: Host $DOMAIN not served yet (check server_name / DNS)" >&2
else
  echo "warning: $DOMAIN does not resolve — add an A record to 43.173.12.145" >&2
fi
if [ -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
  curl -fsS --max-time 5 "https://$DOMAIN/health" >/dev/null 2>&1 \
    && echo "TLS healthy: https://$DOMAIN/health" \
    || echo "warning: cert exists but https://$DOMAIN/health failed" >&2
fi

echo "Nginx OK. Public HTTP: http://43.173.12.145/ ; HTTPS (after setup-tls.sh): https://$DOMAIN/"
echo "Note: app :8000 stays on localhost behind nginx; do not expose it publicly."
