//! Market-data layer: Yahoo Finance REST (`yahoo`), response shapes
//! (`types`), business logic (`service`), and the yields TTL cache.
//! Served natively by `routes/market.rs` — no sidecar, no proxy.

pub mod cache;
pub mod service;
pub mod types;
pub mod yahoo;

pub use cache::TtlCache;
pub use service::{
    index_history, kompas100, latest_quote, price_history, quote_cache, search_idx_stocks,
    top_dividend_yields, yields_cache, MarketError, QuoteCache, YieldsCache, INDEX_OPTIONS,
    INDEX_PERIODS, KOMPAS100_STARTER,
};
pub use types::{
    DividendYieldItem, DividendYieldsResponse, HistoryPoint, IdxStockItem, IdxStockListResponse,
    IdxStockSearchResponse, IndexHistoryResponse, PriceHistoryResponse, StockQuoteResponse,
};
pub use yahoo::{YahooClient, YahooError};
