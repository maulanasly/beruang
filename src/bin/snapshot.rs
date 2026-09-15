//! Daily snapshot producer: fetches the Kompas100 starter universe +
//! benchmark indexes from Yahoo and writes `static/data/snapshot.json`.
//!
//! Usage: `cargo run --bin snapshot [--out <path>]`
//! (`make snapshot`). Designed for a daily CI cron on rotating runner IPs.
//!
//! Exit codes: 0 = snapshot written (or unchanged content — the workflow
//! decides whether to commit); 1 = too few symbols succeeded, existing file
//! left untouched so a bad Yahoo day never commits partial data.

use std::collections::HashMap;
use std::path::PathBuf;

use beruang_gateway::market::{
    index_history, latest_quote, price_history, quote_cache, IndexHistoryResponse,
    PriceHistoryResponse, StockQuoteResponse, YahooClient, INDEX_OPTIONS, KOMPAS100_STARTER,
    SNAPSHOT_VERSION,
};
use chrono::NaiveDate;

const DEFAULT_OUT: &str = "static/data/snapshot.json";
/// Minimum successful quotes or the snapshot is not worth writing.
const MIN_QUOTES: usize = 20;

#[tokio::main]
async fn main() {
    let args: Vec<String> = std::env::args().collect();
    let out = args
        .iter()
        .position(|a| a == "--out")
        .and_then(|i| args.get(i + 1))
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(DEFAULT_OUT));
    if let Err(message) = run(&out).await {
        eprintln!("snapshot: {message}");
        std::process::exit(1);
    }
}

async fn run(out: &PathBuf) -> Result<(), String> {
    let client = YahooClient::new().map_err(|e| e.to_string())?;
    let quotes_cache = quote_cache();

    // Quotes: concurrent, throttled inside YahooClient (2 permits).
    let mut set = tokio::task::JoinSet::new();
    for (symbol, _name) in KOMPAS100_STARTER {
        let client = client.clone();
        let cache = quotes_cache.clone();
        let symbol = symbol.to_string();
        set.spawn(async move {
            latest_quote(&client, &cache, &symbol)
                .await
                .ok()
                .map(|q: StockQuoteResponse| (symbol, q))
        });
    }
    let mut quotes: HashMap<String, StockQuoteResponse> = HashMap::new();
    while let Some(item) = set.join_next().await {
        if let Ok(Some((symbol, quote))) = item {
            quotes.insert(symbol, quote);
        }
    }
    if quotes.len() < MIN_QUOTES {
        return Err(format!(
            "only {}/{} quotes succeeded — keeping previous snapshot",
            quotes.len(),
            KOMPAS100_STARTER.len()
        ));
    }

    // Histories (1y) for symbols with quotes, plus both benchmark indexes.
    let mut histories = HashMap::new();
    let mut hset = tokio::task::JoinSet::new();
    for symbol in quotes.keys().cloned() {
        let client = client.clone();
        hset.spawn(async move {
            price_history(&client, &symbol, "1y")
                .await
                .ok()
                .map(|h: PriceHistoryResponse| (symbol, h.points))
        });
    }
    while let Some(item) = hset.join_next().await {
        if let Ok(Some((symbol, points))) = item {
            histories.insert(symbol, points);
        }
    }
    let mut indexes = HashMap::new();
    for (symbol, _name) in INDEX_OPTIONS {
        match index_history(&client, symbol, "1y").await {
            Ok(h) => {
                let h: IndexHistoryResponse = h;
                indexes.insert(h.symbol.clone(), h.points);
            }
            Err(e) => return Err(format!("index {symbol} failed: {e}")),
        }
    }

    let as_of: NaiveDate = chrono::Local::now().date_naive();
    let file = serde_json::json!({
        "version": SNAPSHOT_VERSION,
        "as_of": as_of,
        "quotes": quotes,
        "histories": histories,
        "indexes": indexes,
    });
    if let Some(parent) = out.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(
        out,
        serde_json::to_string_pretty(&file).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    println!(
        "snapshot: {} quotes, {} histories, {} indexes -> {}",
        quotes.len(),
        histories.len(),
        indexes.len(),
        out.display()
    );
    Ok(())
}
