//! Native calc core: exact port of `logic.py` + the `backend/services.py`
//! adapters, authorized by the parity harness (`tests/calc_parity.rs`
//! replaying `tests/fixtures/*.json` at 1e-9 relative tolerance).
//! `logic.py` stays the frozen oracle — no new math here.

pub mod deposits;
pub mod error;
pub mod ev;
pub mod mutual;
pub mod stock;
pub mod xirr;

pub use deposits::{term_deposit_returns, TermDepositEntry};
pub use error::CalcError;
pub use ev::{ev_comparison, EvComparison, EvComparisonInput};
pub use mutual::{mutual_fund_returns, MutualFundEntry};
pub use stock::{stock_returns, StockEntry};
pub use xirr::calculate_xirr;
