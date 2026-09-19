pub mod debt;
pub mod ev;
pub mod flatloan;
pub mod health;
pub mod market;
pub mod rentbuy;
pub mod retire;
pub mod returns;
pub mod static_handler;

use axum::extract::Request;
use axum::http::{HeaderValue, Method, StatusCode};
use axum::middleware::{self, Next};
use axum::response::{IntoResponse, Response};
use axum::Router;

use tower_http::compression::CompressionLayer;
use tower_http::cors::{AllowHeaders, AllowMethods, AllowOrigin, Any, CorsLayer};
use tower_http::trace::TraceLayer;

fn cors_layer() -> CorsLayer {
    let raw = std::env::var("CORS_ALLOW_ORIGINS").unwrap_or_else(|_| {
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:8080,http://127.0.0.1:8080".to_string()
    });
    let origins: Vec<HeaderValue> = raw
        .split(',')
        .filter_map(|s| s.trim().parse().ok())
        .collect();
    if origins.is_empty() {
        return CorsLayer::new()
            .allow_origin(Any)
            .allow_methods(Any)
            .allow_headers(Any);
    }
    // Explicit allowlist preserves credentials (browsers forbid `*` with credentials).
    CorsLayer::new()
        .allow_origin(AllowOrigin::list(origins))
        .allow_methods(AllowMethods::list([
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::DELETE,
            Method::OPTIONS,
        ]))
        .allow_headers(AllowHeaders::list([
            axum::http::header::CONTENT_TYPE,
            axum::http::header::ACCEPT,
        ]))
        .allow_credentials(true)
}

/// Unknown `/api/*` paths stay JSON (never the SPA fallback).
async fn api_not_found() -> Response {
    (
        StatusCode::NOT_FOUND,
        axum::Json(serde_json::json!({ "detail": "Not found." })),
    )
        .into_response()
}

pub fn create_router() -> Router {
    Router::new()
        .route("/health", axum::routing::get(health::handler))
        .route(
            "/metrics",
            axum::routing::get(crate::metrics::prometheus_handler),
        )
        // Dev-only live-reload poller (`BERUANG_DEV=1`); 404 in prod.
        .route(
            "/__dev_version",
            axum::routing::get(static_handler::dev_version),
        )
        .route(
            "/api/v1/mutual-funds/returns",
            axum::routing::post(returns::mutual_funds),
        )
        .route(
            "/api/v1/stocks/returns",
            axum::routing::post(returns::stocks),
        )
        .route(
            "/api/v1/term-deposits/returns",
            axum::routing::post(returns::term_deposits),
        )
        .route("/api/v1/ev/comparison", axum::routing::post(ev::comparison))
        .route(
            "/api/v1/flat-loan/comparison",
            axum::routing::post(flatloan::comparison),
        )
        .route(
            "/api/v1/debt-payoff/comparison",
            axum::routing::post(debt::comparison),
        )
        .route(
            "/api/v1/retirement/comparison",
            axum::routing::post(retire::comparison),
        )
        .route(
            "/api/v1/rent-vs-buy/comparison",
            axum::routing::post(rentbuy::comparison),
        )
        .route(
            "/api/v1/market-data/idx/kompas100",
            axum::routing::get(market::kompas100),
        )
        .route(
            "/api/v1/market-data/idx/dividend-yields",
            axum::routing::get(market::dividend_yields),
        )
        .route(
            "/api/v1/market-data/idx/search",
            axum::routing::get(market::idx_search),
        )
        .route(
            "/api/v1/market-data/quote",
            axum::routing::get(market::quote),
        )
        .route(
            "/api/v1/market-data/index/history",
            axum::routing::get(market::index_history),
        )
        .route(
            "/api/v1/market-data/price/history",
            axum::routing::get(market::price_history),
        )
        .route("/api/{*path}", axum::routing::any(api_not_found))
        .fallback(static_handler::handler)
        .layer(cors_layer())
        .layer(middleware::from_fn(security_headers))
        .layer(CompressionLayer::new())
        .layer(TraceLayer::new_for_http())
        // Visitor counter (tonggeret 0.3 HLL): `visitors_total{region}` +
        // `unique_visitors_estimate{region}`. Filtered wrapper skips infra
        // paths (`/metrics`, `/health`, `/__dev_version`) so scrapes and
        // probes don't inflate visits. Kept inside `track` so edge latency
        // still covers the visitor observation.
        .layer(middleware::from_fn(crate::metrics::track_visitors_filtered))
        // Outermost: edge latency + status of the final response, with route
        // templates (`MatchedPath`) as labels. `/metrics` scrapes show up as
        // their own series — expected, not filtered.
        .layer(middleware::from_fn(crate::metrics::track))
}

/// Same-origin hardening for the embedded SPA. Inline `style=` attributes
/// are load-bearing in `static/js/components/*`, hence `style-src
/// 'unsafe-inline'` — scripts stay `'self'`-only (no CDN, zero-build).
async fn security_headers(request: Request, next: Next) -> Response {
    let mut response = next.run(request).await;
    let headers = response.headers_mut();
    headers.insert(
        "x-content-type-options",
        HeaderValue::from_static("nosniff"),
    );
    headers.insert("x-frame-options", HeaderValue::from_static("SAMEORIGIN"));
    headers.insert(
        "referrer-policy",
        HeaderValue::from_static("strict-origin-when-cross-origin"),
    );
    headers.insert(
        "content-security-policy",
        HeaderValue::from_static(
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; \
             img-src 'self' data:; connect-src 'self'; frame-ancestors 'self'",
        ),
    );
    response
}
