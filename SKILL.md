---
name: build-investment-app
description: Develops a decoupled MVP for tracking mutual funds, stocks, and term deposits funded via monthly installments. Uses FastAPI (backend), Vue 3 (frontend), local Docker deployment via Makefile, Graphify for context, and enforces code quality with pre-commit, Ruff, and Pytest.
---

# Investment App Developer

## Core Directives
You are an AI agent specialized in financial application development. You must build a RESTful API using FastAPI (Python 3.14) for data processing and a Vue 3 frontend for the user interface. You must strictly maintain context using Graphify. Ensure all backend code is validated using Ruff via pre-commit hooks, tested using Pytest, containerized for local deployment using Docker, and orchestrated using a `Makefile`.

## 1. Graphify Context Memory Workflow
You must **always** use Graphify to read, traverse, and update context memory. Do not rely on raw file reading for structural understanding.
*   **Querying:** Run `$ graphify query "<target_module>"` to trace dependencies and logic paths before writing new code.
*   **Context Injection:** Read from `graph.json` or `graph.html` to understand the codebase structure and cross-session temporal memory.
*   **Updating:** Ensure the codebase is re-graphed when structural changes occur to either the backend or frontend.

## 2. Tech Stack Setup
| Component | Technology | Cost / Licensing |
| :--- | :--- | :--- |
| **Backend API** | FastAPI (Python 3.14) | Free (Open Source) |
| **Data Processing** | Python (Pandas, numpy-financial for XIRR) | Free (Open Source) |
| **Frontend MVP** | Vue 3 (via Vite) or Svelte | Free (Open Source) |
| **Context Memory** | Graphify | Free (Open Source) |
| **Testing Framework**| Pytest | Free (Open Source) |
| **Code Validation**| Ruff & pre-commit (Backend) | Free (Open Source) |
| **Orchestration & Ops**| Makefile | Free (Open Source) |
| **Deployment** | Local Docker & Docker Compose | Free (Open Source) |

## 3. Financial Data Processing Rules (Installment-Based)
Use Python's `pandas` to manage temporal data ledgers of monthly cash flows. Since capital is injected regularly, calculations must isolate investment performance from the raw deposits.

| Asset Class | Cash-Flow Adjusted MoM Return | Overall Growth / ROI Strategy |
| :--- | :--- | :--- |
| **Mutual Funds** | `(Month End Value - Monthly Installment - Month Start Value) / Month Start Value` | XIRR using exact dates of monthly installments vs. Current Value |
| **Stocks** | `(Month End Value - New Share Purchases + Dividends - Month Start Value) / Month Start Value` | XIRR / `(Total Market Value - Sum of All Installments) / Sum of All Installments` |
| **Term Deposits** | Prorated monthly interest based on APY | Future Value of a series of annuities (PMT function) |

## 4. Execution Steps
1. Initialize the backend project with Python 3.14 and FastAPI. Set up `pre-commit` with a `.pre-commit-config.yaml` configured to run `ruff`. 
2. Initialize the frontend project using `npm create vite@latest frontend --template vue`.
3. Create a root `Makefile` to streamline local workflows (e.g., `make up`, `make down`, `make test`, `make lint`, `make graphify`).
4. Build the Python backend logic and expose REST endpoints via FastAPI for MoM returns and overall growth using `numpy-financial`.
5. Develop the Vue 3 frontend to consume the FastAPI endpoints and render tables (ledger view) and line charts (cumulative contributions vs. actual portfolio value).
6. Write unit and integration tests for the API and financial logic, executing them via `make test` (`pytest`).
7. Containerize the application using `Dockerfile`s for frontend and backend, and a `docker-compose.yml` triggered via `make up`.
8. Validate code quality using `make lint` (`pre-commit run --files <changed_files>`).
9. Verify all system dependencies and update the knowledge graph using `$ graphify query` or `make graphify`.
10. **New Feature Workflow:** If a new feature is requested, strictly create a new Git branch or `git worktree` off the `master` branch. Develop, test, and validate in this isolated environment. The code must be reviewed and pass all checks before merging into the `master` branch.