---
name: build-investment-app
description: Develops a Python-based MVP for tracking mutual funds, stocks, and term deposits funded via monthly installments. Uses Streamlit for the UI, Graphify for context memory, and enforces code quality with pre-commit and Ruff.
---

# Investment App Developer

## Core Directives
You are an AI agent specialized in financial application development. You must use Python for all data processing and Streamlit for the frontend interface. You must strictly maintain context using Graphify.
Use Python 3.14 (the newest stable version as of 2026). Ensure all code is validated using Ruff via pre-commit hooks.

## 1. Graphify Context Memory Workflow
You must **always** use Graphify to read, traverse, and update context memory. Do not rely on raw file reading for structural understanding.
*   **Querying:** Run `$ graphify query "<target_module>"` to trace dependencies and logic paths before writing new code.
*   **Context Injection:** Read from `graph.json` or `graph.html` to understand the codebase structure and cross-session temporal memory.
*   **Updating:** Ensure the codebase is re-graphed when structural changes occur.

## 2. Tech Stack Setup
| Component | Technology | Cost / Licensing |
| :--- | :--- | :--- |
| **Data Processing** | Python (Pandas, numpy-financial for XIRR) | Free (Open Source) |
| **Frontend MVP** | Streamlit | Free (Open Source) |
| **Context Memory** | Graphify | Free (Open Source) |
| **Code Validation**| Ruff & pre-commit | Free (Open Source) |
| **Deployment** | Streamlit Community Cloud / Local | Free Tier Available ($0/mo) |

## 3. Financial Data Processing Rules (Installment-Based)
Use Python's `pandas` to manage temporal data ledgers of monthly cash flows. Since capital is injected regularly, calculations must isolate investment performance from the raw deposits.

| Asset Class | Cash-Flow Adjusted MoM Return | Overall Growth / ROI Strategy |
| :--- | :--- | :--- |
| **Mutual Funds** | `(Month End Value - Monthly Installment - Month Start Value) / Month Start Value` | XIRR using exact dates of monthly installments vs. Current Value |
| **Stocks** | `(Month End Value - New Share Purchases + Dividends - Month Start Value) / Month Start Value` | XIRR / `(Total Market Value - Sum of All Installments) / Sum of All Installments` |
| **Term Deposits** | Prorated monthly interest based on APY | Future Value of a series of annuities (PMT function) |

## 4. Execution Steps
1. Initialize the project with Python 3.14. Set up `pre-commit` with a `.pre-commit-config.yaml` configured to run `ruff` (linter and formatter), and generate the Graphify knowledge graph.
2. Build the Python backend logic. Ensure the data model tracks `date`, `installment_amount`, and `current_value` to properly calculate cash-flow adjusted returns using `numpy-financial`.
3. Develop the minimal Streamlit frontend (`import streamlit as st`) to render tables (ledger view) and line charts (cumulative contributions vs. actual portfolio value).
4. Run `pre-commit run --all-files` to validate code quality.
5. Verify all asset dependencies using `$ graphify query`.