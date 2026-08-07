from __future__ import annotations

from unittest.mock import MagicMock, patch

import pandas as pd
from fastapi.testclient import TestClient

from backend.main import app

client = TestClient(app)


def make_quote(symbol: str, name: str, exchange: str) -> dict:
    return {"symbol": symbol, "shortname": name, "longname": name, "exchange": exchange}


def make_index_history(points: list[tuple[str, float]]) -> pd.DataFrame:
    index = pd.to_datetime([point[0] for point in points])
    return pd.DataFrame(
        {"Close": [point[1] for point in points]},
        index=index,
    )


def test_idx_stock_search_returns_only_idx_listings() -> None:
    fake_search = MagicMock()
    fake_search.quotes = [
        make_quote("BBCA.JK", "Bank Central Asia Tbk", "JKT"),
        make_quote("TLKM.JK", "Telkom Indonesia Tbk", "JKT"),
        make_quote("BAC", "Bank of America Corporation", "NYQ"),
        make_quote("BBCA", "JPMorgan BetaBuilders Canada ETF", "BTS"),
    ]

    with patch("backend.services.yf.Search", return_value=fake_search):
        response = client.get("/api/v1/market-data/idx/search", params={"q": "bank"})

    assert response.status_code == 200
    body = response.json()
    assert body["query"] == "bank"
    symbols = [item["symbol"] for item in body["items"]]
    assert symbols == ["BBCA.JK", "TLKM.JK"]


def test_idx_stock_search_dedupes_and_respects_limit() -> None:
    fake_search = MagicMock()
    fake_search.quotes = [
        make_quote("BBCA.JK", "Bank Central Asia Tbk", "JKT"),
        make_quote("BBCA.JK", "Bank Central Asia Tbk", "JKT"),
        make_quote("BBRI.JK", "Bank Rakyat Indonesia Tbk", "JKT"),
        make_quote("BMRI.JK", "Bank Mandiri Tbk", "JKT"),
    ]

    with patch("backend.services.yf.Search", return_value=fake_search):
        response = client.get(
            "/api/v1/market-data/idx/search", params={"q": "bank", "limit": 2}
        )

    assert response.status_code == 200
    body = response.json()
    symbols = [item["symbol"] for item in body["items"]]
    assert symbols == ["BBCA.JK", "BBRI.JK"]


def test_idx_stock_search_rejects_blank_query() -> None:
    response = client.get("/api/v1/market-data/idx/search", params={"q": ""})
    assert response.status_code == 422


def test_idx_stock_search_handles_missing_quotes_gracefully() -> None:
    fake_search = MagicMock()
    fake_search.quotes = None

    with patch("backend.services.yf.Search", return_value=fake_search):
        response = client.get("/api/v1/market-data/idx/search", params={"q": "zzz"})

    assert response.status_code == 200
    assert response.json()["items"] == []


def test_index_history_returns_sorted_daily_closes() -> None:
    history = make_index_history(
        [
            ("2026-05-01", 7100.0),
            ("2026-05-02", 7125.5),
            ("2026-05-03", 7098.25),
        ]
    )
    ticker = MagicMock()
    ticker.history.return_value = history

    with patch("backend.services.yf.Ticker", return_value=ticker) as ticker_factory:
        response = client.get(
            "/api/v1/market-data/index/history",
            params={"symbol": "^JKSE", "period": "1mo"},
        )

    ticker_factory.assert_called_once_with("^JKSE")
    assert response.status_code == 200
    body = response.json()
    assert body["symbol"] == "^JKSE"
    assert body["name"] == "IDX Composite (IHSG)"
    assert body["period"] == "1mo"
    assert body["points"] == [
        {"date": "2026-05-01", "close": 7100.0},
        {"date": "2026-05-02", "close": 7125.5},
        {"date": "2026-05-03", "close": 7098.25},
    ]


def test_index_history_rejects_unsupported_symbol() -> None:
    response = client.get(
        "/api/v1/market-data/index/history", params={"symbol": "^GSPC"}
    )
    assert response.status_code == 422


def test_index_history_rejects_unsupported_period() -> None:
    response = client.get("/api/v1/market-data/index/history", params={"period": "10y"})
    assert response.status_code == 422


def test_index_history_returns_502_when_history_is_empty() -> None:
    ticker = MagicMock()
    ticker.history.return_value = pd.DataFrame()

    with patch("backend.services.yf.Ticker", return_value=ticker):
        response = client.get(
            "/api/v1/market-data/index/history",
            params={"symbol": "^LQ45", "period": "1y"},
        )

    assert response.status_code == 502
