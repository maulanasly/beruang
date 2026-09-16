//! Native rent-vs-buy comparison handler (`POST /api/v1/rent-vs-buy/comparison`).
//! Same `{"detail"}` error shape as the returns handlers.

use axum::extract::Request;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};

use super::super::calc::{rent_buy_comparison, CalcError, RentBuyInput};

fn unprocessable(message: String) -> Response {
    (
        StatusCode::UNPROCESSABLE_ENTITY,
        axum::Json(serde_json::json!({ "detail": message })),
    )
        .into_response()
}

fn calc_error_response(err: CalcError) -> Response {
    let status = StatusCode::from_u16(err.status()).unwrap_or(StatusCode::UNPROCESSABLE_ENTITY);
    (
        status,
        axum::Json(serde_json::json!({ "detail": err.detail() })),
    )
        .into_response()
}

pub async fn comparison(req: Request) -> Response {
    const PATH: &str = "/api/v1/rent-vs-buy/comparison";
    let bytes = match axum::body::to_bytes(req.into_body(), 5 * 1024 * 1024).await {
        Ok(b) => b,
        Err(_) => return unprocessable("Invalid body".to_string()),
    };
    let value: serde_json::Value = match serde_json::from_slice(&bytes) {
        Ok(v) => v,
        Err(e) => return unprocessable(format!("Invalid JSON: {e}")),
    };
    let input: RentBuyInput = match serde_json::from_value(value) {
        Ok(v) => v,
        Err(e) => return unprocessable(format!("Invalid input: {e}")),
    };
    match rent_buy_comparison(&input) {
        Ok(out) => axum::Json(out).into_response(),
        Err(err) => {
            tracing::warn!(path = PATH, detail = err.detail(), "rent-buy 422");
            calc_error_response(err)
        }
    }
}
