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

## UX guide rail (anti-slop)

Filter, not style: https://github.com/miqdadbadjuber/anti-slop
(direction stays with Beruang's ledger/paper identity, `static/css/styles.css`
tokens); the filter only rejects generic AI slop. Apply on any UI/copy work
in `static/`; end with the repo's PASS/FAIL Delivery Gate before shipping.

- Hard gate (FAIL if broken): no em dash `—` in UI copy (use `,`/`:`/`()`);
  no invented stats, testimonials, or trust claims (empty beats deceptive);
  every nav item points somewhere real; every button/link works or is removed;
  empty + loading + error states on all data UI; WCAG AA contrast, keyboard
  operable, visible focus, `Escape` closes dialogs; both themes must work.
- Purpose gate (technique needs a written reason or it goes): gradients,
  glass, glow, arrows (`→`/`↗`), badges, cards, icons, animation. Dose caps:
  blur on max 1–2 elements, glow on max 1–2 focal elements, one accent only.
- Quality locks: max 2–3 core colors + 1 accent; CTAs specific to the action
  (never Get Started/Learn More); no buzzwords (AI Powered, Seamless, ...);
  layout follows content need, never Hero + 3 cards + testimonials + FAQ
  template; never clone Linear/Vercel/Stripe; every major decision gets a
  one-line why (R-31).
- Liveliness: declare dials per change, default ENERGY 1 / RHYTHM 1 / MOTION 1
  (calm ledger tool); one focal point per screen, hierarchical contrast,
  whitespace as structure, one deliberate accent + one identity motif.
