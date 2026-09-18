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
    axum::serve(listener, app).await.expect("Server failed");
}
