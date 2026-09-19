# beruang

Investment tracker for mutual funds, stocks, and term deposits. One
self-contained Rust binary serves the API and the embedded frontend.

```bash
make run     # API + UI on :8000 (GATEWAY_PORT= to override)
make dev     # hot reload: static/ from disk + browser auto-reload (BERUANG_DEV=1)
make up      # same via Docker
make test    # 111 Rust tests
make verify  # clippy + fmt + tests (the gate)
```

## Endpoints

| Method | Path | Notes |
|---|---|---|
| POST | `/api/v1/mutual-funds/returns` | MoM + XIRR |
| POST | `/api/v1/stocks/returns` | MoM + ROI + XIRR + dividend estimates |
| POST | `/api/v1/term-deposits/returns` | APY schedule + maturity tracker |
| GET | `/api/v1/market-data/idx/kompas100` | IDX starter list |
| GET | `/api/v1/market-data/idx/dividend-yields?limit=` | top yields (1–30) |
| GET | `/api/v1/market-data/idx/search?q=&limit=` | IDX search |
| GET | `/api/v1/market-data/quote?symbol=` | live quote + yield |
| GET | `/api/v1/market-data/index/history?symbol=&period=` | `^JKSE`, `^JKLQ45` |
| GET | `/api/v1/market-data/price/history?symbol=&period=` | per-symbol closes |
| GET | `/health` | `{"status":"ok"}` |
| GET | `/metrics` | Prometheus exposition: `http_requests_total`, `http_request_duration_ms`, `beruang_calc_total{calc,status}`, `beruang_market_total{endpoint,status}`, `beruang_market_duration_ms`, `visitors_total{region}`, `unique_visitors_estimate{region}` (uniques refresh every 15 s; infra paths `/metrics`, `/health`, `/__dev_version` are excluded; `region="unknown"` until nginx passes a CDN country header) |

Errors are `{"detail": ...}`: 422 bad input · 502 Yahoo failure · 504 timeout.

## Layout

`src/calc/` financial engine · `src/market/` Yahoo client · `src/routes/` handlers ·
`static/` zero-build Preact UI · `tests/fixtures/` oracle vectors ·
`logic.py` frozen math reference.

Stack: Axum · Yahoo Finance REST · Preact + HTM (no bundler). Graphify
context: `make graphify-query QUERY="..."` / `make graphify-update`.
