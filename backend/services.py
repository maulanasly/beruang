from __future__ import annotations

import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import UTC, date, datetime
from functools import wraps

import pandas as pd
import yfinance as yf

from backend.schemas import (
    DividendYieldItem,
    DividendYieldsResponse,
    IdxStockItem,
    IdxStockListResponse,
    IndexHistoryPoint,
    IndexHistoryResponse,
    MutualFundLedgerEntry,
    MutualFundLedgerRowResponse,
    MutualFundSummaryResponse,
    PriceHistoryPoint,
    PriceHistoryResponse,
    StockLedgerEntry,
    StockLedgerRowResponse,
    StockQuoteResponse,
    StockSummaryResponse,
    TermDepositLedgerEntry,
    TermDepositLedgerRowResponse,
    TermDepositSummaryResponse,
)
from logic import mutual_fund_metrics, stock_metrics, term_deposit_metrics

IDX_KOMPAS100_STARTER: list[tuple[str, str]] = [
    ("ASII.JK", "Astra International Tbk"),
    ("ADRO.JK", "Alamtri Resources Indonesia Tbk"),
    ("AMMN.JK", "Amman Mineral Internasional Tbk"),
    ("ANTM.JK", "Aneka Tambang Tbk"),
    ("BBCA.JK", "Bank Central Asia Tbk"),
    ("BBNI.JK", "Bank Negara Indonesia (Persero) Tbk"),
    ("BBRI.JK", "Bank Rakyat Indonesia (Persero) Tbk"),
    ("BMRI.JK", "Bank Mandiri (Persero) Tbk"),
    ("BRIS.JK", "Bank Syariah Indonesia Tbk"),
    ("CPIN.JK", "Charoen Pokphand Indonesia Tbk"),
    ("GOTO.JK", "GoTo Gojek Tokopedia Tbk"),
    ("ICBP.JK", "Indofood CBP Sukses Makmur Tbk"),
    ("INDF.JK", "Indofood Sukses Makmur Tbk"),
    ("INKP.JK", "Indah Kiat Pulp & Paper Tbk"),
    ("KLBF.JK", "Kalbe Farma Tbk"),
    ("MDKA.JK", "Merdeka Copper Gold Tbk"),
    ("MEDC.JK", "Medco Energi Internasional Tbk"),
    ("PGAS.JK", "Perusahaan Gas Negara Tbk"),
    ("PTBA.JK", "Bukit Asam Tbk"),
    ("SMGR.JK", "Semen Indonesia (Persero) Tbk"),
    ("TLKM.JK", "Telkom Indonesia (Persero) Tbk"),
    ("TOWR.JK", "Sarana Menara Nusantara Tbk"),
    ("UNTR.JK", "United Tractors Tbk"),
    ("UNVR.JK", "Unilever Indonesia Tbk"),
]


def get_kompas100_starter_stocks() -> IdxStockListResponse:
    return IdxStockListResponse(
        index_name="Kompas 100 (Starter)",
        items=[
            IdxStockItem(symbol=symbol, name=name)
            for symbol, name in IDX_KOMPAS100_STARTER
        ],
    )


def search_idx_stocks(query: str, limit: int = 10) -> list[IdxStockItem]:
    """Search the IDX universe via Yahoo Finance and return only IDX listings."""
    normalized = query.strip()
    if not normalized:
        raise ValueError("Query is required.")

    search = yf.Search(query=normalized, max_results=max(limit * 4, 20))

    seen: set[str] = set()
    items: list[IdxStockItem] = []
    for quote in search.quotes or []:
        symbol = quote.get("symbol") or ""
        if not symbol.endswith(".JK") and quote.get("exchange") != "JKT":
            continue
        if symbol in seen:
            continue
        seen.add(symbol)
        name = quote.get("shortname") or quote.get("longname") or symbol
        items.append(IdxStockItem(symbol=symbol, name=name))
        if len(items) >= limit:
            break

    return items


def _normalize_dividend_yield(raw: object) -> float | None:
    """Normalize a dividend yield to a fraction.

    yfinance reports dividendYield inconsistently: most symbols return the
    percentage figure (e.g. 5.58 for 5.58%), but low-yield symbols can come
    back below 1.0 (e.g. 0.9 for 0.9%). Real yields effectively never exceed
    20%, so values at or above 0.2 are treated as percentages and divided by
    100; everything below is already a fraction.
    """
    if raw is None:
        return None
    try:
        value = float(raw)
    except (TypeError, ValueError):
        return None
    if value >= 0.2:
        value /= 100.0
    return value if value >= 0 else None


def _ttl_cache(ttl_seconds: int):
    """Decorator: cache the wrapped function's return value for `ttl_seconds`."""
    cache: dict[str, tuple[object, float]] = {}

    @wraps(_ttl_cache)
    def wrapper(func):
        @wraps(func)
        def cached(*args, **kwargs):
            now = time.time()
            key = str(datetime.now(UTC).date()) + repr((args, kwargs))
            if key in cache:
                value, deadline = cache[key]
                if now < deadline:
                    return value
            result = func(*args, **kwargs)
            cache[key] = (result, now + ttl_seconds)
            return result

        return cached

    return wrapper


def _quote_snapshot(symbol: str) -> DividendYieldItem | None:
    """Fetch a single symbol's snapshot: price, name, currency, dividend_yield.

    Returns None if the symbol cannot be resolved or has no dividend yield.
    """
    try:
        ticker = yf.Ticker(symbol)
        fast_info = getattr(ticker, "fast_info", None)
        price = None
        currency = "IDR"
        name = symbol

        if fast_info:
            price = fast_info.get("lastPrice") or fast_info.get("last_price")
            currency = fast_info.get("currency") or currency

        info = getattr(ticker, "info", {}) or {}
        name = info.get("shortName") or info.get("longName") or name
        currency = info.get("currency") or currency
        dividend_yield = _normalize_dividend_yield(info.get("dividendYield"))

        if dividend_yield is None or dividend_yield <= 0:
            return None

        if price is None:
            history = ticker.history(period="1d")
            if not history.empty:
                close_value = history["Close"].dropna()
                if not close_value.empty:
                    price = float(close_value.iloc[-1])

        if price is None:
            return None

        return DividendYieldItem(
            symbol=symbol,
            name=name,
            price=float(price),
            currency=currency,
            dividend_yield=dividend_yield,
        )
    except Exception:
        return None


@_ttl_cache(ttl_seconds=21600)  # 6 hours
def get_top_dividend_yields(limit: int = 10) -> DividendYieldsResponse:
    """Return the top-N dividend-yielding stocks from the Kompas 100 Starter universe.

    Yield values are fetched from Yahoo Finance in parallel. Results are cached
    in-process for 6 hours so the frontend never triggers a full re-fetch per
    page load.
    """
    symbols = [sym for sym, _name in IDX_KOMPAS100_STARTER]
    results: list[DividendYieldItem] = []

    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(_quote_snapshot, sym): sym for sym in symbols}
        for future in as_completed(futures):
            item = future.result()
            if item is not None:
                results.append(item)

    results.sort(key=lambda i: i.dividend_yield, reverse=True)
    return DividendYieldsResponse(
        as_of=date.today(),
        items=results[: max(limit, 1)],
    )


def get_latest_stock_quote(symbol: str) -> StockQuoteResponse:
    normalized_symbol = symbol.strip().upper()
    if not normalized_symbol:
        raise ValueError("Symbol is required.")

    ticker = yf.Ticker(normalized_symbol)

    price = None
    currency = "IDR"
    name = normalized_symbol

    fast_info = getattr(ticker, "fast_info", None)
    if fast_info:
        price = fast_info.get("lastPrice") or fast_info.get("last_price")
        currency = fast_info.get("currency") or currency

    info = getattr(ticker, "info", {}) or {}
    name = info.get("shortName") or info.get("longName") or name
    currency = info.get("currency") or currency
    dividend_yield = _normalize_dividend_yield(info.get("dividendYield"))

    if price is None:
        history = ticker.history(period="1d")
        if not history.empty:
            close_value = history["Close"].dropna()
            if not close_value.empty:
                price = float(close_value.iloc[-1])

    if price is None:
        raise RuntimeError(
            f"Unable to fetch latest market price for symbol '{normalized_symbol}'."
        )

    return StockQuoteResponse(
        symbol=normalized_symbol,
        name=name,
        price=float(price),
        currency=currency,
        dividend_yield=dividend_yield,
    )


INDEX_OPTIONS: dict[str, str] = {
    "^JKSE": "IDX Composite (IHSG)",
    "^JKLQ45": "LQ45",
}

INDEX_PERIODS: tuple[str, ...] = ("1mo", "3mo", "6mo", "1y", "2y", "5y")


def get_index_history(symbol: str, period: str) -> IndexHistoryResponse:
    normalized_symbol = symbol.strip().upper()
    if normalized_symbol not in INDEX_OPTIONS:
        raise ValueError(
            f"Unsupported index '{symbol}'. Choose from {', '.join(INDEX_OPTIONS)}."
        )
    if period not in INDEX_PERIODS:
        raise ValueError(
            f"Unsupported period '{period}'. Choose from {', '.join(INDEX_PERIODS)}."
        )

    history = yf.Ticker(normalized_symbol).history(period=period)
    points = [
        IndexHistoryPoint(date=point_date, close=close_value)
        for point_date, close_value in _points_from_history(history)
    ]

    return IndexHistoryResponse(
        symbol=normalized_symbol,
        name=INDEX_OPTIONS[normalized_symbol],
        period=period,
        points=points,
    )


def _points_from_history(history: pd.DataFrame) -> list[tuple[date, float]]:
    """Extract sorted daily closing prices from a yfinance history frame."""
    if history is None or history.empty:
        raise RuntimeError("No historical data available.")

    close_values = history["Close"].dropna()
    points = [
        (timestamp.date(), float(close_value))
        for timestamp, close_value in close_values.items()
    ]
    if not points:
        raise RuntimeError("No historical data available.")

    points.sort(key=lambda point: point[0])
    return points


def get_price_history(symbol: str, period: str) -> PriceHistoryResponse:
    normalized_symbol = symbol.strip().upper()
    if not normalized_symbol:
        raise ValueError("Symbol is required.")
    if period not in INDEX_PERIODS:
        raise ValueError(
            f"Unsupported period '{period}'. Choose from {', '.join(INDEX_PERIODS)}."
        )

    ticker = yf.Ticker(normalized_symbol)
    info = getattr(ticker, "info", {}) or {}
    name = info.get("shortName") or info.get("longName") or normalized_symbol
    currency = info.get("currency") or "IDR"
    dividend_yield = _normalize_dividend_yield(info.get("dividendYield"))
    points = [
        PriceHistoryPoint(date=point_date, close=close_value)
        for point_date, close_value in _points_from_history(
            ticker.history(period=period)
        )
    ]

    return PriceHistoryResponse(
        symbol=normalized_symbol,
        name=name,
        period=period,
        currency=currency,
        dividend_yield=dividend_yield,
        points=points,
    )


def calculate_mutual_fund_returns(
    entries: list[MutualFundLedgerEntry],
) -> tuple[MutualFundSummaryResponse, list[MutualFundLedgerRowResponse]]:
    ledger_frame = pd.DataFrame([entry.model_dump() for entry in entries])
    metrics_table, summary = mutual_fund_metrics(ledger_frame)

    ledger_rows: list[MutualFundLedgerRowResponse] = []
    for row in metrics_table.to_dict(orient="records"):
        ledger_rows.append(
            MutualFundLedgerRowResponse(
                date=pd.to_datetime(row["date"]).date(),
                installment_amount=float(row["installment_amount"]),
                current_value=float(row["current_value"]),
                month_start_value=(
                    float(row["month_start_value"])
                    if pd.notna(row.get("month_start_value"))
                    else None
                ),
                mom_return=(
                    float(row["mom_return"])
                    if pd.notna(row.get("mom_return"))
                    else None
                ),
            )
        )

    summary_response = MutualFundSummaryResponse(
        total_installments=float(summary["total_installments"]),
        ending_value=float(summary["ending_value"]),
        xirr=float(summary["xirr"]),
    )
    return summary_response, ledger_rows


def calculate_stock_returns(
    entries: list[StockLedgerEntry],
) -> tuple[StockSummaryResponse, list[StockLedgerRowResponse]]:
    ledger_frame = pd.DataFrame([entry.model_dump() for entry in entries])
    metrics_table, summary = stock_metrics(ledger_frame)

    ledger_rows: list[StockLedgerRowResponse] = []
    for row in metrics_table.to_dict(orient="records"):
        raw_yield = float(row.get("dividend_yield", 0.0))
        raw_estimated = float(row.get("estimated_dividend", 0.0))
        ledger_rows.append(
            StockLedgerRowResponse(
                date=pd.to_datetime(row["date"]).date(),
                installment_amount=float(row["installment_amount"]),
                new_share_purchases=float(row["new_share_purchases"]),
                dividends=float(row["dividends"]),
                current_value=float(row["current_value"]),
                dividend_yield=raw_yield if raw_yield > 0 else None,
                estimated_dividend=raw_estimated if raw_estimated > 0 else None,
                month_start_value=(
                    float(row["month_start_value"])
                    if pd.notna(row.get("month_start_value"))
                    else None
                ),
                mom_return=(
                    float(row["mom_return"])
                    if pd.notna(row.get("mom_return"))
                    else None
                ),
            )
        )

    summary_response = StockSummaryResponse(
        total_contribution=float(summary["total_contribution"]),
        ending_value=float(summary["ending_value"]),
        roi=float(summary["roi"]),
        xirr=float(summary["xirr"]),
        estimated_annual_dividend=summary.get("estimated_annual_dividend"),
        estimated_monthly_dividend=summary.get("estimated_monthly_dividend"),
    )
    return summary_response, ledger_rows


def calculate_term_deposit_returns(
    entries: list[TermDepositLedgerEntry],
    apy: float,
    reference_date: date | None = None,
) -> tuple[TermDepositSummaryResponse, list[TermDepositLedgerRowResponse]]:
    ledger_frame = pd.DataFrame([entry.model_dump() for entry in entries])
    metrics_table, summary = term_deposit_metrics(
        ledger_frame, apy=apy, reference_date=reference_date
    )

    ledger_rows: list[TermDepositLedgerRowResponse] = []
    for row in metrics_table.to_dict(orient="records"):
        maturity_date = row.get("maturity_date")
        days_to_maturity = row.get("days_to_maturity")
        ledger_rows.append(
            TermDepositLedgerRowResponse(
                date=pd.to_datetime(row["date"]).date(),
                installment_amount=float(row["installment_amount"]),
                current_value=float(row["current_value"]),
                month_start_value=(
                    float(row["month_start_value"])
                    if pd.notna(row.get("month_start_value"))
                    else None
                ),
                prorated_interest=(
                    float(row["prorated_interest"])
                    if pd.notna(row.get("prorated_interest"))
                    else None
                ),
                expected_month_end_value=(
                    float(row["expected_month_end_value"])
                    if pd.notna(row.get("expected_month_end_value"))
                    else None
                ),
                term_months=int(row.get("term_months") or 12),
                maturity_date=(
                    pd.to_datetime(maturity_date).date()
                    if maturity_date is not None and pd.notna(maturity_date)
                    else None
                ),
                days_to_maturity=(
                    int(days_to_maturity)
                    if days_to_maturity is not None and pd.notna(days_to_maturity)
                    else None
                ),
                maturity_status=(
                    str(row["maturity_status"])
                    if pd.notna(row.get("maturity_status"))
                    else None
                ),
                maturity_value=(
                    float(row["maturity_value"])
                    if pd.notna(row.get("maturity_value"))
                    else None
                ),
                accrued_interest=(
                    float(row["accrued_interest"])
                    if pd.notna(row.get("accrued_interest"))
                    else None
                ),
            )
        )

    summary_response = TermDepositSummaryResponse(
        apy=float(summary["apy"]),
        monthly_rate=float(summary["monthly_rate"]),
        projected_fv_constant_installment=float(
            summary["projected_fv_constant_installment"]
        ),
        ending_value=float(summary["ending_value"]),
        total_accrued_interest=float(summary["total_accrued_interest"]),
        rollover_value=float(summary["rollover_value"]),
        next_maturity_date=summary.get("next_maturity_date"),
    )
    return summary_response, ledger_rows
