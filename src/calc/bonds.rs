use serde::{Deserialize, Serialize};

use super::error::CalcError;

/// Inputs for a fixed-coupon retail government bond (ORI/SR style).
/// `coupon_annual` and `tax_rate` are fractions on the wire (0.069 = 6.9%);
/// the UI takes percent. `price_pct` is percent of par (100 = primary
/// market at par). All money figures share one currency (e.g. IDR).
#[derive(Debug, Clone, Deserialize)]
pub struct BondInput {
    pub nominal: f64,
    pub coupon_annual: f64,
    pub tenor_months: f64,
    #[serde(default = "default_price_pct")]
    pub price_pct: f64,
    #[serde(default = "default_tax_rate")]
    pub tax_rate: f64,
}

fn default_price_pct() -> f64 {
    100.0
}

fn default_tax_rate() -> f64 {
    0.10
}

/// One month of coupon flow.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct BondMonthPoint {
    pub month: u32,
    pub coupon_gross: f64,
    pub coupon_net: f64,
    pub cum_net: f64,
}

/// Net economics of holding the bond to maturity: monthly coupons after
/// the final coupon tax, the capital gain/loss from buying off par, and
/// the yield to maturity solved from the actual cash paid.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct BondComparison {
    pub nominal: f64,
    pub price_pct: f64,
    pub purchase_cost: f64,
    pub monthly_coupon_gross: f64,
    pub monthly_coupon_net: f64,
    pub total_coupon_gross: f64,
    pub total_coupon_net: f64,
    pub capital_gain: f64,
    pub total_net_received: f64,
    pub total_net_profit: f64,
    pub ytm_gross_annual: f64,
    pub ytm_net_nominal: f64,
    pub ytm_net_annual: f64,
    pub schedule: Vec<BondMonthPoint>,
}

fn require_amount(value: f64, field: &str) -> Result<f64, CalcError> {
    if !value.is_finite() || value < 0.0 {
        return Err(CalcError::validation(format!(
            "{field} must be a non-negative number."
        )));
    }
    Ok(value)
}

/// Monthly yield to maturity: the root of
/// `price = Σ C/(1+r)^t + N/(1+r)^n`. Present value strictly decreases in
/// `r`, so bisection converges on a guarded bracket (negative side covers
/// deep-premium paper; the doubling top covers distressed discounts).
pub fn bond_monthly_ytm(price_paid: f64, coupon: f64, nominal: f64, months: u32) -> f64 {
    if months == 0
        || !price_paid.is_finite()
        || price_paid <= 0.0
        || !nominal.is_finite()
        || nominal < 0.0
        || !coupon.is_finite()
        || coupon < 0.0
    {
        return 0.0;
    }
    let pv = |r: f64| {
        let d = 1.0 + r;
        let mut s = 0.0;
        for t in 1..=months {
            s += coupon / d.powi(t as i32);
        }
        s + nominal / d.powi(months as i32)
    };
    let (mut lo, mut hi) = (0.0, 1.0);
    if pv(0.0) <= price_paid {
        lo = -0.999_999;
        hi = 0.0;
    } else {
        let mut guard = 0;
        while pv(hi) > price_paid && guard < 200 {
            hi *= 2.0;
            guard += 1;
        }
    }
    for _ in 0..120 {
        let mid = 0.5 * (lo + hi);
        if pv(mid) > price_paid {
            lo = mid;
        } else {
            hi = mid;
        }
    }
    0.5 * (lo + hi)
}

pub fn bond_comparison(input: &BondInput) -> Result<BondComparison, CalcError> {
    let nominal = require_amount(input.nominal, "nominal")?;
    let coupon = require_amount(input.coupon_annual, "coupon_annual")?;
    let tenor = require_amount(input.tenor_months, "tenor_months")?;
    let price_pct = require_amount(input.price_pct, "price_pct")?;
    let tax = require_amount(input.tax_rate, "tax_rate")?;

    if nominal < 1_000_000.0 {
        return Err(CalcError::validation(
            "nominal must be at least 1,000,000 (SBN retail minimum).",
        ));
    }
    if coupon > 0.30 {
        return Err(CalcError::validation(
            "coupon_annual must be between 0 and 0.30 (0.069 = 6.9%).",
        ));
    }
    if !(1.0..=360.0).contains(&tenor) || (tenor.round() - tenor).abs() > 1e-9 {
        return Err(CalcError::validation(
            "tenor_months must be a whole number of months between 1 and 360.",
        ));
    }
    if !(50.0..=150.0).contains(&price_pct) {
        return Err(CalcError::validation(
            "price_pct must be between 50 and 150 (100 = at par).",
        ));
    }
    if tax > 1.0 {
        return Err(CalcError::validation(
            "tax_rate must be between 0 and 1 (0.10 = 10%).",
        ));
    }

    let months = tenor.round() as u32;
    let purchase_cost = nominal * price_pct / 100.0;
    // Coupons accrue on the nominal (face) value, paid monthly.
    let monthly_gross = nominal * coupon / 12.0;
    let monthly_net = monthly_gross * (1.0 - tax);
    let total_gross = monthly_gross * months as f64;
    let total_net = monthly_net * months as f64;
    let capital_gain = nominal - purchase_cost;
    let total_received = total_net + nominal;
    let total_profit = total_received - purchase_cost;

    let r_net = bond_monthly_ytm(purchase_cost, monthly_net, nominal, months);
    let r_gross = bond_monthly_ytm(purchase_cost, monthly_gross, nominal, months);

    let mut schedule = Vec::with_capacity(months as usize);
    let mut cum = 0.0;
    for m in 1..=months {
        cum += monthly_net;
        schedule.push(BondMonthPoint {
            month: m,
            coupon_gross: monthly_gross,
            coupon_net: monthly_net,
            cum_net: cum,
        });
    }

    Ok(BondComparison {
        nominal,
        price_pct,
        purchase_cost,
        monthly_coupon_gross: monthly_gross,
        monthly_coupon_net: monthly_net,
        total_coupon_gross: total_gross,
        total_coupon_net: total_net,
        capital_gain,
        total_net_received: total_received,
        total_net_profit: total_profit,
        ytm_gross_annual: (1.0 + r_gross).powf(12.0) - 1.0,
        ytm_net_nominal: r_net * 12.0,
        ytm_net_annual: (1.0 + r_net).powf(12.0) - 1.0,
        schedule,
    })
}

#[cfg(test)]
mod tests {
    use super::{bond_comparison, bond_monthly_ytm, BondInput};

    fn typical() -> BondInput {
        // ORI-style retail series: Rp10M nominal at 6.9% for 36 months,
        // bought at par, 10% final coupon tax.
        BondInput {
            nominal: 10_000_000.0,
            coupon_annual: 0.069,
            tenor_months: 36.0,
            price_pct: 100.0,
            tax_rate: 0.10,
        }
    }

    #[test]
    fn at_par_ytm_equals_coupon() {
        let out = bond_comparison(&typical()).unwrap();
        assert_eq!(out.purchase_cost, 10_000_000.0);
        // 10M × 6.9% ÷ 12 gross, × 0.9 net — to the rupiah.
        assert!((out.monthly_coupon_gross - 57_500.0).abs() < 1e-6);
        assert!((out.monthly_coupon_net - 51_750.0).abs() < 1e-6);
        assert!((out.total_coupon_net - 51_750.0 * 36.0).abs() < 1.0);
        assert_eq!(out.capital_gain, 0.0);
        assert!((out.total_net_received - (51_750.0 * 36.0 + 10_000_000.0)).abs() < 1.0);
        assert!((out.total_net_profit - 51_750.0 * 36.0).abs() < 1.0);
        // At par with level coupons the monthly root is exactly coupon/12.
        assert!((out.ytm_net_nominal - 0.069 * 0.9).abs() < 1e-9);
        let net_eff = (1.0 + 0.069f64 * 0.9 / 12.0).powf(12.0) - 1.0;
        assert!((out.ytm_net_annual - net_eff).abs() < 1e-9);
        let gross_eff = (1.0 + 0.069f64 / 12.0).powf(12.0) - 1.0;
        assert!((out.ytm_gross_annual - gross_eff).abs() < 1e-9);
        assert!(out.ytm_gross_annual > out.ytm_net_annual);
    }

    #[test]
    fn discount_lifts_ytm_and_premium_cuts_it() {
        let mut cheap = typical();
        cheap.price_pct = 95.0;
        let lo = bond_comparison(&cheap).unwrap();
        assert!((lo.capital_gain - 500_000.0).abs() < 1.0);
        let mut dear = typical();
        dear.price_pct = 105.0;
        let hi = bond_comparison(&dear).unwrap();
        assert!((hi.capital_gain + 500_000.0).abs() < 1.0);
        let par = bond_comparison(&typical()).unwrap();
        assert!(lo.ytm_net_annual > par.ytm_net_annual);
        assert!(hi.ytm_net_annual < par.ytm_net_annual);
        // Self-consistency: solved rate discounts net cash back to price.
        let pv: f64 = (1..=36)
            .map(|t| lo.monthly_coupon_net / (1.0 + lo.ytm_net_nominal / 12.0).powi(t))
            .sum::<f64>()
            + 10_000_000.0 / (1.0 + lo.ytm_net_nominal / 12.0).powi(36);
        assert!((pv - lo.purchase_cost).abs() < 1.0);
    }

    #[test]
    fn zero_coupon_at_par_is_zero() {
        let mut input = typical();
        input.coupon_annual = 0.0;
        let out = bond_comparison(&input).unwrap();
        assert_eq!(out.monthly_coupon_net, 0.0);
        assert_eq!(out.total_coupon_net, 0.0);
        assert!(out.ytm_net_annual.abs() < 1e-9);
        assert!(out.ytm_gross_annual.abs() < 1e-9);
        assert_eq!(bond_monthly_ytm(0.0, 1000.0, 10_000_000.0, 36), 0.0);
    }

    #[test]
    fn schedule_sums_to_totals() {
        let out = bond_comparison(&typical()).unwrap();
        assert_eq!(out.schedule.len(), 36);
        assert_eq!(out.schedule[0].month, 1);
        let last = out.schedule.last().unwrap();
        assert!((last.cum_net - out.total_coupon_net).abs() < 1e-6);
        for w in out.schedule.windows(2) {
            assert_eq!(w[1].month, w[0].month + 1);
            assert!(w[1].cum_net >= w[0].cum_net);
        }
    }

    #[test]
    fn rejects_bad_input() {
        let mut input = typical();
        input.nominal = 999_999.0;
        assert!(bond_comparison(&input).is_err());
        input = typical();
        input.nominal = -1.0;
        assert!(bond_comparison(&input).is_err());
        input = typical();
        input.coupon_annual = 0.31;
        assert!(bond_comparison(&input).is_err());
        input = typical();
        input.tenor_months = 0.0;
        assert!(bond_comparison(&input).is_err());
        input = typical();
        input.tenor_months = 361.0;
        assert!(bond_comparison(&input).is_err());
        input = typical();
        input.tenor_months = 12.5;
        assert!(bond_comparison(&input).is_err());
        input = typical();
        input.price_pct = 49.0;
        assert!(bond_comparison(&input).is_err());
        input = typical();
        input.price_pct = 151.0;
        assert!(bond_comparison(&input).is_err());
        input = typical();
        input.tax_rate = 1.5;
        assert!(bond_comparison(&input).is_err());
    }
}
