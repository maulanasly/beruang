//! Native `*/returns` handlers (in-process calc core, parity-guarded).

use axum::extract::Request;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use chrono::Local;

use super::super::calc::{
    mutual_fund_returns, stock_returns, term_deposit_returns, CalcError, MutualFundEntry,
    StockEntry, TermDepositEntry,
};

fn unprocessable(message: String) -> Response {
    (
        StatusCode::UNPROCESSABLE_ENTITY,
        axum::Json(serde_json::json!({ "detail": message })),
    )
        .into_response()
}

fn calc_error_response(path: &str, err: CalcError) -> Response {
    tracing::warn!(path, detail = err.detail(), "calc 422");
    let status = StatusCode::from_u16(err.status()).unwrap_or(StatusCode::UNPROCESSABLE_ENTITY);
    (
        status,
        axum::Json(serde_json::json!({ "detail": err.detail() })),
    )
        .into_response()
}

async fn read_json(req: Request) -> Result<serde_json::Value, Box<Response>> {
    let bytes = axum::body::to_bytes(req.into_body(), 5 * 1024 * 1024)
        .await
        .map_err(|_| Box::new(unprocessable("Invalid body".to_string())))?;
    serde_json::from_slice(&bytes)
        .map_err(|e| Box::new(unprocessable(format!("Invalid JSON: {e}"))))
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
    const CALC: &str = "mutual-funds";
    let body = match read_json(req).await {
        Ok(body) => body,
        Err(resp) => {
            crate::metrics::record_calc(CALC, "error");
            return *resp;
        }
    };
    let entries: Vec<MutualFundEntry> = match parse_entries(&body) {
        Ok(entries) => entries,
        Err(message) => {
            crate::metrics::record_calc(CALC, "error");
            return unprocessable(message);
        }
    };
    match mutual_fund_returns(entries) {
        Ok(returns) => {
            crate::metrics::record_calc(CALC, "ok");
            axum::Json(returns).into_response()
        }
        Err(err) => {
            crate::metrics::record_calc(CALC, "error");
            calc_error_response("/api/v1/mutual-funds/returns", err)
        }
    }
}

pub async fn stocks(req: Request) -> Response {
    const CALC: &str = "stocks";
    let body = match read_json(req).await {
        Ok(body) => body,
        Err(resp) => {
            crate::metrics::record_calc(CALC, "error");
            return *resp;
        }
    };
    let entries: Vec<StockEntry> = match parse_entries(&body) {
        Ok(entries) => entries,
        Err(message) => {
            crate::metrics::record_calc(CALC, "error");
            return unprocessable(message);
        }
    };
    match stock_returns(entries) {
        Ok(returns) => {
            crate::metrics::record_calc(CALC, "ok");
            axum::Json(returns).into_response()
        }
        Err(err) => {
            crate::metrics::record_calc(CALC, "error");
            calc_error_response("/api/v1/stocks/returns", err)
        }
    }
}

pub async fn term_deposits(req: Request) -> Response {
    const CALC: &str = "term-deposits";
    let body = match read_json(req).await {
        Ok(body) => body,
        Err(resp) => {
            crate::metrics::record_calc(CALC, "error");
            return *resp;
        }
    };
    let apy: f64 = match body.get("apy").and_then(|v| v.as_f64()) {
        Some(apy) => apy,
        None => {
            crate::metrics::record_calc(CALC, "error");
            return unprocessable("Missing or invalid 'apy'.".to_string());
        }
    };
    let entries: Vec<TermDepositEntry> = match parse_entries(&body) {
        Ok(entries) => entries,
        Err(message) => {
            crate::metrics::record_calc(CALC, "error");
            return unprocessable(message);
        }
    };
    // `logic.term_deposit_metrics` defaults `reference_date` to today;
    // system-local date matches `date.today()`.
    let reference = Local::now().date_naive();
    match term_deposit_returns(apy, entries, reference) {
        Ok(returns) => {
            crate::metrics::record_calc(CALC, "ok");
            axum::Json(returns).into_response()
        }
        Err(err) => {
            crate::metrics::record_calc(CALC, "error");
            calc_error_response("/api/v1/term-deposits/returns", err)
        }
    }
}
