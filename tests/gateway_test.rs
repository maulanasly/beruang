use axum::body::Body;
use axum::http::{Request, StatusCode};
use tower::ServiceExt;

async fn response_body_json(response: axum::response::Response) -> serde_json::Value {
    let bytes = axum::body::to_bytes(response.into_body(), 1024 * 1024)
        .await
        .unwrap();
    serde_json::from_slice(&bytes).unwrap()
}

async fn response_body_bytes(response: axum::response::Response) -> Vec<u8> {
    axum::body::to_bytes(response.into_body(), 1024 * 1024)
        .await
        .unwrap()
        .to_vec()
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

#[tokio::test]
async fn static_index_injects_version_and_caches() {
    let app = beruang_gateway::routes::create_router();
    let response = app
        .clone()
        .oneshot(Request::builder().uri("/").body(Body::empty()).unwrap())
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        response.headers()["cache-control"],
        "no-cache",
        "shell must revalidate so ?v= URLs stay fresh"
    );
    let body = String::from_utf8(response_body_bytes(response).await).unwrap();
    assert!(
        !body.contains("{{APP_VERSION}}"),
        "version placeholder must be injected at serve time"
    );
    assert!(
        body.contains("/js/app.js?v="),
        "asset URLs must carry the cache-busting version"
    );

    // Immutable tier: versioned JS ships a long cache + ETag.
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/js/app.js?v=abc123")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        response.headers()["cache-control"],
        "public, max-age=31536000, immutable"
    );
    assert!(response.headers()["content-type"]
        .to_str()
        .unwrap()
        .contains("charset=utf-8"));
    let etag = response.headers()["etag"].to_str().unwrap().to_string();

    // Conditional request short-circuits to 304 with no body.
    let response = app
        .oneshot(
            Request::builder()
                .uri("/js/app.js")
                .header("if-none-match", etag)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::NOT_MODIFIED);
    assert!(response_body_bytes(response).await.is_empty());
}

#[tokio::test]
async fn static_responses_carry_security_headers_and_compression() {
    let app = beruang_gateway::routes::create_router();
    let response = app
        .clone()
        .oneshot(Request::builder().uri("/").body(Body::empty()).unwrap())
        .await
        .unwrap();
    assert_eq!(response.headers()["x-content-type-options"], "nosniff");
    assert_eq!(response.headers()["x-frame-options"], "SAMEORIGIN");
    assert!(response.headers()["content-security-policy"]
        .to_str()
        .unwrap()
        .contains("script-src 'self'"));

    // gzip is negotiated when the client offers it.
    let response = app
        .oneshot(
            Request::builder()
                .uri("/js/app.js")
                .header("accept-encoding", "gzip")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(response.headers()["content-encoding"], "gzip");
}

/// Native `*/returns`: oracle vectors served in-process, 422 shape preserved.
#[tokio::test]
async fn native_returns_match_oracle() {
    let app = beruang_gateway::routes::create_router();

    // Mutual funds: oracle xirr for the static-defaults vector.
    let payload = serde_json::json!({"entries": [
        {"date": "2026-05-31", "installment_amount": 1100, "current_value": 6500},
        {"date": "2026-06-30", "installment_amount": 1100, "current_value": 7700},
    ]})
    .to_string();
    let response = app
        .clone()
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
    assert_eq!(response.status(), StatusCode::OK);
    let body = response_body_json(response).await;
    let xirr = body["summary"]["xirr"].as_f64().unwrap();
    assert!(
        ((xirr - 2934315985.171605) / 2934315985.171605).abs() < 1e-9,
        "xirr={xirr}"
    );
    assert_eq!(body["ledger"][0]["mom_return"], serde_json::Value::Null);

    // Stocks: summary ROI + null first-row MoM.
    let payload = serde_json::json!({"entries": [
        {"date": "2026-05-31", "installment_amount": 700, "new_share_purchases": 300,
         "dividends": 0, "current_value": 1000},
        {"date": "2026-06-30", "installment_amount": 700, "new_share_purchases": 200,
         "dividends": 10, "current_value": 1950},
    ]})
    .to_string();
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/stocks/returns")
                .header("content-type", "application/json")
                .body(Body::from(payload))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let body = response_body_json(response).await;
    assert!((body["summary"]["roi"].as_f64().unwrap() - 0.02631578947368421).abs() < 1e-12);

    // Term deposits: maturity fields present (dates depend on today, so
    // assert shape, not values — values are pinned by calc_parity).
    let payload = serde_json::json!({"apy": 0.06, "entries": [
        {"date": "2026-05-31", "installment_amount": 1000, "current_value": 1000,
         "term_months": 12, "maturity_date": "2027-05-31"},
        {"date": "2026-06-30", "installment_amount": 1000, "current_value": 2005,
         "term_months": 12, "maturity_date": "2027-06-30"},
    ]})
    .to_string();
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/term-deposits/returns")
                .header("content-type", "application/json")
                .body(Body::from(payload))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let body = response_body_json(response).await;
    assert_eq!(body["summary"]["apy"].as_f64().unwrap(), 0.06);
    assert!(body["summary"]["next_maturity_date"].is_string());
    assert!(body["ledger"][0]["days_to_maturity"].is_number());

    // Empty ledger keeps the 422 `{"detail": ...}` shape.
    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/mutual-funds/returns")
                .header("content-type", "application/json")
                .body(Body::from(r#"{"entries": []}"#))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::UNPROCESSABLE_ENTITY);
    assert!(response_body_json(response).await["detail"]
        .as_str()
        .unwrap()
        .contains("At least one ledger row"));
}

/// Unknown API paths stay JSON 404 (never the SPA fallback, no proxy).
#[tokio::test]
async fn unknown_api_routes_return_json_404() {
    let app = beruang_gateway::routes::create_router();
    for uri in ["/api/v9/nope", "/api/v1/market-data/nope"] {
        let response = app
            .clone()
            .oneshot(Request::builder().uri(uri).body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::NOT_FOUND, "{uri}");
        assert_eq!(response_body_json(response).await["detail"], "Not found.");
    }
}

/// Market validation rejects shape without touching the network.
#[tokio::test]
async fn market_validation_rejects_without_network() {
    let app = beruang_gateway::routes::create_router();
    // Missing symbol.
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/market-data/quote")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::UNPROCESSABLE_ENTITY);
    // Bad period (no Yahoo call: validation runs first).
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/market-data/index/history?symbol=%5EJKSE&period=9y")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::UNPROCESSABLE_ENTITY);
    // Out-of-range limit.
    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/v1/market-data/idx/dividend-yields?limit=99")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::UNPROCESSABLE_ENTITY);
}
