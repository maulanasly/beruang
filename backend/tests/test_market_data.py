from __future__ import annotations

from unittest.mock import MagicMock, patch

import pandas as pd
import pytest
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
            params={"symbol": "^JKLQ45", "period": "1y"},
        )

    assert response.status_code == 502


def test_price_history_returns_sorted_closes_with_name_and_currency() -> None:
    history = make_index_history(
        [
            ("2026-05-01", 9050.0),
            ("2026-05-02", 9125.5),
            ("2026-05-03", 9098.25),
        ]
    )
    ticker = MagicMock()
    ticker.history.return_value = history
    ticker.info = {"shortName": "Bank Central Asia", "currency": "IDR"}

    with patch("backend.services.yf.Ticker", return_value=ticker) as ticker_factory:
        response = client.get(
            "/api/v1/market-data/price/history",
            params={"symbol": "BBCA.JK", "period": "1mo"},
        )

    ticker_factory.assert_called_once_with("BBCA.JK")
    assert response.status_code == 200
    body = response.json()
    assert body["symbol"] == "BBCA.JK"
    assert body["name"] == "Bank Central Asia"
    assert body["period"] == "1mo"
    assert body["currency"] == "IDR"
    assert body["points"] == [
        {"date": "2026-05-01", "close": 9050.0},
        {"date": "2026-05-02", "close": 9125.5},
        {"date": "2026-05-03", "close": 9098.25},
    ]


def test_price_history_falls_back_to_symbol_and_default_currency() -> None:
    history = make_index_history([("2026-05-01", 100.0)])
    ticker = MagicMock()
    ticker.history.return_value = history
    ticker.info = {}

    with patch("backend.services.yf.Ticker", return_value=ticker):
        response = client.get(
            "/api/v1/market-data/price/history",
            params={"symbol": "AAPL", "period": "1y"},
        )

    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "AAPL"
    assert body["currency"] == "IDR"


def test_price_history_rejects_blank_symbol() -> None:
    response = client.get("/api/v1/market-data/price/history", params={"symbol": ""})
    assert response.status_code == 422


def test_price_history_rejects_unsupported_period() -> None:
    response = client.get(
        "/api/v1/market-data/price/history",
        params={"symbol": "BBCA.JK", "period": "10y"},
    )
    assert response.status_code == 422


def test_price_history_returns_502_when_history_is_empty() -> None:
    ticker = MagicMock()
    ticker.history.return_value = pd.DataFrame()
    ticker.info = {"shortName": "Bank Central Asia"}

    with patch("backend.services.yf.Ticker", return_value=ticker):
        response = client.get(
            "/api/v1/market-data/price/history",
            params={"symbol": "BBCA.JK", "period": "1y"},
        )

    assert response.status_code == 502


def test_quote_returns_price_currency_and_normalized_dividend_yield() -> None:
    ticker = MagicMock()
    ticker.fast_info = {"lastPrice": 9100.0, "currency": "IDR"}
    ticker.info = {
        "shortName": "Bank Central Asia",
        "currency": "IDR",
        "dividendYield": 5.61,
    }

    with patch("backend.services.yf.Ticker", return_value=ticker):
        response = client.get("/api/v1/market-data/quote", params={"symbol": "BBCA.JK"})

    assert response.status_code == 200
    body = response.json()
    assert body["symbol"] == "BBCA.JK"
    assert body["name"] == "Bank Central Asia"
    assert body["price"] == 9100.0
    assert body["currency"] == "IDR"
    assert body["dividend_yield"] == pytest.approx(0.0561)


def test_quote_omits_dividend_yield_when_missing() -> None:
    ticker = MagicMock()
    ticker.fast_info = {"lastPrice": 178.0, "currency": "USD"}
    ticker.info = {"shortName": "Non-Dividend Co", "currency": "USD"}

    with patch("backend.services.yf.Ticker", return_value=ticker):
        response = client.get("/api/v1/market-data/quote", params={"symbol": "ZZZ"})

    assert response.status_code == 200
    assert response.json()["dividend_yield"] is None


def test_quote_normalizes_low_yield_below_one() -> None:
    ticker = MagicMock()
    ticker.fast_info = {"lastPrice": 8325.0, "currency": "IDR"}
    ticker.info = {
        "shortName": "Indah Kiat Pulp & Paper",
        "currency": "IDR",
        "dividendYield": 0.9,
    }

    with patch("backend.services.yf.Ticker", return_value=ticker):
        response = client.get("/api/v1/market-data/quote", params={"symbol": "INKP.JK"})

    assert response.status_code == 200
    assert response.json()["dividend_yield"] == pytest.approx(0.009)


def test_price_history_includes_normalized_dividend_yield() -> None:
    history = make_index_history([("2026-05-01", 9050.0)])
    ticker = MagicMock()
    ticker.history.return_value = history
    ticker.info = {
        "shortName": "Telkom Indonesia",
        "currency": "IDR",
        "dividendYield": 8.42,
    }

    with patch("backend.services.yf.Ticker", return_value=ticker):
        response = client.get(
            "/api/v1/market-data/price/history",
            params={"symbol": "TLKM.JK", "period": "1y"},
        )

    assert response.status_code == 200
    assert response.json()["dividend_yield"] == pytest.approx(0.0842)


def _make_yield_ticker(
    symbol: str, name: str, price: float, yield_pct: float | None
) -> MagicMock:
    """Factory helper: create a mock yf.Ticker with optional dividend yield."""
    ticker = MagicMock()
    ticker.fast_info = {"lastPrice": price, "currency": "IDR"}
    info: dict = {"shortName": name, "currency": "IDR"}
    if yield_pct is not None:
        info["dividendYield"] = yield_pct
    ticker.info = info
    return ticker


def _mock_ticker_side_effect(symbol: str) -> MagicMock:
    """Return a mock yf.Ticker for a known symbol, or a zero-yield fallback."""
    registry = {
        "BBCA.JK": ("Bank Central Asia", 10250, 4.2),
        "TLKM.JK": ("Telkom Indonesia", 3850, 8.4),
        "BMRI.JK": ("Bank Mandiri", 6950, 5.1),
        "BBRI.JK": ("Bank Rakyat Indonesia", 5750, 6.3),
        "ASII.JK": ("Astra International", 5125, 7.8),
        "ADRO.JK": ("Alamtri Resources", 2950, None),  # no yield
    }
    if symbol in registry:
        name, price, yield_pct = registry[symbol]
        return _make_yield_ticker(symbol, name, price, yield_pct)
    return _make_yield_ticker(symbol, "Unknown", 1000, None)


def test_dividend_yields_returns_top_n_sorted_by_yield() -> None:
    with patch(
        "backend.services.yf.Ticker", side_effect=_mock_ticker_side_effect
    ):
        response = client.get(
            "/api/v1/market-data/idx/dividend-yields", params={"limit": 3}
        )

    assert response.status_code == 200
    body = response.json()
    assert body["as_of"] is not None
    items = body["items"]
    assert len(items) == 3
    assert items[0]["symbol"] == "TLKM.JK"
    assert items[0]["dividend_yield"] == pytest.approx(0.084)
    assert items[1]["symbol"] == "ASII.JK"
    assert items[2]["symbol"] == "BBRI.JK"


def test_dividend_yields_omits_symbols_without_yield() -> None:
    with patch("backend.services.yf.Ticker", side_effect=_mock_ticker_side_effect):
        response = client.get("/api/v1/market-data/idx/dividend-yields")

    assert response.status_code == 200
    symbols = [item["symbol"] for item in response.json()["items"]]
    assert "ADRO.JK" not in symbols


def test_dividend_yields_respects_limit_and_returns_at_most_limit() -> None:
    with patch(
        "backend.services.yf.Ticker", side_effect=_mock_ticker_side_effect
    ):
        response = client.get(
            "/api/v1/market-data/idx/dividend-yields", params={"limit": 30}
        )

    assert response.status_code == 200
    assert len(response.json()["items"]) <= 30
