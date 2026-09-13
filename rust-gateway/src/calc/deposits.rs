use chrono::{Datelike, NaiveDate};
use serde::{Deserialize, Serialize};

use super::error::CalcError;

/// Request row: mirrors `backend.schemas.TermDepositLedgerEntry`.
#[derive(Debug, Clone, Deserialize)]
pub struct TermDepositEntry {
    pub date: NaiveDate,
    pub installment_amount: f64,
    pub current_value: f64,
    #[serde(default = "default_term_months")]
    pub term_months: i64,
    pub maturity_date: Option<NaiveDate>,
}

fn default_term_months() -> i64 {
    12
}

/// Mirrors `TermDepositSummaryResponse` (field order = JSON key order).
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct TermDepositSummary {
    pub apy: f64,
    pub monthly_rate: f64,
    pub projected_fv_constant_installment: f64,
    pub ending_value: f64,
    pub total_accrued_interest: f64,
    pub rollover_value: f64,
    pub next_maturity_date: Option<NaiveDate>,
}

/// Mirrors `TermDepositLedgerRowResponse`.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct TermDepositLedgerRow {
    pub date: NaiveDate,
    pub installment_amount: f64,
    pub current_value: f64,
    pub month_start_value: Option<f64>,
    pub prorated_interest: Option<f64>,
    pub expected_month_end_value: Option<f64>,
    pub term_months: i64,
    pub maturity_date: Option<NaiveDate>,
    pub days_to_maturity: Option<i64>,
    pub maturity_status: Option<String>,
    pub maturity_value: Option<f64>,
    pub accrued_interest: Option<f64>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct TermDepositReturns {
    pub summary: TermDepositSummary,
    pub ledger: Vec<TermDepositLedgerRow>,
}

fn require_amount(value: f64, field: &str) -> Result<f64, CalcError> {
    if !value.is_finite() || value < 0.0 {
        return Err(CalcError::validation(format!(
            "{field} must be a non-negative number."
        )));
    }
    Ok(value)
}

/// `numpy_financial.fv` closed form (`when=0`, i.e. end-of-period), with the
/// `rate == 0` branch that numpy takes (`-(pv + pmt * nper)`).
fn future_value(rate: f64, nper: usize, pmt: f64, pv: f64) -> f64 {
    if rate == 0.0 {
        -(pv + pmt * nper as f64)
    } else {
        let growth = (1.0 + rate).powf(nper as f64);
        -(pv * growth + pmt * (growth - 1.0) / rate)
    }
}

/// Derive `maturity_date = date + term_months` with pandas' month
/// arithmetic (`year*12 + (month-1) + term`). An impossible day (e.g. Feb 31)
/// is a 422 whose detail matches the oracle fixture's stable substring.
fn derive_maturity(date: NaiveDate, term_months: i64) -> Result<NaiveDate, CalcError> {
    let total = date.year() as i64 * 12 + (date.month() as i64 - 1) + term_months;
    let year = total.div_euclid(12);
    let month = (total.rem_euclid(12) + 1) as u32;
    NaiveDate::from_ymd_opt(year as i32, month, date.day())
        .ok_or_else(|| CalcError::math("day is out of range for month"))
}

/// Port of `logic.term_deposit_metrics` + the service adapter.
/// `reference_date` pins "today" (routes pass the local date; the parity
/// harness passes the fixture date).
pub fn term_deposit_returns(
    apy: f64,
    entries: Vec<TermDepositEntry>,
    reference_date: NaiveDate,
) -> Result<TermDepositReturns, CalcError> {
    if !apy.is_finite() || apy < -1.0 {
        return Err(CalcError::math("APY must be greater than -100%."));
    }
    if apy > 1.0 {
        return Err(CalcError::validation("APY must not exceed 100%."));
    }
    if entries.is_empty() {
        return Err(CalcError::validation(
            "At least one ledger row is required.",
        ));
    }
    let mut sorted = entries;
    sorted.sort_by(|a, b| a.date.cmp(&b.date));

    let monthly_rate = (1.0 + apy).powf(1.0 / 12.0) - 1.0;

    struct Prepared {
        date: NaiveDate,
        installment: f64,
        current: f64,
        term_months: i64,
        maturity: NaiveDate,
    }
    let mut prepared = Vec::with_capacity(sorted.len());
    for entry in &sorted {
        let installment = require_amount(entry.installment_amount, "installment_amount")?;
        let current = require_amount(entry.current_value, "current_value")?;
        if !(1..=120).contains(&entry.term_months) {
            return Err(CalcError::validation(
                "term_months must be between 1 and 120.",
            ));
        }
        let maturity = match entry.maturity_date {
            Some(date) => date,
            None => derive_maturity(entry.date, entry.term_months)?,
        };
        prepared.push(Prepared {
            date: entry.date,
            installment,
            current,
            term_months: entry.term_months,
            maturity,
        });
    }

    let mut ledger = Vec::with_capacity(prepared.len());
    let mut total_accrued = 0.0;
    let mut rollover_value = 0.0;
    let mut next_maturity: Option<NaiveDate> = None;

    for (index, row) in prepared.iter().enumerate() {
        // pandas `shift(1).fillna(0.0)`: first row starts at zero, never null.
        let month_start = if index == 0 {
            0.0
        } else {
            prepared[index - 1].current
        };
        let prorated = month_start * monthly_rate;
        let expected = month_start + row.installment + prorated;

        let term_years = row.term_months as f64 / 12.0;
        let days_to_maturity = (row.maturity - reference_date).num_days();
        let matured = days_to_maturity <= 0;
        let status = if matured { "matured" } else { "active" };
        let maturity_value = row.installment * (1.0 + apy).powf(term_years);

        let elapsed_days = (reference_date - row.date).num_days().max(0) as f64;
        let elapsed_years = (elapsed_days / 365.0).min(term_years);
        let accrued = row.installment * ((1.0 + apy).powf(elapsed_years) - 1.0);

        total_accrued += accrued;
        if days_to_maturity <= 30 {
            rollover_value += maturity_value;
        }
        if !matured {
            next_maturity = Some(next_maturity.map_or(row.maturity, |d| d.min(row.maturity)));
        }

        ledger.push(TermDepositLedgerRow {
            date: row.date,
            installment_amount: row.installment,
            current_value: row.current,
            month_start_value: Some(month_start),
            prorated_interest: Some(prorated),
            expected_month_end_value: Some(expected),
            term_months: row.term_months,
            maturity_date: Some(row.maturity),
            days_to_maturity: Some(days_to_maturity),
            maturity_status: Some(status.to_string()),
            maturity_value: Some(maturity_value),
            accrued_interest: Some(accrued),
        });
    }

    let periods = prepared.len();
    let first_installment = prepared.first().map(|r| r.installment).unwrap_or(0.0);
    let ending_value = prepared.last().map(|r| r.current).unwrap_or(0.0);
    let projected_fv = future_value(monthly_rate, periods, -first_installment, 0.0);

    Ok(TermDepositReturns {
        summary: TermDepositSummary {
            apy,
            monthly_rate,
            projected_fv_constant_installment: projected_fv,
            ending_value,
            total_accrued_interest: total_accrued,
            rollover_value,
            next_maturity_date: next_maturity,
        },
        ledger,
    })
}

#[cfg(test)]
mod tests {
    use super::{derive_maturity, future_value, term_deposit_returns, TermDepositEntry};
    use chrono::NaiveDate;

    fn date(s: &str) -> NaiveDate {
        NaiveDate::parse_from_str(s, "%Y-%m-%d").unwrap()
    }

    fn entry(
        date: NaiveDate,
        installment: f64,
        value: f64,
        term: i64,
        maturity: Option<NaiveDate>,
    ) -> TermDepositEntry {
        TermDepositEntry {
            date,
            installment_amount: installment,
            current_value: value,
            term_months: term,
            maturity_date: maturity,
        }
    }

    #[test]
    fn matches_static_defaults() {
        let out = term_deposit_returns(
            0.06,
            vec![
                entry(
                    date("2026-05-31"),
                    1000.0,
                    1000.0,
                    12,
                    Some(date("2027-05-31")),
                ),
                entry(
                    date("2026-06-30"),
                    1000.0,
                    2005.0,
                    12,
                    Some(date("2027-06-30")),
                ),
            ],
            date("2026-09-13"),
        )
        .unwrap();
        assert!((out.summary.monthly_rate - 0.004867550565343048).abs() < 1e-15);
        assert!((out.summary.projected_fv_constant_installment - 2004.8675505653582).abs() < 1e-9);
        assert_eq!(out.summary.next_maturity_date, Some(date("2027-05-31")));
        assert_eq!(out.ledger[0].month_start_value, Some(0.0));
        assert_eq!(out.ledger[0].maturity_status.as_deref(), Some("active"));
        assert_eq!(out.ledger[0].days_to_maturity, Some(260));
    }

    #[test]
    fn fv_zero_rate_matches_numpy() {
        assert_eq!(future_value(0.0, 6, -1000.0, 0.0), 6000.0);
    }

    #[test]
    fn jan31_short_term_is_422() {
        let err = derive_maturity(date("2026-01-31"), 1).unwrap_err();
        assert!(err.detail().contains("day is out of range"));
        assert_eq!(
            derive_maturity(date("2026-01-31"), 12).unwrap(),
            date("2027-01-31")
        );
    }

    #[test]
    fn rejects_bad_apy_and_terms() {
        let rows = vec![entry(date("2026-06-30"), 1000.0, 1000.0, 12, None)];
        assert!(term_deposit_returns(-1.5, rows.clone(), date("2026-09-13")).is_err());
        let bad_term = vec![entry(date("2026-06-30"), 1000.0, 1000.0, 0, None)];
        assert!(term_deposit_returns(0.06, bad_term, date("2026-09-13")).is_err());
        assert!(term_deposit_returns(0.06, vec![], date("2026-09-13")).is_err());
    }
}
