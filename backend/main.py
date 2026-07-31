from __future__ import annotations

import os

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

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

_cors_origins_raw = os.getenv(
    "CORS_ALLOW_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173,http://localhost:8080,http://127.0.0.1:8080",
)
_cors_origins = [
    origin.strip() for origin in _cors_origins_raw.split(",") if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/v1/mutual-funds/returns", response_model=MutualFundReturnsResponse)
def mutual_fund_returns(payload: MutualFundReturnsRequest) -> MutualFundReturnsResponse:
    try:
        summary, ledger_rows = calculate_mutual_fund_returns(payload.entries)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return MutualFundReturnsResponse(summary=summary, ledger=ledger_rows)


@app.post("/api/v1/stocks/returns", response_model=StockReturnsResponse)
def stock_returns(payload: StockReturnsRequest) -> StockReturnsResponse:
    try:
        summary, ledger_rows = calculate_stock_returns(payload.entries)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return StockReturnsResponse(summary=summary, ledger=ledger_rows)


@app.post("/api/v1/term-deposits/returns", response_model=TermDepositReturnsResponse)
def term_deposit_returns(
    payload: TermDepositReturnsRequest,
) -> TermDepositReturnsResponse:
    try:
        summary, ledger_rows = calculate_term_deposit_returns(
            payload.entries,
            apy=payload.apy,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return TermDepositReturnsResponse(summary=summary, ledger=ledger_rows)
