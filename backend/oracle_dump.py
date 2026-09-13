"""Frozen-oracle fixture dumper for the Rust calc parity harness.

Runs `logic.py` (via `backend/services.py`, i.e. the exact API response
shapes) over a deterministic corpus and writes
`rust-gateway/tests/fixtures/*.json` files of the form::

    {
      "name": "<case>",
      "request": {"asset": "mutual-funds|stocks|term-deposits",
                  "payload": {...}},
      "expect": {"ok": true, "response": {...}}
              | {"ok": false, "status": 422, "detail_contains": "..."}
    }

Term-deposit cases pin `reference_date` so `days_to_maturity` is stable.
`logic.py` is the frozen oracle: regenerate fixtures only when it changes,
and review the diff before committing.
"""

from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path

from backend.schemas import (
    MutualFundLedgerEntry,
    StockLedgerEntry,
    TermDepositLedgerEntry,
)
from backend.services import (
    calculate_mutual_fund_returns,
    calculate_stock_returns,
    calculate_term_deposit_returns,
)

ROOT = Path(__file__).resolve().parent.parent
FIXTURE_DIR = ROOT / "rust-gateway" / "tests" / "fixtures"

# Fixed "today" so term-deposit maturity fields are deterministic.
REFERENCE_DATE = date(2026, 9, 13)


def dump_response(summary, rows) -> dict:
    return {
        "summary": json.loads(summary.model_dump_json()),
        "ledger": [json.loads(r.model_dump_json()) for r in rows],
    }


def ok_case(name: str, asset: str, payload: dict, response: dict) -> dict:
    return {
        "name": name,
        "request": {"asset": asset, "payload": payload},
        "expect": {"ok": True, "response": response},
    }


def err_case(
    name: str, asset: str, payload: dict, status: int, detail_contains: str
) -> dict:
    return {
        "name": name,
        "request": {"asset": asset, "payload": payload},
        "expect": {
            "ok": False,
            "status": status,
            "detail_contains": detail_contains,
        },
    }


def run_mf(entries: list[dict]):
    summary, rows = calculate_mutual_fund_returns(
        [MutualFundLedgerEntry(**e) for e in entries]
    )
    return dump_response(summary, rows)


def run_stocks(entries: list[dict]):
    summary, rows = calculate_stock_returns([StockLedgerEntry(**e) for e in entries])
    return dump_response(summary, rows)


def run_td(apy: float, entries: list[dict]):
    summary, rows = calculate_term_deposit_returns(
        [TermDepositLedgerEntry(**e) for e in entries],
        apy=apy,
        reference_date=REFERENCE_DATE,
    )
    return dump_response(summary, rows)


def build_cases() -> list[dict]:
    cases: list[dict] = []

    # -- Static frontend defaults (store.js) ---------------------------------
    mf_default = [
        {"date": "2026-05-31", "installment_amount": 1100, "current_value": 6500},
        {"date": "2026-06-30", "installment_amount": 1100, "current_value": 7700},
    ]
    cases.append(
        ok_case(
            "mf_static_defaults",
            "mutual-funds",
            {"entries": mf_default},
            run_mf(mf_default),
        )
    )

    stocks_default = [
        {
            "date": "2026-05-31",
            "installment_amount": 700,
            "new_share_purchases": 300,
            "dividends": 0,
            "dividend_yield": None,
            "current_value": 1000,
        },
        {
            "date": "2026-06-30",
            "installment_amount": 700,
            "new_share_purchases": 200,
            "dividends": 10,
            "dividend_yield": None,
            "current_value": 1950,
        },
    ]
    cases.append(
        ok_case(
            "stocks_static_defaults",
            "stocks",
            {"entries": stocks_default},
            run_stocks(stocks_default),
        )
    )

    td_default = [
        {
            "date": "2026-05-31",
            "installment_amount": 1000,
            "current_value": 1000,
            "term_months": 12,
            "maturity_date": "2027-05-31",
        },
        {
            "date": "2026-06-30",
            "installment_amount": 1000,
            "current_value": 2005,
            "term_months": 12,
            "maturity_date": "2027-06-30",
        },
    ]
    cases.append(
        ok_case(
            "td_static_defaults",
            "term-deposits",
            {"apy": 0.06, "entries": td_default},
            run_td(0.06, td_default),
        )
    )

    # -- Six-row demo ledgers (logic.mock_data_demo shapes) -------------------
    dates6 = [
        "2026-01-31",
        "2026-02-28",
        "2026-03-31",
        "2026-04-30",
        "2026-05-31",
        "2026-06-30",
    ]
    mf6 = [
        {"date": d, "installment_amount": 1000, "current_value": v}
        for d, v in zip(dates6, [1000, 2050, 3120, 4200, 5300, 6450], strict=True)
    ]
    cases.append(ok_case("mf_six_rows", "mutual-funds", {"entries": mf6}, run_mf(mf6)))

    st6 = [
        {
            "date": d,
            "installment_amount": 700,
            "new_share_purchases": p,
            "dividends": dv,
            "current_value": v,
        }
        for d, p, dv, v in zip(
            dates6,
            [300, 200, 150, 250, 100, 200],
            [0, 10, 0, 12, 8, 15],
            [1000, 1950, 2850, 3920, 4900, 6080],
            strict=True,
        )
    ]
    cases.append(
        ok_case(
            "stocks_six_rows_dividends", "stocks", {"entries": st6}, run_stocks(st6)
        )
    )

    # Stocks with a trailing dividend yield (exercises estimated_dividend).
    st6_yield = [dict(e) for e in st6]
    st6_yield[-1]["dividend_yield"] = 0.0602
    cases.append(
        ok_case(
            "stocks_six_rows_yield",
            "stocks",
            {"entries": st6_yield},
            run_stocks(st6_yield),
        )
    )

    td6 = [
        {"date": d, "installment_amount": 1000, "current_value": v}
        for d, v in zip(dates6, [1000, 2005, 3020, 4042, 5075, 6115], strict=True)
    ]
    cases.append(
        ok_case(
            "td_six_rows_derived_maturity",
            "term-deposits",
            {"apy": 0.06, "entries": td6},
            run_td(0.06, td6),
        )
    )

    # -- Edge cases ------------------------------------------------------------
    # XIRR bracket expansion: solid gain over one month forces the
    # high-bound doubling loop well beyond 10.0 (distinct from defaults).
    mf_expand = [
        {"date": "2026-05-31", "installment_amount": 1000, "current_value": 1000},
        {"date": "2026-06-30", "installment_amount": 1000, "current_value": 3100},
    ]
    cases.append(
        ok_case(
            "mf_xirr_bracket_expansion",
            "mutual-funds",
            {"entries": mf_expand},
            run_mf(mf_expand),
        )
    )

    # XIRR unbracketable: gain so extreme no root exists below 1e20.
    # Documents the 422 boundary of the bracketing loop.
    mf_huge = [
        {"date": "2026-05-31", "installment_amount": 1000, "current_value": 1000},
        {"date": "2026-06-30", "installment_amount": 1000, "current_value": 1000000},
    ]
    try:
        resp = run_mf(mf_huge)
        cases.append(
            ok_case("mf_xirr_unbracketable", "mutual-funds", {"entries": mf_huge}, resp)
        )
    except ValueError as exc:
        cases.append(
            err_case(
                "mf_xirr_unbracketable",
                "mutual-funds",
                {"entries": mf_huge},
                422,
                str(exc)[:80],
            )
        )

    # Zero contributions with value growth (gifted holdings).
    mf_zero = [
        {"date": "2026-05-31", "installment_amount": 0, "current_value": 5000},
        {"date": "2026-06-30", "installment_amount": 0, "current_value": 5200},
    ]
    try:
        resp = run_mf(mf_zero)
        cases.append(
            ok_case("mf_zero_contributions", "mutual-funds", {"entries": mf_zero}, resp)
        )
    except ValueError as exc:
        cases.append(
            err_case(
                "mf_zero_contributions",
                "mutual-funds",
                {"entries": mf_zero},
                422,
                str(exc)[:80],
            )
        )

    # APY zero.
    cases.append(
        ok_case(
            "td_apy_zero",
            "term-deposits",
            {"apy": 0.0, "entries": td6},
            run_td(0.0, td6),
        )
    )

    # All-matured deposits (reference date past every maturity).
    td_matured = [
        {
            "date": "2025-01-31",
            "installment_amount": 1000,
            "current_value": 1000,
            "term_months": 6,
            "maturity_date": "2025-07-31",
        },
        {
            "date": "2025-02-28",
            "installment_amount": 1000,
            "current_value": 2005,
            "term_months": 6,
            "maturity_date": "2025-08-28",
        },
    ]
    cases.append(
        ok_case(
            "td_all_matured",
            "term-deposits",
            {"apy": 0.06, "entries": td_matured},
            run_td(0.06, td_matured),
        )
    )

    # Day-31 start crossing February (derived maturity validity probe).
    td_jan31 = [
        {
            "date": "2026-01-31",
            "installment_amount": 1000,
            "current_value": 1000,
            "term_months": 1,
        },
        {
            "date": "2026-02-28",
            "installment_amount": 1000,
            "current_value": 2005,
            "term_months": 1,
        },
    ]
    try:
        resp = run_td(0.06, td_jan31)
        cases.append(
            ok_case(
                "td_jan31_one_month_term",
                "term-deposits",
                {"apy": 0.06, "entries": td_jan31},
                resp,
            )
        )
    except (ValueError, TypeError) as exc:
        # Normalize pandas' datetime-assembly message to a stable substring
        # the Rust port reproduces verbatim ("day is out of range").
        detail = str(exc)
        detail = (
            "day is out of range for month" if "out of range" in detail else detail[:80]
        )
        cases.append(
            err_case(
                "td_jan31_one_month_term",
                "term-deposits",
                {"apy": 0.06, "entries": td_jan31},
                422,
                detail,
            )
        )

    # -- Validation error cases (mirror FastAPI 422 mapping) -------------------
    cases.append(
        err_case(
            "mf_empty_entries",
            "mutual-funds",
            {"entries": []},
            422,
            "At least one ledger row",
        )
    )
    cases.append(
        err_case(
            "mf_single_row_xirr",
            "mutual-funds",
            {
                "entries": [
                    {
                        "date": "2026-06-30",
                        "installment_amount": 1000,
                        "current_value": 1000,
                    }
                ]
            },
            422,
            "at least two",
        )
    )
    cases.append(
        err_case(
            "td_apy_below_floor",
            "term-deposits",
            {"apy": -1.5, "entries": td_default},
            422,
            "greater than -100%",
        )
    )

    return cases


def main() -> None:
    cases = build_cases()
    FIXTURE_DIR.mkdir(parents=True, exist_ok=True)
    # Remove stale fixtures so renames don't linger.
    for stale in FIXTURE_DIR.glob("*.json"):
        stale.unlink()
    for case in cases:
        path = FIXTURE_DIR / f"{case['name']}.json"
        path.write_text(json.dumps(case, indent=2, default=str) + "\n")
    print(f"Wrote {len(cases)} fixtures to {FIXTURE_DIR}")
    for case in cases:
        status = "ok" if case["expect"]["ok"] else "err"
        print(f"  [{status}] {case['name']}")


if __name__ == "__main__":
    sys.exit(main())
