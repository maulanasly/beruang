//! tonggeret telemetry wiring (Prometheus-light).
//!
//! In-memory registry only — no Fjall disk state, so the gateway stays
//! stateless and the release image stays slim. All recording is lock-free
//! atomics; uninitialized (or failed init) degrades to silent no-ops and
//! `/metrics` answers 503, the app itself keeps serving.

pub use tonggeret::middleware::axum::{prometheus_handler, track};

/// Initialize the global engine once at startup. Non-fatal: on error we
/// serve without telemetry rather than refusing to boot.
pub fn init() {
    match tonggeret::init(tonggeret::Config::default_light()) {
        Ok(()) => tracing::info!("metrics initialized (prometheus-light)"),
        Err(e) => tracing::warn!(error = %e, "metrics init failed; serving without telemetry"),
    }
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
