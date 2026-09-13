use serde::{Deserialize, Serialize};

use super::error::CalcError;

/// Inputs for a simple ICE-vs-EV running-cost comparison. All money figures
/// share one currency; all distances share one unit (e.g. IDR and km).
#[derive(Debug, Clone, Deserialize)]
pub struct EvComparisonInput {
    pub price_ice: f64,
    pub price_ev: f64,
    pub km_per_month: f64,
    pub fuel_price_per_liter: f64,
    pub fuel_km_per_liter: f64,
    pub electricity_price_per_kwh: f64,
    pub ev_kwh_per_100km: f64,
    pub service_ice_per_month: f64,
    pub service_ev_per_month: f64,
}

/// Mirrors the JSON shape a future `/kalkulator/mobil-listrik-vs-bensin`
/// route will serve.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct EvComparison {
    pub upfront_delta: f64,
    pub monthly_ice: f64,
    pub monthly_ev: f64,
    pub monthly_saving: f64,
    pub break_even_months: Option<u32>,
}

fn require_amount(value: f64, field: &str) -> Result<f64, CalcError> {
    if !value.is_finite() || value < 0.0 {
        return Err(CalcError::validation(format!(
            "{field} must be a non-negative number."
        )));
    }
    Ok(value)
}

/// Compare monthly running costs and the month the EV purchase premium
/// pays back. `break_even_months` is `None` when the EV never wins back
/// its premium at the given usage (monthly saving <= 0 and delta > 0).
pub fn ev_comparison(input: &EvComparisonInput) -> Result<EvComparison, CalcError> {
    let price_ice = require_amount(input.price_ice, "price_ice")?;
    let price_ev = require_amount(input.price_ev, "price_ev")?;
    let km = require_amount(input.km_per_month, "km_per_month")?;
    let fuel_price = require_amount(input.fuel_price_per_liter, "fuel_price_per_liter")?;
    let fuel_eff = require_amount(input.fuel_km_per_liter, "fuel_km_per_liter")?;
    let elec_price = require_amount(input.electricity_price_per_kwh, "electricity_price_per_kwh")?;
    let ev_use = require_amount(input.ev_kwh_per_100km, "ev_kwh_per_100km")?;
    let service_ice = require_amount(input.service_ice_per_month, "service_ice_per_month")?;
    let service_ev = require_amount(input.service_ev_per_month, "service_ev_per_month")?;

    if fuel_eff <= 0.0 {
        return Err(CalcError::validation(
            "fuel_km_per_liter must be greater than zero.",
        ));
    }

    let monthly_ice = km / fuel_eff * fuel_price + service_ice;
    let monthly_ev = km / 100.0 * ev_use * elec_price + service_ev;
    let upfront_delta = price_ev - price_ice;
    let monthly_saving = monthly_ice - monthly_ev;
    let break_even_months = if monthly_saving > 0.0 && upfront_delta > 0.0 {
        Some((upfront_delta / monthly_saving).ceil() as u32)
    } else if upfront_delta <= 0.0 {
        Some(0)
    } else {
        None
    };

    Ok(EvComparison {
        upfront_delta,
        monthly_ice,
        monthly_ev,
        monthly_saving,
        break_even_months,
    })
}

#[cfg(test)]
mod tests {
    use super::{ev_comparison, EvComparisonInput};

    fn typical() -> EvComparisonInput {
        EvComparisonInput {
            price_ice: 250_000_000.0,
            price_ev: 300_000_000.0,
            km_per_month: 1500.0,
            fuel_price_per_liter: 10_000.0,
            fuel_km_per_liter: 12.0,
            electricity_price_per_kwh: 1_444.0,
            ev_kwh_per_100km: 15.0,
            service_ice_per_month: 500_000.0,
            service_ev_per_month: 200_000.0,
        }
    }

    #[test]
    fn typical_id_case_breaks_even() {
        let out = ev_comparison(&typical()).unwrap();
        assert_eq!(out.upfront_delta, 50_000_000.0);
        // ICE: 1500/12*10000 + 500k; EV: 1500/100*15*1444 + 200k.
        let ice = 1500.0 / 12.0 * 10_000.0 + 500_000.0;
        let ev = 1500.0 / 100.0 * 15.0 * 1_444.0 + 200_000.0;
        assert!((out.monthly_ice - ice).abs() < 1e-6);
        assert!((out.monthly_ev - ev).abs() < 1e-6);
        assert_eq!(
            out.break_even_months,
            Some((50_000_000.0_f64 / (ice - ev)).ceil() as u32)
        );
    }

    #[test]
    fn no_payback_without_saving() {
        let mut input = typical();
        input.km_per_month = 0.0;
        input.service_ev_per_month = 600_000.0;
        let out = ev_comparison(&input).unwrap();
        assert_eq!(out.break_even_months, None);
    }

    #[test]
    fn cheaper_ev_wins_immediately() {
        let mut input = typical();
        input.price_ev = 200_000_000.0;
        assert_eq!(ev_comparison(&input).unwrap().break_even_months, Some(0));
    }

    #[test]
    fn rejects_bad_input() {
        let mut input = typical();
        input.fuel_km_per_liter = 0.0;
        assert!(ev_comparison(&input).is_err());
        input = typical();
        input.price_ev = -1.0;
        assert!(ev_comparison(&input).is_err());
    }
}
