use chrono::NaiveDate;

use super::error::CalcError;

/// Exact port of `logic.calculate_xirr` (bisection with high-bound
/// doubling). Constants mirror the oracle: `low = -0.9999`, `high = 10.0`
/// doubled up to 120 times toward `1e20`, then 200 bisection steps with a
/// `1e-9` `|f(mid)|` tolerance. Summation order matches `_xnpv`.
pub fn calculate_xirr(dates: &[NaiveDate], cash_flows: &[f64]) -> Result<f64, CalcError> {
    if dates.len() != cash_flows.len() {
        return Err(CalcError::math("Dates and cash flows must align."));
    }
    let mut dated: Vec<(NaiveDate, f64)> = dates
        .iter()
        .copied()
        .zip(cash_flows.iter().copied())
        .collect();
    // Python `sorted()` is stable; `sort_by_key` is stable too.
    dated.sort_by_key(|a| a.0);
    if dated.len() < 2 {
        return Err(CalcError::math(
            "XIRR requires at least two cash flow points.",
        ));
    }
    let sorted_dates: Vec<NaiveDate> = dated.iter().map(|(d, _)| *d).collect();
    let sorted_flows: Vec<f64> = dated.iter().map(|(_, cf)| *cf).collect();

    let has_positive = sorted_flows.iter().any(|cf| *cf > 0.0);
    let has_negative = sorted_flows.iter().any(|cf| *cf < 0.0);
    if !(has_positive && has_negative) {
        return Err(CalcError::math(
            "XIRR requires at least one positive and one negative cash flow.",
        ));
    }

    let mut low = -0.9999_f64;
    let mut high = 10.0_f64;
    let mut f_low = xnpv(low, &sorted_flows, &sorted_dates);
    let mut f_high = xnpv(high, &sorted_flows, &sorted_dates);

    let mut expand_count = 0;
    let max_expand_count = 120;
    let max_high = 1e20_f64;
    while f_low * f_high > 0.0 && expand_count < max_expand_count && high < max_high {
        high *= 2.0;
        f_high = xnpv(high, &sorted_flows, &sorted_dates);
        expand_count += 1;
    }
    if f_low * f_high > 0.0 {
        return Err(CalcError::math(
            "Could not bracket XIRR root for given cash flows.",
        ));
    }

    for _ in 0..200 {
        let mid = (low + high) / 2.0;
        let f_mid = xnpv(mid, &sorted_flows, &sorted_dates);
        if f_mid.abs() < 1e-9 {
            return Ok(mid);
        }
        if f_low * f_mid < 0.0 {
            high = mid;
            // `f_high` is never read afterwards; the assignment mirrors
            // `logic.py` bookkeeping verbatim.
            f_high = f_mid;
            let _ = f_high;
        } else {
            low = mid;
            f_low = f_mid;
        }
    }
    Ok((low + high) / 2.0)
}

fn xnpv(rate: f64, cash_flows: &[f64], dates: &[NaiveDate]) -> f64 {
    let start = dates[0];
    cash_flows
        .iter()
        .zip(dates.iter())
        .map(|(cf, date)| {
            let days = (*date - start).num_days() as f64;
            cf / (1.0 + rate).powf(days / 365.0)
        })
        .sum()
}

#[cfg(test)]
mod tests {
    use super::calculate_xirr;
    use chrono::NaiveDate;

    fn date(s: &str) -> NaiveDate {
        NaiveDate::parse_from_str(s, "%Y-%m-%d").unwrap()
    }

    #[test]
    fn rejects_degenerate_flows() {
        assert!(calculate_xirr(&[date("2026-06-30")], &[100.0]).is_err());
        assert!(calculate_xirr(&[date("2026-05-31"), date("2026-06-30")], &[0.0, 5200.0]).is_err());
    }

    #[test]
    fn matches_oracle_spot_vector() {
        // mf_static_defaults oracle: xirr = 2934315985.171605.
        let xirr = calculate_xirr(
            &[date("2026-05-31"), date("2026-06-30")],
            &[-1100.0, -1100.0 + 7700.0],
        )
        .unwrap();
        let rel = ((xirr - 2934315985.171605) / 2934315985.171605).abs();
        assert!(rel < 1e-9, "xirr={xirr}");
    }
}
