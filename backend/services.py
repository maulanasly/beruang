from __future__ import annotations

from datetime import date

import pandas as pd
import yfinance as yf

from backend.schemas import (
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
    """yfinance reports dividendYield as a percentage; keep it a fraction."""
    if raw is None:
        return None
    try:
        value = float(raw)
    except (TypeError, ValueError):
        return None
    if value > 1:
        value /= 100.0
    return value if value >= 0 else None


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
        ledger_rows.append(
            StockLedgerRowResponse(
                date=pd.to_datetime(row["date"]).date(),
                installment_amount=float(row["installment_amount"]),
                new_share_purchases=float(row["new_share_purchases"]),
                dividends=float(row["dividends"]),
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

    summary_response = StockSummaryResponse(
        total_contribution=float(summary["total_contribution"]),
        ending_value=float(summary["ending_value"]),
        roi=float(summary["roi"]),
        xirr=float(summary["xirr"]),
    )
    return summary_response, ledger_rows


def calculate_term_deposit_returns(
    entries: list[TermDepositLedgerEntry],
    apy: float,
) -> tuple[TermDepositSummaryResponse, list[TermDepositLedgerRowResponse]]:
    ledger_frame = pd.DataFrame([entry.model_dump() for entry in entries])
    metrics_table, summary = term_deposit_metrics(ledger_frame, apy=apy)

    ledger_rows: list[TermDepositLedgerRowResponse] = []
    for row in metrics_table.to_dict(orient="records"):
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
            )
        )

    summary_response = TermDepositSummaryResponse(
        apy=float(summary["apy"]),
        monthly_rate=float(summary["monthly_rate"]),
        projected_fv_constant_installment=float(
            summary["projected_fv_constant_installment"]
        ),
        ending_value=float(summary["ending_value"]),
    )
    return summary_response, ledger_rows
