//! tonggeret telemetry wiring (Prometheus-light).
//!
//! In-memory registry only — no Fjall disk state, so the gateway stays
//! stateless and the release image stays slim. All recording is lock-free
//! atomics; uninitialized (or failed init) degrades to silent no-ops and
//! `/metrics` answers 503, the app itself keeps serving.
//!
//! Visitor counting (`visitors_total{region}` + `unique_visitors_estimate{region}`)
//! rides on tonggeret 0.3's HyperLogLog tracker: identity is the first
//! `X-Forwarded-For` entry (else the `ConnectInfo` peer, else `"direct"`)
//! plus `User-Agent`, hashed only — raw identifiers are never stored.
//! Regions come from CDN country headers (`CF-IPCountry` →
//! `X-Vercel-IP-Country` → `CloudFront-Viewer-Country`); the current nginx
//! vhost forwards none of those, so every visit lands in `region="unknown"`
//! until a GeoIP/CDN header is added. Headers are client-spoofable, so
//! totals are best-effort and uniques stay sane via the 512-region cap
//! (overflow folds into `"other"`).

pub use tonggeret::middleware::axum::{prometheus_handler, track, track_visitors};

use axum::extract::Request;
use axum::middleware::Next;
use axum::response::Response;

/// Infra endpoints excluded from visitor counting. `/metrics` scrapes,
/// `/health` probes, and the dev poller would otherwise inflate visit
/// totals (Prometheus scrapes every few seconds).
const VISITOR_SKIP: &[&str] = &["/metrics", "/health", "/__dev_version"];

/// Initialize the global engine once at startup. Non-fatal: on error we
/// serve without telemetry rather than refusing to boot.
///
/// Also spawns the visitor-snapshot task (15 s upstream default) that
/// refreshes the `unique_visitors_estimate` gauge. The spawn is attempted
/// even when engine init fails: observations then no-op harmlessly, and a
/// later successful init still gets fresh uniques. Dropping the returned
/// `JoinHandle` detaches the task (Tokio semantics) — it keeps ticking
/// for the process lifetime, which is exactly what we want. `snapshot()`
/// itself is idempotent (gauge overwrite), so a duplicate spawn from a
/// double `init()` is wasteful but safe.
pub fn init() {
    match tonggeret::init(tonggeret::Config::default_light()) {
        Ok(()) => tracing::info!("metrics initialized (prometheus-light)"),
        Err(e) => tracing::warn!(error = %e, "metrics init failed; serving without telemetry"),
    }
    match tonggeret::visitors::spawn_snapshot_task(
        tonggeret::visitors::DEFAULT_SNAPSHOT_INTERVAL,
    ) {
        Some(_) => tracing::info!("visitor snapshot task started (15s)"),
        None => tracing::warn!(
            "visitor snapshot not started (no Tokio runtime); unique_visitors_estimate will stay stale until snapshot_visitors runs"
        ),
    }
}

/// Visitor middleware with infra-path filtering. Same `from_fn` shape as
/// tonggeret's `track_visitors`, so it stacks as a second layer next to
/// `track` (which owns `http_requests_total` + `http_request_duration_ms`).
/// Skipped paths pass through untouched — no total, no HLL sample.
pub async fn track_visitors_filtered(req: Request, next: Next) -> Response {
    if VISITOR_SKIP.contains(&req.uri().path()) {
        return next.run(req).await;
    }
    track_visitors(req, next).await
}

/// One finished calculation: `calc` is the calculator slug
/// (`"mutual-funds"`, `"ev"`, …), `status` is `"ok"` or `"error"`.
pub fn record_calc(calc: &'static str, status: &'static str) {
    tonggeret::counter!("beruang_calc_total", 1.0, calc = calc, status = status);
}

/// One finished market-data call: `endpoint` is the route template,
/// `status` is `"ok"`, `"validation"`, `"upstream"`, or `"timeout"`.
pub fn record_market(endpoint: &str, status: &'static str, elapsed_ms: f64) {
    tonggeret::counter!(
        "beruang_market_total",
        1.0,
        endpoint = endpoint,
        status = status
    );
    tonggeret::histogram!(
        "beruang_market_duration_ms",
        elapsed_ms,
        endpoint = endpoint
    );
}
