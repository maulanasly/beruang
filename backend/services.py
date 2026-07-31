from __future__ import annotations

import pandas as pd
import yfinance as yf

from backend.schemas import (
    IdxStockItem,
    IdxStockListResponse,
    MutualFundLedgerEntry,
    MutualFundLedgerRowResponse,
    MutualFundSummaryResponse,
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
