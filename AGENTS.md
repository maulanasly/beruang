# Agent Workflow

Beruang: investment tracker (mutual funds, stocks, term deposits). Single
self-contained Axum binary serves the API + embedded zero-build Preact UI.
`logic.py` is the frozen math oracle (read-only, never executed).

## Environment

Rust 1.89+ (entire stack) · Docker Compose (`beruang` :8000) · `gh` CLI.
No Python/Node toolchains.

## Workflow

1. `make graphify-query QUERY="..."` — read memory first
2. Feature branch off `main` → implement + test
3. `make verify` — must be green before commit
4. Push → PR to `main` → `make graphify-update`

## Verification

| Command | What |
|---|---|
| `make lint` | clippy `--all-targets -D warnings` |
| `make fmt-check` | `cargo fmt --check` |
| `make test` | 111 tests: calc unit + parity (16 fixtures @ 1e-9) + gateway |
| `make verify` | all of the above (the gate) |

## Structure

```
src/calc/    MoM/XIRR/APY/maturity port (xirr, mutual, stock, deposits)
src/market/  Yahoo REST (yahoo, service, types, 6h yields cache)
src/routes/  returns, market-data, static_handler (ETag, ?v= assets, CSP), health
tests/       calc_parity.rs + gateway_test.rs + fixtures/ (16 oracle vectors)
static/js/   zero-build Preact (components/, locales/, router, store)
logic.py     frozen oracle — never add math here
```

## Conventions

- Errors: 422 `{"detail"}` bad input · 502 Yahoo failure · 504 market timeout (25s) · unknown `/api/*` → JSON 404, never SPA fallback
- Market: adjusted close wins (yfinance parity); yields fan-out cached 6h
- Static: shell `no-cache`, versioned assets immutable 1y; scripts `'self'`-only
- Forbidden: Python runtime, npm/CDN in `static/`
