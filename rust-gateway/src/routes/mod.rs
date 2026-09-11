pub mod health;
pub mod proxy;
pub mod static_handler;

use axum::http::{HeaderValue, Method};
use axum::Router;
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
        // Proxy `/api/v1/*` verbatim (status + body) to the Python calc service.
        // Anything else under `/api/` falls through to the static handler's
        // 404 guard so the SPA fallback never hijacks API routes.
        .route("/api/v1/{*path}", axum::routing::any(proxy::handler))
        .fallback(static_handler::handler)
        .layer(cors_layer())
        .layer(TraceLayer::new_for_http())
}
