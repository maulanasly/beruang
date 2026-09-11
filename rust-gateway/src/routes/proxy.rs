use axum::body::Body;
use axum::extract::Request;
use axum::http::{HeaderName, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};

fn calc_base() -> String {
    std::env::var("CALC_BASE_URL").unwrap_or_else(|_| "http://127.0.0.1:8001".to_string())
}

fn is_returns_path(path: &str) -> bool {
    path.contains("/returns")
}

pub async fn handler(req: Request) -> Response {
    let method = req.method().clone();
    let path = req.uri().path().to_string();
    let query = req
        .uri()
        .query()
        .map(|q| format!("?{q}"))
        .unwrap_or_default();
    let target = format!("{}{}{}", calc_base().trim_end_matches('/'), path, query);

    let timeout_secs = if is_returns_path(&path) { 10 } else { 25 };

    let client = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(timeout_secs))
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            return (
                StatusCode::BAD_GATEWAY,
                axum::Json(serde_json::json!({"detail": e.to_string()})),
            )
                .into_response()
        }
    };

    let mut builder = client.request(method.clone(), &target);

    // forward content-type if present
    if let Some(ct) = req.headers().get(axum::http::header::CONTENT_TYPE) {
        if let Ok(v) = ct.to_str() {
            builder = builder.header(reqwest::header::CONTENT_TYPE, v);
        }
    }

    let bytes = match axum::body::to_bytes(req.into_body(), 5 * 1024 * 1024).await {
        Ok(b) => b,
        Err(_) => {
            return (
                StatusCode::BAD_REQUEST,
                axum::Json(serde_json::json!({"detail": "Invalid body"})),
            )
                .into_response()
        }
    };
    if !bytes.is_empty() {
        builder = builder.body(bytes.to_vec());
    }

    let upstream = match builder.send().await {
        Ok(r) => r,
        Err(e) if e.is_timeout() => {
            return (
                StatusCode::GATEWAY_TIMEOUT,
                axum::Json(serde_json::json!({"detail": "Calc service timeout"})),
            )
                .into_response()
        }
        Err(e) => {
            return (
                StatusCode::BAD_GATEWAY,
                axum::Json(serde_json::json!({"detail": e.to_string()})),
            )
                .into_response()
        }
    };

    let status =
        StatusCode::from_u16(upstream.status().as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);
    let mut resp_builder = Response::builder().status(status);

    // pass through content-type
    if let Some(ct) = upstream.headers().get(reqwest::header::CONTENT_TYPE) {
        if let Ok(v) = HeaderValue::from_str(ct.to_str().unwrap_or("application/json")) {
            resp_builder = resp_builder.header(HeaderName::from_static("content-type"), v);
        }
    }

    let body_bytes = upstream.bytes().await.unwrap_or_default();
    resp_builder
        .body(Body::from(body_bytes.to_vec()))
        .unwrap_or(
            (
                StatusCode::BAD_GATEWAY,
                axum::Json(serde_json::json!({"detail": "Proxy error"})),
            )
                .into_response(),
        )
}
