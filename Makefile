.PHONY: help install install-backend install-dev run dev run-backend run-backend-local dev-backend dev-streamlit run-streamlit clean test test-backend graphify-init graphify-query graphify-update lint typecheck

VENV := .venv
PYTHON := $(VENV)/bin/python
STREAMLIT := $(VENV)/bin/streamlit
REQUIREMENTS := requirements.txt
APP := app.py
BACKEND_APP := backend.main:app
BACKEND_HOST ?= 0.0.0.0
BACKEND_PORT ?= 8000

help: ## Show this help message
	@echo "Available targets:"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

install: ## Install Python dependencies
	$(PYTHON) -m pip install --upgrade pip
	$(PYTHON) -m pip install -r $(REQUIREMENTS)

install-backend: ## Install backend runtime dependencies only
	$(PYTHON) -m pip install --upgrade pip
	$(PYTHON) -m pip install pandas numpy-financial fastapi "uvicorn[standard]"

install-dev: install ## Install dev/test tools from pyproject optional dependencies
	$(PYTHON) -m pip install -e ".[dev]"

run: run-backend ## Start the backend API (default target)

dev: dev-backend ## Start the backend API in development mode with auto-reload

run-backend: ## Start FastAPI backend on $(BACKEND_HOST):$(BACKEND_PORT)
	$(PYTHON) -m uvicorn $(BACKEND_APP) --host $(BACKEND_HOST) --port $(BACKEND_PORT)

run-backend-local: ## Start FastAPI backend on 127.0.0.1:$(BACKEND_PORT)
	$(PYTHON) -m uvicorn $(BACKEND_APP) --host 127.0.0.1 --port $(BACKEND_PORT)

dev-backend: ## Start FastAPI backend with auto-reload
	$(PYTHON) -m uvicorn $(BACKEND_APP) --host $(BACKEND_HOST) --port $(BACKEND_PORT) --reload

run-streamlit: ## Start Streamlit app (port 8501)
	$(STREAMLIT) run $(APP) --server.port 8501

dev-streamlit: ## Start Streamlit app in development mode with hot rerun
	$(STREAMLIT) run $(APP) --server.port 8501 --server.headless true --global.developmentMode true

clean: ## Remove Python cache and Streamlit cache
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name '*.pyc' -delete 2>/dev/null || true
	rm -rf .streamlit/cache 2>/dev/null || true
	rm -rf graphify-out 2>/dev/null || true
	echo "Cache cleaned."

test: test-backend ## Run backend tests

test-backend: ## Run backend API tests
	$(PYTHON) -m pytest tests/test_backend_endpoints.py

graphify-init: ## Initialize the Graphify knowledge graph
	graphify init

graphify-query: ## Query the Graphify knowledge graph (usage: make graphify-query QUERY="<target>")
	graphify query "$(QUERY)"

graphify-update: ## Re-run Graphify to update the knowledge graph after structural changes
	graphify update

lint: ## Run Ruff and pre-commit across the repository
	$(PYTHON) -m pre_commit run --all-files

typecheck: ## Run compile-time checks for app and backend modules
	$(PYTHON) -m py_compile app.py logic.py backend/*.py tests/*.py && echo "Type check passed (compile-time only)."

.DEFAULT_GOAL := help