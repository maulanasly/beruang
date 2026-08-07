from __future__ import annotations

from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from backend.main import app

client = TestClient(app)


def make_quote(symbol: str, name: str, exchange: str) -> dict:
    return {"symbol": symbol, "shortname": name, "longname": name, "exchange": exchange}


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
