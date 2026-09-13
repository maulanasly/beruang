# beruang

Investment App MVP — track mutual funds, stocks, and term deposits with monthly installments.
Single self-contained Rust binary serves the API and the embedded zero-build frontend.

## Quick Start

```bash
make          # show available commands
make run      # start the self-contained binary (API + UI on :8000)
make up       # build and run in Docker
make down     # stop Docker services
make test     # run Rust gateway tests
make verify   # clippy + fmt check + tests
make clean    # remove build artifacts
```

Legacy Vue frontend (optional):

```bash
make install-frontend  # install Vue frontend dependencies
make dev-frontend      # start Vue dev server (port 5173, proxied to :8000)
make up-legacy         # build and run binary + Vue frontend in Docker
make test-frontend     # run Vue frontend tests (vitest)
```

If ports are already occupied, you can override them:

```bash
make run GATEWAY_PORT=8001
```

## Local URLs

- App (API + UI): http://localhost:8000
- Frontend dev (Vite, legacy): http://localhost:5173
- Frontend via Docker (Nginx, legacy): http://localhost:8080

## Frontend-Backend Pairing

- In `make dev-frontend`, Vite proxies `/api/*` to `http://localhost:${GATEWAY_PORT}` (default `8000`).
- Default frontend requests use relative paths such as `/api/v1/...`.
- Stock mode includes a live quote helper sourced from Yahoo Finance, using an IDX Kompas 100 starter ticker list.

Examples:

```bash
# Binary on default 8000
make run
make dev-frontend

# Binary on custom 8001, frontend proxy follows automatically
make run GATEWAY_PORT=8001
make dev-frontend GATEWAY_PORT=8001 FRONTEND_PORT=5174
```

## Features

- **Cash-flow adjusted MoM returns** — mutual funds and stocks
- **APY-based term deposit projections** — with prorated interest and future value
- **XIRR / ROI** — annualized returns using exact-date cash flows
- **Live stock quote helper** — fetch latest market value for IDX symbols from Yahoo Finance and apply to stock ledger rows
- **Locale-aware formatting** — one locale/currency selector drives every page (table, chart axes, KPI cards) and persists across reloads

## Market Data Endpoints

- `GET /api/v1/market-data/idx/kompas100` — returns starter IDX symbols list (Kompas 100 seed set)
- `GET /api/v1/market-data/quote?symbol=BBCA.JK` — returns latest quote from Yahoo Finance

## Project Structure

| File | Purpose |
|------|---------|
| `rust-gateway/src/routes/` | Axum API handlers (`*/returns`, `market-data/*`) |
| `rust-gateway/src/calc/` | Financial engine port (MoM, XIRR, APY, maturity) |
| `rust-gateway/src/market/` | Yahoo Finance client + response shapes |
| `rust-gateway/tests/fixtures/` | Committed oracle vectors (parity harness input) |
| `frontend/` | Vue 3 + Vite frontend (legacy) |
| `frontend/src/composables/` | Reactive state, formatters, API client |
| `frontend/src/components/` | Calculator, ledger table, charts, KPI cards |
| `static/` | Zero-build Preact frontend, no bundler (hash router) |
| `docker-compose.yml` | Binary (+ legacy frontend) container orchestration |
| `rust-gateway/Dockerfile` | Binary container image |
| `frontend/Dockerfile` | Frontend container image |
| `logic.py` | Frozen financial oracle (reference only) |
| `Makefile` | Common development commands |

## Tech Stack

- **Rust (Axum)** — self-contained API + embedded UI binary
- **Yahoo Finance REST** — market data (no `yfinance`)
- **Preact + HTM** — zero-build frontend (`static/`, no bundler)
- **Vue 3 + Vite** — frontend (legacy)

## Graphify

This project uses Graphify for context memory:

- `make graphify-init` — initialize the knowledge graph
- `make graphify-query QUERY="<target>"` — query dependencies
- `make graphify-update` — re-run after structural changes
