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
                .uri("/kalkulator/reksa-dana")
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
        body.contains("property=\"og:image\" content=\"http://localhost:8000/og-saham.png\""),
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
        "{{LANG}}",
        "{{OG_LOCALE}}",
        "{{OG_LOCALE_ALT}}",
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
        .contains("<title>Beruang — Kalkulator Keuangan</title>"));
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
    for uri in ["/portofolio"] {
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
    for uri in ["/kalkulator/mobil-listrik"] {
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
/// Rent-vs-buy signals: ratios, implied thresholds, wait comparison, and
/// affordability ride the same route with the same 422 shape.
#[tokio::test]
async fn rent_buy_signals() {
    let app = beruang_gateway::routes::create_router();
    let base = serde_json::json!({
        "house_price": 800000000.0, "down_payment": 160000000.0,
        "mortgage_rate_annual": 0.07, "tenor_years": 20.0,
        "rent_per_month": 3000000.0, "other_buy_costs_per_month": 500000.0,
    });
    let payload = base.to_string();
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
    assert!((body["price_to_rent"].as_f64().unwrap() - 22.2222).abs() < 0.01);
    assert!(body["payment_to_rent"].as_f64().unwrap() > 1.0);
    let req = body["required_appreciation"].as_f64().unwrap();
    assert!((0.04..0.05).contains(&req), "{req}");
    assert!(body["max_invest_return"].as_f64().unwrap() < 0.08);
    assert_eq!(body["closing_recovery_years"].as_u64().unwrap(), 0);
    assert!(body["wait_advantage_vs_buy_now"].is_null());
    assert!(body["installment_share"].is_null());

    // Waiting 5 years and earning 20M/month: advantage is a number, share
    // sits in the comfortable band.
    let mut full = base.as_object().unwrap().clone();
    full.insert("wait_years".to_string(), serde_json::json!(5.0));
    full.insert(
        "gross_monthly_income".to_string(),
        serde_json::json!(20000000.0),
    );
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/rent-vs-buy/comparison")
                .header("content-type", "application/json")
                .body(Body::from(serde_json::Value::Object(full).to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let body = response_body_json(response).await;
    assert!(body["wait_advantage_vs_buy_now"].as_f64().is_some());
    assert!(body["installment_share"].as_f64().unwrap() < 0.30);

    // Waiting past the tenor is rejected like any other bad input.
    let mut bad = base.as_object().unwrap().clone();
    bad.insert("wait_years".to_string(), serde_json::json!(99.0));
    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/rent-vs-buy/comparison")
                .header("content-type", "application/json")
                .body(Body::from(serde_json::Value::Object(bad).to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::UNPROCESSABLE_ENTITY);
    assert!(response_body_json(response).await["detail"]
        .as_str()
        .unwrap()
        .contains("wait_years"));
}
/// Rent-vs-buy page shares the Indonesian canonical like the calculators.
#[tokio::test]
async fn rent_buy_page_meta() {
    let app = beruang_gateway::routes::create_router();
    for uri in ["/kalkulator/sewa-vs-beli"] {
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

/// Flat-loan true cost: the dealer quote reveals ~2x the effective rate;
/// bad input keeps 422 shape; schedule amortizes the burn-down chart.
#[tokio::test]
async fn flat_loan_comparison_matches_model() {
    let app = beruang_gateway::routes::create_router();
    let payload = serde_json::json!({
        "price": 150000000.0, "down_payment": 30000000.0,
        "flat_rate_annual": 0.05, "tenor_months": 35.0,
        "upfront_fees": 1500000.0,
    })
    .to_string();
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/flat-loan/comparison")
                .header("content-type", "application/json")
                .body(Body::from(payload))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let body = response_body_json(response).await;
    assert_eq!(body["principal"].as_f64().unwrap(), 120_000_000.0);
    // 5% flat on a 35-month quote hides a ~9% effective rate.
    let nominal = body["effective_annual_nominal"].as_f64().unwrap();
    assert!((0.08..0.11).contains(&nominal), "{nominal}");
    assert!(body["effective_annual_rate"].as_f64().unwrap() > nominal);
    assert!(body["true_cost_multiple"].as_f64().unwrap() > 1.1);
    let schedule = body["schedule"].as_array().unwrap();
    assert_eq!(schedule.len(), 35);
    assert!(schedule[34]["balance"].as_f64().unwrap().abs() < 1.0);
    assert_eq!(
        schedule[34]["cum_interest"].as_f64().unwrap().round(),
        body["total_interest"].as_f64().unwrap().round()
    );

    let bad = r#"{"price": 150000000, "down_payment": 200000000,
        "flat_rate_annual": 0.05, "tenor_months": 35}"#;
    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/flat-loan/comparison")
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

/// Flat-loan page shares the Indonesian canonical like the calculators.
#[tokio::test]
async fn flat_loan_page_meta() {
    let app = beruang_gateway::routes::create_router();
    for uri in ["/kalkulator/bunga-flat"] {
        let response = app
            .clone()
            .oneshot(Request::builder().uri(uri).body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK, "{uri}");
        let body = response_body_text(response).await;
        assert!(
            body.contains("<title>Kalkulator Bunga Flat vs Efektif — Beruang</title>"),
            "{uri}"
        );
        assert!(
            body.contains(
                "<link rel=\"canonical\" href=\"http://localhost:8000/kalkulator/bunga-flat\">"
            ),
            "{uri}"
        );
    }
}

/// English flat-loan alias serves English copy under the same canonical.
#[tokio::test]
async fn flat_loan_english_alias_meta() {
    let app = beruang_gateway::routes::create_router();
    let response = app
        .oneshot(
            Request::builder()
                .uri("/calculators/flat-rate-loan")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let body = response_body_text(response).await;
    assert!(body.contains("<title>Flat-Rate vs Effective Loan Calculator — Beruang</title>"));
    assert!(body
        .contains("<link rel=\"canonical\" href=\"http://localhost:8000/kalkulator/bunga-flat\">"));
}

/// Debt payoff: avalanche beats snowball on the sample debts; bad input
/// keeps 422 shape; both schedules amortize to zero.
#[tokio::test]
async fn debt_payoff_comparison_matches_model() {
    let app = beruang_gateway::routes::create_router();
    let payload = serde_json::json!({
        "extra_payment": 1000000.0,
        "debts": [
            {"name": "Paylater", "balance": 12000000.0, "annual_rate": 0.36,
             "rate_kind": "effective", "tenor_months": 0.0, "min_payment": 1000000.0},
            {"name": "Motor", "balance": 20000000.0, "annual_rate": 0.08,
             "rate_kind": "flat", "tenor_months": 24.0, "min_payment": 0.0},
        ],
    })
    .to_string();
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/debt-payoff/comparison")
                .header("content-type", "application/json")
                .body(Body::from(payload))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let body = response_body_json(response).await;
    assert!(body["interest_saved_avalanche"].as_f64().unwrap() >= 0.0);
    for plan in ["avalanche", "snowball"] {
        assert_eq!(body[plan]["debts"].as_array().unwrap().len(), 2);
        let sched = body[plan]["schedule"].as_array().unwrap();
        assert!(sched.last().unwrap().as_f64().unwrap().abs() < 0.01);
    }

    let bad = r#"{"extra_payment": 0, "debts": [
        {"name": "Paylater", "balance": 12000000, "annual_rate": 0.36,
         "rate_kind": "effective", "tenor_months": 0, "min_payment": 100000}]}"#;
    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/debt-payoff/comparison")
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
        .contains("min_payment"));
}

/// Debt-payoff page shares the Indonesian canonical like the calculators.
#[tokio::test]
async fn debt_payoff_page_meta() {
    let app = beruang_gateway::routes::create_router();
    for uri in ["/kalkulator/lunas-utang"] {
        let response = app
            .clone()
            .oneshot(Request::builder().uri(uri).body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK, "{uri}");
        let body = response_body_text(response).await;
        assert!(
            body.contains(
                "<title>Perencana Pelunasan Utang: Avalanche vs Snowball — Beruang</title>"
            ),
            "{uri}"
        );
        assert!(
            body.contains(
                "<link rel=\"canonical\" href=\"http://localhost:8000/kalkulator/lunas-utang\">"
            ),
            "{uri}"
        );
    }
}

/// English debt-payoff alias serves English copy under the same canonical.
#[tokio::test]
async fn debt_payoff_english_alias_meta() {
    let app = beruang_gateway::routes::create_router();
    let response = app
        .oneshot(
            Request::builder()
                .uri("/calculators/debt-payoff")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let body = response_body_text(response).await;
    assert!(body.contains("<title>Debt Payoff Planner: Avalanche vs Snowball — Beruang</title>"));
    assert!(body.contains(
        "<link rel=\"canonical\" href=\"http://localhost:8000/kalkulator/lunas-utang\">"
    ));
}

/// Retirement plan: the typical case needs ~Rp11M/mo for a ~Rp6.6B fund;
/// bad input keeps 422 shape; schedule tracks to the target.
#[tokio::test]
async fn retirement_comparison_matches_model() {
    let app = beruang_gateway::routes::create_router();
    let payload = serde_json::json!({
        "years_to_retire": 20.0, "monthly_need_today": 10000000.0,
        "inflation_annual": 0.04, "invest_return_annual": 0.08,
        "current_savings": 100000000.0, "withdrawal_rate": 0.04,
        "current_monthly_invest": 2000000.0,
    })
    .to_string();
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/retirement/comparison")
                .header("content-type", "application/json")
                .body(Body::from(payload))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let body = response_body_json(response).await;
    assert!(body["target_fund"].as_f64().unwrap() > 6_000_000_000.0);
    assert!(body["required_monthly"].as_f64().unwrap() > 10_000_000.0);
    assert!(body["funded_ratio"].as_f64().unwrap() < 1.0);
    assert_eq!(body["sensitivity"].as_array().unwrap().len(), 5);
    let schedule = body["schedule"].as_array().unwrap();
    assert_eq!(schedule.len(), 21);
    assert_eq!(schedule[0]["fund_value"].as_f64().unwrap(), 100_000_000.0);

    let bad = r#"{"years_to_retire": 20, "monthly_need_today": 10000000,
        "inflation_annual": 0.04, "invest_return_annual": 0.08,
        "current_savings": 100000000, "withdrawal_rate": 0.0}"#;
    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/retirement/comparison")
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
        .contains("withdrawal_rate"));
}

/// Retirement page shares the Indonesian canonical like the calculators.
#[tokio::test]
async fn retirement_page_meta() {
    let app = beruang_gateway::routes::create_router();
    for uri in ["/kalkulator/dana-pensiun"] {
        let response = app
            .clone()
            .oneshot(Request::builder().uri(uri).body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK, "{uri}");
        let body = response_body_text(response).await;
        assert!(
            body.contains("<title>Kalkulator Target Dana Pensiun — Beruang</title>"),
            "{uri}"
        );
        assert!(
            body.contains(
                "<link rel=\"canonical\" href=\"http://localhost:8000/kalkulator/dana-pensiun\">"
            ),
            "{uri}"
        );
    }
}

/// English retirement alias serves English copy under the same canonical.
#[tokio::test]
async fn retirement_english_alias_meta() {
    let app = beruang_gateway::routes::create_router();
    let response = app
        .oneshot(
            Request::builder()
                .uri("/calculators/retirement")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let body = response_body_text(response).await;
    assert!(body.contains("<title>Retirement Target Calculator — Beruang</title>"));
    assert!(body.contains(
        "<link rel=\"canonical\" href=\"http://localhost:8000/kalkulator/dana-pensiun\">"
    ));
}

/// Legacy short URLs 301 to their Indonesian-first canonicals, keeping
/// query strings (share links) across the redirect.
#[tokio::test]
async fn legacy_short_urls_redirect_to_canonical() {
    let app = beruang_gateway::routes::create_router();
    for (short, canonical) in [
        ("/flat-loan", "/kalkulator/bunga-flat"),
        ("/debt-payoff", "/kalkulator/lunas-utang"),
        ("/retirement", "/kalkulator/dana-pensiun"),
        ("/rent-vs-buy", "/kalkulator/sewa-vs-beli"),
        ("/ev", "/kalkulator/mobil-listrik"),
        ("/overview", "/portofolio"),
    ] {
        let response = app
            .clone()
            .oneshot(Request::builder().uri(short).body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::MOVED_PERMANENTLY, "{short}");
        assert_eq!(
            response.headers()["location"].to_str().unwrap(),
            canonical,
            "{short}"
        );
    }
    let response = app
        .oneshot(
            Request::builder()
                .uri("/flat-loan?s=abc123")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::MOVED_PERMANENTLY);
    assert_eq!(
        response.headers()["location"].to_str().unwrap(),
        "/kalkulator/bunga-flat?s=abc123"
    );
}

/// Trailing slashes serve the same route meta as the clean path.
#[tokio::test]
async fn trailing_slash_serves_route_meta() {
    let app = beruang_gateway::routes::create_router();
    let response = app
        .oneshot(
            Request::builder()
                .uri("/kalkulator/saham/")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let body = response_body_text(response).await;
    assert!(body.contains("<title>Kalkulator Saham dan Dividen — Beruang</title>"));
    assert!(
        body.contains("<link rel=\"canonical\" href=\"http://localhost:8000/kalkulator/saham\">")
    );
}

/// English aliases label the document locale as English.
#[tokio::test]
async fn english_alias_labels_english_locale() {
    let app = beruang_gateway::routes::create_router();
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/calculators/flat-rate-loan")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let body = response_body_text(response).await;
    assert!(body.contains("<html lang=\"en\">"), "lang");
    assert!(
        body.contains("property=\"og:locale\" content=\"en_US\""),
        "og:locale"
    );

    let response = app
        .oneshot(
            Request::builder()
                .uri("/kalkulator/bunga-flat")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    let body = response_body_text(response).await;
    assert!(body.contains("<html lang=\"id\">"), "lang id");
    assert!(
        body.contains("property=\"og:locale\" content=\"id_ID\""),
        "og:locale id"
    );
}

/// Share-link snapshots stay out of the crawl budget; the sitemap lists
/// canonicals only.
#[tokio::test]
async fn robots_and_sitemap_consolidate_crawl() {
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
    assert!(response_body_text(response)
        .await
        .contains("Disallow: /*?s="));

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
    assert!(body.contains("<loc>http://localhost:8000/kalkulator/dana-pensiun</loc>"));
    for short in [
        "<loc>http://localhost:8000/flat-loan</loc>",
        "<loc>http://localhost:8000/debt-payoff</loc>",
        "<loc>http://localhost:8000/retirement</loc>",
        "<loc>http://localhost:8000/rent-vs-buy</loc>",
    ] {
        assert!(!body.contains(short), "short listed: {short}");
    }
}

/// Every calculator serves its own share image; root and unknown pages
/// keep the generic fallback.
#[tokio::test]
async fn per_route_og_images() {
    let app = beruang_gateway::routes::create_router();
    for (uri, image) in [
        ("/kalkulator/saham", "og-saham.png"),
        ("/kalkulator/reksa-dana", "og-reksadana.png"),
        ("/kalkulator/deposito", "og-deposito.png"),
        ("/kalkulator/mobil-listrik", "og-mobil-listrik.png"),
        ("/kalkulator/sewa-vs-beli", "og-sewa-vs-beli.png"),
        ("/kalkulator/bunga-flat", "og-bunga-flat.png"),
        ("/kalkulator/lunas-utang", "og-lunas-utang.png"),
        ("/kalkulator/dana-pensiun", "og-dana-pensiun.png"),
        ("/calculators/debt-payoff", "og-lunas-utang.png"),
        ("/", "og-image.png"),
        ("/some-unknown-page", "og-image.png"),
    ] {
        let response = app
            .clone()
            .oneshot(Request::builder().uri(uri).body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK, "{uri}");
        let body = response_body_text(response).await;
        assert!(
            body.contains(&format!(
                "property=\"og:image\" content=\"http://localhost:8000/{image}\""
            )),
            "{uri} -> {image}"
        );
        // The advertised image itself resolves with immutable caching.
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri(format!("/{image}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK, "{image}");
        assert!(
            response.headers()["cache-control"]
                .to_str()
                .unwrap()
                .contains("immutable"),
            "{image}"
        );
    }
}

static METRICS_INIT: std::sync::Once = std::sync::Once::new();

/// tonggeret's engine is process-global (`OnceLock`); init once for the
/// metrics tests, ignore the already-initialized case.
fn ensure_metrics() {
    METRICS_INIT.call_once(|| {
        let _ = tonggeret::init(tonggeret::Config::default_light());
    });
}

#[tokio::test]
async fn metrics_endpoint_exposes_request_series() {
    ensure_metrics();
    let app = beruang_gateway::routes::create_router();
    // Exercise one route first so the request series exist.
    let probe = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/health")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(probe.status(), StatusCode::OK);

    let response = app
        .oneshot(
            Request::builder()
                .uri("/metrics")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert!(
        response.headers()["content-type"]
            .to_str()
            .unwrap()
            .contains("text/plain"),
        "scrape must use the Prometheus exposition content type"
    );
    let body = response_body_text(response).await;
    assert!(body.contains("http_requests_total"));
    assert!(body.contains("http_request_duration_ms"));
}

#[tokio::test]
async fn calc_error_increments_calc_counter() {
    ensure_metrics();
    let app = beruang_gateway::routes::create_router();
    // Malformed body → 422 through the calc error path.
    let bad = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/ev/comparison")
                .method("POST")
                .body(Body::from("not json"))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(bad.status(), StatusCode::UNPROCESSABLE_ENTITY);

    let response = app
        .oneshot(
            Request::builder()
                .uri("/metrics")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let body = response_body_text(response).await;
    assert!(body.contains("beruang_calc_total"));
}
