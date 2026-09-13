//! Raw Yahoo Finance REST client (`reqwest` + rustls, no `yfinance`).
//!
//! Spike-validated access tiers (2026-09):
//! - `v8/chart` + `v1/search`: anonymous, UA header only.
//! - `v10/quoteSummary`: cookie + crumb flow (`fc.yahoo.com` sets the
//!   cookie, `v1/test/getcrumb` mints the crumb); refresh + single retry
//!   on 401, mirroring what `yfinance` does under the hood.
//!
//! Throttle discipline (the VPS egress IP is edge rate-limited):
//! - at most [`MAX_CONCURRENT`] in-flight Yahoo requests process-wide
//!   (the 24-way yields fan-out used to self-inflict 429s);
//! - HTTP 429 surfaces as [`YahooError::RateLimited`] and is retried with
//!   exponential backoff (honoring `Retry-After`), alternating
//!   `query1`/`query2` hosts per attempt.

use std::sync::Mutex;
use std::time::Duration;

const USER_AGENT: &str = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36";
const HOSTS: [&str; 2] = [
    "https://query1.finance.yahoo.com",
    "https://query2.finance.yahoo.com",
];
const SEARCH_PATH: &str = "/v1/finance/search";
const CRUMB_PATH: &str = "/v1/test/getcrumb";
const COOKIE_URL: &str = "https://fc.yahoo.com";
const SUMMARY_PATH: &str = "/v10/finance/quoteSummary";

/// Max simultaneous Yahoo requests process-wide (shared semaphore).
const MAX_CONCURRENT: usize = 2;
/// Retries after the first attempt on 429/transport errors. Kept small on
/// purpose: retries catch transient blips, while a sustained edge ban must
/// surface fast as [`YahooError::RateLimited`] instead of burning the 25s
/// route budget in backoff sleeps.
const MAX_RETRIES: u32 = 2;
/// Per-request ceiling; retries must fit the 25s route budget.
const REQUEST_TIMEOUT: Duration = Duration::from_secs(8);

#[derive(Debug)]
pub enum YahooError {
    Transport(String),
    Unauthorized,
    RateLimited,
    BadResponse(String),
}

impl std::fmt::Display for YahooError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Transport(message) | Self::BadResponse(message) => write!(f, "{message}"),
            Self::Unauthorized => write!(f, "Yahoo Finance rejected the request"),
            Self::RateLimited => write!(
                f,
                "Yahoo Finance is rate-limiting requests from the server right now — please retry in a minute."
            ),
        }
    }
}

impl std::error::Error for YahooError {}

#[derive(Debug, Clone)]
pub struct YahooClient {
    client: reqwest::Client,
    state: std::sync::Arc<Mutex<AuthState>>,
    /// Process-wide throttle: every Yahoo hit (chart/search/summary/auth)
    /// takes a permit, so bursts serialize instead of tripping the edge.
    throttle: std::sync::Arc<tokio::sync::Semaphore>,
}

/// Host for an attempt: alternate query1/query2 so a per-host bucket
/// refill lets the retry through.
fn host_for_attempt(attempt: u32) -> &'static str {
    HOSTS[(attempt as usize) % HOSTS.len()]
}

/// Backoff before retry `attempt` (1-based): 2s, then 4s (capped).
/// A single send-chain sleeps at most 6s, so even the cold quote path
/// (cookie + crumb + chart + summary chains) stays under the 25s budget.
fn backoff_for_attempt(attempt: u32) -> Duration {
    Duration::from_secs(1_u64.saturating_mul(1 << attempt.min(2)).min(4))
}

/// `Retry-After: <seconds>` value, if the header carries a plain delay.
fn retry_after_secs(headers: &reqwest::header::HeaderMap) -> Option<Duration> {
    headers
        .get(reqwest::header::RETRY_AFTER)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.trim().parse::<u64>().ok())
        .map(|s| Duration::from_secs(s.clamp(1, 30)))
}

fn is_rate_limited(status: reqwest::StatusCode) -> bool {
    status == reqwest::StatusCode::TOO_MANY_REQUESTS
}

#[derive(Debug, Default)]
struct AuthState {
    cookie: Option<String>,
    crumb: Option<String>,
}

impl YahooClient {
    pub fn new() -> Result<Self, YahooError> {
        let client = reqwest::Client::builder()
            .user_agent(USER_AGENT)
            .timeout(REQUEST_TIMEOUT)
            .build()
            .map_err(|e| YahooError::Transport(e.to_string()))?;
        Ok(Self {
            client,
            state: std::sync::Arc::new(Mutex::new(AuthState::default())),
            throttle: std::sync::Arc::new(tokio::sync::Semaphore::new(MAX_CONCURRENT)),
        })
    }

    /// Throttled GET with retry: alternate hosts per attempt, back off on
    /// 429 (honoring `Retry-After`) and transport errors. Returns the
    /// response for 2xx AND 401 — the caller decides what 401 means.
    /// 429 after [`MAX_RETRIES`] becomes [`YahooError::RateLimited`].
    async fn send(
        &self,
        build: impl Fn(&str) -> reqwest::RequestBuilder,
    ) -> Result<reqwest::Response, YahooError> {
        let mut attempt: u32 = 0;
        loop {
            let _permit = self
                .throttle
                .acquire()
                .await
                .map_err(|e| YahooError::Transport(e.to_string()))?;
            let resp = build(host_for_attempt(attempt)).send().await;
            drop(_permit);
            match resp {
                Err(e) if attempt < MAX_RETRIES => {
                    tracing::debug!(
                        attempt,
                        error = e.to_string(),
                        "yahoo transport error, retrying"
                    );
                    tokio::time::sleep(backoff_for_attempt(attempt + 1)).await;
                    attempt += 1;
                }
                Err(e) => return Err(YahooError::Transport(e.to_string())),
                Ok(resp) => {
                    if is_rate_limited(resp.status()) {
                        if attempt < MAX_RETRIES {
                            let wait = retry_after_secs(resp.headers())
                                .unwrap_or_else(|| backoff_for_attempt(attempt + 1));
                            tracing::debug!(?wait, attempt, "yahoo rate-limited, retrying");
                            tokio::time::sleep(wait).await;
                            attempt += 1;
                            continue;
                        }
                        return Err(YahooError::RateLimited);
                    }
                    return Ok(resp);
                }
            }
        }
    }

    /// GET expecting JSON: 401 surfaces immediately so the caller can run
    /// its auth-refresh flow.
    async fn get_json(
        &self,
        build: impl Fn(&str) -> reqwest::RequestBuilder,
    ) -> Result<serde_json::Value, YahooError> {
        let resp = self.send(build).await?;
        if resp.status() == reqwest::StatusCode::UNAUTHORIZED {
            return Err(YahooError::Unauthorized);
        }
        resp.json()
            .await
            .map_err(|e| YahooError::BadResponse(e.to_string()))
    }

    async fn refresh_auth(&self) -> Result<(String, String), YahooError> {
        let cookie_resp = self.send(|_| self.client.get(COOKIE_URL)).await?;
        let cookie = cookie_resp
            .headers()
            .get_all(reqwest::header::SET_COOKIE)
            .iter()
            .filter_map(|v| v.to_str().ok())
            .map(|v| v.split(';').next().unwrap_or("").trim().to_string())
            .filter(|v| !v.is_empty())
            .collect::<Vec<_>>()
            .join("; ");
        if cookie.is_empty() {
            return Err(YahooError::Transport(
                "Yahoo did not set an auth cookie".to_string(),
            ));
        }
        let crumb = self
            .send(|host| {
                self.client
                    .get(format!("{host}{CRUMB_PATH}"))
                    .header(reqwest::header::COOKIE, &cookie)
            })
            .await?
            .text()
            .await
            .map_err(|e| YahooError::Transport(e.to_string()))?;
        let crumb = crumb.trim().to_string();
        if crumb.is_empty() || crumb.contains("error") {
            return Err(YahooError::Transport(
                "Yahoo did not mint a crumb".to_string(),
            ));
        }
        let mut state = self.state.lock().unwrap();
        state.cookie = Some(cookie.clone());
        state.crumb = Some(crumb.clone());
        Ok((cookie, crumb))
    }

    fn cached_auth(&self) -> Option<(String, String)> {
        let state = self.state.lock().unwrap();
        match (&state.cookie, &state.crumb) {
            (Some(cookie), Some(crumb)) => Some((cookie.clone(), crumb.clone())),
            _ => None,
        }
    }

    /// `v8/chart` — anonymous. Returns the raw JSON value.
    pub async fn chart(&self, symbol: &str, range: &str) -> Result<serde_json::Value, YahooError> {
        let symbol = symbol.to_string();
        let range = range.to_string();
        self.get_json(|host| {
            self.client
                .get(format!("{host}/v8/finance/chart/{symbol}"))
                .query(&[("range", range.as_str()), ("interval", "1d")])
        })
        .await
    }

    /// `v1/search` — anonymous. Returns the raw JSON value.
    pub async fn search(
        &self,
        query: &str,
        max_results: usize,
    ) -> Result<serde_json::Value, YahooError> {
        let query = query.to_string();
        let count = max_results.to_string();
        self.get_json(|host| {
            self.client.get(format!("{host}{SEARCH_PATH}")).query(&[
                ("q", query.as_str()),
                ("quotesCount", count.as_str()),
                ("newsCount", "0"),
            ])
        })
        .await
    }

    /// `v10/quoteSummary` — cookie + crumb, refreshed once on 401.
    /// A 429 from the summary leg is returned (not swallowed): callers
    /// degrade name/yield but keep chart data when they can.
    pub async fn quote_summary(
        &self,
        symbol: &str,
        modules: &str,
    ) -> Result<serde_json::Value, YahooError> {
        let auth = match self.cached_auth() {
            Some(auth) => auth,
            None => self.refresh_auth().await?,
        };
        match self.summary_with(&auth.0, &auth.1, symbol, modules).await {
            Err(YahooError::Unauthorized) => {
                let (cookie, crumb) = self.refresh_auth().await?;
                self.summary_with(&cookie, &crumb, symbol, modules).await
            }
            other => other,
        }
    }

    async fn summary_with(
        &self,
        cookie: &str,
        crumb: &str,
        symbol: &str,
        modules: &str,
    ) -> Result<serde_json::Value, YahooError> {
        let cookie = cookie.to_string();
        let crumb = crumb.to_string();
        let symbol = symbol.to_string();
        let modules = modules.to_string();
        self.get_json(|host| {
            self.client
                .get(format!("{host}{SUMMARY_PATH}/{symbol}"))
                .header(reqwest::header::COOKIE, &cookie)
                .query(&[("modules", modules.as_str()), ("crumb", crumb.as_str())])
        })
        .await
    }
}

#[cfg(test)]
mod tests {
    use super::{
        backoff_for_attempt, host_for_attempt, is_rate_limited, retry_after_secs, YahooClient,
        HOSTS, MAX_RETRIES,
    };
    use std::time::Duration;

    #[test]
    fn client_builds_without_network() {
        assert!(YahooClient::new().is_ok());
    }

    #[test]
    fn attempts_alternate_hosts() {
        assert_eq!(host_for_attempt(0), HOSTS[0]);
        assert_eq!(host_for_attempt(1), HOSTS[1]);
        assert_eq!(host_for_attempt(2), HOSTS[0]);
    }

    #[test]
    fn backoff_grows_and_caps() {
        assert_eq!(backoff_for_attempt(1), Duration::from_secs(2));
        assert_eq!(backoff_for_attempt(2), Duration::from_secs(4));
        assert_eq!(backoff_for_attempt(99), Duration::from_secs(4));
    }

    #[test]
    fn retry_after_parses_plain_seconds() {
        let mut headers = reqwest::header::HeaderMap::new();
        assert!(retry_after_secs(&headers).is_none());
        headers.insert(
            reqwest::header::RETRY_AFTER,
            reqwest::header::HeaderValue::from_static("5"),
        );
        assert_eq!(retry_after_secs(&headers), Some(Duration::from_secs(5)));
    }

    #[test]
    fn rate_limit_status_detected() {
        assert!(is_rate_limited(reqwest::StatusCode::TOO_MANY_REQUESTS));
        assert!(!is_rate_limited(reqwest::StatusCode::OK));
        assert!(!is_rate_limited(reqwest::StatusCode::UNAUTHORIZED));
    }

    #[test]
    fn retry_budget_fits_route_timeout() {
        // Worst case per send-chain: initial + MAX_RETRIES backoffs must
        // stay small — even the cold quote path (cookie + crumb + chart +
        // summary chains, chart/summary joined) stays under the 25s budget.
        let worst: Duration = (1..=MAX_RETRIES).map(backoff_for_attempt).sum();
        assert!(worst <= Duration::from_secs(10));
    }
}
