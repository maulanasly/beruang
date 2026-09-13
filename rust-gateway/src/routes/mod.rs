pub mod health;
pub mod proxy;
pub mod returns;
pub mod static_handler;

use axum::extract::Request;
use axum::http::{HeaderValue, Method};
use axum::middleware::{self, Next};
use axum::response::Response;
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

pub fn create_router() -> Router {
    Router::new()
        .route("/health", axum::routing::get(health::handler))
        // Native calc (parity-guarded) with proxy rollback per route group.
        // `/api/v1/market-data/*` always proxies until the Rust market
        // module passes the shadow-diff bar. Anything else under `/api/`
        // falls through to the static handler's 404 guard so the SPA
        // fallback never hijacks API routes.
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
        .route("/api/v1/{*path}", axum::routing::any(proxy::handler))
        .fallback(static_handler::handler)
        .layer(cors_layer())
        .layer(middleware::from_fn(security_headers))
        .layer(CompressionLayer::new())
        .layer(TraceLayer::new_for_http())
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
