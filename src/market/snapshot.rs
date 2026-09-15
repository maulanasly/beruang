//! Daily market-data snapshot: the degraded tier when Yahoo edge
//! rate-limits the server (see `yahoo.rs` throttle discipline).
//!
//! Schema (v1, `static/data/snapshot.json`, pretty-printed):
//! ```json
//! {
//!   "version": 1,
//!   "as_of": "2026-09-14",
//!   "quotes": { "BBCA.JK": { "symbol": "BBCA.JK", "name": "…", "price": 6325.0, "currency": "IDR", "dividend_yield": 0.0602 } },
//!   "histories": { "BBCA.JK": [ { "date": "2025-09-14", "close": 5900.0 } ] },
//!   "indexes": { "^JKSE": [ { "date": "…", "close": 6950.0 } ] }
//! }
//! ```
//!
//! Produced by `src/bin/snapshot.rs` (daily cron, `make snapshot`),
//! consumed by the fallback paths in `service.rs`. Missing symbols or an
//! unreadable file simply mean "no fallback for that lookup" — never an
//! error by itself.

use std::collections::HashMap;

use chrono::NaiveDate;
use serde::{Deserialize, Serialize};

use super::types::{HistoryPoint, StockQuoteResponse};

pub const SNAPSHOT_VERSION: u32 = 1;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SnapshotFile {
    pub version: u32,
    pub as_of: NaiveDate,
    #[serde(default)]
    pub quotes: HashMap<String, StockQuoteResponse>,
    #[serde(default)]
    pub histories: HashMap<String, Vec<HistoryPoint>>,
    #[serde(default)]
    pub indexes: HashMap<String, Vec<HistoryPoint>>,
}

impl SnapshotFile {
    pub fn parse(text: &str) -> Option<Self> {
        let file: Self = serde_json::from_str(text).ok()?;
        if file.version != SNAPSHOT_VERSION {
            return None;
        }
        Some(file)
    }

    pub fn quote(&self, symbol: &str) -> Option<&StockQuoteResponse> {
        self.quotes.get(symbol)
    }

    pub fn history(&self, symbol: &str) -> Option<&Vec<HistoryPoint>> {
        self.histories.get(symbol)
    }

    pub fn index(&self, symbol: &str) -> Option<&Vec<HistoryPoint>> {
        self.indexes.get(symbol)
    }
}

#[cfg(test)]
mod tests {
    use super::SnapshotFile;

    const CANNED: &str = r#"{
        "version": 1,
        "as_of": "2026-09-12",
        "quotes": {
            "BBCA.JK": { "symbol": "BBCA.JK", "name": "Bank Central Asia Tbk", "price": 6325.0, "currency": "IDR", "dividend_yield": 0.0602 }
        },
        "histories": {
            "BBCA.JK": [ { "date": "2026-09-11", "close": 6300.0 }, { "date": "2026-09-12", "close": 6325.0 } ]
        },
        "indexes": {
            "^JKSE": [ { "date": "2026-09-12", "close": 6950.5 } ]
        }
    }"#;

    #[test]
    fn parses_canned_snapshot() {
        let file = SnapshotFile::parse(CANNED).expect("canned snapshot parses");
        assert_eq!(file.as_of.to_string(), "2026-09-12");
        let quote = file.quote("BBCA.JK").expect("quote present");
        assert_eq!(quote.price, 6325.0);
        assert_eq!(quote.currency, "IDR");
        assert_eq!(file.history("BBCA.JK").expect("history").len(), 2);
        assert_eq!(file.index("^JKSE").expect("index").len(), 1);
        assert!(file.quote("NOPE.JK").is_none());
    }

    #[test]
    fn rejects_wrong_version_and_garbage() {
        assert!(SnapshotFile::parse(r#"{"version": 2, "as_of": "2026-09-12"}"#).is_none());
        assert!(SnapshotFile::parse("not json").is_none());
        assert!(SnapshotFile::parse("{}").is_none());
    }
}
