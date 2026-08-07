from __future__ import annotations

from datetime import date

from pydantic import BaseModel, Field


class MutualFundLedgerEntry(BaseModel):
    date: date
    installment_amount: float = Field(ge=0)
    current_value: float = Field(ge=0)


class MutualFundReturnsRequest(BaseModel):
    entries: list[MutualFundLedgerEntry] = Field(min_length=1)

    model_config = {
        "json_schema_extra": {
            "example": {
                "entries": [
                    {
                        "date": "2026-05-31",
                        "installment_amount": 1100,
                        "current_value": 6500,
                    },
                    {
                        "date": "2026-06-30",
                        "installment_amount": 1100,
                        "current_value": 7700,
                    },
                ]
            }
        }
    }


class MutualFundSummaryResponse(BaseModel):
    total_installments: float
    ending_value: float
    xirr: float


class MutualFundLedgerRowResponse(BaseModel):
    date: date
    installment_amount: float
    current_value: float
    month_start_value: float | None = None
    mom_return: float | None = None


class MutualFundReturnsResponse(BaseModel):
    summary: MutualFundSummaryResponse
    ledger: list[MutualFundLedgerRowResponse]


class StockLedgerEntry(BaseModel):
    date: date
    installment_amount: float = Field(ge=0)
    new_share_purchases: float = Field(ge=0)
    dividends: float = Field(ge=0)
    current_value: float = Field(ge=0)


class StockReturnsRequest(BaseModel):
    entries: list[StockLedgerEntry] = Field(min_length=1)

    model_config = {
        "json_schema_extra": {
            "example": {
                "entries": [
                    {
                        "date": "2026-05-31",
                        "installment_amount": 700,
                        "new_share_purchases": 300,
                        "dividends": 0,
                        "current_value": 1000,
                    },
                    {
                        "date": "2026-06-30",
                        "installment_amount": 700,
                        "new_share_purchases": 200,
                        "dividends": 10,
                        "current_value": 1950,
                    },
                ]
            }
        }
    }


class StockSummaryResponse(BaseModel):
    total_contribution: float
    ending_value: float
    roi: float
    xirr: float


class StockLedgerRowResponse(BaseModel):
    date: date
    installment_amount: float
    new_share_purchases: float
    dividends: float
    current_value: float
    month_start_value: float | None = None
    mom_return: float | None = None


class StockReturnsResponse(BaseModel):
    summary: StockSummaryResponse
    ledger: list[StockLedgerRowResponse]


class IdxStockItem(BaseModel):
    symbol: str
    name: str


class IdxStockListResponse(BaseModel):
    index_name: str
    items: list[IdxStockItem]


class IdxStockSearchResponse(BaseModel):
    query: str
    items: list[IdxStockItem]


class StockQuoteResponse(BaseModel):
    symbol: str
    name: str
    price: float
    currency: str


class TermDepositLedgerEntry(BaseModel):
    date: date
    installment_amount: float = Field(ge=0)
    current_value: float = Field(ge=0)


class TermDepositReturnsRequest(BaseModel):
    apy: float = Field(ge=-1.0, le=1.0)
    entries: list[TermDepositLedgerEntry] = Field(min_length=1)

    model_config = {
        "json_schema_extra": {
            "example": {
                "apy": 0.06,
                "entries": [
                    {
                        "date": "2026-05-31",
                        "installment_amount": 1000,
                        "current_value": 1000,
                    },
                    {
                        "date": "2026-06-30",
                        "installment_amount": 1000,
                        "current_value": 2005,
                    },
                ],
            }
        }
    }


class TermDepositSummaryResponse(BaseModel):
    apy: float
    monthly_rate: float
    projected_fv_constant_installment: float
    ending_value: float


class TermDepositLedgerRowResponse(BaseModel):
    date: date
    installment_amount: float
    current_value: float
    month_start_value: float | None = None
    prorated_interest: float | None = None
    expected_month_end_value: float | None = None


class TermDepositReturnsResponse(BaseModel):
    summary: TermDepositSummaryResponse
    ledger: list[TermDepositLedgerRowResponse]
