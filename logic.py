from __future__ import annotations

from collections.abc import Iterable

import numpy as np
import numpy_financial as npf
import pandas as pd

LEDGER_COLUMNS = ["date", "installment_amount", "current_value"]
STOCK_LEDGER_COLUMNS = LEDGER_COLUMNS + ["new_share_purchases", "dividends", "dividend_yield"]


def create_empty_ledger() -> pd.DataFrame:
    """Return an empty ledger with the required schema."""
    return pd.DataFrame(columns=LEDGER_COLUMNS)


def create_empty_stock_ledger() -> pd.DataFrame:
    """Return an empty stock ledger with purchase and dividend columns."""
    return pd.DataFrame(columns=STOCK_LEDGER_COLUMNS)


def _prepare_ledger(
    ledger: pd.DataFrame, required_columns: Iterable[str]
) -> pd.DataFrame:
    """Validate, normalize, and sort a monthly ledger."""
    missing = [col for col in required_columns if col not in ledger.columns]
    if missing:
        raise ValueError(f"Missing required columns: {missing}")

    normalized = ledger.copy()
    normalized["date"] = pd.to_datetime(normalized["date"])  # type: ignore[assignment]
    normalized = normalized.sort_values("date").reset_index(drop=True)

    for col in required_columns:
        if col != "date":
            normalized[col] = pd.to_numeric(normalized[col], errors="coerce").fillna(
                0.0
            )

    return normalized


def _xnpv(rate: float, cash_flows: list[float], dates: list[pd.Timestamp]) -> float:
    """Compute NPV with exact dates (XNPV)."""
    start = dates[0]
    return sum(
        cf / (1.0 + rate) ** ((date - start).days / 365.0)
        for cf, date in zip(cash_flows, dates, strict=True)
    )


def calculate_xirr(dates: Iterable[pd.Timestamp], cash_flows: Iterable[float]) -> float:
    """Compute annualized XIRR from dated cash flows using bisection."""
    dated = sorted(
        zip(pd.to_datetime(list(dates)), list(cash_flows), strict=True),
        key=lambda x: x[0],
    )
    if len(dated) < 2:
        raise ValueError("XIRR requires at least two cash flow points.")

    sorted_dates = [d for d, _ in dated]
    sorted_flows = [float(cf) for _, cf in dated]

    has_positive = any(cf > 0 for cf in sorted_flows)
    has_negative = any(cf < 0 for cf in sorted_flows)
    if not (has_positive and has_negative):
        raise ValueError(
            "XIRR requires at least one positive and one negative cash flow."
        )

    low = -0.9999
    high = 10.0
    f_low = _xnpv(low, sorted_flows, sorted_dates)
    f_high = _xnpv(high, sorted_flows, sorted_dates)

    # Some valid cash-flow sets (e.g. very large gain over a short period)
    # require extremely large positive rates before XNPV changes sign.
    expand_count = 0
    max_expand_count = 120
    max_high = 1e20
    while f_low * f_high > 0 and expand_count < max_expand_count and high < max_high:
        high *= 2
        f_high = _xnpv(high, sorted_flows, sorted_dates)
        expand_count += 1

    if f_low * f_high > 0:
        raise ValueError("Could not bracket XIRR root for given cash flows.")

    for _ in range(200):
        mid = (low + high) / 2.0
        f_mid = _xnpv(mid, sorted_flows, sorted_dates)

        if abs(f_mid) < 1e-9:
            return mid
        if f_low * f_mid < 0:
            high = mid
            f_high = f_mid
        else:
            low = mid
            f_low = f_mid

    return (low + high) / 2.0


def mutual_fund_metrics(ledger: pd.DataFrame) -> tuple[pd.DataFrame, dict[str, float]]:
    """Calculate cash-flow adjusted MoM return and overall XIRR for mutual funds."""
    df = _prepare_ledger(ledger, LEDGER_COLUMNS)
    df["month_start_value"] = df["current_value"].shift(1)

    df["mom_return"] = np.where(
        df["month_start_value"] > 0,
        (df["current_value"] - df["installment_amount"] - df["month_start_value"])
        / df["month_start_value"],
        np.nan,
    )

    cash_flows = (-df["installment_amount"]).tolist()
    cash_flows[-1] += float(df["current_value"].iloc[-1])
    xirr = calculate_xirr(df["date"], cash_flows)

    summary = {
        "total_installments": float(df["installment_amount"].sum()),
        "ending_value": float(df["current_value"].iloc[-1]),
        "xirr": float(xirr),
    }
    return df, summary


def stock_metrics(ledger: pd.DataFrame) -> tuple[pd.DataFrame, dict[str, float]]:
    """Calculate stock MoM return, ROI, and XIRR with purchases/dividends."""
    df = _prepare_ledger(ledger, STOCK_LEDGER_COLUMNS)
    df["month_start_value"] = df["current_value"].shift(1)
    df["estimated_dividend"] = df["current_value"] * df["dividend_yield"] / 12.0

    df["mom_return"] = np.where(
        df["month_start_value"] > 0,
        (
            df["current_value"]
            - df["new_share_purchases"]
            + df["dividends"]
            + df["estimated_dividend"]
            - df["month_start_value"]
        )
        / df["month_start_value"],
        np.nan,
    )

    cash_outflow = df["installment_amount"] + df["new_share_purchases"]
    per_row = (-cash_outflow + df["estimated_dividend"]).tolist()
    per_row[-1] += float(df["current_value"].iloc[-1])
    xirr = calculate_xirr(df["date"], per_row)

    total_contribution = float(cash_outflow.sum())
    ending_value = float(df["current_value"].iloc[-1])
    roi = (
        (ending_value - total_contribution) / total_contribution
        if total_contribution > 0
        else np.nan
    )

    last_yield = float(df["dividend_yield"].iloc[-1]) if pd.notna(df["dividend_yield"].iloc[-1]) else 0.0

    summary = {
        "total_contribution": total_contribution,
        "ending_value": ending_value,
        "roi": float(roi),
        "xirr": float(xirr),
    }
    if last_yield > 0:
        summary["estimated_annual_dividend"] = ending_value * last_yield
        summary["estimated_monthly_dividend"] = ending_value * last_yield / 12.0
    return df, summary


def term_deposit_metrics(
    ledger: pd.DataFrame, apy: float
) -> tuple[pd.DataFrame, dict[str, float]]:
    """Calculate prorated monthly APY progression for term deposits."""
    if apy < -1.0:
        raise ValueError("APY must be greater than -100%.")

    df = _prepare_ledger(ledger, LEDGER_COLUMNS)
    monthly_rate = (1.0 + apy) ** (1.0 / 12.0) - 1.0
    df["month_start_value"] = df["current_value"].shift(1).fillna(0.0)
    df["prorated_interest"] = df["month_start_value"] * monthly_rate
    df["expected_month_end_value"] = (
        df["month_start_value"] + df["installment_amount"] + df["prorated_interest"]
    )

    periods = len(df)
    installment = float(df["installment_amount"].iloc[0]) if periods > 0 else 0.0
    projected_fv = npf.fv(rate=monthly_rate, nper=periods, pmt=-installment, pv=0.0)

    summary = {
        "apy": float(apy),
        "monthly_rate": float(monthly_rate),
        "projected_fv_constant_installment": float(projected_fv),
        "ending_value": float(df["current_value"].iloc[-1]),
    }
    return df, summary


def mock_data_demo() -> dict[str, tuple[pd.DataFrame, dict[str, float]]]:
    """Run calculations with mock data to verify formulas and outputs."""
    dates = pd.date_range("2026-01-31", periods=6, freq="ME")

    mutual_fund_ledger = pd.DataFrame(
        {
            "date": dates,
            "installment_amount": [1000, 1000, 1000, 1000, 1000, 1000],
            "current_value": [1000, 2050, 3120, 4200, 5300, 6450],
        }
    )

    stock_ledger = pd.DataFrame(
        {
            "date": dates,
            "installment_amount": [700, 700, 700, 700, 700, 700],
            "new_share_purchases": [300, 200, 150, 250, 100, 200],
            "dividends": [0, 10, 0, 12, 8, 15],
            "current_value": [1000, 1950, 2850, 3920, 4900, 6080],
        }
    )

    term_deposit_ledger = pd.DataFrame(
        {
            "date": dates,
            "installment_amount": [1000, 1000, 1000, 1000, 1000, 1000],
            "current_value": [1000, 2005, 3020, 4042, 5075, 6115],
        }
    )

    mf_result = mutual_fund_metrics(mutual_fund_ledger)
    stock_result = stock_metrics(stock_ledger)
    td_result = term_deposit_metrics(term_deposit_ledger, apy=0.06)

    return {
        "mutual_fund": mf_result,
        "stock": stock_result,
        "term_deposit": td_result,
    }


def print_mock_verification() -> None:
    """Print mock outputs for quick verification in terminal runs."""
    results = mock_data_demo()
    for name, (table, summary) in results.items():
        print(f"\n=== {name.upper()} ===")
        printable = table.copy()
        numeric_cols = printable.select_dtypes(include=[np.number]).columns
        printable[numeric_cols] = printable[numeric_cols].round(6)
        print(printable.to_string(index=False))
        print("Summary:")
        for key, value in summary.items():
            print(f"  {key}: {value:.6f}")


if __name__ == "__main__":
    print_mock_verification()
