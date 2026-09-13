# beruang production deploy runbook — kalkulator.rayakala.ink on 43.173.12.145.
#
# Flow: cut a GitHub Release (stable) -> `Build + Deploy` workflow builds the
# release binary -> scp to the VPS -> install-release.sh installs, restarts,
# healthchecks. Same shape as monthly-logs, minus the database.
#
# Beruang keeps NO server-side state (ledgers live in each visitor's
# browser) and needs NO secrets, so there is no DB backup and no env file.

## 0. One-time GitHub secrets (repo Settings -> Secrets -> Actions)

| Secret         | Value              |
| -------------- | ------------------ |
| `DEPLOY_HOST`  | `43.173.12.145`    |
| `DEPLOY_USER`  | `deploy`           |
| `DEPLOY_PORT`  | `22`               |
| `DEPLOY_KEY`   | deploy SSH private key (ed25519) |
| `KNOWN_HOSTS`  | `ssh-keyscan` output for the host |

## 1. One-time DNS

Create an **A** record `kalkulator.rayakala.ink` → `43.173.12.145`.
Verify from the VPS before requesting TLS: `getent hosts kalkulator.rayakala.ink`.

## 2. One-time server bootstrap (as root on the VPS)

The `deploy` SSH user and nginx already exist (monthly-logs). Copy
`scripts/bootstrap-server.sh`, `deploy/beruang.service`,
`deploy/nginx-beruang.conf`, `scripts/setup-nginx.sh` to the server, then:

```bash
bash bootstrap-server.sh        # beruang user, dirs, sudoers, unit, nginx vhost
bash scripts/setup-nginx.sh     # install vhost, reload, local healthcheck
DOMAIN=kalkulator.rayakala.ink EMAIL=you@example.com bash scripts/setup-tls.sh
```

`setup-tls.sh` uses Let's Encrypt HTTP-01 via the nginx plugin, adds the
`:443` block + http→https redirect, verifies `https://…/health`, and runs a
renewal dry-run (renewals continue via the certbot systemd timer).

## 3. Day-to-day: ship a release

1. Feature branch -> PR to `main` (CI runs fmt + clippy + test + build).
2. Merge, then cut a GitHub Release (stable, non-prerelease).
   `Build + Deploy` builds `--release`, copies the binary + installer +
   unit to `/tmp`, and runs `install-release.sh` (keeps `.prev`,
   refreshes the unit, restarts, polls `/health` 20×).
3. Verify: `curl -f https://kalkulator.rayakala.ink/health` and check a
   versioned asset URL (`/js/app.js?v=…`) changed.
4. Manual redeploy without a release: Actions -> `Build + Deploy` ->
   `Run workflow` (`workflow_dispatch`).

Prereleases never deploy (workflow guard); drafts never fire `published`.

## 4. Rollback

```bash
sudo bash /opt/beruang/scripts/rollback.sh   # .prev binary + restart + healthcheck
```

## 5. File inventory

| Path (VPS) | Source |
|---|---|
| `/usr/local/bin/beruang-gateway` (+`.prev`) | CI artifact |
| `/etc/systemd/system/beruang.service` | `deploy/beruang.service` |
| `/etc/nginx/sites-{available,enabled}/beruang` | `deploy/nginx-beruang.conf` |
| `/etc/letsencrypt/live/kalkulator.rayakala.ink/` | certbot |
| `/var/lib/beruang/` | working dir (no app writes) |
| `/opt/beruang/scripts/` | operator copy of `scripts/` |

## 6. Operate

- Logs: `journalctl -u beruang -f`
- Status: `systemctl status beruang nginx --no-pager`
- TLS renewals: `systemctl list-timers | grep -i certbot`
- Keep tcp/8000 off the public firewall; app stays on localhost behind nginx.
