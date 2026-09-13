use chrono::NaiveDate;
use serde::{Deserialize, Serialize};

use super::error::CalcError;
use super::xirr::calculate_xirr;

/// Request row: mirrors `backend.schemas.StockLedgerEntry`.
#[derive(Debug, Clone, Deserialize)]
pub struct StockEntry {
    pub date: NaiveDate,
    pub installment_amount: f64,
    pub new_share_purchases: f64,
    pub dividends: f64,
    pub current_value: f64,
    pub dividend_yield: Option<f64>,
}

/// Mirrors `StockSummaryResponse` (field order = JSON key order).
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct StockSummary {
    pub total_contribution: f64,
    pub ending_value: f64,
    pub roi: Option<f64>,
    pub xirr: f64,
    pub estimated_annual_dividend: Option<f64>,
    pub estimated_monthly_dividend: Option<f64>,
}

/// Mirrors `StockLedgerRowResponse`.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct StockLedgerRow {
    pub date: NaiveDate,
    pub installment_amount: f64,
    pub new_share_purchases: f64,
    pub dividends: f64,
    pub current_value: f64,
    pub dividend_yield: Option<f64>,
    pub estimated_dividend: Option<f64>,
    pub month_start_value: Option<f64>,
    pub mom_return: Option<f64>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct StockReturns {
    pub summary: StockSummary,
    pub ledger: Vec<StockLedgerRow>,
}

fn require_amount(value: f64, field: &str) -> Result<f64, CalcError> {
    if !value.is_finite() || value < 0.0 {
        return Err(CalcError::validation(format!(
            "{field} must be a non-negative number."
        )));
    }
    Ok(value)
}

/// Port of `logic.stock_metrics` + the service adapter. A `None` yield is
/// the pandas `fillna(0.0)` zero; zero yields/estimates serialize as null
/// exactly like the service's `raw > 0 else None` mapping.
pub fn stock_returns(entries: Vec<StockEntry>) -> Result<StockReturns, CalcError> {
    if entries.is_empty() {
        return Err(CalcError::validation(
            "At least one ledger row is required.",
        ));
    }
    let mut sorted = entries;
    sorted.sort_by_key(|a| a.date);

    let mut ledger: Vec<StockLedgerRow> = Vec::with_capacity(sorted.len());
    let mut per_row = Vec::with_capacity(sorted.len());
    let mut dates = Vec::with_capacity(sorted.len());
    let mut total_contribution = 0.0;

    for (index, entry) in sorted.iter().enumerate() {
        let installment = require_amount(entry.installment_amount, "installment_amount")?;
        let purchases = require_amount(entry.new_share_purchases, "new_share_purchases")?;
        let dividends = require_amount(entry.dividends, "dividends")?;
        let current = require_amount(entry.current_value, "current_value")?;
        let raw_yield = match entry.dividend_yield {
            Some(y) if !y.is_finite() || y < 0.0 => {
                return Err(CalcError::validation(
                    "dividend_yield must be a non-negative number.",
                ));
            }
            Some(y) => y,
            None => 0.0,
        };

        let month_start = if index == 0 {
            None
        } else {
            Some(ledger[index - 1].current_value)
        };
        let estimated = current * raw_yield / 12.0;
        let mom = match month_start {
            Some(start) if start > 0.0 => {
                Some((current - purchases + dividends + estimated - start) / start)
            }
            _ => None,
        };
        ledger.push(StockLedgerRow {
            date: entry.date,
            installment_amount: installment,
            new_share_purchases: purchases,
            dividends,
            current_value: current,
            dividend_yield: if raw_yield > 0.0 {
                Some(raw_yield)
            } else {
                None
            },
            estimated_dividend: if estimated > 0.0 {
                Some(estimated)
            } else {
                None
            },
            month_start_value: month_start,
            mom_return: mom,
        });

        total_contribution += installment + purchases;
        per_row.push(-(installment + purchases) + estimated);
        dates.push(entry.date);
    }

    let ending_value = sorted.last().map(|e| e.current_value).unwrap_or(0.0);
    if let Some(last) = per_row.last_mut() {
        *last += ending_value;
    }
    let xirr = calculate_xirr(&dates, &per_row)?;

    let roi = if total_contribution > 0.0 {
        Some((ending_value - total_contribution) / total_contribution)
    } else {
        None
    };
    // `last_yield` is the sorted last row's yield, like `df.iloc[-1]`.
    let last_yield = sorted
        .last()
        .and_then(|e| e.dividend_yield)
        .filter(|y| y.is_finite() && *y > 0.0)
        .unwrap_or(0.0);
    let (annual, monthly) = if last_yield > 0.0 {
        (
            Some(ending_value * last_yield),
            Some(ending_value * last_yield / 12.0),
        )
    } else {
        (None, None)
    };

    Ok(StockReturns {
        summary: StockSummary {
            total_contribution,
            ending_value,
            roi,
            xirr,
            estimated_annual_dividend: annual,
            estimated_monthly_dividend: monthly,
        },
        ledger,
    })
}

#[cfg(test)]
mod tests {
    use super::{stock_returns, StockEntry};
    use chrono::NaiveDate;

    fn entry(
        date: &str,
        installment: f64,
        purchases: f64,
        dividends: f64,
        value: f64,
        yld: Option<f64>,
    ) -> StockEntry {
        StockEntry {
            date: NaiveDate::parse_from_str(date, "%Y-%m-%d").unwrap(),
            installment_amount: installment,
            new_share_purchases: purchases,
            dividends,
            current_value: value,
            dividend_yield: yld,
        }
    }

    #[test]
    fn matches_static_defaults() {
        let out = stock_returns(vec![
            entry("2026-05-31", 700.0, 300.0, 0.0, 1000.0, None),
            entry("2026-06-30", 700.0, 200.0, 10.0, 1950.0, None),
        ])
        .unwrap();
        assert_eq!(out.summary.total_contribution, 1900.0);
        assert_eq!(out.summary.ending_value, 1950.0);
        assert!((out.summary.roi.unwrap() - 0.02631578947368421).abs() < 1e-12);
        assert!((out.summary.xirr - 0.8105192164584014).abs() < 1e-9);
        assert_eq!(out.summary.estimated_annual_dividend, None);
        assert_eq!(out.ledger[0].mom_return, None);
    }

    #[test]
    fn yield_drives_estimates() {
        let out = stock_returns(vec![
            entry("2026-05-31", 700.0, 300.0, 0.0, 1000.0, None),
            entry("2026-06-30", 700.0, 200.0, 10.0, 10000.0, Some(0.12)),
        ])
        .unwrap();
        let annual = out.summary.estimated_annual_dividend.unwrap();
        let monthly = out.summary.estimated_monthly_dividend.unwrap();
        assert!((annual - 1200.0).abs() < 1e-9, "annual={annual}");
        assert!((monthly - 100.0).abs() < 1e-12, "monthly={monthly}");
        assert_eq!(out.ledger[1].dividend_yield, Some(0.12));
    }
}
