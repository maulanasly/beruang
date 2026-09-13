use axum::body::Body;
use axum::extract::Request;
use axum::http::{HeaderName, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};

use super::super::errors::AppError;

fn calc_base() -> String {
    std::env::var("CALC_BASE_URL").unwrap_or_else(|_| "http://127.0.0.1:8001".to_string())
}

pub(crate) fn build_target(base: &str, path: &str, query: Option<&str>) -> String {
    match query {
        Some(q) => format!("{}{}?{q}", base.trim_end_matches('/'), path),
        None => format!("{}{}", base.trim_end_matches('/'), path),
    }
}

/// 10s for `*/returns`, 25s for everything else (incl. `/market-data/*`).
pub(crate) fn timeout_for_path(path: &str) -> u64 {
    if path.contains("/returns") {
        10
    } else {
        25
    }
}

pub async fn handler(req: Request) -> Response {
    let method = req.method().clone();
    let path = req.uri().path().to_string();
    let query = req.uri().query().map(|q| q.to_string());
    let target = build_target(&calc_base(), &path, query.as_deref());

    let client = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(timeout_for_path(&path)))
        .build()
    {
        Ok(c) => c,
        Err(e) => return AppError::BadGateway(e.to_string()).into_response(),
    };

    let mut builder = client.request(method.clone(), &target);

    // Forward JSON-relevant request headers verbatim.
    for header in [axum::http::header::CONTENT_TYPE, axum::http::header::ACCEPT] {
        if let Some(value) = req.headers().get(&header) {
            if let Ok(v) = value.to_str() {
                let name = if header == axum::http::header::CONTENT_TYPE {
                    reqwest::header::CONTENT_TYPE
                } else {
                    reqwest::header::ACCEPT
                };
                builder = builder.header(name, v);
            }
        }
    }

    let bytes = match axum::body::to_bytes(req.into_body(), 5 * 1024 * 1024).await {
        Ok(b) => b,
        Err(_) => return AppError::BadRequest("Invalid body".to_string()).into_response(),
    };
    if !bytes.is_empty() {
        builder = builder.body(bytes.to_vec());
    }

    let upstream_started = std::time::Instant::now();
    let upstream = match builder.send().await {
        Ok(r) => r,
        Err(e) if e.is_timeout() => return AppError::Timeout.into_response(),
        Err(e) => return AppError::BadGateway(e.to_string()).into_response(),
    };

    let status =
        StatusCode::from_u16(upstream.status().as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);
    let mut resp_builder = Response::builder().status(status);

    // Pass through content-type verbatim so 422/502 JSON shapes stay identical.
    if let Some(ct) = upstream.headers().get(reqwest::header::CONTENT_TYPE) {
        if let Ok(v) = HeaderValue::from_str(ct.to_str().unwrap_or("application/json")) {
            resp_builder = resp_builder.header(HeaderName::from_static("content-type"), v);
        }
    }

    let body_bytes = upstream.bytes().await.unwrap_or_default();
    // Shadow-diff: market-data responses are compared against the native
    // implementation detached — the client never waits for it.
    if super::super::shadow::classify(&path).is_some() {
        super::super::shadow::spawn_compare(
            path.clone(),
            query.clone(),
            status.as_u16(),
            body_bytes.to_vec(),
            upstream_started.elapsed().as_millis(),
        );
    }
    resp_builder
        .body(Body::from(body_bytes.to_vec()))
        .unwrap_or(AppError::BadGateway("Proxy error".to_string()).into_response())
}

#[cfg(test)]
mod tests {
    use super::{build_target, timeout_for_path};

    #[test]
    fn target_preserves_path_and_query() {
        assert_eq!(
            build_target("http://127.0.0.1:8001/", "/api/v1/stocks/returns", None),
            "http://127.0.0.1:8001/api/v1/stocks/returns"
        );
        assert_eq!(
            build_target(
                "http://calc:8001",
                "/api/v1/market-data/quote",
                Some("symbol=BBCA.JK")
            ),
            "http://calc:8001/api/v1/market-data/quote?symbol=BBCA.JK"
        );
    }

    #[test]
    fn timeouts_match_spec() {
        assert_eq!(timeout_for_path("/api/v1/stocks/returns"), 10);
        assert_eq!(timeout_for_path("/api/v1/market-data/quote"), 25);
        assert_eq!(timeout_for_path("/health"), 25);
    }
}
