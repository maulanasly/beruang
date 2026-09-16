#!/usr/bin/env bash
# setup-tls.sh — issue/renew a production Let's Encrypt cert for
# kalkulator.rayakala.ink + hitung.rayakala.id. HTTP-01 via the nginx plugin.
# Idempotent. Run as root:
#   DOMAIN=kalkulator.rayakala.ink EXTRA_DOMAINS="hitung.rayakala.id www.rayakala.ink" EMAIL=you@example.com bash scripts/setup-tls.sh
# Append more names to EXTRA_DOMAINS once their A records resolve
# (e.g. kalkulator.rayakala.id). www.rayakala.ink stays: the landing vhost
# still points at this cert file until that repo fixes its own cert path.
#
# Prerequisites: DNS `A` for every requested name -> 43.173.12.145 resolves
# here, tcp/80 reachable from the internet, and deploy/nginx-beruang.conf
# installed with all names in `server_name` (run scripts/setup-nginx.sh first).
set -euo pipefail

DOMAIN="${DOMAIN:-kalkulator.rayakala.ink}"
EMAIL="${EMAIL:-gi.creatorz@gmail.com}"
EXTRA_DOMAINS="${EXTRA_DOMAINS:-hitung.rayakala.id www.rayakala.ink}"

echo "==> Installing certbot"
apt-get update -y
apt-get install -y certbot python3-certbot-nginx curl

DOMAINS=("$DOMAIN")
if [ -n "$EXTRA_DOMAINS" ]; then
  # shellcheck disable=SC2206
  DOMAINS+=($EXTRA_DOMAINS)
fi

echo "==> Checking DNS for: ${DOMAINS[*]}"
for d in "${DOMAINS[@]}"; do
  if ! getent hosts "$d" >/dev/null; then
    echo "error: $d does not resolve locally — add an A record to 43.173.12.145 first" >&2
    exit 1
  fi
done

echo "==> Checking HTTP challenge path (nginx must serve each name on port 80)"
for d in "${DOMAINS[@]}"; do
  if ! curl -fsS --max-time 10 -H "Host: $d" "http://127.0.0.1/health" >/dev/null; then
    echo "error: local Host:$d http://127.0.0.1/health failed — fix nginx/app before requesting a cert" >&2
    echo "see: systemctl status nginx beruang --no-pager; nginx -T" >&2
    exit 1
  fi
done

ARGS=()
for d in "${DOMAINS[@]}"; do ARGS+=(-d "$d"); done

echo "==> Requesting production cert for: ${DOMAINS[*]}"
certbot --nginx --cert-name "$DOMAIN" --expand "${ARGS[@]}" \
  --agree-tos -m "$EMAIL" --no-eff-email \
  --redirect --non-interactive

echo "==> Verifying"
nginx -t
systemctl reload nginx
certbot certificates
for d in "${DOMAINS[@]}"; do
  curl -fsS --max-time 10 "https://$d/health" >/dev/null \
    && echo "TLS OK: https://$d/health" \
    || { echo "TLS healthcheck FAILED for $d — see: journalctl -u nginx" >&2; exit 1; }
done

echo "==> Renewal dry-run (staging, safe)"
certbot renew --dry-run

echo "TLS done. Renewals run via the certbot systemd timer:"
echo "  systemctl list-timers | grep -i certbot"
echo "Next: keep tcp/8000 off the public firewall; app stays on 127.0.0.1:8000 behind nginx."
