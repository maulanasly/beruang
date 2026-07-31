# beruang

Investment App MVP — track multiple mutual funds, stocks, and term deposits with monthly installments.

## Quick Start

```bash
make          # show available commands
make install  # install dependencies
make run      # start the Streamlit app
make dev      # start in development mode
make test     # run logic.py self-test
make clean    # remove cache files
```

## Features

- **Multi-product tracking** — each asset class (Mutual Funds, Stocks, Term Deposits) supports multiple named products
- **Per-product ledgers** — independent entry and metrics for each product
- **Sidebar product management** — add, select, and delete products per asset class
- **Cash-flow adjusted MoM returns** — mutual funds and stocks
- **APY-based term deposit projections** — with prorated interest and future value
- **XIRR / ROI** — annualized returns using exact-date cash flows

## Project Structure

| File | Purpose |
|------|---------|
| `app.py` | Streamlit frontend with multi-product tabs |
| `logic.py` | Financial calculation backend |
| `requirements.txt` | Python dependencies |
| `Makefile` | Common development commands |
| `.streamlit/config.toml` | Streamlit theming and config |

## Product Workflow

Each asset class tab has a sidebar for product management:
1. **Add Product** — enter a name and click "Add Product" to create a new ledger
2. **Select Product** — choose from the dropdown to view/edit a specific product
3. **Delete Product** — remove a product and its data
4. **Add Entry** — use the form to add monthly entries for the selected product

## Tech Stack

- **Python 3.12+**
- **Streamlit** — UI framework
- **Pandas** — data manipulation
- **numpy-financial** — XIRR and time-value calculations

## Graphify

This project uses Graphify for context memory:

- `make graphify-init` — initialize the knowledge graph
- `make graphify-query QUERY="<target>"` — query dependencies
- `make graphify-update` — re-run after structural changes