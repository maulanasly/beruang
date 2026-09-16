//! Native calc core: exact port of `logic.py` + the `backend/services.py`
//! adapters, authorized by the parity harness (`tests/calc_parity.rs`
//! replaying `tests/fixtures/*.json` at 1e-9 relative tolerance).
//! `logic.py` stays the frozen oracle — no new math here.

pub mod deposits;
pub mod error;
pub mod ev;
pub mod flatloan;
pub mod mutual;
pub mod rentbuy;
pub mod stock;
pub mod xirr;

pub use deposits::{term_deposit_returns, TermDepositEntry};
pub use error::CalcError;
pub use ev::{ev_comparison, EvComparison, EvComparisonInput};
pub use flatloan::{
    effective_monthly_rate, flat_loan_comparison, FlatLoanComparison, FlatLoanInput,
    FlatLoanMonthPoint,
};
pub use mutual::{mutual_fund_returns, MutualFundEntry};
pub use rentbuy::{rent_buy_comparison, RentBuyComparison, RentBuyInput, RentBuyYearPoint};
pub use stock::{stock_returns, StockEntry};
pub use xirr::calculate_xirr;
