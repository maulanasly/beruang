//! Response shapes for market data. Field order mirrors
//! `backend/schemas.py` so the embedded `static/js` client needs no changes.

use chrono::NaiveDate;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct IdxStockItem {
    pub symbol: String,
    pub name: String,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct IdxStockListResponse {
    pub index_name: String,
    pub items: Vec<IdxStockItem>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct IdxStockSearchResponse {
    pub query: String,
    pub items: Vec<IdxStockItem>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct StockQuoteResponse {
    pub symbol: String,
    pub name: String,
    pub price: f64,
    pub currency: String,
    pub dividend_yield: Option<f64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct HistoryPoint {
    pub date: NaiveDate,
    pub close: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct IndexHistoryResponse {
    pub symbol: String,
    pub name: String,
    pub period: String,
    pub points: Vec<HistoryPoint>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct PriceHistoryResponse {
    pub symbol: String,
    pub name: String,
    pub period: String,
    pub currency: String,
    pub dividend_yield: Option<f64>,
    pub points: Vec<HistoryPoint>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct DividendYieldItem {
    pub symbol: String,
    pub name: String,
    pub price: f64,
    pub currency: String,
    pub dividend_yield: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct DividendYieldsResponse {
    pub as_of: NaiveDate,
    pub items: Vec<DividendYieldItem>,
}
