from __future__ import annotations

import os

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from backend.schemas import (
    DividendYieldsResponse,
    IdxStockListResponse,
    IdxStockSearchResponse,
    IndexHistoryResponse,
    MutualFundReturnsRequest,
    MutualFundReturnsResponse,
    PriceHistoryResponse,
    StockQuoteResponse,
    StockReturnsRequest,
    StockReturnsResponse,
    TermDepositReturnsRequest,
    TermDepositReturnsResponse,
)
from backend.services import (
    calculate_mutual_fund_returns,
    calculate_stock_returns,
    calculate_term_deposit_returns,
    get_index_history,
    get_kompas100_starter_stocks,
    get_latest_stock_quote,
    get_price_history,
    get_top_dividend_yields,
    search_idx_stocks,
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


@app.get(
    "/api/v1/market-data/idx/kompas100",
    response_model=IdxStockListResponse,
)
def kompas100_starter_stock_list() -> IdxStockListResponse:
    return get_kompas100_starter_stocks()


@app.get(
    "/api/v1/market-data/idx/dividend-yields",
    response_model=DividendYieldsResponse,
)
def idx_dividend_yields(
    limit: int = Query(default=10, ge=1, le=30),
) -> DividendYieldsResponse:
    try:
        return get_top_dividend_yields(limit=limit)
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.get(
    "/api/v1/market-data/idx/search",
    response_model=IdxStockSearchResponse,
)
def idx_stock_search(
    q: str = Query(min_length=1, max_length=64),
    limit: int = Query(default=10, ge=1, le=50),
) -> IdxStockSearchResponse:
    try:
        items = search_idx_stocks(q, limit=limit)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return IdxStockSearchResponse(query=q.strip(), items=items)


@app.get("/api/v1/market-data/quote", response_model=StockQuoteResponse)
def latest_stock_quote(
    symbol: str = Query(min_length=3, max_length=16),
) -> StockQuoteResponse:
    try:
        return get_latest_stock_quote(symbol)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.get("/api/v1/market-data/index/history", response_model=IndexHistoryResponse)
def index_history(
    symbol: str = Query(default="^JKSE", max_length=16),
    period: str = Query(default="1y", max_length=8),
) -> IndexHistoryResponse:
    try:
        return get_index_history(symbol, period)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.get("/api/v1/market-data/price/history", response_model=PriceHistoryResponse)
def price_history(
    symbol: str = Query(min_length=3, max_length=16),
    period: str = Query(default="1y", max_length=8),
) -> PriceHistoryResponse:
    try:
        return get_price_history(symbol, period)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
