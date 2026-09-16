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
async fn dev_version_endpoint_is_prod_404() {
    // Without BERUANG_DEV the live-reload poller exposes no surface,
    // and the prod shell carries no dev script tag.
    let app = beruang_gateway::routes::create_router();
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/__dev_version")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::NOT_FOUND);

    let response = app
        .oneshot(Request::builder().uri("/").body(Body::empty()).unwrap())
        .await
        .unwrap();
    let body = response_body_bytes(response).await;
    assert!(!String::from_utf8_lossy(&body).contains("dev-reload.js"));
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

async fn response_body_text(response: axum::response::Response) -> String {
    String::from_utf8(response_body_bytes(response).await).unwrap()
}

/// Calculator routes carry Indonesian-first share metadata.
#[tokio::test]
async fn seo_meta_per_route() {
    let app = beruang_gateway::routes::create_router();
    let response = app
        .oneshot(
            Request::builder()
                .uri("/kalkulator/saham")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let body = response_body_text(response).await;
    assert!(
        body.contains("<title>Kalkulator Saham dan Dividen — Beruang</title>"),
        "title"
    );
    assert!(
        body.contains("<link rel=\"canonical\" href=\"http://localhost:8000/kalkulator/saham\">"),
        "canonical"
    );
    assert!(
        body.contains("hreflang=\"en\" href=\"http://localhost:8000/calculators/stocks\""),
        "hreflang"
    );
    assert!(
        body.contains("property=\"og:image\" content=\"http://localhost:8000/og-image.png\""),
        "og:image"
    );
    assert!(
        body.contains("name=\"twitter:card\" content=\"summary_large_image\""),
        "twitter card"
    );
    assert!(body.contains("application/ld+json"), "json-ld");
    assert!(body.contains("<noscript>"), "noscript");
    for leftover in [
        "{{TITLE}}",
        "{{DESCRIPTION}}",
        "{{CANONICAL}}",
        "{{OG_IMAGE}}",
        "{{JSON_LD}}",
        "{{NOSCRIPT}}",
        "{{HREFLANG}}",
        "{{BASE_URL}}",
        "{{APP_VERSION}}",
    ] {
        assert!(!body.contains(leftover), "unreplaced {leftover}");
    }
}

/// English aliases share the Indonesian canonical; unknown paths fall back generic.
#[tokio::test]
async fn seo_alias_and_fallback() {
    let app = beruang_gateway::routes::create_router();
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/calculators/stocks")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let body = response_body_text(response).await;
    assert!(
        body.contains("<link rel=\"canonical\" href=\"http://localhost:8000/kalkulator/saham\">")
    );

    let response = app
        .oneshot(
            Request::builder()
                .uri("/some-unknown-page")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert!(response_body_text(response)
        .await
        .contains("<title>Beruang — Kalkulator Investasi</title>"));
}

/// Crawl infrastructure is served, never the SPA shell.
#[tokio::test]
async fn robots_and_sitemap_served() {
    let app = beruang_gateway::routes::create_router();
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/robots.txt")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert!(response.headers()["content-type"]
        .to_str()
        .unwrap()
        .contains("text/plain"));
    let body = response_body_text(response).await;
    assert!(body.contains("Sitemap: http://localhost:8000/sitemap.xml"));

    let response = app
        .oneshot(
            Request::builder()
                .uri("/sitemap.xml")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let body = response_body_text(response).await;
    assert!(body.contains("<urlset"));
    assert!(
        body.contains("http://localhost:8000/kalkulator/saham"),
        "sitemap lists ID canonical"
    );
    assert!(
        body.contains("http://localhost:8000/portofolio"),
        "sitemap lists portfolio"
    );
}

/// Portfolio dashboard: canonical ID path, /overview alias shares it.
#[tokio::test]
async fn portfolio_canonical_and_alias() {
    let app = beruang_gateway::routes::create_router();
    for uri in ["/portofolio", "/overview"] {
        let response = app
            .clone()
            .oneshot(Request::builder().uri(uri).body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK, "{uri}");
        let body = response_body_text(response).await;
        assert!(
            body.contains("<title>Portofolio Saya — Beruang</title>"),
            "{uri}"
        );
        assert!(
            body.contains("<link rel=\"canonical\" href=\"http://localhost:8000/portofolio\">"),
            "{uri}"
        );
    }
}

/// EV comparison: typical ID inputs break even; bad input keeps 422 shape.
#[tokio::test]
async fn ev_comparison_matches_model() {
    let app = beruang_gateway::routes::create_router();
    let payload = serde_json::json!({
        "price_ice": 250000000.0, "price_ev": 300000000.0,
        "km_per_month": 1500.0, "fuel_price_per_liter": 10000.0,
        "fuel_km_per_liter": 12.0, "electricity_price_per_kwh": 1444.0,
        "ev_kwh_per_100km": 15.0,
        "service_ice_per_month": 500000.0, "service_ev_per_month": 200000.0,
    })
    .to_string();
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/ev/comparison")
                .header("content-type", "application/json")
                .body(Body::from(payload))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let body = response_body_json(response).await;
    assert_eq!(body["upfront_delta"].as_f64().unwrap(), 50_000_000.0);
    assert_eq!(body["break_even_months"].as_u64().unwrap(), 41);
    assert!(body["monthly_saving"].as_f64().unwrap() > 0.0);

    let bad = r#"{"price_ice": 1, "price_ev": 2, "km_per_month": 1,
        "fuel_price_per_liter": 1, "fuel_km_per_liter": 0,
        "electricity_price_per_kwh": 1, "ev_kwh_per_100km": 1,
        "service_ice_per_month": 0, "service_ev_per_month": 0}"#;
    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/ev/comparison")
                .header("content-type", "application/json")
                .body(Body::from(bad))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::UNPROCESSABLE_ENTITY);
    assert!(response_body_json(response).await["detail"]
        .as_str()
        .unwrap()
        .contains("fuel_km_per_liter"));
}

/// EV page shares the Indonesian canonical like the other calculators.
#[tokio::test]
async fn ev_page_meta() {
    let app = beruang_gateway::routes::create_router();
    for uri in ["/kalkulator/mobil-listrik", "/ev"] {
        let response = app
            .clone()
            .oneshot(Request::builder().uri(uri).body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK, "{uri}");
        let body = response_body_text(response).await;
        assert!(
            body.contains("<title>Kalkulator Mobil Listrik vs Bensin — Beruang</title>"),
            "{uri}"
        );
        assert!(
            body.contains(
                "<link rel=\"canonical\" href=\"http://localhost:8000/kalkulator/mobil-listrik\">"
            ),
            "{uri}"
        );
    }
}

/// English aliases serve English copy under the Indonesian canonical.
#[tokio::test]
async fn english_alias_serves_english_meta() {
    let app = beruang_gateway::routes::create_router();
    let response = app
        .oneshot(
            Request::builder()
                .uri("/calculators/stocks")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let body = response_body_text(response).await;
    assert!(body.contains("<title>Stock and Dividend Calculator — Beruang</title>"));
    assert!(
        body.contains("<link rel=\"canonical\" href=\"http://localhost:8000/kalkulator/saham\">")
    );
}

/// English EV alias serves English copy under the same canonical.
#[tokio::test]
async fn ev_english_alias_meta() {
    let app = beruang_gateway::routes::create_router();
    let response = app
        .oneshot(
            Request::builder()
                .uri("/calculators/ev")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let body = response_body_text(response).await;
    assert!(body.contains("<title>EV vs Petrol Cost Calculator — Beruang</title>"));
    assert!(body.contains(
        "<link rel=\"canonical\" href=\"http://localhost:8000/kalkulator/mobil-listrik\">"
    ));
}

/// Rent-vs-buy comparison: typical ID inputs cost less cash renting;
/// bad input keeps 422 shape; schedule anchors the crossover chart.
#[tokio::test]
async fn rent_buy_comparison_matches_model() {
    let app = beruang_gateway::routes::create_router();
    let payload = serde_json::json!({
        "house_price": 800000000.0, "down_payment": 160000000.0,
        "mortgage_rate_annual": 0.07, "tenor_years": 20.0,
        "rent_per_month": 3000000.0, "other_buy_costs_per_month": 500000.0,
    })
    .to_string();
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/rent-vs-buy/comparison")
                .header("content-type", "application/json")
                .body(Body::from(payload))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let body = response_body_json(response).await;
    assert_eq!(body["upfront_buy"].as_f64().unwrap(), 160_000_000.0);
    assert!(body["break_even_months"].is_null());
    assert!(body["monthly_buy"].as_f64().unwrap() > body["monthly_rent"].as_f64().unwrap());
    let schedule = body["schedule"].as_array().unwrap();
    assert_eq!(schedule.len(), 21);
    assert_eq!(schedule[0]["cum_buy"].as_f64().unwrap(), 160_000_000.0);
    assert_eq!(schedule[0]["cum_rent"].as_f64().unwrap(), 0.0);
    assert_eq!(
        schedule[20]["cum_rent"].as_f64().unwrap(),
        body["total_rent"].as_f64().unwrap()
    );

    let bad = r#"{"house_price": 800000000, "down_payment": 900000000,
        "mortgage_rate_annual": 0.07, "tenor_years": 20,
        "rent_per_month": 3000000, "other_buy_costs_per_month": 500000}"#;
    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/rent-vs-buy/comparison")
                .header("content-type", "application/json")
                .body(Body::from(bad))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::UNPROCESSABLE_ENTITY);
    assert!(response_body_json(response).await["detail"]
        .as_str()
        .unwrap()
        .contains("down_payment"));
}

/// Rent-vs-buy net-worth layer: old 6-field payloads gain documented
/// defaults (4/3/8/5%), explicit wealth inputs are honored, and bad new
/// input keeps the 422 shape.
#[tokio::test]
async fn rent_buy_net_worth_layer() {
    let app = beruang_gateway::routes::create_router();
    let payload = serde_json::json!({
        "house_price": 800000000.0, "down_payment": 160000000.0,
        "mortgage_rate_annual": 0.07, "tenor_years": 20.0,
        "rent_per_month": 3000000.0, "other_buy_costs_per_month": 500000.0,
    })
    .to_string();
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/rent-vs-buy/comparison")
                .header("content-type", "application/json")
                .body(Body::from(payload))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let body = response_body_json(response).await;
    // Typical defaults: honest close race, renter ahead at 4% vs 8%.
    assert!(body["net_worth_break_even_year"].is_null());
    assert!(body["total_interest_paid"].as_f64().unwrap() > 0.0);
    assert!(
        body["end_renter_net_worth"].as_f64().unwrap()
            > body["end_buyer_net_worth"].as_f64().unwrap()
    );
    assert_eq!(body["sensitivity"].as_array().unwrap().len(), 5);
    let schedule = body["schedule"].as_array().unwrap();
    assert_eq!(schedule[0]["home_value"].as_f64().unwrap(), 800_000_000.0);
    assert_eq!(schedule[0]["loan_balance"].as_f64().unwrap(), 640_000_000.0);
    assert_eq!(schedule[0]["equity"].as_f64().unwrap(), 160_000_000.0);

    // Explicit 6% appreciation flips the verdict early.
    let payload = serde_json::json!({
        "house_price": 800000000.0, "down_payment": 160000000.0,
        "mortgage_rate_annual": 0.07, "tenor_years": 20.0,
        "rent_per_month": 3000000.0, "other_buy_costs_per_month": 500000.0,
        "home_appreciation_annual": 0.06, "rent_growth_annual": 0.03,
        "other_growth_annual": 0.03, "invest_return_annual": 0.08,
        "closing_costs": 0.0, "selling_cost_rate": 0.05,
    })
    .to_string();
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/rent-vs-buy/comparison")
                .header("content-type", "application/json")
                .body(Body::from(payload))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let body = response_body_json(response).await;
    assert!(body["net_worth_break_even_year"].as_u64().unwrap() <= 20);
    assert!(body["net_advantage_buy_minus_rent"].as_f64().unwrap() > 0.0);

    let bad = r#"{"house_price": 800000000, "down_payment": 160000000,
        "mortgage_rate_annual": 0.07, "tenor_years": 20,
        "rent_per_month": 3000000, "other_buy_costs_per_month": 500000,
        "home_appreciation_annual": 1.5}"#;
    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/rent-vs-buy/comparison")
                .header("content-type", "application/json")
                .body(Body::from(bad))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::UNPROCESSABLE_ENTITY);
    assert!(response_body_json(response).await["detail"]
        .as_str()
        .unwrap()
        .contains("home_appreciation_annual"));
}
/// Rent-vs-buy page shares the Indonesian canonical like the calculators.
#[tokio::test]
async fn rent_buy_page_meta() {
    let app = beruang_gateway::routes::create_router();
    for uri in ["/kalkulator/sewa-vs-beli", "/rent-vs-buy"] {
        let response = app
            .clone()
            .oneshot(Request::builder().uri(uri).body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK, "{uri}");
        let body = response_body_text(response).await;
        assert!(
            body.contains("<title>Kalkulator Sewa vs Beli Rumah — Beruang</title>"),
            "{uri}"
        );
        assert!(
            body.contains(
                "<link rel=\"canonical\" href=\"http://localhost:8000/kalkulator/sewa-vs-beli\">"
            ),
            "{uri}"
        );
    }
}

/// English rent-vs-buy alias serves English copy under the same canonical.
#[tokio::test]
async fn rent_buy_english_alias_meta() {
    let app = beruang_gateway::routes::create_router();
    let response = app
        .oneshot(
            Request::builder()
                .uri("/calculators/rent-vs-buy")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let body = response_body_text(response).await;
    assert!(body.contains("<title>Rent vs Buy House Calculator — Beruang</title>"));
    assert!(body.contains(
        "<link rel=\"canonical\" href=\"http://localhost:8000/kalkulator/sewa-vs-beli\">"
    ));
}
