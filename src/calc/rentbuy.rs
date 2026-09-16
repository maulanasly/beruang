use serde::{Deserialize, Serialize};

use super::error::CalcError;

/// Inputs for a simple rent-vs-buy cash comparison. All money figures
/// share one currency (e.g. IDR); rates are annual fractions (0.07 = 7%).
#[derive(Debug, Clone, Deserialize)]
pub struct RentBuyInput {
    pub house_price: f64,
    pub down_payment: f64,
    pub mortgage_rate_annual: f64,
    pub tenor_years: f64,
    pub rent_per_month: f64,
    pub other_buy_costs_per_month: f64,
}

/// One point of the cumulative cash-out series backing the crossover
/// chart (`year` 0..=tenor, cash paid so far for each side).
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct RentBuyYearPoint {
    pub year: u32,
    pub cum_buy: f64,
    pub cum_rent: f64,
}

/// Cash-basis comparison: renting vs buying the same roof.
/// `break_even_months` is `None` when buying never wins back its upfront
/// on monthly cash flow (monthly saving <= 0 and upfront > 0) — the
/// common case for mortgaged homes, where the verdict is "renting costs
/// less cash, buying leaves you the asset".
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct RentBuyComparison {
    pub upfront_buy: f64,
    pub monthly_buy: f64,
    pub monthly_rent: f64,
    pub monthly_saving: f64,
    pub break_even_months: Option<u32>,
    pub total_buy: f64,
    pub total_rent: f64,
    pub schedule: Vec<RentBuyYearPoint>,
}

fn require_amount(value: f64, field: &str) -> Result<f64, CalcError> {
    if !value.is_finite() || value < 0.0 {
        return Err(CalcError::validation(format!(
            "{field} must be a non-negative number."
        )));
    }
    Ok(value)
}

/// Standard amortizing-loan payment: `P*r/(1-(1+r)^-n)`, `P/n` at 0% rate.
pub fn monthly_payment(principal: f64, annual_rate: f64, months: u32) -> f64 {
    if months == 0 {
        return 0.0;
    }
    let r = annual_rate / 12.0;
    if r == 0.0 {
        principal / months as f64
    } else {
        principal * r / (1.0 - (1.0 + r).powf(-(months as f64)))
    }
}

pub fn rent_buy_comparison(input: &RentBuyInput) -> Result<RentBuyComparison, CalcError> {
    let price = require_amount(input.house_price, "house_price")?;
    let dp = require_amount(input.down_payment, "down_payment")?;
    let rate = require_amount(input.mortgage_rate_annual, "mortgage_rate_annual")?;
    let tenor = require_amount(input.tenor_years, "tenor_years")?;
    let rent = require_amount(input.rent_per_month, "rent_per_month")?;
    let other = require_amount(input.other_buy_costs_per_month, "other_buy_costs_per_month")?;

    if price <= 0.0 {
        return Err(CalcError::validation(
            "house_price must be greater than zero.",
        ));
    }
    if dp > price {
        return Err(CalcError::validation(
            "down_payment must not exceed house_price.",
        ));
    }
    if rate > 1.0 {
        return Err(CalcError::validation(
            "mortgage_rate_annual must be between 0 and 1 (0.07 = 7%).",
        ));
    }
    if !(1.0..=30.0).contains(&tenor) || (tenor.round() - tenor).abs() > 1e-9 {
        return Err(CalcError::validation(
            "tenor_years must be a whole number of years between 1 and 30.",
        ));
    }

    let years = tenor.round() as u32;
    let months = years * 12;
    let principal = price - dp;
    let pmt = monthly_payment(principal, rate, months);
    let monthly_buy = pmt + other;
    let monthly_saving = rent - monthly_buy;
    let break_even_months = if monthly_saving > 0.0 && dp > 0.0 {
        Some((dp / monthly_saving).ceil() as u32)
    } else if dp <= 0.0 {
        Some(0)
    } else {
        None
    };

    let total_buy = dp + monthly_buy * months as f64;
    let total_rent = rent * months as f64;
    let schedule = (0..=years)
        .map(|y| RentBuyYearPoint {
            year: y,
            cum_buy: dp + monthly_buy * (y * 12) as f64,
            cum_rent: rent * (y * 12) as f64,
        })
        .collect();

    Ok(RentBuyComparison {
        upfront_buy: dp,
        monthly_buy,
        monthly_rent: rent,
        monthly_saving,
        break_even_months,
        total_buy,
        total_rent,
        schedule,
    })
}

#[cfg(test)]
mod tests {
    use super::{monthly_payment, rent_buy_comparison, RentBuyInput};

    fn typical() -> RentBuyInput {
        // Realistic Jakarta case: Rp800M house, 20% DP, 7% for 20 years,
        // Rp3M/month rent, Rp500k/month other buying costs.
        RentBuyInput {
            house_price: 800_000_000.0,
            down_payment: 160_000_000.0,
            mortgage_rate_annual: 0.07,
            tenor_years: 20.0,
            rent_per_month: 3_000_000.0,
            other_buy_costs_per_month: 500_000.0,
        }
    }

    #[test]
    fn typical_id_case_rent_wins_on_cash() {
        let out = rent_buy_comparison(&typical()).unwrap();
        assert_eq!(out.upfront_buy, 160_000_000.0);
        let expected_pmt = monthly_payment(640_000_000.0, 0.07, 240);
        assert!((out.monthly_buy - (expected_pmt + 500_000.0)).abs() < 1e-6);
        assert_eq!(out.monthly_rent, 3_000_000.0);
        // Buying costs more per month, so cash never breaks even.
        assert!(out.monthly_saving < 0.0);
        assert_eq!(out.break_even_months, None);
        assert!((out.total_buy - (160_000_000.0 + out.monthly_buy * 240.0)).abs() < 1.0);
        assert_eq!(out.total_rent, 3_000_000.0 * 240.0);
    }

    #[test]
    fn schedule_anchors_and_grows_monotonically() {
        let out = rent_buy_comparison(&typical()).unwrap();
        assert_eq!(out.schedule.len(), 21);
        assert_eq!(out.schedule[0].year, 0);
        assert_eq!(out.schedule[0].cum_buy, 160_000_000.0);
        assert_eq!(out.schedule[0].cum_rent, 0.0);
        for w in out.schedule.windows(2) {
            assert!(w[1].cum_buy >= w[0].cum_buy);
            assert!(w[1].cum_rent >= w[0].cum_rent);
        }
        let last = out.schedule.last().unwrap();
        assert!((last.cum_buy - out.total_buy).abs() < 1.0);
        assert!((last.cum_rent - out.total_rent).abs() < 1.0);
    }

    #[test]
    fn cheap_rent_pays_back() {
        let mut input = typical();
        input.rent_per_month = 8_000_000.0;
        let out = rent_buy_comparison(&input).unwrap();
        assert!(out.monthly_saving > 0.0);
        let expected = (160_000_000.0_f64 / out.monthly_saving).ceil() as u32;
        assert_eq!(out.break_even_months, Some(expected));
        // Crossover sits inside the charted schedule.
        let cross = out.schedule.iter().position(|p| p.cum_buy <= p.cum_rent);
        assert_eq!(cross, Some((expected.div_ceil(12)) as usize));
    }

    #[test]
    fn zero_down_payment_wins_immediately() {
        let mut input = typical();
        input.down_payment = 0.0;
        input.rent_per_month = 8_000_000.0;
        assert_eq!(
            rent_buy_comparison(&input).unwrap().break_even_months,
            Some(0)
        );
    }

    #[test]
    fn zero_rate_uses_straight_division() {
        assert_eq!(monthly_payment(120_000_000.0, 0.0, 120), 1_000_000.0);
        let mut input = typical();
        input.mortgage_rate_annual = 0.0;
        let out = rent_buy_comparison(&input).unwrap();
        let expected = 640_000_000.0 / 240.0 + 500_000.0;
        assert!((out.monthly_buy - expected).abs() < 1e-6);
    }

    #[test]
    fn rejects_bad_input() {
        let mut input = typical();
        input.down_payment = 900_000_000.0;
        assert!(rent_buy_comparison(&input).is_err());
        input = typical();
        input.tenor_years = 0.0;
        assert!(rent_buy_comparison(&input).is_err());
        input = typical();
        input.tenor_years = 20.5;
        assert!(rent_buy_comparison(&input).is_err());
        input = typical();
        input.mortgage_rate_annual = 1.5;
        assert!(rent_buy_comparison(&input).is_err());
        input = typical();
        input.house_price = -1.0;
        assert!(rent_buy_comparison(&input).is_err());
    }
}
