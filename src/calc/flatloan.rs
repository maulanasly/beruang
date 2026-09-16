use serde::{Deserialize, Serialize};

use super::error::CalcError;

/// Inputs for a flat-rate credit quote (dealer motor/paylater style).
/// `flat_rate_annual` is a fraction on the wire (0.05 = 5%); the UI takes
/// percent. All money figures share one currency (e.g. IDR).
#[derive(Debug, Clone, Deserialize)]
pub struct FlatLoanInput {
    pub price: f64,
    pub down_payment: f64,
    pub flat_rate_annual: f64,
    pub tenor_months: f64,
    #[serde(default)]
    pub upfront_fees: f64,
}

/// One month of the reducing-balance amortization behind the flat quote.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct FlatLoanMonthPoint {
    pub month: u32,
    pub balance: f64,
    pub principal_paid: f64,
    pub interest_paid: f64,
    pub cum_interest: f64,
}

/// True cost of a flat quote: the flat installment plus the effective
/// (reducing-balance) rates it hides.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct FlatLoanComparison {
    pub principal: f64,
    pub monthly_installment: f64,
    pub total_interest: f64,
    pub upfront_fees: f64,
    pub total_payable: f64,
    pub effective_monthly_rate: f64,
    pub effective_annual_nominal: f64,
    pub effective_annual_rate: f64,
    pub true_cost_multiple: f64,
    pub schedule: Vec<FlatLoanMonthPoint>,
}

fn require_amount(value: f64, field: &str) -> Result<f64, CalcError> {
    if !value.is_finite() || value < 0.0 {
        return Err(CalcError::validation(format!(
            "{field} must be a non-negative number."
        )));
    }
    Ok(value)
}

/// Reducing-balance monthly rate behind a flat quote: the root of
/// `P = A·(1−(1+r)^−n)/r`. Bisection converges because annuity present
/// value strictly decreases in `r` (guarded bracket: `A·n > P` at 0⁺).
pub fn effective_monthly_rate(principal: f64, installment: f64, months: u32) -> f64 {
    if months == 0 || principal <= 0.0 || installment * months as f64 <= principal {
        return 0.0;
    }
    let pv = |r: f64| installment * (1.0 - (1.0 + r).powf(-(months as f64))) / r;
    let (mut lo, mut hi) = (0.0, 1.0);
    for _ in 0..60 {
        let mid = 0.5 * (lo + hi);
        if pv(mid) > principal {
            lo = mid;
        } else {
            hi = mid;
        }
    }
    0.5 * (lo + hi)
}

pub fn flat_loan_comparison(input: &FlatLoanInput) -> Result<FlatLoanComparison, CalcError> {
    let price = require_amount(input.price, "price")?;
    let dp = require_amount(input.down_payment, "down_payment")?;
    let rate = require_amount(input.flat_rate_annual, "flat_rate_annual")?;
    let tenor = require_amount(input.tenor_months, "tenor_months")?;
    let fees = require_amount(input.upfront_fees, "upfront_fees")?;

    if price <= 0.0 {
        return Err(CalcError::validation("price must be greater than zero."));
    }
    if dp > price {
        return Err(CalcError::validation("down_payment must not exceed price."));
    }
    if rate > 1.0 {
        return Err(CalcError::validation(
            "flat_rate_annual must be between 0 and 1 (0.05 = 5%).",
        ));
    }
    if !(1.0..=360.0).contains(&tenor) || (tenor.round() - tenor).abs() > 1e-9 {
        return Err(CalcError::validation(
            "tenor_months must be a whole number of months between 1 and 360.",
        ));
    }

    let months = tenor.round() as u32;
    let principal = price - dp;
    // Flat interest is charged on the ORIGINAL principal every month.
    let total_interest = principal * rate * months as f64 / 12.0;
    let installment = (principal + total_interest) / months as f64;
    let r = effective_monthly_rate(principal, installment, months);

    let mut schedule = Vec::with_capacity(months as usize);
    let mut balance = principal;
    let mut cum = 0.0;
    for m in 1..=months {
        let interest = balance * r;
        let principal_part = (installment - interest).min(balance).max(0.0);
        cum += interest;
        balance = (balance - principal_part).max(0.0);
        schedule.push(FlatLoanMonthPoint {
            month: m,
            balance,
            principal_paid: principal_part,
            interest_paid: interest,
            cum_interest: cum,
        });
    }

    let total_payable = installment * months as f64 + fees;
    Ok(FlatLoanComparison {
        principal,
        monthly_installment: installment,
        total_interest,
        upfront_fees: fees,
        total_payable,
        effective_monthly_rate: r,
        effective_annual_nominal: r * 12.0,
        effective_annual_rate: (1.0 + r).powf(12.0) - 1.0,
        true_cost_multiple: if principal > 0.0 {
            total_payable / principal
        } else {
            1.0
        },
        schedule,
    })
}

#[cfg(test)]
mod tests {
    use super::{effective_monthly_rate, flat_loan_comparison, FlatLoanInput};

    fn typical() -> FlatLoanInput {
        // Dealer quote: Rp120M financed at 5% flat for 12 months.
        FlatLoanInput {
            price: 120_000_000.0,
            down_payment: 0.0,
            flat_rate_annual: 0.05,
            tenor_months: 12.0,
            upfront_fees: 0.0,
        }
    }

    #[test]
    fn dealer_quote_reveals_double_rate() {
        let out = flat_loan_comparison(&typical()).unwrap();
        assert_eq!(out.principal, 120_000_000.0);
        // Flat math: 120M × 1.05 ÷ 12, to the rupiah.
        assert!((out.monthly_installment - 10_500_000.0).abs() < 1e-6);
        assert!((out.total_interest - 6_000_000.0).abs() < 1.0);
        // The headline: ~9.4% effective hiding behind "5% flat".
        assert!(
            (0.09..0.10).contains(&out.effective_annual_nominal),
            "nominal = {}",
            out.effective_annual_nominal
        );
        // Self-consistency: solved rate discounts installments back.
        let pv = out.monthly_installment * (1.0 - (1.0 + out.effective_monthly_rate).powf(-12.0))
            / out.effective_monthly_rate;
        assert!((pv - 120_000_000.0).abs() < 1.0);
        // Compounded APR sits just above nominal; multiple is 1.05 flat.
        assert!(out.effective_annual_rate > out.effective_annual_nominal);
        assert!((out.true_cost_multiple - 1.05).abs() < 1e-9);
        assert!((out.total_payable - 126_000_000.0).abs() < 1.0);
    }

    #[test]
    fn zero_flat_is_free_money() {
        let mut input = typical();
        input.flat_rate_annual = 0.0;
        let out = flat_loan_comparison(&input).unwrap();
        assert!((out.monthly_installment - 10_000_000.0).abs() < 1e-6);
        assert_eq!(out.total_interest, 0.0);
        assert_eq!(out.effective_monthly_rate, 0.0);
        assert_eq!(out.effective_annual_nominal, 0.0);
        assert_eq!(out.effective_annual_rate, 0.0);
        assert_eq!(out.true_cost_multiple, 1.0);
    }

    #[test]
    fn down_payment_and_fees_fold_in() {
        let mut input = typical();
        input.price = 150_000_000.0;
        input.down_payment = 30_000_000.0;
        input.upfront_fees = 2_000_000.0;
        let out = flat_loan_comparison(&input).unwrap();
        assert_eq!(out.principal, 120_000_000.0);
        assert!((out.monthly_installment - 10_500_000.0).abs() < 1e-6);
        assert_eq!(out.upfront_fees, 2_000_000.0);
        assert!((out.total_payable - 128_000_000.0).abs() < 1.0);
        assert!((out.true_cost_multiple - 128.0 / 120.0).abs() < 1e-9);
    }

    #[test]
    fn schedule_amortizes_to_zero() {
        let out = flat_loan_comparison(&typical()).unwrap();
        assert_eq!(out.schedule.len(), 12);
        assert_eq!(out.schedule[0].month, 1);
        let last = out.schedule.last().unwrap();
        assert!(last.balance.abs() < 1.0);
        assert!((last.cum_interest - out.total_interest).abs() < 1.0);
        let principal_sum: f64 = out.schedule.iter().map(|p| p.principal_paid).sum();
        assert!((principal_sum - 120_000_000.0).abs() < 1.0);
        for w in out.schedule.windows(2) {
            assert!(w[1].balance <= w[0].balance + 1.0);
        }
    }

    #[test]
    fn higher_flat_means_higher_effective() {
        let mut input = typical();
        input.flat_rate_annual = 0.10;
        let high = flat_loan_comparison(&input).unwrap();
        let low = flat_loan_comparison(&typical()).unwrap();
        assert!(high.effective_annual_nominal > low.effective_annual_nominal);
        assert!(high.monthly_installment > low.monthly_installment);
        // Solver agrees with closed form at the boundary.
        assert_eq!(effective_monthly_rate(0.0, 1000.0, 12), 0.0);
        assert_eq!(effective_monthly_rate(120_000_000.0, 10_000_000.0, 12), 0.0);
    }

    #[test]
    fn rejects_bad_input() {
        let mut input = typical();
        input.down_payment = 200_000_000.0;
        assert!(flat_loan_comparison(&input).is_err());
        input = typical();
        input.flat_rate_annual = 1.5;
        assert!(flat_loan_comparison(&input).is_err());
        input = typical();
        input.tenor_months = 0.0;
        assert!(flat_loan_comparison(&input).is_err());
        input = typical();
        input.tenor_months = 361.0;
        assert!(flat_loan_comparison(&input).is_err());
        input = typical();
        input.tenor_months = 12.5;
        assert!(flat_loan_comparison(&input).is_err());
        input = typical();
        input.price = 0.0;
        assert!(flat_loan_comparison(&input).is_err());
        input = typical();
        input.upfront_fees = -1.0;
        assert!(flat_loan_comparison(&input).is_err());
    }
}
