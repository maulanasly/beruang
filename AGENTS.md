# Agent Workflow

Beruang: investment tracker for mutual funds, stocks, and term deposits funded via
monthly installments. Cash-flow adjusted MoM returns, XIRR/ROI, APY projections.

Stack: **Python FastAPI calc + Axum gateway + zero-build Preact/HTM `static/`**
modeled on `monthly-logs`, with `logic.py` kept as the financial-math source of
truth. Vue 3 + Vite `frontend/` kept as legacy (`--profile legacy`).

## Environment

- **Python**: 3.12+ via `.venv` (`.venv/bin/python`)
- **Node**: 22 for `frontend/` only (`npm --prefix frontend`, legacy)
- **Rust**: 1.75+ (`rustc --version`) for `rust-gateway/`
- **Docker**: Compose for `gateway` (:8000) + `calc` (:8001) + `frontend` nginx (:8080, legacy profile)
- **GitHub**: `gh` CLI authenticated as `maulanasly`

## Repository

- **URL**: github.com/maulanasly/beruang
- **Main branch**: `master`
- **Dev workflow**: feature branches → PR → merge → graph update

## Skill Routing (read before acting)

| Request scope | Skill to adopt |
|---|---|
| Multi-domain or ambiguous | `app-orchestrator` (`.agents/skills/orchestrator/SKILL.md`) |
| `backend/`, `logic.py`, `tests/`, pytest | `fastapi-backend-expert` (`.agents/skills/fastapi-backend-expert/SKILL.md`) |
| `frontend/src/`, Vite, vitest (legacy) | `vue-frontend-expert` (`.agents/skills/vue-frontend-expert/SKILL.md`) |
| `rust-gateway/`, Axum, proxy | `app-orchestrator` (gateway is thin proxy; no Rust math duplication) |
| `static/`, Preact/HTM, hash router | `app-orchestrator` (frontend now zero-build; Vue skill for legacy only) |

Authoritative specs: `SKILL.md` (financial formulas + execution steps),
`.github/copilot-instructions.md` (router). This file consolidates workflow only
and does not override formula semantics in `SKILL.md` / `logic.py`.

## Feature/Bug Fix Workflow (MANDATORY)

Every change follows this exact flow:

1. **Read memory context**:
   ```bash
   make graphify-query QUERY="How does [related feature] work?"
   make graphify-query QUERY="What modules are in [area]?"
   ```

2. **Create branch / worktree** (always off `master`):
   - Single active branch:
   ```bash
   git fetch origin && git switch master
   git switch -c feature/<name>  # or fix/<name>, chore/<name>
   ```
   - Multiple active branches → use one worktree per branch (MANDATORY to avoid conflicting checkouts):
   ```bash
   git fetch origin
   git worktree add ../beruang-<branch-slug> <branch>  # e.g. chore/rust-gateway
   cd ../beruang-<branch-slug>
   ```

3. **Implement + test**:
   - Write code
   - Write tests (pytest for backend/`logic.py`, vitest for `frontend/src/`, `cargo test` for `rust-gateway/`)
   - Run `make test` (backend) + `make test-frontend` when Vue changes + `make test-rust` when gateway changes
   - Run `make lint` (Python) + `make lint-rust` when Rust changes

4. **Commit** (conventional commits):
   ```bash
   git commit -m "feat: description"
   ```

5. **Push + PR**:
   ```bash
   git push -u origin feature/<name>
   gh pr create --base master --title "feat: ..." --body "..."
   ```

6. **Update memory context**:
   ```bash
   make graphify-update
   ```

## Git Worktrees (multiple active branches)

- **Rule**: if 2+ branches are active at the same time, use one worktree per branch. Never `git switch` / `git stash` a dirty tree to jump between active branches.
- **Create**: `git fetch origin && git worktree add ../beruang-<branch-slug> <branch>` (slug: `/` → `-`, e.g. `feature/axum-proxy` → `../beruang-feature-axum-proxy`).
- **List**: `git worktree list` before creating — reuse existing worktree if branch is already checked out.
- **Cleanup**: after PR merge, `git worktree remove ../beruang-<branch-slug>` (use `--force` only if uncommitted work is intentionally discarded).
- **Scope**: each worktree has its own `.venv/`, `frontend/node_modules/`, `target/` — run `make test` inside the worktree you changed.

## Verification (run before any commit)

| Step | Command | Notes |
|---|---|---|
| Python lint | `make lint` | Ruff via pre-commit (`ruff-check` + `ruff-format`) |
| Python typecheck | `make typecheck` | `py_compile` on `logic.py`, `backend/`, `tests/` |
| Backend tests | `make test` | `pytest tests/test_backend_endpoints.py` (plus `backend/tests/`) |
| Frontend tests | `make test-frontend` | Vitest (`frontend/src/**/*.spec.js`, legacy) |
| Rust lint | `make lint-rust` | `cargo clippy -- -D warnings` (`rust-gateway/`) |
| Rust format | `make fmt-check-rust` | `cargo fmt -- --check` (`rust-gateway/`) |
| Rust tests | `make test-rust` | `cargo test` gateway proxy + static |
| **Verify (Python gate)** | `make verify` | `lint + typecheck + test` |
| **Verify (Rust gate)** | `make verify-rust` | `lint-rust + fmt-check-rust + test-rust` |
| **Verify all** | `make verify-all` | `lint-all + typecheck + test-all` |

## Knowledge graph

- **Graph-first workflow**: always query graph before starting work
- **Update at task end**: run `make graphify-update` after completing feature
- **Query examples**:
  - `make graphify-query QUERY="How does the stock returns API work?"`
  - `make graphify-query QUERY="What modules handle term deposits?"`

## Testing Strategy

- **Unit tests**: pure `logic.py` functions (MoM, XIRR, APY, maturity fields)
- **Integration tests**: FastAPI endpoints with `httpx.ASGITransport` (`tests/`) and mocked `yfinance` (`backend/tests/test_market_data.py`)
- **Gateway tests**: proxy verbatim (status+body) + static serving + CORS (Rust `cargo test`)
- **Frontend tests**: composables/components via vitest + happy-dom (Vue legacy)
- **Coverage target**: 80% for new code
- **Test commands**: `make test`, `make test-frontend`, `make test-rust`, `make test-all`

## Branch Naming

| Type | Pattern | Example |
|------|---------|---------|
| Feature | `feature/<name>` | `feature/dividend-focus` |
| Bug fix | `fix/<name>` | `fix/xirr-bracket` |
| Chore | `chore/<name>` | `chore/rust-gateway` |
| Docs | `docs/<name>` | `docs/api-reference` |
| Test | `test/<name>` | `test/market-data` |

## Commit Convention

`feat:`, `fix:`, `test:`, `chore:`, `docs:`, `refactor:`, `perf:`

## Backend conventions

- **Source of truth**: `logic.py` for all financial math — never duplicate XIRR/MoM/APY in route handlers or Rust.
- **Routes**: RESTful under `/api/v1/` in `backend/main.py` (`/health` unauthenticated).
- **Schemas**: Pydantic in `backend/schemas.py`; validation failures → 422, `yfinance` failures → 502 with passthrough detail.
- **Services**: `backend/services.py` adapts DataFrames ↔ response models; `yfinance` access stays here.
- **Errors**: raise `ValueError` for bad math input (mapped to 422), `RuntimeError` for upstream market-data failure (mapped to 502).

## Frontend conventions

- **Current (`static/`, modeled on `monthly-logs`)**: zero-build Preact + HTM — no npm/node; components in `static/js/components/`; fetch wrapper in `static/js/api.js`; hash router in `static/js/router.js` (`#/overview`, `#/mutual-funds`, `#/stocks`, `#/term-deposits`); same `localStorage` keys as Vue for migration.
- **Legacy (Vue)**: Composition API in `frontend/src/composables/`, views in `frontend/src/views/`, shared UI in `frontend/src/components/`; hash-free history router; `fetch` wrapper in `useApiClient.js`; locale/currency/market via `useSettings` + `vue-i18n` (kept for migration via `--profile legacy`).

## Rust boundary (`rust-gateway/` → self-contained binary)

- **Topology (target)**: Axum on `:8000` (public) serves `static/` via `rust-embed` + native `/api/v1/*/returns` handlers ported from `logic.py`; `/api/v1/market-data/*` stays proxied to Python calc (`CALC_BASE_URL`, default `http://127.0.0.1:8001`, compose `http://calc:8001`) until the Rust market module passes shadow-diff. Keeps 422/502 shapes identical.
- **Authorized**: porting `mutual_fund_metrics` / `stock_metrics` / `term_deposit_metrics` / `calculate_xirr` into `rust-gateway/src/calc/` — the parity harness (`rust-gateway/tests/calc_parity.rs` replaying `rust-gateway/tests/fixtures/*.json`) is the correctness arbiter (epsilon 1e-9 numerics; exact nulls/statuses/strings). `logic.py` is FROZEN (oracle only — no new features; edits require regenerating fixtures via `backend/oracle_dump.py`).
- **Forbidden**: embedding Python via PyO3; promoting market-data routes to native before the shadow-diff stability bar is met (≥7 days, zero material diffs post-burn-in, min volumes).
- **Config**: `CALC_BASE_URL` env; `CALC_RETURNS_MODE=proxy|native`, `SHADOW_MODE=off|compare`, `SHADOW_SAMPLE_RATE`; CORS in Axum `tower-http` layer; 10s timeout for `*/returns`, 25s for `/market-data/*`.
- **Layout**: `rust-gateway/src/{main.rs,lib.rs,routes/,calc/,market/,shadow.rs,errors.rs}` with `thiserror`, `tracing`, `tower-http cors/compression`, `reqwest json/rustls-tls`, `chrono`, `serde`; release profile `opt-level="s", lto, strip` like reference.

## Project layout

```
logic.py            Financial engine (pandas + numpy-financial)
backend/            FastAPI routes, schemas, services (calc service, :8001)
tests/              Endpoint tests (httpx); backend/tests/ market-data + stock math
frontend/           Vue 3 + Vite app (legacy UI; --profile legacy)
rust-gateway/       Axum edge proxy + embedded static/ (public :8000)
static/             Zero-build Preact frontend, no bundler (hash router)
docker-compose.yml  gateway + calc (legacy frontend behind profile)
Makefile            dev/test/lint/graphify orchestration
```
