from __future__ import annotations

from datetime import date

import pytest
from httpx import ASGITransport, AsyncClient

import backend.services as services
from backend.main import app


@pytest.fixture
async def async_client() -> AsyncClient:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


def assert_validation_error_loc(body: dict, expected_loc: list) -> None:
    details = body.get("detail", [])
    assert any(item.get("loc") == expected_loc for item in details), details


@pytest.mark.anyio
async def test_health(async_client: AsyncClient) -> None:
    response = await async_client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@pytest.mark.anyio
async def test_mutual_fund_returns_endpoint(async_client: AsyncClient) -> None:
    payload = {
        "entries": [
            {
                "date": "2026-05-31",
                "installment_amount": 1100,
                "current_value": 6500,
            },
            {
                "date": "2026-06-30",
                "installment_amount": 1100,
                "current_value": 7700,
            },
            {
                "date": "2026-07-31",
                "installment_amount": 1100,
                "current_value": 9000,
            },
        ]
    }

    response = await async_client.post("/api/v1/mutual-funds/returns", json=payload)

    assert response.status_code == 200
    body = response.json()
    assert set(body.keys()) == {"summary", "ledger"}
    assert body["summary"]["ending_value"] == 9000.0
    assert len(body["ledger"]) == 3


@pytest.mark.anyio
async def test_stock_returns_endpoint(async_client: AsyncClient) -> None:
    payload = {
        "entries": [
            {
                "date": "2026-01-31",
                "installment_amount": 700,
                "new_share_purchases": 300,
                "dividends": 0,
                "current_value": 1000,
            },
            {
                "date": "2026-02-28",
                "installment_amount": 700,
                "new_share_purchases": 200,
                "dividends": 10,
                "current_value": 1950,
            },
            {
                "date": "2026-03-31",
                "installment_amount": 700,
                "new_share_purchases": 150,
                "dividends": 0,
                "current_value": 2850,
            },
        ]
    }

    response = await async_client.post("/api/v1/stocks/returns", json=payload)

    assert response.status_code == 200
    body = response.json()
    assert set(body.keys()) == {"summary", "ledger"}
    assert body["summary"]["ending_value"] == 2850.0
    assert len(body["ledger"]) == 3


@pytest.mark.anyio
async def test_term_deposit_returns_endpoint(async_client: AsyncClient) -> None:
    payload = {
        "apy": 0.06,
        "entries": [
            {
                "date": "2026-01-31",
                "installment_amount": 1000,
                "current_value": 1000,
            },
            {
                "date": "2026-02-28",
                "installment_amount": 1000,
                "current_value": 2005,
            },
            {
                "date": "2026-03-31",
                "installment_amount": 1000,
                "current_value": 3020,
            },
        ],
    }

    response = await async_client.post("/api/v1/term-deposits/returns", json=payload)

    assert response.status_code == 200
    body = response.json()
    assert set(body.keys()) == {"summary", "ledger"}
    assert body["summary"]["apy"] == 0.06
    assert len(body["ledger"]) == 3


def test_term_deposit_maturity_fields_derived_from_term_months() -> None:
    summary, rows = services.calculate_term_deposit_returns(
        [
            services.TermDepositLedgerEntry(
                date=date(2026, 1, 31),
                installment_amount=1000,
                current_value=1000,
                term_months=12,
            )
        ],
        apy=0.06,
        reference_date=date(2026, 6, 30),
    )

    assert rows[0].term_months == 12
    assert rows[0].maturity_date == date(2027, 1, 31)
    assert rows[0].days_to_maturity == 215
    assert rows[0].maturity_status == "active"
    assert rows[0].maturity_value == pytest.approx(1000 * (1.06) ** 1.0)
    assert rows[0].accrued_interest == pytest.approx(1000 * (1.06 ** (150 / 365) - 1))
    assert summary.next_maturity_date == date(2027, 1, 31)
    assert summary.total_accrued_interest == pytest.approx(rows[0].accrued_interest)


def test_term_deposit_matured_status_when_after_maturity() -> None:
    summary, rows = services.calculate_term_deposit_returns(
        [
            services.TermDepositLedgerEntry(
                date=date(2025, 1, 31),
                installment_amount=5000,
                current_value=5000,
                term_months=12,
                maturity_date=date(2026, 1, 31),
            )
        ],
        apy=0.06,
        reference_date=date(2026, 8, 8),
    )

    assert rows[0].maturity_status == "matured"
    assert rows[0].days_to_maturity == -189
    assert rows[0].accrued_interest == pytest.approx(5000 * (1.06 - 1))
    assert summary.next_maturity_date is None


def test_term_deposit_rollover_value_counts_matured_and_near_maturity() -> None:
    summary, _ = services.calculate_term_deposit_returns(
        [
            services.TermDepositLedgerEntry(
                date=date(2025, 6, 30),
                installment_amount=2000,
                current_value=2000,
                term_months=12,
                maturity_date=date(2026, 6, 30),
            ),
            services.TermDepositLedgerEntry(
                date=date(2026, 1, 31),
                installment_amount=3000,
                current_value=3000,
                term_months=12,
                maturity_date=date(2027, 1, 31),
            ),
        ],
        apy=0.06,
        reference_date=date(2026, 7, 15),
    )

    matured_value = 2000 * (1.06) ** 1.0
    assert summary.rollover_value == pytest.approx(matured_value)
    assert summary.next_maturity_date == date(2027, 1, 31)


@pytest.mark.anyio
async def test_mutual_fund_returns_validation_error_empty_entries(
    async_client: AsyncClient,
) -> None:
    response = await async_client.post(
        "/api/v1/mutual-funds/returns",
        json={"entries": []},
    )

    assert response.status_code == 422
    assert_validation_error_loc(response.json(), ["body", "entries"])


@pytest.mark.anyio
async def test_stock_returns_validation_error_negative_current_value(
    async_client: AsyncClient,
) -> None:
    response = await async_client.post(
        "/api/v1/stocks/returns",
        json={
            "entries": [
                {
                    "date": "2026-07-31",
                    "installment_amount": 700,
                    "new_share_purchases": 100,
                    "dividends": 0,
                    "current_value": -1,
                }
            ]
        },
    )

    assert response.status_code == 422
    assert_validation_error_loc(
        response.json(),
        ["body", "entries", 0, "current_value"],
    )


@pytest.mark.anyio
async def test_term_deposit_returns_validation_error_invalid_apy(
    async_client: AsyncClient,
) -> None:
    response = await async_client.post(
        "/api/v1/term-deposits/returns",
        json={
            "apy": 1.5,
            "entries": [
                {
                    "date": "2026-07-31",
                    "installment_amount": 1000,
                    "current_value": 1000,
                }
            ],
        },
    )

    assert response.status_code == 422
    assert_validation_error_loc(response.json(), ["body", "apy"])


@pytest.mark.anyio
async def test_mutual_fund_returns_validation_error_malformed_date(
    async_client: AsyncClient,
) -> None:
    response = await async_client.post(
        "/api/v1/mutual-funds/returns",
        json={
            "entries": [
                {
                    "date": "2026/07/31",
                    "installment_amount": 1100,
                    "current_value": 6500,
                }
            ]
        },
    )

    assert response.status_code == 422
    assert_validation_error_loc(response.json(), ["body", "entries", 0, "date"])


@pytest.mark.anyio
async def test_mutual_fund_returns_validation_error_missing_current_value(
    async_client: AsyncClient,
) -> None:
    response = await async_client.post(
        "/api/v1/mutual-funds/returns",
        json={
            "entries": [
                {
                    "date": "2026-07-31",
                    "installment_amount": 1100,
                }
            ]
        },
    )

    assert response.status_code == 422
    assert_validation_error_loc(
        response.json(),
        ["body", "entries", 0, "current_value"],
    )


@pytest.mark.anyio
async def test_stock_returns_validation_error_malformed_date(
    async_client: AsyncClient,
) -> None:
    response = await async_client.post(
        "/api/v1/stocks/returns",
        json={
            "entries": [
                {
                    "date": "31-07-2026",
                    "installment_amount": 700,
                    "new_share_purchases": 100,
                    "dividends": 0,
                    "current_value": 1000,
                }
            ]
        },
    )

    assert response.status_code == 422
    assert_validation_error_loc(response.json(), ["body", "entries", 0, "date"])


@pytest.mark.anyio
async def test_stock_returns_validation_error_missing_dividends(
    async_client: AsyncClient,
) -> None:
    response = await async_client.post(
        "/api/v1/stocks/returns",
        json={
            "entries": [
                {
                    "date": "2026-07-31",
                    "installment_amount": 700,
                    "new_share_purchases": 100,
                    "current_value": 1000,
                }
            ]
        },
    )

    assert response.status_code == 422
    assert_validation_error_loc(response.json(), ["body", "entries", 0, "dividends"])


@pytest.mark.anyio
async def test_term_deposit_returns_validation_error_malformed_date(
    async_client: AsyncClient,
) -> None:
    response = await async_client.post(
        "/api/v1/term-deposits/returns",
        json={
            "apy": 0.06,
            "entries": [
                {
                    "date": "07-31-2026",
                    "installment_amount": 1000,
                    "current_value": 1000,
                }
            ],
        },
    )

    assert response.status_code == 422
    assert_validation_error_loc(response.json(), ["body", "entries", 0, "date"])


@pytest.mark.anyio
async def test_term_deposit_returns_validation_error_missing_apy(
    async_client: AsyncClient,
) -> None:
    response = await async_client.post(
        "/api/v1/term-deposits/returns",
        json={
            "entries": [
                {
                    "date": "2026-07-31",
                    "installment_amount": 1000,
                    "current_value": 1000,
                }
            ]
        },
    )

    assert response.status_code == 422
    assert_validation_error_loc(response.json(), ["body", "apy"])


@pytest.mark.anyio
async def test_kompas100_stock_list_endpoint(async_client: AsyncClient) -> None:
    response = await async_client.get("/api/v1/market-data/idx/kompas100")

    assert response.status_code == 200
    body = response.json()
    assert body["index_name"] == "Kompas 100 (Starter)"
    assert len(body["items"]) > 0
    assert body["items"][0]["symbol"].endswith(".JK")


@pytest.mark.anyio
async def test_stock_quote_endpoint(async_client: AsyncClient, monkeypatch) -> None:
    class FakeTicker:
        def __init__(self, symbol: str) -> None:
            self.fast_info = {"lastPrice": 1234.5, "currency": "IDR"}
            self.info = {"shortName": "Demo IDX"}

        def history(self, period: str):
            raise AssertionError("history fallback should not be called")

    monkeypatch.setattr(services.yf, "Ticker", FakeTicker)

    response = await async_client.get(
        "/api/v1/market-data/quote",
        params={"symbol": "BBCA.JK"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body == {
        "symbol": "BBCA.JK",
        "name": "Demo IDX",
        "price": 1234.5,
        "currency": "IDR",
        "dividend_yield": None,
    }


@pytest.mark.anyio
async def test_stock_quote_endpoint_upstream_failure(
    async_client: AsyncClient,
    monkeypatch,
) -> None:
    class FakeTicker:
        def __init__(self, symbol: str) -> None:
            self.fast_info = {}
            self.info = {}

        def history(self, period: str):
            return services.pd.DataFrame()

    monkeypatch.setattr(services.yf, "Ticker", FakeTicker)

    response = await async_client.get(
        "/api/v1/market-data/quote",
        params={"symbol": "BBCA.JK"},
    )

    assert response.status_code == 502
    assert "Unable to fetch latest market price" in response.json()["detail"]


@pytest.mark.anyio
async def test_mutual_fund_returns_large_short_period_gain_still_computes_xirr(
    async_client: AsyncClient,
) -> None:
    # Historically this pattern could fail bracketing; it should now compute.
    response = await async_client.post(
        "/api/v1/mutual-funds/returns",
        json={
            "entries": [
                {
                    "date": "2026-05-31",
                    "installment_amount": 1100,
                    "current_value": 6500,
                },
                {
                    "date": "2026-06-30",
                    "installment_amount": 1100,
                    "current_value": 7700,
                },
            ]
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["summary"]["xirr"] > 0
