use serde::{Deserialize, Serialize};

use super::error::CalcError;

fn default_appreciation() -> f64 {
    0.04
}
fn default_rent_growth() -> f64 {
    0.03
}
fn default_other_growth() -> f64 {
    0.03
}
fn default_invest_return() -> f64 {
    0.08
}
fn default_closing() -> f64 {
    0.0
}
fn default_zero() -> f64 {
    0.0
}
fn default_selling_rate() -> f64 {
    0.05
}

/// Inputs for the rent-vs-buy comparison. The first six fields drive the
/// flat first-month cash view (unchanged semantics); the `#[serde(default)]`
/// growth/wealth fields drive the net-worth simulation, so payloads and
/// share links saved before they existed keep working.
/// All money figures share one currency (e.g. IDR); rates are annual
/// fractions (0.07 = 7%).
#[derive(Debug, Clone, Deserialize)]
pub struct RentBuyInput {
    pub house_price: f64,
    pub down_payment: f64,
    pub mortgage_rate_annual: f64,
    pub tenor_years: f64,
    pub rent_per_month: f64,
    pub other_buy_costs_per_month: f64,
    #[serde(default = "default_appreciation")]
    pub home_appreciation_annual: f64,
    #[serde(default = "default_rent_growth")]
    pub rent_growth_annual: f64,
    #[serde(default = "default_other_growth")]
    pub other_growth_annual: f64,
    #[serde(default = "default_invest_return")]
    pub invest_return_annual: f64,
    #[serde(default = "default_closing")]
    pub closing_costs: f64,
    #[serde(default = "default_selling_rate")]
    pub selling_cost_rate: f64,
    /// Whole years to wait before buying (0 = buy now, feature off).
    #[serde(default = "default_zero")]
    pub wait_years: f64,
    /// Gross monthly income for the affordability gauge (0 = hidden).
    #[serde(default = "default_zero")]
    pub gross_monthly_income: f64,
}

/// One point of the yearly series backing both charts (`year` 0..=tenor).
/// `cum_buy`/`cum_rent` are the flat first-month cash series (plus closing
/// costs on the buy side); the net-worth fields compound growth, investing
/// surpluses, and amortization.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct RentBuyYearPoint {
    pub year: u32,
    pub cum_buy: f64,
    pub cum_rent: f64,
    pub home_value: f64,
    pub loan_balance: f64,
    pub equity: f64,
    pub buyer_net_worth: f64,
    pub renter_net_worth: f64,
}

/// Net-worth crossover year at one appreciation assumption (`None` when
/// buying never catches up — e.g. zero appreciation with high friction).
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct SensitivityPoint {
    pub appreciation: f64,
    pub break_even_year: Option<u32>,
}

/// Cash-basis comparison plus the net-worth layer. The original cash fields
/// keep their exact meaning (first-month figures, flat series) so old
/// clients and tests are unaffected; wealth effects live in the new fields.
/// `break_even_months` is `None` when buying never wins back its upfront
/// on monthly cash flow — the common mortgaged case, where the headline
/// answer is `net_worth_break_even_year` instead.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct RentBuyComparison {
    pub upfront_buy: f64,
    pub monthly_buy: f64,
    pub monthly_rent: f64,
    pub monthly_saving: f64,
    pub break_even_months: Option<u32>,
    pub total_buy: f64,
    pub total_rent: f64,
    pub total_interest_paid: f64,
    pub end_buyer_net_worth: f64,
    pub end_renter_net_worth: f64,
    pub net_advantage_buy_minus_rent: f64,
    pub net_worth_break_even_year: Option<u32>,
    pub sensitivity: Vec<SensitivityPoint>,
    /// Buy signals: price ÷ annual rent (`None` when rent is zero) and
    /// first-month buy ÷ rent (`None` when rent is zero).
    pub price_to_rent: Option<f64>,
    pub payment_to_rent: Option<f64>,
    /// Appreciation at which buying breaks even by horizon (`Some(0.0)` =
    /// wins at any appreciation, `None` = cannot win below 30%/yr).
    pub required_appreciation: Option<f64>,
    /// Invest return below which buying wins (`None` = renting wins even
    /// at 0% returns).
    pub max_invest_return: Option<f64>,
    /// Years of renter surplus covering closing costs (`Some(0)` when no
    /// closing costs, `None` when buying never runs a surplus).
    pub closing_recovery_years: Option<u32>,
    /// Waiter end wealth minus buy-now end wealth (`None` when
    /// `wait_years` is 0).
    pub wait_advantage_vs_buy_now: Option<f64>,
    /// First-month buy cost ÷ income (`None` when income is 0/absent).
    pub installment_share: Option<f64>,
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

fn require_rate(value: f64, field: &str) -> Result<f64, CalcError> {
    let v = require_amount(value, field)?;
    if v > 1.0 {
        return Err(CalcError::validation(format!(
            "{field} must be between 0 and 1 (0.07 = 7%)."
        )));
    }
    Ok(v)
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

/// Convert an effective annual rate to its monthly compounding equivalent.
fn monthly_factor(annual: f64) -> f64 {
    (1.0 + annual).powf(1.0 / 12.0) - 1.0
}

/// Validated, simulation-ready parameters.
struct Resolved {
    price: f64,
    dp: f64,
    rate: f64,
    years: u32,
    rent0: f64,
    other0: f64,
    apprec: f64,
    rent_g: f64,
    other_g: f64,
    invest: f64,
    closing: f64,
    sell: f64,
}

/// Dynamic month-loop state captured at each yearly snapshot.
struct YearState {
    year: u32,
    balance: f64,
    renter_pf: f64,
    buyer_pf: f64,
    cum_buy: f64,
    cum_rent: f64,
}

fn snapshot(p: &Resolved, s: &YearState) -> RentBuyYearPoint {
    let home_value = p.price * (1.0 + p.apprec).powf(s.year as f64);
    let equity = home_value - s.balance;
    RentBuyYearPoint {
        year: s.year,
        cum_buy: s.cum_buy,
        cum_rent: s.cum_rent,
        home_value,
        loan_balance: s.balance,
        equity,
        // As-if-sold: equity net of selling friction, plus invested surplus.
        buyer_net_worth: equity - p.sell * home_value + s.buyer_pf,
        renter_net_worth: s.renter_pf,
    }
}

/// Monthly wealth simulation with yearly snapshots. Surplus investing is
/// symmetric: whoever spends less on housing that month invests the
/// difference at the invest return.
fn simulate(p: &Resolved) -> (Vec<RentBuyYearPoint>, f64) {
    let months = p.years * 12;
    let principal = p.price - p.dp;
    let r = p.rate / 12.0;
    let pmt = monthly_payment(principal, p.rate, months);
    let rent_f = monthly_factor(p.rent_g);
    let other_f = monthly_factor(p.other_g);
    let inv_f = monthly_factor(p.invest);

    let mut schedule = Vec::with_capacity(p.years as usize + 1);
    let mut balance = principal;
    let mut renter_pf = p.dp + p.closing;
    let mut buyer_pf = 0.0;
    let mut total_interest = 0.0;
    // Flat cash series anchors (unchanged semantics, plus closing costs).
    let flat_buy_m = pmt + p.other0;
    schedule.push(snapshot(
        p,
        &YearState {
            year: 0,
            balance,
            renter_pf,
            buyer_pf,
            cum_buy: p.dp + p.closing,
            cum_rent: 0.0,
        },
    ));

    for m in 1..=months {
        let grow = |monthly: f64| (1.0 + monthly).powf((m - 1) as f64);
        let rent_m = p.rent0 * grow(rent_f);
        let buy_m = pmt + p.other0 * grow(other_f);
        if buy_m >= rent_m {
            renter_pf = renter_pf * (1.0 + inv_f) + (buy_m - rent_m);
            buyer_pf *= 1.0 + inv_f;
        } else {
            buyer_pf = buyer_pf * (1.0 + inv_f) + (rent_m - buy_m);
            renter_pf *= 1.0 + inv_f;
        }
        let interest_m = balance * r;
        total_interest += interest_m;
        balance = (balance + interest_m - pmt).max(0.0);
        if m % 12 == 0 {
            schedule.push(snapshot(
                p,
                &YearState {
                    year: m / 12,
                    balance,
                    renter_pf,
                    buyer_pf,
                    cum_buy: p.dp + p.closing + flat_buy_m * m as f64,
                    cum_rent: p.rent0 * m as f64,
                },
            ));
        }
    }
    (schedule, total_interest)
}

fn crossover_year(schedule: &[RentBuyYearPoint]) -> Option<u32> {
    schedule
        .iter()
        .find(|pt| pt.buyer_net_worth >= pt.renter_net_worth)
        .map(|pt| pt.year)
}

/// End-horizon buyer-minus-renter wealth with appreciation and invest
/// return overridden. Buyer wealth rises strictly with `apprec` and falls
/// strictly with `invest`, so both bisections below always converge.
fn advantage_at(p: &Resolved, apprec: f64, invest: f64) -> f64 {
    let q = Resolved {
        apprec,
        invest,
        ..*p
    };
    let (sched, _) = simulate(&q);
    let last = sched.last().expect("schedule always has year 0");
    last.buyer_net_worth - last.renter_net_worth
}

fn round4(x: f64) -> f64 {
    (x * 10_000.0).round() / 10_000.0
}

/// Bisection root of `f` on `[lo, hi]`; `increasing` selects the branch.
fn bisect(f: impl Fn(f64) -> f64, mut lo: f64, mut hi: f64, increasing: bool) -> f64 {
    for _ in 0..40 {
        let mid = 0.5 * (lo + hi);
        if (f(mid) > 0.0) == increasing {
            hi = mid;
        } else {
            lo = mid;
        }
    }
    round4(0.5 * (lo + hi))
}

/// Minimum appreciation for buying to win by horizon. `Some(0.0)` wins at
/// any appreciation; `None` cannot win below 30%/yr.
fn required_appreciation(p: &Resolved) -> Option<f64> {
    if advantage_at(p, 0.0, p.invest) > 0.0 {
        return Some(0.0);
    }
    if advantage_at(p, 0.30, p.invest) < 0.0 {
        return None;
    }
    Some(bisect(|g| advantage_at(p, g, p.invest), 0.0, 0.30, true))
}

/// Maximum invest return at which buying still wins. `None` means renting
/// wins even if investments return nothing.
fn max_invest_return(p: &Resolved) -> Option<f64> {
    if advantage_at(p, p.apprec, 0.0) < 0.0 {
        return None;
    }
    if advantage_at(p, p.apprec, 1.0) >= 0.0 {
        return Some(1.0);
    }
    Some(bisect(|i| advantage_at(p, p.apprec, i), 0.0, 1.0, false))
}

/// Years of first-year renter surplus covering closing costs.
fn closing_recovery_years(p: &Resolved, pmt: f64) -> Option<u32> {
    if p.closing <= 0.0 {
        return Some(0);
    }
    let rent_f = monthly_factor(p.rent_g);
    let other_f = monthly_factor(p.other_g);
    let surplus: f64 = (0..12)
        .map(|m| {
            let buy_m = pmt + p.other0 * (1.0 + other_f).powf(m as f64);
            (buy_m - p.rent0 * (1.0 + rent_f).powf(m as f64)).max(0.0)
        })
        .sum();
    if surplus <= 0.0 {
        return None;
    }
    Some((p.closing / surplus).ceil() as u32)
}

/// Buy-now-vs-wait: rent and invest everything for `w` years, then deploy
/// the whole accumulated portfolio as the down payment (net of a fresh
/// round of closing costs) on the appreciated house with a new same-rate,
/// same-tenor loan. Returns end-horizon buyer wealth for the waiter.
fn wait_net_worth(p: &Resolved, w: u32) -> f64 {
    let months_total = p.years * 12;
    let principal0 = p.price - p.dp;
    let pmt0 = monthly_payment(principal0, p.rate, months_total);
    let rent_f = monthly_factor(p.rent_g);
    let other_f = monthly_factor(p.other_g);
    let inv_f = monthly_factor(p.invest);

    // Phase 1: rent while investing the would-be buyer surplus.
    let mut pf = p.dp + p.closing;
    let w_m = w * 12;
    for m in 1..=w_m {
        let grow = |f: f64| (1.0 + f).powf((m - 1) as f64);
        let rent_m = p.rent0 * grow(rent_f);
        let buy_m = pmt0 + p.other0 * grow(other_f);
        pf = pf * (1.0 + inv_f) + (buy_m - rent_m).max(0.0);
    }
    // Purchase at year w: everything deployed as down payment.
    let price_w = p.price * (1.0 + p.apprec).powf(w as f64);
    let dp_w = (pf - p.closing).max(0.0);
    let principal_w = (price_w - dp_w).max(0.0);
    let pmt_w = monthly_payment(principal_w, p.rate, months_total);
    let r = p.rate / 12.0;

    // Phase 2: own for the remaining months, investing own surplus.
    let mut balance = principal_w;
    let mut buyer_pf = 0.0;
    for m in 1..=(months_total - w_m) {
        let gm = w_m + m;
        let grow = |f: f64| (1.0 + f).powf((gm - 1) as f64);
        let rent_m = p.rent0 * grow(rent_f);
        let buy_m = pmt_w + p.other0 * grow(other_f);
        if buy_m < rent_m {
            buyer_pf = buyer_pf * (1.0 + inv_f) + (rent_m - buy_m);
        } else {
            buyer_pf *= 1.0 + inv_f;
        }
        balance = (balance + balance * r - pmt_w).max(0.0);
    }
    let home_end = p.price * (1.0 + p.apprec).powf(p.years as f64);
    (home_end - balance) - p.sell * home_end + buyer_pf
}
fn sensitivity(p: &Resolved) -> Vec<SensitivityPoint> {
    [-0.02, -0.01, 0.0, 0.01, 0.02]
        .into_iter()
        .map(|d| {
            let apprec = (p.apprec + d).max(0.0);
            let (sched, _) = simulate(&Resolved { apprec, ..*p });
            SensitivityPoint {
                appreciation: (apprec * 10_000.0).round() / 10_000.0,
                break_even_year: crossover_year(&sched),
            }
        })
        .collect()
}

pub fn rent_buy_comparison(input: &RentBuyInput) -> Result<RentBuyComparison, CalcError> {
    let price = require_amount(input.house_price, "house_price")?;
    let dp = require_amount(input.down_payment, "down_payment")?;
    let rate = require_rate(input.mortgage_rate_annual, "mortgage_rate_annual")?;
    let tenor = require_amount(input.tenor_years, "tenor_years")?;
    let rent = require_amount(input.rent_per_month, "rent_per_month")?;
    let other = require_amount(input.other_buy_costs_per_month, "other_buy_costs_per_month")?;
    let apprec = require_rate(input.home_appreciation_annual, "home_appreciation_annual")?;
    let rent_g = require_rate(input.rent_growth_annual, "rent_growth_annual")?;
    let other_g = require_rate(input.other_growth_annual, "other_growth_annual")?;
    let invest = require_rate(input.invest_return_annual, "invest_return_annual")?;
    let closing = require_amount(input.closing_costs, "closing_costs")?;
    let sell = require_rate(input.selling_cost_rate, "selling_cost_rate")?;
    let wait = require_amount(input.wait_years, "wait_years")?;
    let income = require_amount(input.gross_monthly_income, "gross_monthly_income")?;

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
    if !(1.0..=30.0).contains(&tenor) || (tenor.round() - tenor).abs() > 1e-9 {
        return Err(CalcError::validation(
            "tenor_years must be a whole number of years between 1 and 30.",
        ));
    }
    if (wait.round() - wait).abs() > 1e-9 || !(0.0..=10.0).contains(&wait) {
        return Err(CalcError::validation(
            "wait_years must be a whole number of years between 0 and 10.",
        ));
    }

    let years = tenor.round() as u32;
    let wait_y = wait.round() as u32;
    if wait_y >= years {
        return Err(CalcError::validation(
            "wait_years must be less than tenor_years.",
        ));
    }
    let months = years * 12;
    let principal = price - dp;
    let pmt = monthly_payment(principal, rate, months);
    // First-month cash figures (unchanged semantics).
    let monthly_buy = pmt + other;
    let monthly_saving = rent - monthly_buy;
    let break_even_months = if monthly_saving > 0.0 && dp > 0.0 {
        Some((dp / monthly_saving).ceil() as u32)
    } else if dp <= 0.0 {
        Some(0)
    } else {
        None
    };

    let p = Resolved {
        price,
        dp,
        rate,
        years,
        rent0: rent,
        other0: other,
        apprec,
        rent_g,
        other_g,
        invest,
        closing,
        sell,
    };
    let (schedule, total_interest) = simulate(&p);
    let nw_break_even = crossover_year(&schedule);
    let last = schedule.last().expect("schedule always has year 0");
    let end_buyer = last.buyer_net_worth;
    let end_renter = last.renter_net_worth;

    Ok(RentBuyComparison {
        upfront_buy: dp,
        monthly_buy,
        monthly_rent: rent,
        monthly_saving,
        break_even_months,
        total_buy: dp + closing + monthly_buy * months as f64,
        total_rent: rent * months as f64,
        total_interest_paid: total_interest,
        end_buyer_net_worth: end_buyer,
        end_renter_net_worth: end_renter,
        net_advantage_buy_minus_rent: end_buyer - end_renter,
        net_worth_break_even_year: nw_break_even,
        sensitivity: sensitivity(&p),
        price_to_rent: (rent > 0.0).then_some(price / (12.0 * rent)),
        payment_to_rent: (rent > 0.0).then_some(monthly_buy / rent),
        required_appreciation: required_appreciation(&p),
        max_invest_return: max_invest_return(&p),
        closing_recovery_years: closing_recovery_years(&p, pmt),
        wait_advantage_vs_buy_now: (wait_y > 0).then(|| wait_net_worth(&p, wait_y) - end_buyer),
        installment_share: (income > 0.0).then_some(monthly_buy / income),
        schedule,
    })
}

#[cfg(test)]
mod tests {
    use super::{monthly_payment, rent_buy_comparison, RentBuyInput};

    fn typical() -> RentBuyInput {
        // Realistic Jakarta case: Rp800M house, 20% DP, 7% for 20 years,
        // Rp3M/month rent, Rp500k/month other buying costs.
        // (New wealth fields take serde defaults via JSON below; struct
        // literals spell them out.)
        RentBuyInput {
            house_price: 800_000_000.0,
            down_payment: 160_000_000.0,
            mortgage_rate_annual: 0.07,
            tenor_years: 20.0,
            rent_per_month: 3_000_000.0,
            other_buy_costs_per_month: 500_000.0,
            home_appreciation_annual: 0.04,
            rent_growth_annual: 0.03,
            other_growth_annual: 0.03,
            invest_return_annual: 0.08,
            closing_costs: 0.0,
            selling_cost_rate: 0.05,
            wait_years: 0.0,
            gross_monthly_income: 0.0,
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
    fn old_payloads_get_documented_defaults() {
        let input: RentBuyInput = serde_json::from_str(
            r#"{"house_price": 800000000, "down_payment": 160000000,
                "mortgage_rate_annual": 0.07, "tenor_years": 20,
                "rent_per_month": 3000000, "other_buy_costs_per_month": 500000}"#,
        )
        .unwrap();
        assert_eq!(input.home_appreciation_annual, 0.04);
        assert_eq!(input.rent_growth_annual, 0.03);
        assert_eq!(input.other_growth_annual, 0.03);
        assert_eq!(input.invest_return_annual, 0.08);
        assert_eq!(input.closing_costs, 0.0);
        assert_eq!(input.selling_cost_rate, 0.05);
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
    fn typical_defaults_is_a_close_race_renter_wins() {
        let out = rent_buy_comparison(&typical()).unwrap();
        // Honest math: 8% market returns on the DP + monthly surplus beat
        // 4% appreciation against a 7% mortgage — but only just.
        assert_eq!(out.break_even_months, None);
        assert_eq!(out.net_worth_break_even_year, None);
        assert!(out.end_buyer_net_worth > 1_000_000_000.0);
        assert!(out.end_renter_net_worth > out.end_buyer_net_worth);
        assert!(out.net_advantage_buy_minus_rent < 0.0);
        // ...while one point more appreciation flips the verdict early.
        assert_eq!(out.sensitivity[2].appreciation, 0.04);
        assert_eq!(out.sensitivity[2].break_even_year, None);
        assert!(out.sensitivity[3].break_even_year.is_some());
        assert!(out.sensitivity[4].break_even_year.is_some());
    }

    #[test]
    fn higher_appreciation_crosses_over_early() {
        let mut input = typical();
        input.home_appreciation_annual = 0.06;
        let out = rent_buy_comparison(&input).unwrap();
        // Leverage cuts both ways: 6% on the whole house accrues to the
        // 20% equity stake, so buying pulls ahead within a few years.
        let year = out.net_worth_break_even_year.expect("must cross over");
        assert!((1..=20).contains(&year));
        assert!(out.end_buyer_net_worth > out.end_renter_net_worth);
        assert!(out.net_advantage_buy_minus_rent > 0.0);
        assert!(
            (out.net_advantage_buy_minus_rent
                - (out.end_buyer_net_worth - out.end_renter_net_worth))
                .abs()
                < 1.0
        );
    }

    #[test]
    fn net_worth_anchors_match_model() {
        let out = rent_buy_comparison(&typical()).unwrap();
        let first = &out.schedule[0];
        assert_eq!(first.home_value, 800_000_000.0);
        assert_eq!(first.loan_balance, 640_000_000.0);
        assert_eq!(first.equity, 160_000_000.0);
        // As-if-sold at year 0: equity minus 5% selling friction.
        assert_eq!(first.buyer_net_worth, 120_000_000.0);
        assert_eq!(first.renter_net_worth, 160_000_000.0);
        let last = out.schedule.last().unwrap();
        assert_eq!(last.year, 20);
        // Loan fully amortized; home compounded 20y at 4%.
        assert!(last.loan_balance.abs() < 1.0);
        assert!((last.home_value - 800_000_000.0 * 1.04_f64.powi(20)).abs() < 1.0);
        assert!((last.equity - last.home_value).abs() < 1.0);
        assert!((out.end_buyer_net_worth - last.buyer_net_worth).abs() < 1e-6);
        assert!((out.end_renter_net_worth - last.renter_net_worth).abs() < 1e-6);
    }

    #[test]
    fn total_interest_matches_amortization() {
        let out = rent_buy_comparison(&typical()).unwrap();
        let pmt = monthly_payment(640_000_000.0, 0.07, 240);
        assert!((out.total_interest_paid - (pmt * 240.0 - 640_000_000.0)).abs() < 1.0);
        assert!(out.total_interest_paid > 0.0);
    }

    #[test]
    fn closing_costs_fold_into_cash_and_wealth_views() {
        let mut input = typical();
        input.closing_costs = 20_000_000.0;
        let out = rent_buy_comparison(&input).unwrap();
        assert_eq!(out.schedule[0].cum_buy, 180_000_000.0);
        assert!((out.total_buy - (180_000_000.0 + out.monthly_buy * 240.0)).abs() < 1.0);
        // Renter invests the same upfront instead.
        assert_eq!(out.schedule[0].renter_net_worth, 180_000_000.0);
    }

    #[test]
    fn signals_match_typical_case() {
        let out = rent_buy_comparison(&typical()).unwrap();
        // 800M ÷ 36M annual rent sits in rent territory on the 15/20 scale.
        let ptr = out.price_to_rent.expect("rent is nonzero");
        assert!((ptr - 22.2222).abs() < 0.01, "{ptr}");
        let pmt = monthly_payment(640_000_000.0, 0.07, 240);
        let pr = out.payment_to_rent.expect("rent is nonzero");
        assert!((pr - (pmt + 500_000.0) / 3_000_000.0).abs() < 1e-9);
        // End-horizon flips between 4% and 5%: the required rate hides in
        // between, and 8% investing beats buying (max return below it).
        let req = out.required_appreciation.expect("flips in range");
        assert!((0.04..0.05).contains(&req), "{req}");
        let max_i = out.max_invest_return.expect("wins at 0%");
        assert!((0.0..0.08).contains(&max_i), "{max_i}");
        // No closing costs recover immediately; nothing to wait for.
        assert_eq!(out.closing_recovery_years, Some(0));
        assert_eq!(out.wait_advantage_vs_buy_now, None);
        assert_eq!(out.installment_share, None);
    }

    #[test]
    fn zero_rent_gives_null_ratios() {
        let mut input = typical();
        input.rent_per_month = 0.0;
        let out = rent_buy_comparison(&input).unwrap();
        assert_eq!(out.price_to_rent, None);
        assert_eq!(out.payment_to_rent, None);
    }

    #[test]
    fn closing_recovery_and_income_share() {
        let mut input = typical();
        input.closing_costs = 20_000_000.0;
        input.gross_monthly_income = 20_000_000.0;
        let out = rent_buy_comparison(&input).unwrap();
        // ~29.5M first-year surplus covers 20M closing in year 1.
        assert_eq!(out.closing_recovery_years, Some(1));
        let share = out.installment_share.expect("income given");
        assert!((share - out.monthly_buy / 20_000_000.0).abs() < 1e-12);
        assert!(share < 0.30, "comfortable band: {share}");
    }

    #[test]
    fn wait_zero_matches_buy_now_internally() {
        let input = typical();
        let out = rent_buy_comparison(&input).unwrap();
        // wait_net_worth(0) must reproduce the buy-now end wealth exactly
        // (same purchase, same loan, same horizon).
        let p = super::Resolved {
            price: input.house_price,
            dp: input.down_payment,
            rate: input.mortgage_rate_annual,
            years: 20,
            rent0: input.rent_per_month,
            other0: input.other_buy_costs_per_month,
            apprec: input.home_appreciation_annual,
            rent_g: input.rent_growth_annual,
            other_g: input.other_growth_annual,
            invest: input.invest_return_annual,
            closing: input.closing_costs,
            sell: input.selling_cost_rate,
        };
        assert!((super::wait_net_worth(&p, 0) - out.end_buyer_net_worth).abs() < 1.0);
    }

    #[test]
    fn sensitivity_is_monotonic_and_centered() {
        let out = rent_buy_comparison(&typical()).unwrap();
        assert_eq!(out.sensitivity.len(), 5);
        assert_eq!(out.sensitivity[2].appreciation, 0.04);
        assert_eq!(
            out.sensitivity[2].break_even_year,
            out.net_worth_break_even_year
        );
        let mut prev: Option<u32> = None;
        let mut first = true;
        for pt in &out.sensitivity {
            if !first {
                // Higher appreciation can only pull the crossover earlier.
                match (prev, pt.break_even_year) {
                    (Some(a), Some(b)) => assert!(b <= a),
                    (None, _) => {}
                    (Some(_), None) => panic!("crossover lost at higher appreciation"),
                }
            }
            first = false;
            prev = pt.break_even_year;
        }
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
        input = typical();
        input.home_appreciation_annual = 1.5;
        assert!(rent_buy_comparison(&input).is_err());
        input = typical();
        input.invest_return_annual = -0.1;
        assert!(rent_buy_comparison(&input).is_err());
        input = typical();
        input.selling_cost_rate = 2.0;
        assert!(rent_buy_comparison(&input).is_err());
        input = typical();
        input.closing_costs = -1.0;
        assert!(rent_buy_comparison(&input).is_err());
        input = typical();
        input.wait_years = 99.0;
        assert!(rent_buy_comparison(&input).is_err());
        input = typical();
        input.wait_years = 2.5;
        assert!(rent_buy_comparison(&input).is_err());
        input = typical();
        input.wait_years = 20.0;
        assert!(rent_buy_comparison(&input).is_err());
        input = typical();
        input.gross_monthly_income = -1.0;
        assert!(rent_buy_comparison(&input).is_err());
    }
}
