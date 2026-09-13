//! Native `*/returns` handlers with proxy fallback.
//!
//! Topology during migration: `CALC_RETURNS_MODE=native` (default, parity
//! green) serves calculations in-process; `=proxy` forwards to the Python
//! calc sidecar verbatim (rollback path, one env flip, no redeploy).
//! `/api/v1/market-data/*` always proxies until the Rust market module
//! passes the shadow-diff stability bar.

use axum::extract::Request;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use chrono::Local;

use super::super::calc::{
    mutual_fund_returns, stock_returns, term_deposit_returns, CalcError, MutualFundEntry,
    StockEntry, TermDepositEntry,
};
use super::proxy;

/// Anything other than an explicit `proxy` value serves natively.
pub(crate) fn returns_mode() -> String {
    std::env::var("CALC_RETURNS_MODE").unwrap_or_else(|_| "native".to_string())
}

fn is_proxy_mode() -> bool {
    returns_mode() == "proxy"
}

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

async fn read_json(req: Request) -> Result<serde_json::Value, Response> {
    let bytes = axum::body::to_bytes(req.into_body(), 5 * 1024 * 1024)
        .await
        .map_err(|_| unprocessable("Invalid body".to_string()))?;
    serde_json::from_slice(&bytes).map_err(|e| unprocessable(format!("Invalid JSON: {e}")))
}

fn parse_entries<T>(value: &serde_json::Value) -> Result<Vec<T>, String>
where
    T: serde::de::DeserializeOwned,
{
    match value.get("entries") {
        Some(entries) => {
            serde_json::from_value(entries.clone()).map_err(|e| format!("Invalid entries: {e}"))
        }
        None => Err("Missing 'entries'.".to_string()),
    }
}

pub async fn mutual_funds(req: Request) -> Response {
    if is_proxy_mode() {
        return super::proxy::handler(req).await;
    }
    let uri = req.uri().clone();
    let body = match read_json(req).await {
        Ok(body) => body,
        Err(resp) => return resp,
    };
    let entries: Vec<MutualFundEntry> = match parse_entries(&body) {
        Ok(entries) => entries,
        Err(message) => return unprocessable(message),
    };
    match mutual_fund_returns(entries) {
        Ok(returns) => axum::Json(returns).into_response(),
        Err(err) => {
            tracing::warn!(path = uri.path(), detail = err.detail(), "native calc 422");
            calc_error_response(err)
        }
    }
}

pub async fn stocks(req: Request) -> Response {
    if is_proxy_mode() {
        return proxy::handler(req).await;
    }
    let uri = req.uri().clone();
    let body = match read_json(req).await {
        Ok(body) => body,
        Err(resp) => return resp,
    };
    let entries: Vec<StockEntry> = match parse_entries(&body) {
        Ok(entries) => entries,
        Err(message) => return unprocessable(message),
    };
    match stock_returns(entries) {
        Ok(returns) => axum::Json(returns).into_response(),
        Err(err) => {
            tracing::warn!(path = uri.path(), detail = err.detail(), "native calc 422");
            calc_error_response(err)
        }
    }
}

pub async fn term_deposits(req: Request) -> Response {
    if is_proxy_mode() {
        return proxy::handler(req).await;
    }
    let uri = req.uri().clone();
    let body = match read_json(req).await {
        Ok(body) => body,
        Err(resp) => return resp,
    };
    let apy: f64 = match body.get("apy").and_then(|v| v.as_f64()) {
        Some(apy) => apy,
        None => return unprocessable("Missing or invalid 'apy'.".to_string()),
    };
    let entries: Vec<TermDepositEntry> = match parse_entries(&body) {
        Ok(entries) => entries,
        Err(message) => return unprocessable(message),
    };
    // `logic.term_deposit_metrics` defaults `reference_date` to today;
    // system-local date matches `date.today()`.
    let reference = Local::now().date_naive();
    match term_deposit_returns(apy, entries, reference) {
        Ok(returns) => axum::Json(returns).into_response(),
        Err(err) => {
            tracing::warn!(path = uri.path(), detail = err.detail(), "native calc 422");
            calc_error_response(err)
        }
    }
}
