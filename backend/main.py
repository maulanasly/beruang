from __future__ import annotations

from fastapi import FastAPI

from backend.schemas import (
    MutualFundReturnsRequest,
    MutualFundReturnsResponse,
    StockReturnsRequest,
    StockReturnsResponse,
    TermDepositReturnsRequest,
    TermDepositReturnsResponse,
)
from backend.services import (
    calculate_mutual_fund_returns,
    calculate_stock_returns,
    calculate_term_deposit_returns,
)

app = FastAPI(
    title="Investment App API",
    version="0.1.0",
    description="Backend API for installment-based investment return calculations.",
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/v1/mutual-funds/returns", response_model=MutualFundReturnsResponse)
def mutual_fund_returns(payload: MutualFundReturnsRequest) -> MutualFundReturnsResponse:
    summary, ledger_rows = calculate_mutual_fund_returns(payload.entries)
    return MutualFundReturnsResponse(summary=summary, ledger=ledger_rows)


@app.post("/api/v1/stocks/returns", response_model=StockReturnsResponse)
def stock_returns(payload: StockReturnsRequest) -> StockReturnsResponse:
    summary, ledger_rows = calculate_stock_returns(payload.entries)
    return StockReturnsResponse(summary=summary, ledger=ledger_rows)


@app.post("/api/v1/term-deposits/returns", response_model=TermDepositReturnsResponse)
def term_deposit_returns(
    payload: TermDepositReturnsRequest,
) -> TermDepositReturnsResponse:
    summary, ledger_rows = calculate_term_deposit_returns(
        payload.entries,
        apy=payload.apy,
    )
    return TermDepositReturnsResponse(summary=summary, ledger=ledger_rows)
