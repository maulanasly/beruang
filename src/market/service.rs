//! Business logic for market data (Yahoo Finance direct). Pure helpers
//! (`normalize_dividend_yield`, search filtering, chart point extraction)
//! are unit-tested against canned payloads.

use std::sync::Arc;
use std::time::Duration;

use chrono::{Local, NaiveDate};

use super::cache::TtlCache;
use super::types::{
    DividendYieldItem, DividendYieldsResponse, HistoryPoint, IdxStockItem, IdxStockListResponse,
    IdxStockSearchResponse, IndexHistoryResponse, PriceHistoryResponse, StockQuoteResponse,
};
use super::yahoo::{YahooClient, YahooError};

/// Errors mirror `backend/main.py`: bad input → 422, Yahoo failure → 502.
#[derive(Debug, Clone, PartialEq)]
pub enum MarketError {
    Validation(String),
    Upstream(String),
}

impl MarketError {
    pub fn status(&self) -> u16 {
        match self {
            Self::Validation(_) => 422,
            Self::Upstream(_) => 502,
        }
    }

    pub fn detail(&self) -> &str {
        match self {
            Self::Validation(message) | Self::Upstream(message) => message,
        }
    }
}

impl std::fmt::Display for MarketError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.detail())
    }
}

impl std::error::Error for MarketError {}

impl From<YahooError> for MarketError {
    fn from(err: YahooError) -> Self {
        Self::Upstream(err.to_string())
    }
}

/// Starter universe, copied from `IDX_KOMPAS100_STARTER` in services.py.
pub const KOMPAS100_STARTER: [(&str, &str); 24] = [
    ("ASII.JK", "Astra International Tbk"),
    ("ADRO.JK", "Alamtri Resources Indonesia Tbk"),
    ("AMMN.JK", "Amman Mineral Internasional Tbk"),
    ("ANTM.JK", "Aneka Tambang Tbk"),
    ("BBCA.JK", "Bank Central Asia Tbk"),
    ("BBNI.JK", "Bank Negara Indonesia (Persero) Tbk"),
    ("BBRI.JK", "Bank Rakyat Indonesia (Persero) Tbk"),
    ("BMRI.JK", "Bank Mandiri (Persero) Tbk"),
    ("BRIS.JK", "Bank Syariah Indonesia Tbk"),
    ("CPIN.JK", "Charoen Pokphand Indonesia Tbk"),
    ("GOTO.JK", "GoTo Gojek Tokopedia Tbk"),
    ("ICBP.JK", "Indofood CBP Sukses Makmur Tbk"),
    ("INDF.JK", "Indofood Sukses Makmur Tbk"),
    ("INKP.JK", "Indah Kiat Pulp & Paper Tbk"),
    ("KLBF.JK", "Kalbe Farma Tbk"),
    ("MDKA.JK", "Merdeka Copper Gold Tbk"),
    ("MEDC.JK", "Medco Energi Internasional Tbk"),
    ("PGAS.JK", "Perusahaan Gas Negara Tbk"),
    ("PTBA.JK", "Bukit Asam Tbk"),
    ("SMGR.JK", "Semen Indonesia (Persero) Tbk"),
    ("TLKM.JK", "Telkom Indonesia (Persero) Tbk"),
    ("TOWR.JK", "Sarana Menara Nusantara Tbk"),
    ("UNTR.JK", "United Tractors Tbk"),
    ("UNVR.JK", "Unilever Indonesia Tbk"),
];

pub const INDEX_OPTIONS: [(&str, &str); 2] =
    [("^JKSE", "IDX Composite (IHSG)"), ("^JKLQ45", "LQ45")];
pub const INDEX_PERIODS: [&str; 6] = ["1mo", "3mo", "6mo", "1y", "2y", "5y"];

/// Port of `_normalize_dividend_yield`: yfinance reports most symbols as a
/// percentage figure (5.58 = 5.58%) but low yields can arrive below 1.0;
/// values >= 0.2 are percentages, below is already a fraction.
pub fn normalize_dividend_yield(raw: Option<f64>) -> Option<f64> {
    let mut value = raw?;
    if !value.is_finite() {
        return None;
    }
    if value >= 0.2 {
        value /= 100.0;
    }
    if value >= 0.0 {
        Some(value)
    } else {
        None
    }
}

fn raw_number(value: &serde_json::Value) -> Option<f64> {
    match value {
        serde_json::Value::Number(n) => n.as_f64(),
        serde_json::Value::Object(map) => map.get("raw").and_then(raw_number),
        _ => None,
    }
}

fn raw_str(value: &serde_json::Value) -> Option<&str> {
    match value {
        serde_json::Value::String(s) => Some(s.as_str()),
        serde_json::Value::Object(map) => map.get("raw").and_then(raw_str),
        _ => None,
    }
}

pub fn kompas100() -> IdxStockListResponse {
    IdxStockListResponse {
        index_name: "Kompas 100 (Starter)".to_string(),
        items: KOMPAS100_STARTER
            .iter()
            .map(|(symbol, name)| IdxStockItem {
                symbol: symbol.to_string(),
                name: name.to_string(),
            })
            .collect(),
    }
}

/// Filter a raw `v1/search` payload to IDX listings (`.JK` suffix or `JKT`
/// exchange), deduped, capped at `limit` — mirrors `search_idx_stocks`.
pub fn filter_search_results(payload: &serde_json::Value, limit: usize) -> Vec<IdxStockItem> {
    let quotes = payload
        .get("quotes")
        .and_then(|q| q.as_array())
        .cloned()
        .unwrap_or_default();
    let mut seen = std::collections::HashSet::new();
    let mut items = Vec::new();
    for quote in quotes {
        let symbol = quote.get("symbol").and_then(|s| s.as_str()).unwrap_or("");
        if symbol.is_empty() || !seen.insert(symbol.to_string()) {
            continue;
        }
        let exchange = quote.get("exchange").and_then(|e| e.as_str()).unwrap_or("");
        if !symbol.ends_with(".JK") && exchange != "JKT" {
            continue;
        }
        let name = quote
            .get("shortname")
            .and_then(|s| s.as_str())
            .or_else(|| quote.get("longname").and_then(|s| s.as_str()))
            .unwrap_or(symbol)
            .to_string();
        items.push(IdxStockItem {
            symbol: symbol.to_string(),
            name,
        });
        if items.len() >= limit.max(1) {
            break;
        }
    }
    items
}

/// Extract sorted daily closes from a `v8/chart` payload. Dates are
/// exchange-local (`gmtoffset`), matching yfinance's tz-aware index dates.
/// Adjusted close wins over raw close: yfinance defaults to
/// `auto_adjust=True`, so its `Close` column is dividend/split-adjusted
/// (shadow-diff caught the raw-vs-adjusted gap on BBCA.JK).
pub fn points_from_chart(payload: &serde_json::Value) -> Result<Vec<HistoryPoint>, MarketError> {
    let result = payload
        .get("chart")
        .and_then(|c| c.get("result"))
        .and_then(|r| r.as_array())
        .and_then(|a| a.first())
        .ok_or_else(|| MarketError::Upstream("No historical data available.".to_string()))?;
    let offset = result
        .get("meta")
        .and_then(|m| m.get("gmtoffset"))
        .and_then(|o| o.as_i64())
        .unwrap_or(0);
    let timestamps: Vec<i64> = result
        .get("timestamp")
        .and_then(|t| t.as_array())
        .map(|arr| arr.iter().filter_map(|v| v.as_i64()).collect())
        .unwrap_or_default();
    let closes: Vec<Option<f64>> = result
        .get("indicators")
        .and_then(|i| i.get("adjclose"))
        .and_then(|a| a.as_array())
        .and_then(|a| a.first())
        .and_then(|q| q.get("adjclose"))
        .and_then(|c| c.as_array())
        .map(|arr| arr.iter().map(|v| v.as_f64()).collect())
        .unwrap_or_default();
    let raw: Vec<Option<f64>> = result
        .get("indicators")
        .and_then(|i| i.get("quote"))
        .and_then(|q| q.as_array())
        .and_then(|a| a.first())
        .and_then(|q| q.get("close"))
        .and_then(|c| c.as_array())
        .map(|arr| arr.iter().map(|v| v.as_f64()).collect())
        .unwrap_or_default();

    let mut points = Vec::new();
    for (i, ts) in timestamps.iter().enumerate() {
        let close = closes
            .get(i)
            .copied()
            .flatten()
            .or_else(|| raw.get(i).copied().flatten());
        let Some(close) = close else { continue };
        if !close.is_finite() {
            continue;
        }
        let Some(date) = chrono::DateTime::from_timestamp(ts + offset, 0) else {
            continue;
        };
        points.push(HistoryPoint {
            date: date.date_naive(),
            close,
        });
    }
    if points.is_empty() {
        return Err(MarketError::Upstream(
            "No historical data available.".to_string(),
        ));
    }
    points.sort_by_key(|a| a.date);
    Ok(points)
}

fn chart_meta(payload: &serde_json::Value) -> serde_json::Value {
    payload
        .get("chart")
        .and_then(|c| c.get("result"))
        .and_then(|r| r.as_array())
        .and_then(|a| a.first())
        .and_then(|r| r.get("meta"))
        .cloned()
        .unwrap_or(serde_json::Value::Null)
}

fn summary_result(payload: &serde_json::Value) -> serde_json::Value {
    payload
        .get("quoteSummary")
        .and_then(|q| q.get("result"))
        .and_then(|r| r.as_array())
        .and_then(|a| a.first())
        .cloned()
        .unwrap_or(serde_json::Value::Null)
}

pub async fn search_idx_stocks(
    client: &YahooClient,
    query: &str,
    limit: usize,
) -> Result<IdxStockSearchResponse, MarketError> {
    let normalized = query.trim();
    if normalized.is_empty() {
        return Err(MarketError::Validation("Query is required.".to_string()));
    }
    let payload = client.search(normalized, limit.max(1) * 4).await?;
    Ok(IdxStockSearchResponse {
        query: normalized.to_string(),
        items: filter_search_results(&payload, limit.clamp(1, 50)),
    })
}

struct Snapshot {
    name: String,
    price: Option<f64>,
    currency: String,
    dividend_yield: Option<f64>,
}

async fn snapshot(client: &YahooClient, symbol: &str) -> Result<Snapshot, MarketError> {
    // Cheap leg first (price/currency, anonymous), summary second (name/yield).
    // Concurrent: independent legs, halves wall time under retry budgets.
    let (chart, summary) = tokio::join!(
        client.chart(symbol, "5d"),
        client.quote_summary(symbol, "price,summaryDetail")
    );

    let meta = chart
        .as_ref()
        .map(chart_meta)
        .unwrap_or(serde_json::Value::Null);
    let mut price = meta.get("regularMarketPrice").and_then(raw_number);
    let mut currency = meta
        .get("currency")
        .and_then(|c| c.as_str())
        .unwrap_or("IDR")
        .to_string();
    let mut name = symbol.to_string();
    let mut dividend_yield = None;

    if let Ok(payload) = &summary {
        let result = summary_result(payload);
        let price_node = result
            .get("price")
            .cloned()
            .unwrap_or(serde_json::Value::Null);
        if let Some(n) = price_node
            .get("shortName")
            .and_then(raw_str)
            .or_else(|| price_node.get("longName").and_then(raw_str))
        {
            name = n.to_string();
        }
        if let Some(c) = price_node.get("currency").and_then(|c| c.as_str()) {
            currency = c.to_string();
        }
        dividend_yield = normalize_dividend_yield(
            result
                .get("summaryDetail")
                .and_then(|s| s.get("dividendYield"))
                .and_then(raw_number),
        );
    }

    if price.is_none() {
        // `history` fallback: last close of a short window (mirrors yfinance
        // `ticker.history(period="1d")` when `fast_info` has no price).
        if let Ok(payload) = &chart {
            if let Ok(points) = points_from_chart(payload) {
                price = points.last().map(|p| p.close);
            }
        }
    }
    // A failed summary degrades name/currency/yield but must not fail the
    // snapshot when the chart leg succeeded — except callers that require a
    // price decide below.
    let _ = summary;
    Ok(Snapshot {
        name,
        price,
        currency,
        dividend_yield,
    })
}

pub async fn latest_quote(
    client: &YahooClient,
    cache: &QuoteCache,
    symbol: &str,
) -> Result<StockQuoteResponse, MarketError> {
    let normalized = symbol.trim().to_uppercase();
    if normalized.is_empty() {
        return Err(MarketError::Validation("Symbol is required.".to_string()));
    }
    if let Some(cached) = cache.get(&normalized) {
        return Ok(cached);
    }
    let snap = snapshot(client, &normalized).await?;
    let Some(price) = snap.price else {
        return Err(MarketError::Upstream(format!(
            "Unable to fetch latest market price for symbol '{normalized}'."
        )));
    };
    let quote = StockQuoteResponse {
        symbol: normalized.clone(),
        name: snap.name,
        price,
        currency: snap.currency,
        dividend_yield: snap.dividend_yield,
    };
    cache.put(normalized, quote.clone());
    Ok(quote)
}

fn check_period(period: &str) -> Result<(), MarketError> {
    if INDEX_PERIODS.contains(&period) {
        Ok(())
    } else {
        Err(MarketError::Validation(format!(
            "Unsupported period '{period}'. Choose from {}.",
            INDEX_PERIODS.join(", ")
        )))
    }
}

pub async fn index_history(
    client: &YahooClient,
    symbol: &str,
    period: &str,
) -> Result<IndexHistoryResponse, MarketError> {
    let normalized = symbol.trim().to_uppercase();
    let name = INDEX_OPTIONS
        .iter()
        .find(|(s, _)| *s == normalized)
        .map(|(_, n)| n.to_string())
        .ok_or_else(|| {
            MarketError::Validation(format!(
                "Unsupported index '{symbol}'. Choose from {}.",
                INDEX_OPTIONS
                    .iter()
                    .map(|(s, _)| *s)
                    .collect::<Vec<_>>()
                    .join(", ")
            ))
        })?;
    check_period(period)?;
    let payload = client.chart(&normalized, period).await?;
    Ok(IndexHistoryResponse {
        symbol: normalized,
        name,
        period: period.to_string(),
        points: points_from_chart(&payload)?,
    })
}

pub async fn price_history(
    client: &YahooClient,
    symbol: &str,
    period: &str,
) -> Result<PriceHistoryResponse, MarketError> {
    let normalized = symbol.trim().to_uppercase();
    if normalized.is_empty() {
        return Err(MarketError::Validation("Symbol is required.".to_string()));
    }
    check_period(period)?;
    let payload = client.chart(&normalized, period).await?;
    let points = points_from_chart(&payload)?;
    // Name/currency/yield enrich the response; a summary outage degrades to
    // defaults rather than failing the history the chart already provided.
    let mut name = normalized.clone();
    let mut currency = "IDR".to_string();
    let mut dividend_yield = None;
    if let Ok(summary) = client
        .quote_summary(&normalized, "price,summaryDetail")
        .await
    {
        let result = summary_result(&summary);
        let price_node = result
            .get("price")
            .cloned()
            .unwrap_or(serde_json::Value::Null);
        if let Some(n) = price_node
            .get("shortName")
            .and_then(raw_str)
            .or_else(|| price_node.get("longName").and_then(raw_str))
        {
            name = n.to_string();
        }
        if let Some(c) = price_node.get("currency").and_then(|c| c.as_str()) {
            currency = c.to_string();
        }
        dividend_yield = normalize_dividend_yield(
            result
                .get("summaryDetail")
                .and_then(|s| s.get("dividendYield"))
                .and_then(raw_number),
        );
    }
    Ok(PriceHistoryResponse {
        symbol: normalized,
        name,
        period: period.to_string(),
        currency,
        dividend_yield,
        points,
    })
}

/// Shared yields cache (6h TTL, like `_ttl_cache(ttl_seconds=21600)`).
pub type YieldsCache = Arc<TtlCache<DividendYieldsResponse>>;

pub fn yields_cache() -> YieldsCache {
    Arc::new(TtlCache::new(Duration::from_secs(6 * 3600)))
}

/// Short quote cache (90s): collapses repeat fetches, double-clicks and
/// "sync all" bursts into one Yahoo round-trip per symbol. Prices move
/// intraday, so the TTL stays short on purpose.
pub type QuoteCache = Arc<TtlCache<StockQuoteResponse>>;

pub fn quote_cache() -> QuoteCache {
    Arc::new(TtlCache::new(Duration::from_secs(90)))
}

async fn yield_snapshot(client: &YahooClient, symbol: &str) -> Option<DividendYieldItem> {
    let snap = snapshot(client, symbol).await.ok()?;
    let (Some(price), Some(yield_value)) = (snap.price, snap.dividend_yield) else {
        return None;
    };
    if yield_value <= 0.0 {
        return None;
    }
    Some(DividendYieldItem {
        symbol: symbol.to_string(),
        name: snap.name,
        price,
        currency: snap.currency,
        dividend_yield: yield_value,
    })
}

pub async fn top_dividend_yields(
    client: &YahooClient,
    cache: &YieldsCache,
    limit: usize,
) -> Result<DividendYieldsResponse, MarketError> {
    let limit = limit.clamp(1, 30);
    let key = format!("yields:{limit}");
    if let Some(cached) = cache.get(&key) {
        return Ok(cached);
    }
    let mut set = tokio::task::JoinSet::new();
    for (symbol, _name) in KOMPAS100_STARTER {
        let client = client.clone();
        let symbol = symbol.to_string();
        set.spawn(async move { yield_snapshot(&client, &symbol).await });
    }
    let mut results = Vec::new();
    while let Some(item) = set.join_next().await {
        if let Ok(Some(entry)) = item {
            results.push(entry);
        }
    }
    results.sort_by(|a, b| {
        b.dividend_yield
            .partial_cmp(&a.dividend_yield)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    results.truncate(limit);
    let response = DividendYieldsResponse {
        as_of: Local::now().date_naive(),
        items: results,
    };
    cache.put(key, response.clone());
    Ok(response)
}

pub fn today() -> NaiveDate {
    Local::now().date_naive()
}

#[cfg(test)]
mod tests {
    use super::{
        filter_search_results, normalize_dividend_yield, points_from_chart, INDEX_PERIODS,
    };

    #[test]
    fn yield_normalization_matches_oracle() {
        // Percentage-style values divide by 100; sub-0.2 stays fractional.
        assert_eq!(normalize_dividend_yield(Some(5.58)), Some(0.0558));
        assert_eq!(normalize_dividend_yield(Some(0.0602)), Some(0.0602));
        assert_eq!(normalize_dividend_yield(Some(0.2)), Some(0.002));
        assert_eq!(normalize_dividend_yield(Some(0.0)), Some(0.0));
        assert_eq!(normalize_dividend_yield(None), None);
        assert_eq!(normalize_dividend_yield(Some(-1.0)), None);
        assert_eq!(normalize_dividend_yield(Some(f64::NAN)), None);
    }

    #[test]
    fn search_filter_keeps_idx_only() {
        let payload = serde_json::json!({
            "quotes": [
                {"symbol": "BAC", "exchange": "NYQ", "shortname": "Bank of America"},
                {"symbol": "BBCA.JK", "exchange": "JKT", "shortname": "Bank Central Asia Tbk"},
                {"symbol": "BBCA.JK", "exchange": "JKT", "shortname": "dup"},
                {"symbol": "FOO", "exchange": "JKT", "longname": "Foo JKT"},
                {"symbol": "", "exchange": "JKT"},
            ]
        });
        let items = filter_search_results(&payload, 10);
        let symbols: Vec<_> = items.iter().map(|i| i.symbol.as_str()).collect();
        assert_eq!(symbols, vec!["BBCA.JK", "FOO"]);
        assert_eq!(items[0].name, "Bank Central Asia Tbk");
        assert_eq!(items[1].name, "Foo JKT");
    }

    #[test]
    fn chart_points_skip_nulls_and_use_exchange_date() {
        let payload = serde_json::json!({
            "chart": {"result": [{
                "meta": {"gmtoffset": 25200, "currency": "IDR"},
                "timestamp": [1789000000, 1789086400, 1789172800],
                "indicators": {
                    "quote": [{"close": [6300.0, null, 6325.0]}],
                    "adjclose": [{"adjclose": [6300.0, 6310.0, 6325.0]}]
                }
            }]}
        });
        let points = points_from_chart(&payload).unwrap();
        // Null close falls back to adjclose; dates are WIB-local.
        assert_eq!(points.len(), 3);
        assert_eq!(points[1].close, 6310.0);
        assert!(points.windows(2).all(|w| w[0].date <= w[1].date));
        assert!(INDEX_PERIODS.contains(&"1y"));
    }

    #[test]
    fn chart_prefers_adjusted_close() {
        // yfinance auto_adjust=True: adjusted (fractional) wins over raw.
        let payload = serde_json::json!({
            "chart": {"result": [{
                "meta": {"gmtoffset": 25200},
                "timestamp": [1789000000],
                "indicators": {
                    "quote": [{"close": [6300.0]}],
                    "adjclose": [{"adjclose": [6275.67578125]}]
                }
            }]}
        });
        let points = points_from_chart(&payload).unwrap();
        assert_eq!(points.len(), 1);
        assert_eq!(points[0].close, 6275.67578125);
    }

    #[test]
    fn chart_without_data_is_upstream() {
        let payload = serde_json::json!({"chart": {"result": null}});
        assert!(points_from_chart(&payload).is_err());
    }
}
