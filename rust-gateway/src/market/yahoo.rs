//! Raw Yahoo Finance REST client (`reqwest` + rustls, no `yfinance`).
//!
//! Spike-validated access tiers (2026-09):
//! - `v8/chart` + `v1/search`: anonymous, UA header only.
//! - `v10/quoteSummary`: cookie + crumb flow (`fc.yahoo.com` sets the
//!   cookie, `v1/test/getcrumb` mints the crumb); refresh + single retry
//!   on 401, mirroring what `yfinance` does under the hood.

use std::sync::Mutex;

const USER_AGENT: &str = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36";
const CHART_BASE: &str = "https://query1.finance.yahoo.com/v8/finance/chart";
const SEARCH_BASE: &str = "https://query1.finance.yahoo.com/v1/finance/search";
const CRUMB_URL: &str = "https://query1.finance.yahoo.com/v1/test/getcrumb";
const COOKIE_URL: &str = "https://fc.yahoo.com";
const SUMMARY_BASE: &str = "https://query1.finance.yahoo.com/v10/finance/quoteSummary";

#[derive(Debug)]
pub enum YahooError {
    Transport(String),
    Unauthorized,
    BadResponse(String),
}

impl std::fmt::Display for YahooError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Transport(message) | Self::BadResponse(message) => write!(f, "{message}"),
            Self::Unauthorized => write!(f, "Yahoo Finance rejected the request"),
        }
    }
}

impl std::error::Error for YahooError {}

#[derive(Debug, Clone)]
pub struct YahooClient {
    client: reqwest::Client,
    state: std::sync::Arc<Mutex<AuthState>>,
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
            .build()
            .map_err(|e| YahooError::Transport(e.to_string()))?;
        Ok(Self {
            client,
            state: std::sync::Arc::new(Mutex::new(AuthState::default())),
        })
    }

    async fn refresh_auth(&self) -> Result<(String, String), YahooError> {
        let cookie_resp = self
            .client
            .get(COOKIE_URL)
            .send()
            .await
            .map_err(|e| YahooError::Transport(e.to_string()))?;
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
            .client
            .get(CRUMB_URL)
            .header(reqwest::header::COOKIE, &cookie)
            .send()
            .await
            .map_err(|e| YahooError::Transport(e.to_string()))?
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
        let url = format!("{CHART_BASE}/{symbol}");
        let resp = self
            .client
            .get(&url)
            .query(&[("range", range), ("interval", "1d")])
            .send()
            .await
            .map_err(|e| YahooError::Transport(e.to_string()))?;
        if resp.status() == reqwest::StatusCode::UNAUTHORIZED {
            return Err(YahooError::Unauthorized);
        }
        resp.json()
            .await
            .map_err(|e| YahooError::BadResponse(e.to_string()))
    }

    /// `v1/search` — anonymous. Returns the raw JSON value.
    pub async fn search(
        &self,
        query: &str,
        max_results: usize,
    ) -> Result<serde_json::Value, YahooError> {
        let resp = self
            .client
            .get(SEARCH_BASE)
            .query(&[
                ("q", query),
                ("quotesCount", &max_results.to_string()),
                ("newsCount", "0"),
            ])
            .send()
            .await
            .map_err(|e| YahooError::Transport(e.to_string()))?;
        if resp.status() == reqwest::StatusCode::UNAUTHORIZED {
            return Err(YahooError::Unauthorized);
        }
        resp.json()
            .await
            .map_err(|e| YahooError::BadResponse(e.to_string()))
    }

    /// `v10/quoteSummary` — cookie + crumb, refreshed once on 401.
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
        let url = format!("{SUMMARY_BASE}/{symbol}");
        let resp = self
            .client
            .get(&url)
            .header(reqwest::header::COOKIE, cookie)
            .query(&[("modules", modules), ("crumb", crumb)])
            .send()
            .await
            .map_err(|e| YahooError::Transport(e.to_string()))?;
        if resp.status() == reqwest::StatusCode::UNAUTHORIZED {
            return Err(YahooError::Unauthorized);
        }
        resp.json()
            .await
            .map_err(|e| YahooError::BadResponse(e.to_string()))
    }
}

#[cfg(test)]
mod tests {
    use super::YahooClient;

    #[test]
    fn client_builds_without_network() {
        assert!(YahooClient::new().is_ok());
    }
}
