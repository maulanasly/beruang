//! Native market-data handlers (Yahoo Finance via `market::`).
//!
//! Error mapping mirrors the old FastAPI layer: bad input → 422,
//! Yahoo outage → 502, overrun of the 25s upstream budget → 504.
//! Shapes stay `{"detail": "<message>"}` so `static/js/api.js` is untouched.

use axum::extract::Query;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde::Deserialize;
use std::future::Future;
use std::sync::OnceLock;
use std::time::Duration;

use super::super::market::{self, MarketError, YahooClient, YieldsCache};

/// 25s budget per market call — matches the old proxy timeout for
/// `/market-data/*`.
const MARKET_TIMEOUT: Duration = Duration::from_secs(25);

static CLIENT: OnceLock<YahooClient> = OnceLock::new();
static YIELDS: OnceLock<YieldsCache> = OnceLock::new();

fn client() -> YahooClient {
    CLIENT
        .get_or_init(|| YahooClient::new().expect("yahoo client"))
        .clone()
}

fn yields_cache() -> YieldsCache {
    YIELDS.get_or_init(market::yields_cache).clone()
}

fn market_error(path: &str, err: MarketError) -> Response {
    tracing::warn!(path, detail = err.detail(), "market error");
    let status = StatusCode::from_u16(err.status()).unwrap_or(StatusCode::BAD_GATEWAY);
    (
        status,
        axum::Json(serde_json::json!({ "detail": err.detail() })),
    )
        .into_response()
}

fn timed_out(path: &str) -> Response {
    tracing::warn!(path, "market data timeout");
    (
        StatusCode::GATEWAY_TIMEOUT,
        axum::Json(serde_json::json!({ "detail": "Market data request timed out." })),
    )
        .into_response()
}

async fn run_with_timeout<T, F>(path: &str, fut: F) -> Response
where
    F: Future<Output = Result<T, MarketError>>,
    T: serde::Serialize,
{
    match tokio::time::timeout(MARKET_TIMEOUT, fut).await {
        Err(_) => timed_out(path),
        Ok(Err(err)) => market_error(path, err),
        Ok(Ok(value)) => axum::Json(value).into_response(),
    }
}

pub async fn kompas100() -> Response {
    axum::Json(market::kompas100()).into_response()
}

#[derive(Debug, Deserialize)]
pub struct LimitQuery {
    pub limit: Option<usize>,
}

pub async fn dividend_yields(Query(params): Query<LimitQuery>) -> Response {
    const PATH: &str = "/api/v1/market-data/idx/dividend-yields";
    let limit = params.limit.unwrap_or(10);
    if !(1..=30).contains(&limit) {
        return market_error(
            PATH,
            MarketError::Validation("limit must be between 1 and 30.".to_string()),
        );
    }
    let client = client();
    let cache = yields_cache();
    run_with_timeout(PATH, market::top_dividend_yields(&client, &cache, limit)).await
}

#[derive(Debug, Deserialize)]
pub struct SearchQuery {
    pub q: Option<String>,
    pub limit: Option<usize>,
}

pub async fn idx_search(Query(params): Query<SearchQuery>) -> Response {
    const PATH: &str = "/api/v1/market-data/idx/search";
    let limit = params.limit.unwrap_or(10);
    if !(1..=50).contains(&limit) {
        return market_error(
            PATH,
            MarketError::Validation("limit must be between 1 and 50.".to_string()),
        );
    }
    let client = client();
    let query = params.q.unwrap_or_default();
    run_with_timeout(PATH, market::search_idx_stocks(&client, &query, limit)).await
}

#[derive(Debug, Deserialize)]
pub struct SymbolQuery {
    pub symbol: Option<String>,
}

pub async fn quote(Query(params): Query<SymbolQuery>) -> Response {
    const PATH: &str = "/api/v1/market-data/quote";
    let client = client();
    let symbol = params.symbol.unwrap_or_default();
    run_with_timeout(PATH, market::latest_quote(&client, &symbol)).await
}

#[derive(Debug, Deserialize)]
pub struct HistoryQuery {
    pub symbol: Option<String>,
    pub period: Option<String>,
}

pub async fn index_history(Query(params): Query<HistoryQuery>) -> Response {
    const PATH: &str = "/api/v1/market-data/index/history";
    let client = client();
    let symbol = params.symbol.unwrap_or_else(|| "^JKSE".to_string());
    let period = params.period.unwrap_or_else(|| "1y".to_string());
    run_with_timeout(PATH, market::index_history(&client, &symbol, &period)).await
}

pub async fn price_history(Query(params): Query<HistoryQuery>) -> Response {
    const PATH: &str = "/api/v1/market-data/price/history";
    let client = client();
    let symbol = params.symbol.unwrap_or_default();
    let period = params.period.unwrap_or_else(|| "1y".to_string());
    run_with_timeout(PATH, market::price_history(&client, &symbol, &period)).await
}
