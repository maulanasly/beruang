from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

import pandas as pd

from logic import stock_metrics


def _frame(rows: list[dict]) -> pd.DataFrame:
    """Build a stock ledger DataFrame matching StockLedgerEntry fields."""
    return pd.DataFrame(rows)


def test_estimated_dividend_added_to_mom() -> None:
    """estimated_dividend = current_value * dividend_yield / 12
    is added to the MoM numerator alongside manual dividends."""
    df = _frame(
        [
            {
                "date": "2026-01-31",
                "installment_amount": 700,
                "new_share_purchases": 300,
                "dividends": 0,
                "current_value": 1000,
                "dividend_yield": 0.0,
            },
            {
                "date": "2026-02-28",
                "installment_amount": 700,
                "new_share_purchases": 200,
                "dividends": 10,
                "current_value": 1950,
                "dividend_yield": 0.06,
            },
        ]
    )
    metrics, _summary = stock_metrics(df)

    # month 2 estimated = 1950 * 0.06 / 12 = 9.75
    # MoM = (1950 - 200 + 10 + 9.75 - 1000) / 1000 = 769.75 / 1000 = 0.76975
    row2 = metrics.iloc[1]
    assert row2["estimated_dividend"] == pytest.approx(9.75)
    assert row2["mom_return"] == pytest.approx(0.76975)


def test_null_yield_produces_no_estimate() -> None:
    """Rows without a dividend_yield get 0 estimated_dividend."""
    df = _frame(
        [
            {
                "date": "2026-01-31",
                "installment_amount": 700,
                "new_share_purchases": 0,
                "dividends": 0,
                "current_value": 1000,
                "dividend_yield": None,
            },
            {
                "date": "2026-02-28",
                "installment_amount": 700,
                "new_share_purchases": 0,
                "dividends": 0,
                "current_value": 1050,
                "dividend_yield": None,
            },
        ]
    )
    metrics, _summary = stock_metrics(df)
    for row in metrics.itertuples():
        assert row.estimated_dividend == 0.0


def test_xirr_includes_estimated_dividend() -> None:
    """XIRR cash flows: each period -outflow + estimated_dividend,
    last period + ending_value."""
    df = _frame(
        [
            {
                "date": "2026-01-31",
                "installment_amount": 1000,
                "new_share_purchases": 0,
                "dividends": 0,
                "current_value": 1000,
                "dividend_yield": 0.12,
            },
            {
                "date": "2026-02-28",
                "installment_amount": 1000,
                "new_share_purchases": 0,
                "dividends": 0,
                "current_value": 10000,
                "dividend_yield": 0.12,
            },
        ]
    )
    # month 1: -1000 + (1000*0.12/12=10) = -990
    # month 2: -1000 + (10000*0.12/12=100) + 10000 = 9100
    _metrics, summary = stock_metrics(df)
    assert summary["xirr"] > 0
    assert summary["estimated_annual_dividend"] == pytest.approx(10000 * 0.12)


def test_summary_omits_estimated_keys_when_no_yield() -> None:
    """When the last row has no dividend yield, the summary
    does not contain estimated_dividend keys."""
    df = _frame(
        [
            {
                "date": "2026-01-31",
                "installment_amount": 700,
                "new_share_purchases": 0,
                "dividends": 0,
                "current_value": 1000,
                "dividend_yield": 0.0,
            },
            {
                "date": "2026-02-28",
                "installment_amount": 700,
                "new_share_purchases": 0,
                "dividends": 0,
                "current_value": 5000,
                "dividend_yield": 0.0,
            },
        ]
    )
    _metrics, summary = stock_metrics(df)
    assert "estimated_annual_dividend" not in summary
    assert "estimated_monthly_dividend" not in summary
