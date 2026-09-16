use serde::{Deserialize, Serialize};

use super::error::CalcError;
use super::flatloan::effective_monthly_rate;

/// Maximum debts per plan and months per simulation (100 years — a guard
/// validation makes unreachable, see below).
const MAX_DEBTS: usize = 12;
const MAX_MONTHS: u32 = 1200;

/// How a debt's quoted rate converts to the effective monthly rate every
/// debt is simulated with: `effective` divides by 12, `flat` runs through
/// the flat-loan solver (same math as `/kalkulator/bunga-flat`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RateKind {
    #[default]
    Effective,
    Flat,
}

#[derive(Debug, Clone, Deserialize)]
pub struct DebtInput {
    pub name: String,
    #[serde(default)]
    pub balance: f64,
    #[serde(default)]
    pub annual_rate: f64,
    #[serde(default)]
    pub rate_kind: RateKind,
    /// Required for `flat` quotes (solves the effective rate + installment).
    #[serde(default)]
    pub tenor_months: f64,
    /// Minimum monthly payment (`effective` debts; `flat` debts pay their
    /// fixed installment instead).
    #[serde(default)]
    pub min_payment: f64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct DebtPayoffInput {
    #[serde(default)]
    pub debts: Vec<DebtInput>,
    #[serde(default)]
    pub extra_payment: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct DebtResult {
    pub name: String,
    pub payoff_month: u32,
    pub interest_paid: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct PayoffPlan {
    pub strategy: &'static str,
    pub total_months: u32,
    pub total_interest: f64,
    pub first_win_month: u32,
    pub debts: Vec<DebtResult>,
    /// Total remaining balance per month (month 0..=total) for the chart.
    pub schedule: Vec<f64>,
}

/// Avalanche vs snowball on the same debts, plus the verdict deltas.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct DebtPayoffComparison {
    pub avalanche: PayoffPlan,
    pub snowball: PayoffPlan,
    pub interest_saved_avalanche: f64,
    pub months_saved_avalanche: i64,
}

fn require_amount(value: f64, field: &str) -> Result<f64, CalcError> {
    if !value.is_finite() || value < 0.0 {
        return Err(CalcError::validation(format!(
            "{field} must be a non-negative number."
        )));
    }
    Ok(value)
}

struct ResolvedDebt {
    name: String,
    balance: f64,
    monthly_rate: f64,
    /// Fixed monthly obligation (flat installment, or min payment).
    obligation: f64,
}

fn resolve(debts: &[DebtInput]) -> Result<Vec<ResolvedDebt>, CalcError> {
    if debts.is_empty() || debts.len() > MAX_DEBTS {
        return Err(CalcError::validation(format!(
            "debts must hold between 1 and {MAX_DEBTS} entries."
        )));
    }
    debts
        .iter()
        .enumerate()
        .map(|(i, d)| {
            let tag = format!("debts[{i}]");
            let name = d.name.trim().to_string();
            if name.is_empty() || name.chars().count() > 64 {
                return Err(CalcError::validation(format!(
                    "{tag}.name must be 1–64 characters."
                )));
            }
            let balance = require_amount(d.balance, &format!("{tag}.balance"))?;
            if balance <= 0.0 {
                return Err(CalcError::validation(format!(
                    "{tag}.balance must be greater than zero."
                )));
            }
            let rate = require_amount(d.annual_rate, &format!("{tag}.annual_rate"))?;
            if rate > 1.0 {
                return Err(CalcError::validation(format!(
                    "{tag}.annual_rate must be between 0 and 1 (0.12 = 12%)."
                )));
            }
            let min = require_amount(d.min_payment, &format!("{tag}.min_payment"))?;
            let (monthly_rate, obligation) = match d.rate_kind {
                RateKind::Effective => {
                    let r = rate / 12.0;
                    if min <= balance * r {
                        return Err(CalcError::validation(format!(
                            "{tag}.min_payment must exceed the first month's interest."
                        )));
                    }
                    (r, min)
                }
                RateKind::Flat => {
                    let tenor = require_amount(d.tenor_months, &format!("{tag}.tenor_months"))?;
                    if !(1.0..=360.0).contains(&tenor) || (tenor.round() - tenor).abs() > 1e-9 {
                        return Err(CalcError::validation(format!(
                            "{tag}.tenor_months must be a whole number of months between 1 and 360."
                        )));
                    }
                    let n = tenor.round() as u32;
                    let installment = balance * (1.0 + rate * n as f64 / 12.0) / n as f64;
                    let r = effective_monthly_rate(balance, installment, n);
                    (r, installment)
                }
            };
            Ok(ResolvedDebt {
                name,
                balance,
                monthly_rate,
                obligation,
            })
        })
        .collect()
}

/// Simulate one payoff order (`order` holds debt indices, focus-first).
/// Minimums (or fixed installments) go out first; then the pool — monthly
/// extra plus obligations freed by debts cleared in *prior* months —
/// attacks the first unpaid debt in strategy order, rolling over.
fn simulate(
    debts: &[ResolvedDebt],
    order: &[usize],
    extra: f64,
    strategy: &'static str,
) -> Result<PayoffPlan, CalcError> {
    let mut balances: Vec<f64> = debts.iter().map(|d| d.balance).collect();
    let mut interests = vec![0.0; debts.len()];
    let mut payoff_month: Vec<Option<u32>> = vec![None; debts.len()];
    let mut freed = 0.0;
    let mut total_interest = 0.0;
    let mut schedule = Vec::with_capacity(64);
    schedule.push(balances.iter().sum());
    let mut month = 0u32;

    while payoff_month.iter().any(|p| p.is_none()) {
        if month >= MAX_MONTHS {
            return Err(CalcError::validation(
                "debts never amortize at these payments.".to_string(),
            ));
        }
        month += 1;
        let mut pool = extra + freed;
        let mut newly = 0.0;
        for (idx, debt) in debts.iter().enumerate() {
            if payoff_month[idx].is_some() {
                continue;
            }
            let owed = balances[idx] * debt.monthly_rate;
            let pay = debt.obligation.min(balances[idx] + owed);
            let interest = owed.min(pay);
            balances[idx] = (balances[idx] + owed - pay).max(0.0);
            interests[idx] += interest;
            total_interest += interest;
            if balances[idx] < 0.01 {
                balances[idx] = 0.0;
                payoff_month[idx] = Some(month);
                newly += debt.obligation;
            }
        }
        for &idx in order {
            if pool < 0.01 {
                break;
            }
            if payoff_month[idx].is_some() {
                continue;
            }
            let pay = pool.min(balances[idx]);
            balances[idx] -= pay;
            pool -= pay;
            if balances[idx] < 0.01 {
                balances[idx] = 0.0;
                payoff_month[idx] = Some(month);
                newly += debts[idx].obligation;
            }
        }
        freed += newly;
        schedule.push(balances.iter().sum());
    }

    let debts_out = debts
        .iter()
        .enumerate()
        .map(|(idx, d)| DebtResult {
            name: d.name.clone(),
            payoff_month: payoff_month[idx].unwrap_or(month),
            interest_paid: interests[idx],
        })
        .collect();
    let first_win = payoff_month
        .iter()
        .flatten()
        .min()
        .copied()
        .unwrap_or(month);
    Ok(PayoffPlan {
        strategy,
        total_months: month,
        total_interest,
        first_win_month: first_win,
        debts: debts_out,
        schedule,
    })
}

pub fn debt_payoff_comparison(input: &DebtPayoffInput) -> Result<DebtPayoffComparison, CalcError> {
    let extra = require_amount(input.extra_payment, "extra_payment")?;
    let debts = resolve(&input.debts)?;

    let mut by_rate: Vec<usize> = (0..debts.len()).collect();
    by_rate.sort_by(|&a, &b| {
        debts[b]
            .monthly_rate
            .partial_cmp(&debts[a].monthly_rate)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    let mut by_balance: Vec<usize> = (0..debts.len()).collect();
    by_balance.sort_by(|&a, &b| {
        debts[a]
            .balance
            .partial_cmp(&debts[b].balance)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    // Avalanche (highest effective rate first) vs snowball (lowest
    // balance first) on identical debts and extra.
    let avalanche = simulate(&debts, &by_rate, extra, "avalanche")?;
    let snowball = simulate(&debts, &by_balance, extra, "snowball")?;
    Ok(DebtPayoffComparison {
        interest_saved_avalanche: snowball.total_interest - avalanche.total_interest,
        months_saved_avalanche: snowball.total_months as i64 - avalanche.total_months as i64,
        avalanche,
        snowball,
    })
}

#[cfg(test)]
mod tests {
    use super::{debt_payoff_comparison, DebtInput, DebtPayoffInput, RateKind};

    fn typical() -> DebtPayoffInput {
        DebtPayoffInput {
            extra_payment: 1_000_000.0,
            debts: vec![
                DebtInput {
                    name: "Paylater".to_string(),
                    balance: 12_000_000.0,
                    annual_rate: 0.36,
                    rate_kind: RateKind::Effective,
                    tenor_months: 0.0,
                    min_payment: 1_000_000.0,
                },
                DebtInput {
                    name: "Motor".to_string(),
                    balance: 20_000_000.0,
                    annual_rate: 0.08,
                    rate_kind: RateKind::Flat,
                    tenor_months: 24.0,
                    min_payment: 0.0,
                },
            ],
        }
    }

    #[test]
    fn rejects_bad_input() {
        let mut input = typical();
        input.debts = vec![];
        assert!(debt_payoff_comparison(&input).is_err());
        let mut input = typical();
        input.debts[0].name = "   ".to_string();
        assert!(debt_payoff_comparison(&input).is_err());
        let mut input = typical();
        input.debts[0].balance = 0.0;
        assert!(debt_payoff_comparison(&input).is_err());
        let mut input = typical();
        input.debts[0].annual_rate = 1.5;
        assert!(debt_payoff_comparison(&input).is_err());
        // Minimum below first month's interest never amortizes.
        let mut input = typical();
        input.debts[0].min_payment = 100_000.0;
        assert!(debt_payoff_comparison(&input).is_err());
        // Flat quote without a tenor cannot solve a rate.
        let mut input = typical();
        input.debts[1].tenor_months = 0.0;
        assert!(debt_payoff_comparison(&input).is_err());
        let mut input = typical();
        input.extra_payment = -1.0;
        assert!(debt_payoff_comparison(&input).is_err());
        // Thirteen debts exceeds the plan cap.
        let mut input = typical();
        input.debts = (0..13)
            .map(|i| DebtInput {
                name: format!("D{i}"),
                balance: 1_000_000.0,
                annual_rate: 0.12,
                rate_kind: RateKind::Effective,
                tenor_months: 0.0,
                min_payment: 500_000.0,
            })
            .collect();
        assert!(debt_payoff_comparison(&input).is_err());
    }

    #[test]
    fn avalanche_beats_snowball_on_interest() {
        let out = debt_payoff_comparison(&typical()).unwrap();
        assert_eq!(out.avalanche.strategy, "avalanche");
        assert_eq!(out.snowball.strategy, "snowball");
        // Highest-rate first (paylater 36%) vs lowest-balance first:
        // avalanche pays less interest over fewer-or-equal months.
        assert!(out.interest_saved_avalanche >= 0.0);
        assert!(out.months_saved_avalanche >= 0);
        assert!(
            (out.interest_saved_avalanche
                - (out.snowball.total_interest - out.avalanche.total_interest))
                .abs()
                < 1.0
        );
        for plan in [&out.avalanche, &out.snowball] {
            assert_eq!(plan.debts.len(), 2);
            assert!(*plan.schedule.last().unwrap() < 0.01);
            assert_eq!(plan.schedule.len() as u32, plan.total_months + 1);
            let first = plan.debts.iter().map(|d| d.payoff_month).min().unwrap();
            assert_eq!(plan.first_win_month, first);
            let interest_sum: f64 = plan.debts.iter().map(|d| d.interest_paid).sum();
            assert!((interest_sum - plan.total_interest).abs() < 1.0);
        }
    }

    #[test]
    fn flat_debt_uses_solved_rate_and_fixed_schedule() {
        // Motor alone, no extra: fixed 24-installment schedule.
        let input = DebtPayoffInput {
            extra_payment: 0.0,
            debts: vec![typical().debts.remove(1)],
        };
        let out = debt_payoff_comparison(&input).unwrap();
        assert_eq!(out.avalanche.total_months, 24);
        assert_eq!(out.snowball.total_months, 24);
        assert_eq!(out.interest_saved_avalanche, 0.0);
        assert_eq!(out.months_saved_avalanche, 0);
        // 20M at 8% flat for 24mo: 3.2M interest, no more, no less.
        assert!((out.avalanche.total_interest - 3_200_000.0).abs() < 1.0);
    }

    #[test]
    fn single_effective_debt_matches_amortization() {
        let input = DebtPayoffInput {
            extra_payment: 0.0,
            debts: vec![DebtInput {
                name: "KPR".to_string(),
                balance: 120_000_000.0,
                annual_rate: 0.12,
                rate_kind: RateKind::Effective,
                tenor_months: 0.0,
                min_payment: 2_000_000.0,
            }],
        };
        let out = debt_payoff_comparison(&input).unwrap();
        // Closed form: n = -ln(1 - r·B/A) / ln(1+r), r = 1%/mo.
        let r = 0.01_f64;
        let expected = (-(1.0 - r * 120_000_000.0 / 2_000_000.0).ln() / (1.0 + r).ln()).ceil();
        assert_eq!(out.avalanche.total_months, expected as u32);
        assert_eq!(out.snowball.total_months, expected as u32);
    }

    #[test]
    fn extra_payment_shortens_both_plans() {
        let mut input = typical();
        input.extra_payment = 0.0;
        let plain = debt_payoff_comparison(&input).unwrap();
        let boosted = debt_payoff_comparison(&typical()).unwrap();
        assert!(boosted.avalanche.total_months < plain.avalanche.total_months);
        assert!(boosted.avalanche.total_interest < plain.avalanche.total_interest);
    }
}
