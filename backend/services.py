from __future__ import annotations

import pandas as pd

from backend.schemas import (
    MutualFundLedgerEntry,
    MutualFundLedgerRowResponse,
    MutualFundSummaryResponse,
    StockLedgerEntry,
    StockLedgerRowResponse,
    StockSummaryResponse,
    TermDepositLedgerEntry,
    TermDepositLedgerRowResponse,
    TermDepositSummaryResponse,
)
from logic import mutual_fund_metrics, stock_metrics, term_deposit_metrics


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
