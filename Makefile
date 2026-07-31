.PHONY: help install run dev clean test graphify-init graphify-query graphify-update lint typecheck

VENV := .venv
PYTHON := $(VENV)/bin/python
STREAMLIT := $(VENV)/bin/streamlit
REQUIREMENTS := requirements.txt
APP := app.py

help: ## Show this help message
	@echo "Available targets:"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

install: ## Install Python dependencies
	$(PYTHON) -m pip install --upgrade pip
	$(PYTHON) -m pip install -r $(REQUIREMENTS)

run: ## Start the Streamlit app (default port 8501)
	$(STREAMLIT) run $(APP) --server.port 8501

dev: ## Start the Streamlit app in development mode with hot rerun
	$(STREAMLIT) run $(APP) --server.port 8501 --server.headless true --global.developmentMode true

clean: ## Remove Python cache and Streamlit cache
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name '*.pyc' -delete 2>/dev/null || true
	rm -rf .streamlit/cache 2>/dev/null || true
	rm -rf graphify-out 2>/dev/null || true
	echo "Cache cleaned."

test: ## Run logic.py self-test (mock data verification)
	$(PYTHON) logic.py

graphify-init: ## Initialize the Graphify knowledge graph
	graphify init

graphify-query: ## Query the Graphify knowledge graph (usage: make graphify-query QUERY="<target>")
	graphify query "$(QUERY)"

graphify-update: ## Re-run Graphify to update the knowledge graph after structural changes
	graphify update

lint: ## Run Ruff and pre-commit across the repository
	$(PYTHON) -m pre_commit run --all-files

typecheck: ## Run type checking (best-effort, no strict mypy config yet)
	$(PYTHON) -m py_compile app.py logic.py && echo "Type check passed (compile-time only)."

.DEFAULT_GOAL := help