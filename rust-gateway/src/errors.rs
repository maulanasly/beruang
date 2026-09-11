use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("Bad gateway: {0}")]
    BadGateway(String),
    #[error("Gateway timeout")]
    Timeout,
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, msg) = match self {
            AppError::BadGateway(m) => (StatusCode::BAD_GATEWAY, m),
            AppError::Timeout => (
                StatusCode::GATEWAY_TIMEOUT,
                "Calc service timeout".to_string(),
            ),
        };
        let body = serde_json::json!({ "detail": msg });
        (status, axum::Json(body)).into_response()
    }
}
