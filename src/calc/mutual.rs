use chrono::NaiveDate;
use serde::{Deserialize, Serialize};

use super::error::CalcError;
use super::xirr::calculate_xirr;

/// Request row: mirrors `backend.schemas.MutualFundLedgerEntry`.
#[derive(Debug, Clone, Deserialize)]
pub struct MutualFundEntry {
    pub date: NaiveDate,
    pub installment_amount: f64,
    pub current_value: f64,
}

/// Mirrors `MutualFundSummaryResponse` (field order = JSON key order).
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct MutualFundSummary {
    pub total_installments: f64,
    pub ending_value: f64,
    pub xirr: f64,
}

/// Mirrors `MutualFundLedgerRowResponse`.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct MutualFundLedgerRow {
    pub date: NaiveDate,
    pub installment_amount: f64,
    pub current_value: f64,
    pub month_start_value: Option<f64>,
    pub mom_return: Option<f64>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct MutualFundReturns {
    pub summary: MutualFundSummary,
    pub ledger: Vec<MutualFundLedgerRow>,
}

fn require_amount(value: f64, field: &str) -> Result<f64, CalcError> {
    if !value.is_finite() || value < 0.0 {
        return Err(CalcError::validation(format!(
            "{field} must be a non-negative number."
        )));
    }
    Ok(value)
}

/// Port of `logic.mutual_fund_metrics` + the service adapter: validate,
/// normalize, sort, then compute cash-flow adjusted MoM and XIRR.
pub fn mutual_fund_returns(entries: Vec<MutualFundEntry>) -> Result<MutualFundReturns, CalcError> {
    if entries.is_empty() {
        return Err(CalcError::validation(
            "At least one ledger row is required.",
        ));
    }
    let mut sorted = entries;
    // `_prepare_ledger` sorts by date; stable to match pandas + Python sorted().
    sorted.sort_by(|a, b| a.date.cmp(&b.date));

    let mut ledger: Vec<MutualFundLedgerRow> = Vec::with_capacity(sorted.len());
    let mut cash_flows = Vec::with_capacity(sorted.len());
    let mut dates = Vec::with_capacity(sorted.len());
    let mut total_installments = 0.0;

    for (index, entry) in sorted.iter().enumerate() {
        let installment = require_amount(entry.installment_amount, "installment_amount")?;
        let current = require_amount(entry.current_value, "current_value")?;
        total_installments += installment;

        let month_start = if index == 0 {
            None
        } else {
            // Validated value from the previous row (identity for valid input).
            Some(ledger[index - 1].current_value)
        };
        let mom = match month_start {
            Some(start) if start > 0.0 => Some((current - installment - start) / start),
            _ => None,
        };
        ledger.push(MutualFundLedgerRow {
            date: entry.date,
            installment_amount: installment,
            current_value: current,
            month_start_value: month_start,
            mom_return: mom,
        });
        cash_flows.push(-installment);
        dates.push(entry.date);
    }

    let ending_value = sorted.last().map(|e| e.current_value).unwrap_or(0.0);
    if let Some(last) = cash_flows.last_mut() {
        *last += ending_value;
    }
    let xirr = calculate_xirr(&dates, &cash_flows)?;

    Ok(MutualFundReturns {
        summary: MutualFundSummary {
            total_installments,
            ending_value,
            xirr,
        },
        ledger,
    })
}

#[cfg(test)]
mod tests {
    use super::{mutual_fund_returns, MutualFundEntry};
    use chrono::NaiveDate;

    fn entry(date: &str, installment: f64, value: f64) -> MutualFundEntry {
        MutualFundEntry {
            date: NaiveDate::parse_from_str(date, "%Y-%m-%d").unwrap(),
            installment_amount: installment,
            current_value: value,
        }
    }

    #[test]
    fn first_row_mom_is_null() {
        let out = mutual_fund_returns(vec![
            entry("2026-05-31", 1100.0, 6500.0),
            entry("2026-06-30", 1100.0, 7700.0),
        ])
        .unwrap();
        assert_eq!(out.ledger[0].mom_return, None);
        assert_eq!(out.ledger[0].month_start_value, None);
        let mom = out.ledger[1].mom_return.unwrap();
        assert!((mom - 0.015384615384615385).abs() < 1e-12, "mom={mom}");
        assert_eq!(out.summary.total_installments, 2200.0);
        assert_eq!(out.summary.ending_value, 7700.0);
    }

    #[test]
    fn rejects_empty_and_negative() {
        assert!(mutual_fund_returns(vec![]).is_err());
        assert!(mutual_fund_returns(vec![entry("2026-06-30", -1.0, 5.0)]).is_err());
    }
}
