use serde::{Deserialize, Serialize};

use super::error::CalcError;

/// Inputs for the retirement target plan. Rates are annual fractions on
/// the wire (0.08 = 8%); the UI takes percent. All money figures share
/// one currency (e.g. IDR).
#[derive(Debug, Clone, Deserialize)]
pub struct RetireInput {
    pub years_to_retire: f64,
    pub monthly_need_today: f64,
    pub inflation_annual: f64,
    pub invest_return_annual: f64,
    pub current_savings: f64,
    #[serde(default = "default_withdrawal")]
    pub withdrawal_rate: f64,
    #[serde(default)]
    pub current_monthly_invest: f64,
}

fn default_withdrawal() -> f64 {
    0.04
}

/// Required monthly invest at one assumed return (sensitivity strip).
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct RetireSensitivityPoint {
    pub invest_return: f64,
    pub required_monthly: f64,
}

/// Projected fund trajectory (with the required monthly invest).
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct RetireYearPoint {
    pub year: u32,
    pub fund_value: f64,
    pub target_fund: f64,
}

/// Closed-form retirement plan: the future monthly need inflated to
/// retirement, the fund that sustains it at the withdrawal rate, and the
/// monthly invest closing the gap left by current savings.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct RetireComparison {
    pub need_at_retirement_monthly: f64,
    pub target_fund: f64,
    pub required_monthly: f64,
    pub projected_fund: f64,
    pub funded_ratio: f64,
    pub shortfall: f64,
    pub sensitivity: Vec<RetireSensitivityPoint>,
    pub schedule: Vec<RetireYearPoint>,
}

fn require_amount(value: f64, field: &str) -> Result<f64, CalcError> {
    if !value.is_finite() || value < 0.0 {
        return Err(CalcError::validation(format!(
            "{field} must be a non-negative number."
        )));
    }
    Ok(value)
}

fn require_rate(value: f64, field: &str) -> Result<f64, CalcError> {
    let v = require_amount(value, field)?;
    if v > 1.0 {
        return Err(CalcError::validation(format!(
            "{field} must be between 0 and 1 (0.08 = 8%)."
        )));
    }
    Ok(v)
}

/// Future value of `principal` plus a level monthly contribution over
/// `years` at effective annual `rate` (contributions credited annually
/// in twelve monthly slices, end of period).
fn future_value(principal: f64, monthly: f64, rate: f64, years: u32) -> f64 {
    if years == 0 {
        return principal;
    }
    let grown = (1.0 + rate).powf(years as f64);
    if rate == 0.0 {
        principal + monthly * 12.0 * years as f64
    } else {
        principal * grown + monthly * 12.0 * (grown - 1.0) / rate
    }
}

/// Level monthly invest closing `gap` over `years` at `rate` (0 when the
/// gap is already closed).
fn required_pmt(gap: f64, rate: f64, years: u32) -> f64 {
    if gap <= 0.0 || years == 0 {
        return 0.0;
    }
    if rate == 0.0 {
        gap / (12.0 * years as f64)
    } else {
        gap * rate / (12.0 * ((1.0 + rate).powf(years as f64) - 1.0))
    }
}

pub fn retire_comparison(input: &RetireInput) -> Result<RetireComparison, CalcError> {
    let years_f = require_amount(input.years_to_retire, "years_to_retire")?;
    let need = require_amount(input.monthly_need_today, "monthly_need_today")?;
    let inf = require_rate(input.inflation_annual, "inflation_annual")?;
    let rate = require_rate(input.invest_return_annual, "invest_return_annual")?;
    let savings = require_amount(input.current_savings, "current_savings")?;
    let withdrawal = require_amount(input.withdrawal_rate, "withdrawal_rate")?;
    let current = require_amount(input.current_monthly_invest, "current_monthly_invest")?;

    if !(1.0..=50.0).contains(&years_f) || (years_f.round() - years_f).abs() > 1e-9 {
        return Err(CalcError::validation(
            "years_to_retire must be a whole number of years between 1 and 50.",
        ));
    }
    if need <= 0.0 {
        return Err(CalcError::validation(
            "monthly_need_today must be greater than zero.",
        ));
    }
    if withdrawal <= 0.0 || withdrawal > 1.0 {
        return Err(CalcError::validation(
            "withdrawal_rate must be between 0 (exclusive) and 1 (0.04 = 4%).",
        ));
    }

    let years = years_f.round() as u32;
    let need_end = need * (1.0 + inf).powf(years as f64);
    let target = need_end * 12.0 / withdrawal;
    let grown_savings = savings * (1.0 + rate).powf(years as f64);
    let gap = target - grown_savings;
    let required = required_pmt(gap, rate, years);
    let projected = future_value(savings, current, rate, years);

    let schedule = (0..=years)
        .map(|y| RetireYearPoint {
            year: y,
            fund_value: future_value(savings, required, rate, y),
            target_fund: target,
        })
        .collect();

    let sensitivity = [-0.02, -0.01, 0.0, 0.01, 0.02]
        .into_iter()
        .map(|d| {
            let r = (rate + d).max(0.0);
            let g = target - savings * (1.0 + r).powf(years as f64);
            RetireSensitivityPoint {
                invest_return: (r * 10_000.0).round() / 10_000.0,
                required_monthly: required_pmt(g, r, years),
            }
        })
        .collect();

    Ok(RetireComparison {
        need_at_retirement_monthly: need_end,
        target_fund: target,
        required_monthly: required,
        projected_fund: projected,
        funded_ratio: if target > 0.0 {
            projected / target
        } else {
            1.0
        },
        shortfall: target - projected,
        sensitivity,
        schedule,
    })
}

#[cfg(test)]
mod tests {
    use super::{future_value, required_pmt, retire_comparison, RetireInput};

    fn typical() -> RetireInput {
        // Jakarta case: need Rp10M/mo today, retire in 20y, inflation 4%,
        // invest 8%, Rp100M saved, 4% rule, currently investing Rp2M/mo.
        RetireInput {
            years_to_retire: 20.0,
            monthly_need_today: 10_000_000.0,
            inflation_annual: 0.04,
            invest_return_annual: 0.08,
            current_savings: 100_000_000.0,
            withdrawal_rate: 0.04,
            current_monthly_invest: 2_000_000.0,
        }
    }

    #[test]
    fn typical_plan_hangs_together() {
        let out = retire_comparison(&typical()).unwrap();
        // Need inflates 20y at 4%; target is 25x annual need (4% rule).
        assert!((out.need_at_retirement_monthly - 10_000_000.0 * 1.04_f64.powi(20)).abs() < 1.0);
        assert!((out.target_fund - out.need_at_retirement_monthly * 12.0 / 0.04).abs() < 1.0);
        assert!(out.target_fund > 6_000_000_000.0);
        // Rp2M/mo falls far short of the ~Rp11M/mo required.
        assert!(out.required_monthly > 10_000_000.0);
        assert!(out.projected_fund < out.target_fund);
        assert!(out.funded_ratio < 1.0);
        assert!(out.shortfall > 0.0);
        assert!((out.shortfall - (out.target_fund - out.projected_fund)).abs() < 1.0);
        // Required monthly exactly closes the gap by construction.
        let closed = future_value(100_000_000.0, out.required_monthly, 0.08, 20);
        assert!((closed - out.target_fund).abs() / out.target_fund < 1e-9);
    }

    #[test]
    fn zero_return_uses_straight_division() {
        assert_eq!(required_pmt(12_000_000.0, 0.0, 10), 100_000.0);
        assert_eq!(future_value(5_000_000.0, 100_000.0, 0.0, 10), 17_000_000.0);
        let mut input = typical();
        input.invest_return_annual = 0.0;
        let out = retire_comparison(&input).unwrap();
        let gap = out.target_fund - 100_000_000.0;
        assert!((out.required_monthly - gap / 240.0).abs() < 1.0);
    }

    #[test]
    fn already_funded_needs_nothing() {
        let mut input = typical();
        input.current_savings = 10_000_000_000.0;
        let out = retire_comparison(&input).unwrap();
        assert_eq!(out.required_monthly, 0.0);
        assert!(out.shortfall < 0.0);
        assert!(out.funded_ratio > 1.0);
    }

    #[test]
    fn schedule_tracks_required_trajectory_to_target() {
        let out = retire_comparison(&typical()).unwrap();
        assert_eq!(out.schedule.len(), 21);
        assert_eq!(out.schedule[0].fund_value, 100_000_000.0);
        let last = out.schedule.last().unwrap();
        assert!((last.fund_value - out.target_fund).abs() / out.target_fund < 1e-9);
        for w in out.schedule.windows(2) {
            assert!(w[1].fund_value >= w[0].fund_value);
        }
    }

    #[test]
    fn sensitivity_falls_as_returns_rise() {
        let out = retire_comparison(&typical()).unwrap();
        assert_eq!(out.sensitivity.len(), 5);
        assert_eq!(out.sensitivity[2].invest_return, 0.08);
        assert!((out.sensitivity[2].required_monthly - out.required_monthly).abs() < 1e-6);
        for w in out.sensitivity.windows(2) {
            assert!(w[1].required_monthly <= w[0].required_monthly + 1e-6);
        }
    }

    #[test]
    fn rejects_bad_input() {
        let mut input = typical();
        input.years_to_retire = 0.0;
        assert!(retire_comparison(&input).is_err());
        input = typical();
        input.years_to_retire = 51.0;
        assert!(retire_comparison(&input).is_err());
        input = typical();
        input.years_to_retire = 20.5;
        assert!(retire_comparison(&input).is_err());
        input = typical();
        input.monthly_need_today = 0.0;
        assert!(retire_comparison(&input).is_err());
        input = typical();
        input.withdrawal_rate = 0.0;
        assert!(retire_comparison(&input).is_err());
        input = typical();
        input.withdrawal_rate = 1.5;
        assert!(retire_comparison(&input).is_err());
        input = typical();
        input.invest_return_annual = 1.5;
        assert!(retire_comparison(&input).is_err());
        input = typical();
        input.current_savings = -1.0;
        assert!(retire_comparison(&input).is_err());
    }
}
