# beruang

Investment App MVP — track multiple mutual funds, stocks, and term deposits with monthly installments.

## Quick Start

```bash
make          # show available commands
make install  # install dependencies
make run      # start the FastAPI backend
make dev      # start backend with auto-reload
make dev-all  # start backend + frontend dev servers together
make install-frontend  # install Vue frontend dependencies
make dev-frontend      # start Vue dev server (port 5173)
make up       # build and run backend + frontend in Docker
make up-backend  # build and run only backend in Docker (for pairing with dev frontend)
make down     # stop Docker services
make test     # run backend tests
make clean    # remove cache files
```

If ports are already occupied, you can override them:

```bash
make dev-all BACKEND_PORT=8001 FRONTEND_PORT=5174
```

## Local URLs

- Backend API: http://localhost:8000
- Backend docs: http://localhost:8000/docs
- Frontend dev (Vite): http://localhost:5173
- Frontend via Docker (Nginx): http://localhost:8080

## Frontend-Backend Pairing

- In `make dev-frontend`, Vite proxies `/api/*` to `http://localhost:${BACKEND_PORT}` (default `8000`).
- Default frontend requests use relative paths such as `/api/v1/...`.
- To override API host, set `VITE_API_BASE_URL` in the frontend environment.
- Stock mode now includes a live quote helper sourced from yfinance, using an IDX Kompas 100 starter ticker list.

Examples:

```bash
# Backend on default 8000
make dev-backend
make dev-frontend

# Backend on custom 8001, frontend proxy follows automatically
make dev-backend BACKEND_PORT=8001
make dev-frontend BACKEND_PORT=8001 FRONTEND_PORT=5174
```

## Features

- **Multi-product tracking** — each asset class (Mutual Funds, Stocks, Term Deposits) supports multiple named products
- **Per-product ledgers** — independent entry and metrics for each product
- **Sidebar product management** — add, select, and delete products per asset class
- **Cash-flow adjusted MoM returns** — mutual funds and stocks
- **APY-based term deposit projections** — with prorated interest and future value
- **XIRR / ROI** — annualized returns using exact-date cash flows
- **Live stock quote helper** — fetch latest market value for IDX symbols from yfinance and apply to stock ledger rows

## Market Data Endpoints

- `GET /api/v1/market-data/idx/kompas100` — returns starter IDX symbols list (Kompas 100 seed set)
- `GET /api/v1/market-data/quote?symbol=BBCA.JK` — returns latest quote from yfinance

## Project Structure

| File | Purpose |
|------|---------|
| `backend/main.py` | FastAPI backend routes |
| `backend/services.py` | Backend financial service adapters |
| `frontend/` | Vue 3 + Vite frontend |
| `docker-compose.yml` | Backend + frontend container orchestration |
| `backend/Dockerfile` | Backend container image |
| `frontend/Dockerfile` | Frontend container image |
| `logic.py` | Financial calculation engine |
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