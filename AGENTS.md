# Agent Workflow

Beruang: investment tracker for mutual funds, stocks, and term deposits funded via
monthly installments. Cash-flow adjusted MoM returns, XIRR/ROI, APY projections.

Stack: **self-contained Axum binary + zero-build Preact/HTM `static/`**
modeled on `monthly-logs`. `logic.py` is the frozen financial-math oracle
(sole Python file; never executed at runtime). Vue 3 + Vite `frontend/`
kept as legacy (`--profile legacy`).

## Environment

- **Rust**: 1.89+ (`rustc --version`) for `rust-gateway/` (the entire stack)
- **Python**: none required (only `logic.py` remains, as a frozen reference)
- **Node**: 22 for `frontend/` only (`npm --prefix frontend`, legacy)
- **Docker**: Compose for `beruang` (:8000) + `frontend` nginx (:8080, legacy profile)
- **GitHub**: `gh` CLI authenticated as `maulanasly`

## Repository

- **URL**: github.com/maulanasly/beruang
- **Main branch**: `main`
- **Dev workflow**: feature branches → PR → merge → graph update

## Skill Routing (read before acting)

| Request scope | Skill to adopt |
|---|---|
| Multi-domain or ambiguous | `app-orchestrator` (`.agents/skills/orchestrator/SKILL.md`) |
| `logic.py` (frozen oracle, read-only) | `fastapi-backend-expert` (`.agents/skills/fastapi-backend-expert/SKILL.md`) |
| `frontend/src/`, Vite, vitest (legacy) | `vue-frontend-expert` (`.agents/skills/vue-frontend-expert/SKILL.md`) |
| `rust-gateway/`, Axum, calc, market | `app-orchestrator` (self-contained binary; all logic in Rust) |
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

2. **Create branch / worktree** (always off `main`):
   - Single active branch:
   ```bash
   git fetch origin && git switch main
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
   - Write tests (`cargo test` for `rust-gateway/` unit + parity + gateway; vitest for `frontend/src/`)
   - Run `make test` + `make test-frontend` when Vue changes
   - Run `make lint` (clippy `--all-targets -D warnings`)

4. **Commit** (conventional commits):
   ```bash
   git commit -m "feat: description"
   ```

5. **Push + PR**:
   ```bash
   git push -u origin feature/<name>
   gh pr create --base main --title "feat: ..." --body "..."
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
- **Scope**: each worktree has its own `frontend/node_modules/`, `target/` — run `make test` inside the worktree you changed.

## Verification (run before any commit)

| Step | Command | Notes |
|---|---|---|
| Rust lint | `make lint` | `cargo clippy --all-targets -- -D warnings` (`rust-gateway/`) |
| Rust format | `make fmt-check` | `cargo fmt -- --check` (`rust-gateway/`) |
| Rust tests | `make test` | `cargo test` calc + market + parity + gateway + static |
| Frontend tests | `make test-frontend` | Vitest (`frontend/src/**/*.spec.js`, legacy) |
| **Verify (gate)** | `make verify` | `lint + fmt-check + test` |

## Knowledge graph

- **Graph-first workflow**: always query graph before starting work
- **Update at task end**: run `make graphify-update` after completing feature
- **Query examples**:
  - `make graphify-query QUERY="How does the stock returns API work?"`
  - `make graphify-query QUERY="What modules handle term deposits?"`

## Testing Strategy

- **Unit tests**: pure `src/calc` (MoM, XIRR, APY, maturity fields) and `src/market` pure helpers (yield normalization, search filter, chart parsing) against oracle values
- **Parity tests**: `rust-gateway/tests/calc_parity.rs` replays committed `tests/fixtures/*.json` (from frozen `logic.py`) at 1e-9 relative epsilon
- **Gateway tests**: native routes + static serving + CORS + security headers + compression (Rust `cargo test`; market validation paths offline, live Yahoo validated manually)
- **Frontend tests**: composables/components via vitest + happy-dom (Vue legacy)
- **Coverage target**: 80% for new code
- **Test commands**: `make test`, `make test-frontend`

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

## Calc conventions (`rust-gateway/src/calc/`, ported from frozen `logic.py`)

- **Source of truth**: `logic.py` is the frozen oracle — never add math there; the parity harness (`tests/calc_parity.rs` + `tests/fixtures/`) is the correctness arbiter for the Rust port.
- **Routes**: RESTful under `/api/v1/` in `rust-gateway/src/routes/` (`/health` unauthenticated; unknown `/api/*` → JSON 404, never the SPA fallback).
- **Validation**: bad math input → 422 `{"detail"}`, Yahoo failure → 502, market timeout (25s) → 504 with passthrough detail.
- **Market data**: `src/market/` talks Yahoo Finance directly (`v8/chart` + `v1/search` anonymous; `quoteSummary` via cookie+crumb); adjusted close preferred (yfinance `auto_adjust=True` parity); yields fan-out cached 6h.

## Frontend conventions

- **Current (`static/`, modeled on `monthly-logs`)**: zero-build Preact + HTM — no npm/node; components in `static/js/components/`; fetch wrapper in `static/js/api.js`; hash router in `static/js/router.js` (`#/overview`, `#/mutual-funds`, `#/stocks`, `#/term-deposits`); same `localStorage` keys as Vue for migration.
- **Legacy (Vue)**: Composition API in `frontend/src/composables/`, views in `frontend/src/views/`, shared UI in `frontend/src/components/`; hash-free history router; `fetch` wrapper in `useApiClient.js`; locale/currency/market via `useSettings` + `vue-i18n` (kept for migration via `--profile legacy`).

## Rust layout (`rust-gateway/`, self-contained binary)

- **Topology**: Axum on `:8000` serves `static/` via `rust-embed` + native `/api/v1/*/returns` (`src/calc/`, ported from frozen `logic.py`) + native `/api/v1/market-data/*` (`src/market/`, Yahoo Finance direct). Single service; no sidecar. Keeps 422/502/504 JSON shapes.
- **Forbidden**: re-adding a Python runtime (no PyO3, no sidecar); adding npm/CDN dependencies to `static/` (zero-build purity).
- **Config**: `PORT`/`GATEWAY_PORT` (default `8000`); CORS allowlist in Axum `tower-http` layer (dev origins; same-origin in prod); 25s timeout for `/market-data/*`.
- **Layout**: `rust-gateway/src/{main.rs,lib.rs,routes/,calc/,market/}` with `thiserror`, `tracing`, `tower-http cors/compression`, `reqwest json/rustls-tls`, `chrono`, `serde`, `sha2`; release profile `opt-level="s", lto, strip` like reference.

## Project layout

```
logic.py            Frozen financial oracle (pandas; reference only, never executed)
rust-gateway/       Self-contained Axum binary: API + embedded static/ (:8000)
rust-gateway/tests/fixtures/  Committed oracle vectors (parity harness input)
frontend/           Vue 3 + Vite app (legacy UI; --profile legacy)
static/             Zero-build Preact frontend, no bundler (hash router)
docker-compose.yml  beruang (legacy frontend behind profile)
Makefile            dev/test/lint/graphify orchestration
```
