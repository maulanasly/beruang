use axum::body::Body;
use axum::http::{Request, StatusCode};
use tower::ServiceExt;

async fn response_body_json(response: axum::response::Response) -> serde_json::Value {
    let bytes = axum::body::to_bytes(response.into_body(), 1024 * 1024)
        .await
        .unwrap();
    serde_json::from_slice(&bytes).unwrap()
}

#[tokio::test]
async fn health_returns_ok() {
    let app = beruang_gateway::routes::create_router();
    let response = app
        .oneshot(
            Request::builder()
                .uri("/health")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(response_body_json(response).await["status"], "ok");
}

#[tokio::test]
async fn static_serves_index_and_guards_api() {
    let app = beruang_gateway::routes::create_router();

    // Root serves the embedded SPA.
    let response = app
        .clone()
        .oneshot(Request::builder().uri("/").body(Body::empty()).unwrap())
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert!(response.headers()["content-type"]
        .to_str()
        .unwrap()
        .contains("text/html"));

    // Unknown SPA path falls back to index.html.
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/mutual-funds")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);

    // Unknown /api path must NOT fall back to index.html.
    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/v9/nope")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}

/// Spin a mock calc on an ephemeral port and assert the gateway proxies
/// method + path + query + body + status + body verbatim.
#[tokio::test]
async fn proxy_passes_through_verbatim() {
    let mock = axum::Router::new()
        .route(
            "/api/v1/market-data/idx/kompas100",
            axum::routing::get(|| async {
                axum::Json(serde_json::json!({
                    "index_name": "Kompas 100 (Starter)",
                    "items": [{"symbol": "BBCA.JK", "name": "Bank Central Asia Tbk"}],
                }))
            }),
        )
        .route(
            "/api/v1/mutual-funds/returns",
            axum::routing::post(|body: axum::body::Bytes| async move {
                // Echo a 422 with the received body size so the test can
                // verify the request body was forwarded.
                (
                    StatusCode::UNPROCESSABLE_ENTITY,
                    [(axum::http::header::CONTENT_TYPE, "application/json")],
                    serde_json::json!({"detail": format!("mock saw {} bytes", body.len())})
                        .to_string(),
                )
            }),
        );

    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, mock).await.unwrap() });

    // SAFETY: only this test writes CALC_BASE_URL; health/static tests never read it.
    std::env::set_var("CALC_BASE_URL", format!("http://{addr}"));
    let app = beruang_gateway::routes::create_router();

    // GET with query passthrough.
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/market-data/idx/kompas100")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert!(response.headers()["content-type"]
        .to_str()
        .unwrap()
        .contains("application/json"));
    let body = response_body_json(response).await;
    assert_eq!(body["index_name"], "Kompas 100 (Starter)");
    assert_eq!(body["items"][0]["symbol"], "BBCA.JK");

    // POST forwards body; mock 422 passes through verbatim.
    let payload = serde_json::json!({"entries": []}).to_string();
    let expected = format!("mock saw {} bytes", payload.len());
    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/mutual-funds/returns")
                .header("content-type", "application/json")
                .body(Body::from(payload))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(response_body_json(response).await["detail"], expected);
}
