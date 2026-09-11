use axum::extract::OriginalUri;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use rust_embed::Embed;

#[derive(Embed)]
#[folder = "../static/"]
struct Assets;

pub async fn handler(uri: OriginalUri) -> Result<Response, StatusCode> {
    let path = uri.path().trim_start_matches('/');
    if path.is_empty() {
        return match Assets::get("index.html") {
            Some(c) => {
                Ok(([(axum::http::header::CONTENT_TYPE, "text/html")], c.data).into_response())
            }
            None => Err(StatusCode::NOT_FOUND),
        };
    }
    // Don't hijack API routes - let them 404 via routing layer
    if path.starts_with("api/") {
        return Err(StatusCode::NOT_FOUND);
    }
    match Assets::get(path) {
        Some(c) => {
            let mime = mime_guess::from_path(path)
                .first_or_octet_stream()
                .to_string();
            Ok(([(axum::http::header::CONTENT_TYPE, mime)], c.data).into_response())
        }
        None => match Assets::get("index.html") {
            Some(c) => {
                Ok(([(axum::http::header::CONTENT_TYPE, "text/html")], c.data).into_response())
            }
            None => Err(StatusCode::NOT_FOUND),
        },
    }
}
