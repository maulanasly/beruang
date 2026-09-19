use beruang_gateway::{metrics, routes::create_router};

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    metrics::init();

    let app = create_router();
    let port: u16 = std::env::var("PORT")
        .or_else(|_| std::env::var("GATEWAY_PORT"))
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(8000);

    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{port}"))
        .await
        .expect("Failed to bind gateway");
    tracing::info!("beruang listening on 0.0.0.0:{port} (self-contained)");
    // `ConnectInfo` feeds tonggeret's visitor identity when `X-Forwarded-For`
    // is absent (direct connections, healthchecks): without it every such
    // visit collapses to peer `"direct"` and uniques distinguish by
    // `User-Agent` only. Nginx already sends `X-Forwarded-For`, so proxied
    // traffic is unaffected — this only sharpens the direct fallback.
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<std::net::SocketAddr>(),
    )
    .await
    .expect("Server failed");
}
