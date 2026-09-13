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

If the port is already occupied, you can override it:

```bash
make run GATEWAY_PORT=8001
```

## Local URLs

- App (API + UI): http://localhost:8000

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
| `static/` | Zero-build Preact frontend, no bundler (hash router) |
| `docker-compose.yml` | Binary container orchestration |
| `rust-gateway/Dockerfile` | Binary container image |
| `logic.py` | Frozen financial oracle (reference only) |
| `Makefile` | Common development commands |

## Tech Stack

- **Rust (Axum)** — self-contained API + embedded UI binary
- **Yahoo Finance REST** — market data
- **Preact + HTM** — zero-build frontend (`static/`, no bundler)

## Graphify

This project uses Graphify for context memory:

- `make graphify-init` — initialize the knowledge graph
- `make graphify-query QUERY="<target>"` — query dependencies
- `make graphify-update` — re-run after structural changes
