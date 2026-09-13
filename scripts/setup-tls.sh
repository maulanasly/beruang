#!/usr/bin/env bash
# setup-tls.sh — issue/renew a production Let's Encrypt cert for
# kalkulator.rayakala.ink. HTTP-01 via the nginx plugin. Idempotent. Run as root:
#   DOMAIN=kalkulator.rayakala.ink EMAIL=you@example.com bash scripts/setup-tls.sh
#
# Prerequisites: DNS `A kalkulator -> 43.173.12.145` resolves here, tcp/80
# reachable from the internet, and deploy/nginx-beruang.conf installed with
# `server_name kalkulator.rayakala.ink` (run scripts/setup-nginx.sh first).
set -euo pipefail

DOMAIN="${DOMAIN:-kalkulator.rayakala.ink}"
EMAIL="${EMAIL:-gi.creatorz@gmail.com}"
EXTRA_DOMAINS="${EXTRA_DOMAINS:-}"

echo "==> Installing certbot"
apt-get update -y
apt-get install -y certbot python3-certbot-nginx curl

echo "==> Checking DNS for $DOMAIN"
if ! getent hosts "$DOMAIN" >/dev/null; then
  echo "error: $DOMAIN does not resolve locally — add an A record to 43.173.12.145 first" >&2
  exit 1
fi

echo "==> Checking HTTP challenge path (nginx must serve port 80)"
if ! curl -fsS --max-time 10 "http://127.0.0.1/health" >/dev/null; then
  echo "error: local http://127.0.0.1/health failed — fix nginx/app before requesting a cert" >&2
  echo "see: systemctl status nginx beruang --no-pager; nginx -T" >&2
  exit 1
fi

DOMAINS=("$DOMAIN")
if [ -n "$EXTRA_DOMAINS" ]; then
  # shellcheck disable=SC2206
  DOMAINS+=($EXTRA_DOMAINS)
fi
ARGS=()
for d in "${DOMAINS[@]}"; do ARGS+=(-d "$d"); done

echo "==> Requesting production cert for: ${DOMAINS[*]}"
certbot --nginx "${ARGS[@]}" \
  --agree-tos -m "$EMAIL" --no-eff-email \
  --redirect --non-interactive

echo "==> Verifying"
nginx -t
systemctl reload nginx
certbot certificates
curl -fsS --max-time 10 "https://$DOMAIN/health" >/dev/null \
  && echo "TLS OK: https://$DOMAIN/health" \
  || { echo "TLS healthcheck FAILED — see: journalctl -u nginx" >&2; exit 1; }

echo "==> Renewal dry-run (staging, safe)"
certbot renew --dry-run

echo "TLS done. Renewals run via the certbot systemd timer:"
echo "  systemctl list-timers | grep -i certbot"
echo "Next: keep tcp/8000 off the public firewall; app stays on 127.0.0.1:8000 behind nginx."
