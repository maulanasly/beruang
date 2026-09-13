//! Shadow-diff harness: the proxy keeps serving Python (`yfinance`) while
//! these native market implementations run detached and their outputs are
//! compared. One structured JSON event per sampled request on target
//! `shadow_diff` — the `shadow-report` tool aggregates them.
//!
//! Materiality rules (sequential Yahoo calls legitimately disagree):
//! - status mismatch (either side) → always material (availability class);
//!   dual-error with equal status → match (message text not compared).
//! - `kompas100` is a static constant → any body diff is material.
//! - prices: rel-tol 0.2%; yields: rel-tol 1e-4; history closes rel-tol
//!   1e-6 except the trailing point (0.2%); yields/search compared as
//!   order-insensitive sets (order-only drift → minor).

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::OnceLock;
use std::time::Instant;

use crate::market::{MarketError, YahooClient, YieldsCache};

const PRICE_TOL: f64 = 0.002;
const YIELD_TOL: f64 = 1e-4;
const HISTORY_TOL: f64 = 1e-6;
const SHADOW_TIMEOUT_SECS: u64 = 25;

static CLIENT: OnceLock<YahooClient> = OnceLock::new();
static YIELDS: OnceLock<YieldsCache> = OnceLock::new();
static SAMPLE_COUNTER: AtomicU64 = AtomicU64::new(0);

fn client() -> YahooClient {
    CLIENT
        .get_or_init(|| YahooClient::new().expect("shadow Yahoo client"))
        .clone()
}

fn yields_cache() -> YieldsCache {
    YIELDS.get_or_init(crate::market::yields_cache).clone()
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ShadowRoute {
    Kompas100,
    DividendYields,
    IdxSearch,
    Quote,
    IndexHistory,
    PriceHistory,
}

impl ShadowRoute {
    fn name(self) -> &'static str {
        match self {
            Self::Kompas100 => "kompas100",
            Self::DividendYields => "dividend-yields",
            Self::IdxSearch => "search",
            Self::Quote => "quote",
            Self::IndexHistory => "index-history",
            Self::PriceHistory => "price-history",
        }
    }

    fn sample_env(self) -> &'static str {
        match self {
            Self::Kompas100 => "SHADOW_SAMPLE_KOMPAS100",
            Self::DividendYields => "SHADOW_SAMPLE_YIELDS",
            Self::IdxSearch => "SHADOW_SAMPLE_SEARCH",
            Self::Quote => "SHADOW_SAMPLE_QUOTE",
            Self::IndexHistory => "SHADOW_SAMPLE_INDEX_HISTORY",
            Self::PriceHistory => "SHADOW_SAMPLE_PRICE_HISTORY",
        }
    }
}

pub fn classify(path: &str) -> Option<ShadowRoute> {
    if path.contains("/market-data/idx/kompas100") {
        Some(ShadowRoute::Kompas100)
    } else if path.contains("/market-data/idx/dividend-yields") {
        Some(ShadowRoute::DividendYields)
    } else if path.contains("/market-data/idx/search") {
        Some(ShadowRoute::IdxSearch)
    } else if path.contains("/market-data/quote") {
        Some(ShadowRoute::Quote)
    } else if path.contains("/market-data/index/history") {
        Some(ShadowRoute::IndexHistory)
    } else if path.contains("/market-data/price/history") {
        Some(ShadowRoute::PriceHistory)
    } else {
        None
    }
}

pub fn shadow_enabled() -> bool {
    std::env::var("SHADOW_MODE")
        .map(|v| v == "compare")
        .unwrap_or(false)
}

fn sample_rate(route: ShadowRoute) -> f64 {
    std::env::var(route.sample_env())
        .ok()
        .and_then(|v| v.parse().ok())
        .or_else(|| {
            std::env::var("SHADOW_SAMPLE_RATE")
                .ok()
                .and_then(|v| v.parse().ok())
        })
        .unwrap_or(1.0)
}

/// Counter-based sampler (no extra deps): `rate >= 1.0` samples everything.
fn sampled(route: ShadowRoute) -> bool {
    let rate = sample_rate(route).clamp(0.0, 1.0);
    if rate >= 1.0 {
        return true;
    }
    if rate <= 0.0 {
        return false;
    }
    SAMPLE_COUNTER.fetch_add(1, Ordering::Relaxed) % 100 < (rate * 100.0) as u64
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Verdict {
    Match,
    Minor,
    Material,
    ShadowError,
}

impl Verdict {
    fn name(&self) -> &'static str {
        match self {
            Self::Match => "match",
            Self::Minor => "minor",
            Self::Material => "material",
            Self::ShadowError => "shadow_error",
        }
    }

    fn worse(self, other: Self) -> Self {
        use Verdict::{Match, Material, Minor, ShadowError};
        match (self, other) {
            (Material, _) | (_, Material) => Material,
            (ShadowError, _) | (_, ShadowError) => ShadowError,
            (Minor, _) | (_, Minor) => Minor,
            (Match, Match) => Match,
        }
    }
}

#[derive(Debug, Clone)]
pub struct FieldDiff {
    pub path: String,
    pub py: serde_json::Value,
    pub rs: serde_json::Value,
    pub rule: String,
}

fn rel_eq(a: f64, b: f64, tol: f64) -> bool {
    if a == b {
        return true;
    }
    if !a.is_finite() || !b.is_finite() {
        return false;
    }
    (a - b).abs() <= tol * 1.0_f64.max(a.abs()).max(b.abs())
}

fn num(value: &serde_json::Value) -> Option<f64> {
    value.as_f64()
}

fn check_number(
    diffs: &mut Vec<FieldDiff>,
    verdict: &mut Verdict,
    path: &str,
    py: &serde_json::Value,
    rs: &serde_json::Value,
    tol: f64,
    minor: bool,
) {
    let rule = format!("rel_tol_{tol}");
    match (num(py), num(rs)) {
        (Some(a), Some(b)) if rel_eq(a, b, tol) => {}
        _ => {
            diffs.push(FieldDiff {
                path: path.to_string(),
                py: py.clone(),
                rs: rs.clone(),
                rule,
            });
            *verdict = verdict.clone().worse(if minor {
                Verdict::Minor
            } else {
                Verdict::Material
            });
        }
    }
}

fn check_exact(
    diffs: &mut Vec<FieldDiff>,
    verdict: &mut Verdict,
    path: &str,
    py: &serde_json::Value,
    rs: &serde_json::Value,
) {
    if py != rs {
        diffs.push(FieldDiff {
            path: path.to_string(),
            py: py.clone(),
            rs: rs.clone(),
            rule: "exact".to_string(),
        });
        *verdict = verdict.clone().worse(Verdict::Material);
    }
}

fn compare_quote(py: &serde_json::Value, rs: &serde_json::Value) -> (Verdict, Vec<FieldDiff>) {
    let mut verdict = Verdict::Match;
    let mut diffs = Vec::new();
    for key in ["symbol", "currency", "name"] {
        check_exact(&mut diffs, &mut verdict, key, &py[key], &rs[key]);
    }
    check_number(
        &mut diffs,
        &mut verdict,
        "price",
        &py["price"],
        &rs["price"],
        PRICE_TOL,
        false,
    );
    match (&py["dividend_yield"], &rs["dividend_yield"]) {
        (serde_json::Value::Null, serde_json::Value::Null) => {}
        (a, b) if num(a).is_some() && num(b).is_some() => {
            check_number(
                &mut diffs,
                &mut verdict,
                "dividend_yield",
                a,
                b,
                YIELD_TOL,
                false,
            );
        }
        // Null-vs-value yield is a real behavioral breach.
        _ => check_exact(
            &mut diffs,
            &mut verdict,
            "dividend_yield",
            &py["dividend_yield"],
            &rs["dividend_yield"],
        ),
    }
    (verdict, diffs)
}

fn compare_history(py: &serde_json::Value, rs: &serde_json::Value) -> (Verdict, Vec<FieldDiff>) {
    let mut verdict = Verdict::Match;
    let mut diffs = Vec::new();
    for key in ["symbol", "period"] {
        check_exact(&mut diffs, &mut verdict, key, &py[key], &rs[key]);
    }
    let empty = Vec::new();
    let py_pts = py["points"].as_array().unwrap_or(&empty);
    let rs_pts = rs["points"].as_array().unwrap_or(&empty);
    if py_pts.len().abs_diff(rs_pts.len()) > 1 {
        diffs.push(FieldDiff {
            path: "points.len".to_string(),
            py: py_pts.len().into(),
            rs: rs_pts.len().into(),
            rule: "count_pm_1".to_string(),
        });
        verdict = verdict.worse(Verdict::Material);
        return (verdict, diffs);
    }
    let shared = py_pts.len().min(rs_pts.len());
    for (i, (a, b)) in py_pts.iter().zip(rs_pts.iter()).enumerate().take(shared) {
        let last = i + 1 == shared;
        // Trailing-point date may advance between sequential fetches.
        if !last {
            check_exact(
                &mut diffs,
                &mut verdict,
                &format!("points[{i}].date"),
                &a["date"],
                &b["date"],
            );
        }
        let tol = if last { PRICE_TOL } else { HISTORY_TOL };
        check_number(
            &mut diffs,
            &mut verdict,
            &format!("points[{i}].close"),
            &a["close"],
            &b["close"],
            tol,
            last,
        );
    }
    (verdict, diffs)
}

fn compare_yields(py: &serde_json::Value, rs: &serde_json::Value) -> (Verdict, Vec<FieldDiff>) {
    let mut verdict = Verdict::Match;
    let mut diffs = Vec::new();
    check_exact(
        &mut diffs,
        &mut verdict,
        "as_of",
        &py["as_of"],
        &rs["as_of"],
    );
    let empty = Vec::new();
    let py_items = py["items"].as_array().unwrap_or(&empty);
    let rs_items = rs["items"].as_array().unwrap_or(&empty);
    let to_map = |items: &[serde_json::Value]| {
        items
            .iter()
            .filter_map(|it| {
                Some((
                    it.get("symbol")?.as_str()?.to_string(),
                    it.get("dividend_yield").cloned().unwrap_or_default(),
                ))
            })
            .collect::<std::collections::HashMap<_, _>>()
    };
    let py_map = to_map(py_items);
    let rs_map = to_map(rs_items);
    let mut py_syms: Vec<_> = py_map.keys().collect();
    let mut rs_syms: Vec<_> = rs_map.keys().collect();
    py_syms.sort();
    rs_syms.sort();
    if py_syms != rs_syms {
        let py_set: Vec<serde_json::Value> = py_syms
            .iter()
            .map(|s| serde_json::Value::String((*s).clone()))
            .collect();
        let rs_set: Vec<serde_json::Value> = rs_syms
            .iter()
            .map(|s| serde_json::Value::String((*s).clone()))
            .collect();
        diffs.push(FieldDiff {
            path: "items.symbols".to_string(),
            py: py_set.into(),
            rs: rs_set.into(),
            rule: "set_equal".to_string(),
        });
        verdict = verdict.worse(Verdict::Material);
    }
    for symbol in py_map.keys().filter(|s| rs_map.contains_key(*s)) {
        check_number(
            &mut diffs,
            &mut verdict,
            &format!("items[{symbol}].dividend_yield"),
            &py_map[symbol],
            &rs_map[symbol],
            YIELD_TOL,
            false,
        );
    }
    // Same set, different order (or trailing-point-only drift flagged minor
    // above) with no value breach → noise, not signal.
    if verdict == Verdict::Match && py_items.len() == rs_items.len() {
        let py_order: Vec<_> = py_items.iter().filter_map(|it| it.get("symbol")).collect();
        let rs_order: Vec<_> = rs_items.iter().filter_map(|it| it.get("symbol")).collect();
        if py_order != rs_order {
            verdict = Verdict::Minor;
        }
    }
    (verdict, diffs)
}

fn compare_search(py: &serde_json::Value, rs: &serde_json::Value) -> (Verdict, Vec<FieldDiff>) {
    let mut verdict = Verdict::Match;
    let mut diffs = Vec::new();
    let symbols = |v: &serde_json::Value| {
        let mut out: Vec<String> = v["items"]
            .as_array()
            .cloned()
            .unwrap_or_default()
            .iter()
            .filter_map(|it| it.get("symbol")?.as_str().map(str::to_string))
            .collect();
        out.sort();
        out
    };
    // Names track Yahoo editorial data — sets only, names ignored.
    if symbols(py) != symbols(rs) {
        diffs.push(FieldDiff {
            path: "items.symbols".to_string(),
            py: symbols(py).into_iter().collect(),
            rs: symbols(rs).into_iter().collect(),
            rule: "set_equal".to_string(),
        });
        verdict = verdict.worse(Verdict::Material);
    }
    (verdict, diffs)
}

fn compare_bodies(
    route: ShadowRoute,
    py: &serde_json::Value,
    rs: &serde_json::Value,
) -> (Verdict, Vec<FieldDiff>) {
    match route {
        ShadowRoute::Kompas100 => {
            let mut verdict = Verdict::Match;
            let mut diffs = Vec::new();
            if py != rs {
                diffs.push(FieldDiff {
                    path: "$".to_string(),
                    py: py.clone(),
                    rs: rs.clone(),
                    rule: "exact".to_string(),
                });
                verdict = verdict.worse(Verdict::Material);
            }
            (verdict, diffs)
        }
        ShadowRoute::Quote => compare_quote(py, rs),
        ShadowRoute::IndexHistory | ShadowRoute::PriceHistory => compare_history(py, rs),
        ShadowRoute::DividendYields => compare_yields(py, rs),
        ShadowRoute::IdxSearch => compare_search(py, rs),
    }
}

fn parse_query(query: Option<&str>) -> std::collections::HashMap<String, String> {
    let mut out = std::collections::HashMap::new();
    for pair in query.unwrap_or("").split('&') {
        let mut parts = pair.splitn(2, '=');
        if let (Some(k), Some(v)) = (parts.next(), parts.next()) {
            out.insert(
                percent_decode(k).unwrap_or_else(|| k.to_string()),
                percent_decode(v).unwrap_or_else(|| v.to_string()),
            );
        }
    }
    out
}

fn percent_decode(s: &str) -> Option<String> {
    let mut out = String::with_capacity(s.len());
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'%' if i + 2 < bytes.len() => {
                let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).ok()?;
                out.push(u8::from_str_radix(hex, 16).ok()? as char);
                i += 3;
            }
            b'+' => {
                out.push(' ');
                i += 1;
            }
            b => {
                out.push(b as char);
                i += 1;
            }
        }
    }
    Some(out)
}

async fn run_native(
    route: ShadowRoute,
    params: &std::collections::HashMap<String, String>,
) -> Result<(u16, serde_json::Value), MarketError> {
    let client = client();
    let yields = yields_cache();
    match route {
        ShadowRoute::Kompas100 => Ok((
            200,
            serde_json::to_value(crate::market::kompas100()).unwrap(),
        )),
        ShadowRoute::DividendYields => {
            let limit = params
                .get("limit")
                .and_then(|v| v.parse().ok())
                .unwrap_or(10);
            crate::market::top_dividend_yields(&client, &yields, limit)
                .await
                .map(|r| (200, serde_json::to_value(r).unwrap()))
        }
        ShadowRoute::IdxSearch => {
            let q = params.get("q").cloned().unwrap_or_default();
            let limit = params
                .get("limit")
                .and_then(|v| v.parse().ok())
                .unwrap_or(10);
            crate::market::search_idx_stocks(&client, &q, limit)
                .await
                .map(|r| (200, serde_json::to_value(r).unwrap()))
        }
        ShadowRoute::Quote => {
            let symbol = params.get("symbol").cloned().unwrap_or_default();
            crate::market::latest_quote(&client, &symbol)
                .await
                .map(|r| (200, serde_json::to_value(r).unwrap()))
        }
        ShadowRoute::IndexHistory => {
            let symbol = params
                .get("symbol")
                .cloned()
                .unwrap_or_else(|| "^JKSE".to_string());
            let period = params
                .get("period")
                .cloned()
                .unwrap_or_else(|| "1y".to_string());
            crate::market::index_history(&client, &symbol, &period)
                .await
                .map(|r| (200, serde_json::to_value(r).unwrap()))
        }
        ShadowRoute::PriceHistory => {
            let symbol = params.get("symbol").cloned().unwrap_or_default();
            let period = params
                .get("period")
                .cloned()
                .unwrap_or_else(|| "1y".to_string());
            crate::market::price_history(&client, &symbol, &period)
                .await
                .map(|r| (200, serde_json::to_value(r).unwrap()))
        }
    }
}

/// Fire-and-forget entry from the proxy path. Never blocks the client;
/// never fails the request — all outcomes become `shadow_diff` log events.
pub fn spawn_compare(
    path: String,
    query: Option<String>,
    py_status: u16,
    py_body: Vec<u8>,
    py_ms: u128,
) {
    let Some(route) = classify(&path) else { return };
    if !shadow_enabled() || !sampled(route) {
        return;
    }
    tokio::spawn(async move {
        let started = Instant::now();
        let params = parse_query(query.as_deref());
        let outcome = tokio::time::timeout(
            std::time::Duration::from_secs(SHADOW_TIMEOUT_SECS),
            run_native(route, &params),
        )
        .await;
        let rs_ms = started.elapsed().as_millis();

        let (verdict, rs_status, diffs) = match outcome {
            Err(_) => (Verdict::ShadowError, None, Vec::new()),
            Ok(Err(err)) => {
                // Error-class parity: equal statuses agree, message text is
                // not compared (dual-422 rule).
                if err.status() == py_status {
                    (Verdict::Match, Some(err.status()), Vec::new())
                } else {
                    (
                        Verdict::Material,
                        Some(err.status()),
                        vec![FieldDiff {
                            path: "status".to_string(),
                            py: py_status.into(),
                            rs: err.status().into(),
                            rule: "status_equal".to_string(),
                        }],
                    )
                }
            }
            Ok(Ok((rs_status, rs_body))) => {
                if rs_status != py_status {
                    (
                        Verdict::Material,
                        Some(rs_status),
                        vec![FieldDiff {
                            path: "status".to_string(),
                            py: py_status.into(),
                            rs: rs_status.into(),
                            rule: "status_equal".to_string(),
                        }],
                    )
                } else if rs_status != 200 {
                    (Verdict::Match, Some(rs_status), Vec::new())
                } else {
                    let py_value: serde_json::Value =
                        serde_json::from_slice(&py_body).unwrap_or_default();
                    let (verdict, diffs) = compare_bodies(route, &py_value, &rs_body);
                    (verdict, Some(rs_status), diffs)
                }
            }
        };

        let event = serde_json::json!({
            "ts": chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true),
            "shadow": true,
            "route": route.name(),
            "params": params,
            "py_status": py_status,
            "rs_status": rs_status,
            "py_ms": py_ms,
            "rs_ms": rs_ms,
            "verdict": verdict.name(),
            "diffs": diffs.iter().map(|d| serde_json::json!({
                "path": d.path, "py": d.py, "rs": d.rs, "rule": d.rule,
            })).collect::<Vec<_>>(),
        });
        // Single JSON line on a dedicated target — `shadow-report` greps it.
        tracing::info!(target: "shadow_diff", "{event}");
    });
}

#[cfg(test)]
mod tests {
    use super::{
        classify, compare_bodies, parse_query, sampled, shadow_enabled, ShadowRoute, Verdict,
    };

    #[test]
    fn routes_classify() {
        assert_eq!(
            classify("/api/v1/market-data/quote"),
            Some(ShadowRoute::Quote)
        );
        assert_eq!(
            classify("/api/v1/market-data/idx/search"),
            Some(ShadowRoute::IdxSearch)
        );
        assert_eq!(classify("/api/v1/stocks/returns"), None);
        assert_eq!(classify("/health"), None);
    }

    #[test]
    fn disabled_by_default() {
        // SAFETY: this test never sets SHADOW_MODE; enabling tests use
        // explicit env and are serialized by the test harness order.
        std::env::remove_var("SHADOW_MODE");
        assert!(!shadow_enabled());
    }

    #[test]
    fn full_rate_always_samples() {
        std::env::set_var("SHADOW_SAMPLE_RATE", "1.0");
        assert!(sampled(ShadowRoute::Quote));
        std::env::set_var("SHADOW_SAMPLE_RATE", "0.0");
        assert!(!sampled(ShadowRoute::Quote));
        std::env::remove_var("SHADOW_SAMPLE_RATE");
    }

    #[test]
    fn quote_rules() {
        let py = serde_json::json!({"symbol": "BBCA.JK", "name": "Bank Central Asia Tbk",
            "price": 6325.0, "currency": "IDR", "dividend_yield": 0.0602});
        // In-tolerance tick → match.
        let rs = serde_json::json!({"symbol": "BBCA.JK", "name": "Bank Central Asia Tbk",
            "price": 6330.0, "currency": "IDR", "dividend_yield": 0.0602});
        assert_eq!(
            compare_bodies(ShadowRoute::Quote, &py, &rs).0,
            Verdict::Match
        );
        // Name drift → material.
        let rs = serde_json::json!({"symbol": "BBCA.JK", "name": "Other",
            "price": 6325.0, "currency": "IDR", "dividend_yield": 0.0602});
        assert_eq!(
            compare_bodies(ShadowRoute::Quote, &py, &rs).0,
            Verdict::Material
        );
        // Null-vs-value yield → material.
        let rs = serde_json::json!({"symbol": "BBCA.JK", "name": "Bank Central Asia Tbk",
            "price": 6325.0, "currency": "IDR", "dividend_yield": null});
        assert_eq!(
            compare_bodies(ShadowRoute::Quote, &py, &rs).0,
            Verdict::Material
        );
    }

    #[test]
    fn yields_order_swap_is_minor_set_breach_material() {
        let py = serde_json::json!({"as_of": "2026-09-13", "items": [
            {"symbol": "A.JK", "dividend_yield": 0.05},
            {"symbol": "B.JK", "dividend_yield": 0.04},
        ]});
        let swapped = serde_json::json!({"as_of": "2026-09-13", "items": [
            {"symbol": "B.JK", "dividend_yield": 0.04},
            {"symbol": "A.JK", "dividend_yield": 0.05},
        ]});
        assert_eq!(
            compare_bodies(ShadowRoute::DividendYields, &py, &swapped).0,
            Verdict::Minor
        );
        let breached = serde_json::json!({"as_of": "2026-09-13", "items": [
            {"symbol": "A.JK", "dividend_yield": 0.05},
            {"symbol": "C.JK", "dividend_yield": 0.04},
        ]});
        assert_eq!(
            compare_bodies(ShadowRoute::DividendYields, &py, &breached).0,
            Verdict::Material
        );
    }

    #[test]
    fn search_ignores_names() {
        let py = serde_json::json!({"items": [
            {"symbol": "BBCA.JK", "name": "Old Name"},
        ]});
        let rs = serde_json::json!({"items": [
            {"symbol": "BBCA.JK", "name": "New Name"},
        ]});
        assert_eq!(
            compare_bodies(ShadowRoute::IdxSearch, &py, &rs).0,
            Verdict::Match
        );
    }

    #[test]
    fn query_parsing_decodes() {
        let params = parse_query(Some("symbol=BBCA.JK&q=bank+rakyat&limit=10"));
        assert_eq!(params["symbol"], "BBCA.JK");
        assert_eq!(params["q"], "bank rakyat");
        assert_eq!(params["limit"], "10");
    }
}
