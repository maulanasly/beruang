use axum::body::Body;
use axum::extract::OriginalUri;
use axum::http::{header, HeaderMap, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use rust_embed::Embed;
use sha2::{Digest, Sha256};

#[derive(Embed)]
#[folder = "../static/"]
struct Assets;

const INDEX: &str = "index.html";
const VERSION_PLACEHOLDER: &str = "{{APP_VERSION}}";

/// Asset version baked at compile time by `build.rs` (git short SHA).
fn app_version() -> &'static str {
    option_env!("APP_VERSION").unwrap_or(env!("CARGO_PKG_VERSION"))
}

fn etag_for(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    format!("\"{:x}\"", hasher.finalize())
}

/// Long-lived immutable tier: content-hashed-by-release (`?v=` URLs).
/// Query strings never reach here (`OriginalUri::path` excludes them), so
/// `/js/app.js?v=abc` resolves to the same embedded bytes as `/js/app.js`.
fn is_immutable(path: &str) -> bool {
    path.starts_with("js/") || path.starts_with("css/") || path == "favicon.svg"
}

fn cache_control(path: &str) -> &'static str {
    if path == INDEX {
        "no-cache"
    } else if is_immutable(path) {
        "public, max-age=31536000, immutable"
    } else {
        "public, max-age=3600"
    }
}

fn content_type_for(path: &str) -> String {
    let mime = mime_guess::from_path(path)
        .first_or_octet_stream()
        .to_string();
    if mime.starts_with("text/") || mime == "application/javascript" {
        format!("{mime}; charset=utf-8")
    } else {
        mime
    }
}

fn etag_matches(headers: &HeaderMap, etag: &str) -> bool {
    headers
        .get(header::IF_NONE_MATCH)
        .and_then(|v| v.to_str().ok())
        .is_some_and(|v| {
            v.split(',')
                .any(|tag| tag.trim() == etag || tag.trim() == "*")
        })
}

fn serve_bytes(path: &str, bytes: Vec<u8>, headers: &HeaderMap) -> Response {
    let etag = etag_for(&bytes);
    if etag_matches(headers, &etag) {
        return Response::builder()
            .status(StatusCode::NOT_MODIFIED)
            .header(header::ETAG, etag)
            .header(header::CACHE_CONTROL, cache_control(path))
            .body(Body::empty())
            .unwrap_or(StatusCode::INTERNAL_SERVER_ERROR.into_response());
    }
    let content_type = content_type_for(path);
    let mut builder = Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, content_type)
        .header(header::CACHE_CONTROL, cache_control(path));
    if let Ok(value) = HeaderValue::from_str(&etag) {
        builder = builder.header(header::ETAG, value);
    }
    builder
        .body(Body::from(bytes))
        .unwrap_or(StatusCode::INTERNAL_SERVER_ERROR.into_response())
}

fn serve_index(headers: &HeaderMap) -> Response {
    match Assets::get(INDEX) {
        Some(file) => {
            let html =
                String::from_utf8_lossy(&file.data).replace(VERSION_PLACEHOLDER, app_version());
            serve_bytes(INDEX, html.into_bytes(), headers)
        }
        None => StatusCode::NOT_FOUND.into_response(),
    }
}

pub async fn handler(uri: OriginalUri, headers: HeaderMap) -> Result<Response, StatusCode> {
    let path = uri.path().trim_start_matches('/');
    if path.is_empty() {
        return Ok(serve_index(&headers));
    }
    // Don't hijack API routes - let them 404 via routing layer
    if path.starts_with("api/") {
        return Err(StatusCode::NOT_FOUND);
    }
    match Assets::get(path) {
        Some(file) => Ok(serve_bytes(path, file.data.to_vec(), &headers)),
        // SPA fallback serves the version-injected shell, never an API route.
        None => Ok(serve_index(&headers)),
    }
}

#[cfg(test)]
mod tests {
    use super::{app_version, cache_control, content_type_for, etag_for, is_immutable};

    #[test]
    fn cache_tiers_match_spec() {
        assert_eq!(cache_control("index.html"), "no-cache");
        assert_eq!(
            cache_control("js/app.js"),
            "public, max-age=31536000, immutable"
        );
        assert_eq!(
            cache_control("css/styles.css"),
            "public, max-age=31536000, immutable"
        );
        assert_eq!(
            cache_control("favicon.svg"),
            "public, max-age=31536000, immutable"
        );
        assert!(!is_immutable("index.html"));
    }

    #[test]
    fn text_types_carry_charset() {
        assert!(content_type_for("index.html").contains("charset=utf-8"));
        assert!(content_type_for("js/app.js").contains("charset=utf-8"));
        assert!(content_type_for("favicon.svg").contains("svg"));
        assert!(!app_version().is_empty());
    }

    #[test]
    fn etag_is_stable_and_quoted() {
        assert_eq!(etag_for(b"abc"), etag_for(b"abc"));
        assert_ne!(etag_for(b"abc"), etag_for(b"abd"));
        assert!(etag_for(b"abc").starts_with('"'));
    }
}
