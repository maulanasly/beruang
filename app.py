from __future__ import annotations

from io import BytesIO

import pandas as pd
import streamlit as st
import yfinance as yf

from logic import mutual_fund_metrics, stock_metrics, term_deposit_metrics


@st.cache_data
def _compute_mf_metrics(ledger: pd.DataFrame) -> tuple[pd.DataFrame, dict[str, float]]:
    return mutual_fund_metrics(ledger)


@st.cache_data
def _compute_stock_metrics(
    ledger: pd.DataFrame,
) -> tuple[pd.DataFrame, dict[str, float]]:
    return stock_metrics(ledger)


@st.cache_data
def _compute_td_metrics(
    ledger: pd.DataFrame,
    apy: float,
) -> tuple[pd.DataFrame, dict[str, float]]:
    return term_deposit_metrics(ledger, apy=apy)


@st.cache_data(ttl=300)
def fetch_stock_price(ticker: str) -> float | None:
    try:
        data = yf.Ticker(ticker).history(period="1d")
        if data.empty:
            return None
        return float(data["Close"].iloc[-1])
    except Exception:
        return None


BASE_LEDGER_COLUMNS = ["date", "installment_amount", "current_value"]
STOCK_LEDGER_COLUMNS = BASE_LEDGER_COLUMNS + ["new_share_purchases", "dividends"]
DEFAULT_MF_PRODUCT_NAME = "Default Mutual Fund"


def _empty_mf_ledger() -> pd.DataFrame:
    return pd.DataFrame(columns=BASE_LEDGER_COLUMNS)


def _empty_stock_ledger() -> pd.DataFrame:
    return pd.DataFrame(columns=STOCK_LEDGER_COLUMNS)


def _empty_td_ledger() -> pd.DataFrame:
    return pd.DataFrame(columns=BASE_LEDGER_COLUMNS)


def _seed_mf_ledger() -> pd.DataFrame:
    """Initial mutual fund ledger including the latest monthly installment."""
    return pd.DataFrame(
        {
            "date": pd.to_datetime(
                ["2026-01-31", "2026-02-28", "2026-03-31", "2026-07-31"]
            ),
            "installment_amount": [1000.0, 1000.0, 1000.0, 1100.0],
            "current_value": [1000.0, 2050.0, 3120.0, 6500.0],
        }
    )


def _ensure_product_state(asset: str) -> None:
    key = f"{asset}_products"
    active_key = f"active_{asset}_product"
    if key not in st.session_state:
        if asset == "mf":
            st.session_state[key] = {DEFAULT_MF_PRODUCT_NAME: _seed_mf_ledger()}
        else:
            st.session_state[key] = {}
    if active_key not in st.session_state:
        if asset == "mf" and st.session_state[key]:
            st.session_state[active_key] = DEFAULT_MF_PRODUCT_NAME
        else:
            st.session_state[active_key] = ""


def _get_active_ledger(asset: str) -> pd.DataFrame:
    products = st.session_state[f"{asset}_products"]
    active = st.session_state[f"active_{asset}_product"]
    if active not in products:
        return (
            _empty_mf_ledger()
            if asset == "mf"
            else (_empty_stock_ledger() if asset == "stock" else _empty_td_ledger())
        )
    return products[active]


def _set_active_ledger(asset: str, ledger: pd.DataFrame) -> None:
    active = st.session_state[f"active_{asset}_product"]
    st.session_state[f"{asset}_products"][active] = ledger


def _add_product(asset: str, name: str) -> None:
    products = st.session_state[f"{asset}_products"]
    if name in products:
        st.error(f"Product '{name}' already exists.")
        return
    products[name] = (
        _empty_mf_ledger()
        if asset == "mf"
        else (_empty_stock_ledger() if asset == "stock" else _empty_td_ledger())
    )
    st.session_state[f"active_{asset}_product"] = name
    st.rerun()


def _delete_product(asset: str, name: str) -> None:
    products = st.session_state[f"{asset}_products"]
    if name in products:
        del products[name]
        active_key = f"active_{asset}_product"
        if st.session_state[active_key] == name:
            st.session_state[active_key] = next(iter(products), "")
        st.rerun()


def _select_product(asset: str, name: str) -> None:
    st.session_state[f"active_{asset}_product"] = name
    st.rerun()


def _append_mf_entry(
    ledger: pd.DataFrame,
    entry_date: pd.Timestamp,
    installment_amount: float,
    current_value: float,
) -> pd.DataFrame:
    new_row = pd.DataFrame(
        {
            "date": [pd.to_datetime(entry_date)],
            "installment_amount": [float(installment_amount)],
            "current_value": [float(current_value)],
        }
    )
    updated = pd.concat([ledger, new_row], ignore_index=True)
    return updated.sort_values("date").reset_index(drop=True)


def _append_stock_entry(
    ledger: pd.DataFrame,
    entry_date: pd.Timestamp,
    installment_amount: float,
    new_share_purchases: float,
    dividends: float,
    current_value: float,
) -> pd.DataFrame:
    new_row = pd.DataFrame(
        {
            "date": [pd.to_datetime(entry_date)],
            "installment_amount": [float(installment_amount)],
            "new_share_purchases": [float(new_share_purchases)],
            "dividends": [float(dividends)],
            "current_value": [float(current_value)],
        }
    )
    updated = pd.concat([ledger, new_row], ignore_index=True)
    return updated.sort_values("date").reset_index(drop=True)


def _append_td_entry(
    ledger: pd.DataFrame,
    entry_date: pd.Timestamp,
    installment_amount: float,
    current_value: float,
) -> pd.DataFrame:
    new_row = pd.DataFrame(
        {
            "date": [pd.to_datetime(entry_date)],
            "installment_amount": [float(installment_amount)],
            "current_value": [float(current_value)],
        }
    )
    updated = pd.concat([ledger, new_row], ignore_index=True)
    return updated.sort_values("date").reset_index(drop=True)


def _normalize_stock_import_frame(dataframe: pd.DataFrame) -> pd.DataFrame:
    """Normalize a stock import file into the stock ledger schema."""
    renamed = {
        column: column.strip().lower().replace(" ", "_") for column in dataframe.columns
    }
    normalized = dataframe.rename(columns=renamed).copy()

    required = ["date", "current_value"]
    missing = [column for column in required if column not in normalized.columns]
    if missing:
        raise ValueError(f"Missing required columns: {', '.join(missing)}")

    for column in ["installment_amount", "new_share_purchases", "dividends"]:
        if column not in normalized.columns:
            normalized[column] = 0.0

    normalized["date"] = pd.to_datetime(normalized["date"], errors="coerce")
    normalized["current_value"] = pd.to_numeric(
        normalized["current_value"], errors="coerce"
    )
    normalized["installment_amount"] = pd.to_numeric(
        normalized["installment_amount"], errors="coerce"
    ).fillna(0.0)
    normalized["new_share_purchases"] = pd.to_numeric(
        normalized["new_share_purchases"], errors="coerce"
    ).fillna(0.0)
    normalized["dividends"] = pd.to_numeric(
        normalized["dividends"], errors="coerce"
    ).fillna(0.0)

    normalized = normalized.dropna(subset=["date", "current_value"])
    return normalized[
        [
            "date",
            "installment_amount",
            "new_share_purchases",
            "dividends",
            "current_value",
        ]
    ]


def _import_stock_entries_from_file(uploaded_file) -> pd.DataFrame:
    """Load stock entries from a CSV file upload."""
    if uploaded_file is None:
        return _empty_stock_ledger()

    if uploaded_file.name.lower().endswith(".csv"):
        raw = pd.read_csv(BytesIO(uploaded_file.getvalue()))
    else:
        raise ValueError("Please upload a CSV file with stock entries.")

    imported = _normalize_stock_import_frame(raw)
    return imported.sort_values("date").reset_index(drop=True)


def _fmt_percent(value: float) -> str:
    return "N/A" if pd.isna(value) else f"{value * 100:.2f}%"


def _render_this_month_update_mf(
    metrics_table: pd.DataFrame, summary: dict[str, float]
) -> None:
    latest = metrics_table.iloc[-1]
    st.caption("This month update")
    col_1, col_2, col_3 = st.columns(3)
    col_1.metric("Latest entry date", f"{pd.to_datetime(latest['date']).date()}")
    col_2.metric("Latest MoM", _fmt_percent(float(latest["mom_return"])))
    col_3.metric("Latest XIRR", _fmt_percent(float(summary["xirr"])))


def _render_this_month_update_stock(
    metrics_table: pd.DataFrame, summary: dict[str, float]
) -> None:
    latest = metrics_table.iloc[-1]
    st.caption("This month update")
    col_1, col_2, col_3, col_4 = st.columns(4)
    col_1.metric("Latest entry date", f"{pd.to_datetime(latest['date']).date()}")
    col_2.metric("Latest MoM", _fmt_percent(float(latest["mom_return"])))
    col_3.metric("Latest ROI", _fmt_percent(float(summary["roi"])))
    col_4.metric("Latest XIRR", _fmt_percent(float(summary["xirr"])))


def _render_this_month_update_td(
    metrics_table: pd.DataFrame, summary: dict[str, float]
) -> None:
    latest = metrics_table.iloc[-1]
    st.caption("This month update")
    col_1, col_2, col_3 = st.columns(3)
    col_1.metric("Latest entry date", f"{pd.to_datetime(latest['date']).date()}")
    col_2.metric(
        "Latest prorated interest", f"{float(latest['prorated_interest']):.2f}"
    )
    col_3.metric("Current APY", _fmt_percent(float(summary["apy"])))


def _product_manager(asset: str, label: str) -> None:
    _ensure_product_state(asset)
    products = st.session_state[f"{asset}_products"]
    active = st.session_state[f"active_{asset}_product"]

    with st.sidebar:
        st.markdown(f"### {label} Products")
        if products:
            product_names = list(products.keys())
            current_idx = product_names.index(active) if active in product_names else 0
            selected = st.selectbox(
                "Select Product",
                product_names,
                index=current_idx,
                key=f"{asset}_select",
            )
            if selected != active:
                _select_product(asset, selected)

            col_del1, col_del2 = st.columns(2)
            with col_del1:
                if st.button("Delete Product", key=f"{asset}_delete_btn"):
                    _delete_product(asset, active)
            with col_del2:
                pass

        new_name = st.text_input(f"New {label} Name", key=f"{asset}_new_name")
        if st.button("Add Product", key=f"{asset}_add_btn"):
            if new_name.strip():
                _add_product(asset, new_name.strip())
            else:
                st.warning("Enter a product name.")


def _render_mf_tab() -> None:
    _ensure_product_state("mf")
    _product_manager("mf", "Mutual Fund")

    ledger = _get_active_ledger("mf")
    if ledger.empty:
        st.info("No entries yet. Add a product and start entering monthly data.")
        return

    st.subheader("Add Mutual Fund Entry")
    with st.form("mf_entry_form", clear_on_submit=False):
        col_a, col_b, col_c = st.columns(3)
        with col_a:
            entry_date = st.date_input(
                "Month End Date", value=pd.Timestamp.today().date(), key="mf_date"
            )
        with col_b:
            installment_amount = st.number_input(
                "Installment Amount",
                min_value=0.0,
                value=1000.0,
                step=100.0,
                format="%.2f",
                key="mf_installment",
            )
        with col_c:
            current_value = st.number_input(
                "Current Market Value",
                min_value=0.0,
                value=1000.0,
                step=100.0,
                format="%.2f",
                key="mf_value",
            )
        submitted = st.form_submit_button("Add Entry")
        if submitted:
            updated = _append_mf_entry(
                ledger, pd.Timestamp(entry_date), installment_amount, current_value
            )
            _set_active_ledger("mf", updated)
            st.success("Mutual fund entry added.")
            st.rerun()

    ledger = _get_active_ledger("mf")
    metrics_table, summary = _compute_mf_metrics(ledger)

    _render_this_month_update_mf(metrics_table, summary)

    st.subheader("Mutual Fund Ledger")
    display = metrics_table.copy()
    display["mom_return_pct"] = (display["mom_return"] * 100.0).round(2)
    display["date"] = pd.to_datetime(display["date"]).dt.date
    st.dataframe(
        display[
            [
                "date",
                "installment_amount",
                "current_value",
                "month_start_value",
                "mom_return_pct",
            ]
        ],
        width="stretch",
    )

    metric_col_1, metric_col_2, metric_col_3 = st.columns(3)
    metric_col_1.metric(
        "Total Capital Invested",
        f"{summary['total_installments']:.2f}",
    )
    metric_col_2.metric("Current Market Value", f"{summary['ending_value']:.2f}")
    metric_col_3.metric("Overall XIRR", f"{summary['xirr'] * 100:.2f}%")

    @st.fragment
    def _mf_chart() -> None:
        st.subheader("Capital Invested vs Current Market Value")
        chart_df = metrics_table[["date", "installment_amount", "current_value"]].copy()
        chart_df["Total Capital Invested (Sum of Installments)"] = chart_df[
            "installment_amount"
        ].cumsum()
        chart_df["Current Market Value"] = chart_df["current_value"]
        chart_df = chart_df.set_index("date")
        st.line_chart(
            chart_df[
                ["Total Capital Invested (Sum of Installments)", "Current Market Value"]
            ],
            width="stretch",
        )

    _mf_chart()


def _normalize_idx_ticker(ticker: str) -> str:
    ticker = ticker.strip().upper()
    if not ticker:
        return ticker
    if "." not in ticker:
        return f"{ticker}.JK"
    return ticker


def _render_stock_tab() -> None:
    _ensure_product_state("stock")
    _product_manager("stock", "Stock")

    ledger = _get_active_ledger("stock")
    if ledger.empty:
        st.info("No entries yet. Add a product and start entering monthly data.")

    st.subheader("Import stock entries from file")
    with st.container(border=True):
        uploaded_file = st.file_uploader(
            "CSV file with stock entries",
            type=["csv"],
            key="stock_import_uploader",
            help=(
                "Expected columns: date, installment_amount, new_share_purchases, "
                "dividends, current_value."
            ),
        )
        if uploaded_file is not None:
            imported_ledger = _import_stock_entries_from_file(uploaded_file)
            st.dataframe(imported_ledger, width="stretch")
            if st.button("Import stock entries", key="stock_import_btn"):
                updated = pd.concat([ledger, imported_ledger], ignore_index=True)
                updated = updated.sort_values("date").reset_index(drop=True)
                _set_active_ledger("stock", updated)
                st.success(f"Imported {len(imported_ledger)} stock entries.")
                st.rerun()

    st.subheader("Fetch Current IDX Stock Price")
    col_tck1, col_tck2, col_tck3 = st.columns(3)
    with col_tck1:
        idx_ticker = st.text_input("Ticker (e.g. BBCA)", key="idx_ticker_input")
    with col_tck2:
        if st.button("Fetch Price", key="fetch_idx_price"):
            symbol = _normalize_idx_ticker(idx_ticker)
            price = fetch_stock_price(symbol)
            if price is not None:
                st.session_state["idx_fetched_price"] = price
                st.success(f"Fetched {symbol}: {price:,.2f} IDR")
            else:
                st.error(f"Failed to fetch price for {symbol}.")
    with col_tck3:
        if "idx_fetched_price" in st.session_state:
            st.metric(
                "Last Fetched", f"{st.session_state['idx_fetched_price']:,.2f} IDR"
            )

    st.subheader("Add Stock Entry")
    with st.form("stock_entry_form", clear_on_submit=False):
        col_a, col_b = st.columns(2)
        with col_a:
            entry_date = st.date_input(
                "Month End Date", value=pd.Timestamp.today().date(), key="stock_date"
            )
            installment_amount = st.number_input(
                "Installment Amount",
                min_value=0.0,
                value=700.0,
                step=100.0,
                format="%.2f",
                key="stock_installment",
            )
        with col_b:
            new_share_purchases = st.number_input(
                "New Share Purchases",
                min_value=0.0,
                value=0.0,
                step=50.0,
                format="%.2f",
                key="stock_purchases",
            )
        col_c, col_d = st.columns(2)
        with col_c:
            dividends = st.number_input(
                "Dividends",
                min_value=0.0,
                value=0.0,
                step=10.0,
                format="%.2f",
                key="stock_dividends",
            )
        with col_d:
            current_value = st.number_input(
                "Current Market Value",
                min_value=0.0,
                value=float(st.session_state.get("idx_fetched_price", 0.0)) or 0.0,
                step=100.0,
                format="%.2f",
                key="stock_value",
            )
        submitted = st.form_submit_button("Add Entry")
        if submitted:
            updated = _append_stock_entry(
                ledger,
                pd.Timestamp(entry_date),
                installment_amount,
                new_share_purchases,
                dividends,
                current_value,
            )
            _set_active_ledger("stock", updated)
            st.success("Stock entry added.")
            st.rerun()

    ledger = _get_active_ledger("stock")
    if ledger.empty:
        return

    ledger = _get_active_ledger("stock")
    metrics_table, summary = _compute_stock_metrics(ledger)

    _render_this_month_update_stock(metrics_table, summary)

    st.subheader("Stock Ledger")
    display = metrics_table.copy()
    display["mom_return_pct"] = (display["mom_return"] * 100.0).round(2)
    display["date"] = pd.to_datetime(display["date"]).dt.date
    st.dataframe(
        display[
            [
                "date",
                "installment_amount",
                "new_share_purchases",
                "dividends",
                "current_value",
                "month_start_value",
                "mom_return_pct",
            ]
        ],
        width="stretch",
    )

    metric_col_1, metric_col_2, metric_col_3, metric_col_4 = st.columns(4)
    metric_col_1.metric(
        "Total Contribution",
        f"{summary['total_contribution']:.2f}",
    )
    metric_col_2.metric("Current Market Value", f"{summary['ending_value']:.2f}")
    metric_col_3.metric("ROI", f"{summary['roi'] * 100:.2f}%")
    metric_col_4.metric("Overall XIRR", f"{summary['xirr'] * 100:.2f}%")

    @st.fragment
    def _stock_chart() -> None:
        st.subheader("Total Contribution vs Current Market Value")
        chart_df = metrics_table[
            ["date", "installment_amount", "new_share_purchases", "current_value"]
        ].copy()
        chart_df["Total Contribution"] = (
            chart_df["installment_amount"] + chart_df["new_share_purchases"]
        ).cumsum()
        chart_df["Current Market Value"] = chart_df["current_value"]
        chart_df = chart_df.set_index("date")
        st.line_chart(
            chart_df[["Total Contribution", "Current Market Value"]],
            width="stretch",
        )

    _stock_chart()


def _render_td_tab() -> None:
    _ensure_product_state("td")
    _product_manager("td", "Term Deposit")

    ledger = _get_active_ledger("td")
    if ledger.empty:
        st.info("No entries yet. Add a product and start entering monthly data.")
        return

    apy_key = f"td_apy_{st.session_state.active_td_product}"
    if apy_key not in st.session_state:
        st.session_state[apy_key] = 0.06

    st.subheader("Term Deposit Settings")
    apy = st.number_input(
        "Annual Percentage Yield (APY)",
        min_value=-1.0,
        max_value=1.0,
        value=st.session_state[apy_key],
        step=0.01,
        format="%.4f",
        key="td_apy_input",
    )
    if apy != st.session_state[apy_key]:
        st.session_state[apy_key] = apy
        st.rerun()

    st.subheader("Add Term Deposit Entry")
    with st.form("td_entry_form", clear_on_submit=False):
        col_a, col_b, col_c = st.columns(3)
        with col_a:
            entry_date = st.date_input(
                "Month End Date", value=pd.Timestamp.today().date(), key="td_date"
            )
        with col_b:
            installment_amount = st.number_input(
                "Installment Amount",
                min_value=0.0,
                value=1000.0,
                step=100.0,
                format="%.2f",
                key="td_installment",
            )
        with col_c:
            current_value = st.number_input(
                "Current Market Value",
                min_value=0.0,
                value=1000.0,
                step=100.0,
                format="%.2f",
                key="td_value",
            )
        submitted = st.form_submit_button("Add Entry")
        if submitted:
            updated = _append_td_entry(
                ledger, pd.Timestamp(entry_date), installment_amount, current_value
            )
            _set_active_ledger("td", updated)
            st.success("Term deposit entry added.")
            st.rerun()

    ledger = _get_active_ledger("td")
    metrics_table, summary = _compute_td_metrics(ledger, apy=apy)

    _render_this_month_update_td(metrics_table, summary)

    st.subheader("Term Deposit Ledger")
    display = metrics_table.copy()
    display["date"] = pd.to_datetime(display["date"]).dt.date
    st.dataframe(
        display[
            [
                "date",
                "installment_amount",
                "current_value",
                "month_start_value",
                "prorated_interest",
                "expected_month_end_value",
            ]
        ],
        width="stretch",
    )

    metric_col_1, metric_col_2, metric_col_3, metric_col_4 = st.columns(4)
    metric_col_1.metric("APY", f"{summary['apy'] * 100:.2f}%")
    metric_col_2.metric("Monthly Rate", f"{summary['monthly_rate'] * 100:.4f}%")
    metric_col_3.metric(
        "Projected FV", f"{summary['projected_fv_constant_installment']:.2f}"
    )
    metric_col_4.metric("Ending Value", f"{summary['ending_value']:.2f}")

    @st.fragment
    def _td_chart() -> None:
        st.subheader("Expected vs Actual Value")
        chart_df = metrics_table[
            ["date", "current_value", "expected_month_end_value"]
        ].copy()
        chart_df = chart_df.set_index("date")
        st.line_chart(
            chart_df[["expected_month_end_value", "current_value"]],
            width="stretch",
        )

    _td_chart()


def main() -> None:
    st.set_page_config(page_title="Investment App MVP", layout="wide")
    st.title("Investment App MVP")
    st.caption(
        "Track mutual funds, stocks, and term deposits with monthly installments."
    )

    tabs = st.tabs(["Mutual Funds", "Stocks", "Term Deposits"])

    with tabs[0]:
        _render_mf_tab()

    with tabs[1]:
        _render_stock_tab()

    with tabs[2]:
        _render_td_tab()


if __name__ == "__main__":
    main()
