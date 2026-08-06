.PHONY: help install install-backend install-dev install-frontend run dev dev-all run-backend run-backend-local dev-backend run-frontend dev-frontend up up-backend down down-backend build logs clean test test-backend graphify-init graphify-query graphify-update lint typecheck

VENV := .venv
PYTHON := $(VENV)/bin/python
REQUIREMENTS := requirements.txt
BACKEND_APP := backend.main:app
BACKEND_HOST ?= 0.0.0.0
BACKEND_PORT ?= 8000
FRONTEND_PORT ?= 5173
FRONTEND_DIR := frontend
NPM := npm --prefix $(FRONTEND_DIR)

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

install-frontend: ## Install frontend dependencies
	$(NPM) install

run: run-backend ## Start the backend API (default target)

dev: dev-backend ## Start the backend API in development mode with auto-reload

dev-all: ## Run backend and frontend dev servers together (Ctrl+C stops both)
	@if lsof -n -iTCP:$(BACKEND_PORT) -sTCP:LISTEN >/dev/null 2>&1; then \
		echo "Port $(BACKEND_PORT) is already in use. Stop the existing backend (e.g. make down-backend) or run: make dev-all BACKEND_PORT=<free_port>"; \
		exit 1; \
	fi
	@if lsof -n -iTCP:$(FRONTEND_PORT) -sTCP:LISTEN >/dev/null 2>&1; then \
		echo "Port $(FRONTEND_PORT) is already in use. Stop the existing frontend dev server or run: make dev-all FRONTEND_PORT=<free_port>"; \
		exit 1; \
	fi
	@trap 'kill 0' INT TERM EXIT; \
	$(PYTHON) -m uvicorn $(BACKEND_APP) --host $(BACKEND_HOST) --port $(BACKEND_PORT) --reload & \
	VITE_PROXY_TARGET=http://localhost:$(BACKEND_PORT) BACKEND_PORT=$(BACKEND_PORT) $(NPM) run dev -- --port $(FRONTEND_PORT) & \
	wait

run-backend: ## Start FastAPI backend on $(BACKEND_HOST):$(BACKEND_PORT)
	$(PYTHON) -m uvicorn $(BACKEND_APP) --host $(BACKEND_HOST) --port $(BACKEND_PORT)

run-backend-local: ## Start FastAPI backend on 127.0.0.1:$(BACKEND_PORT)
	$(PYTHON) -m uvicorn $(BACKEND_APP) --host 127.0.0.1 --port $(BACKEND_PORT)

dev-backend: ## Start FastAPI backend with auto-reload
	$(PYTHON) -m uvicorn $(BACKEND_APP) --host $(BACKEND_HOST) --port $(BACKEND_PORT) --reload

run-frontend: ## Start frontend preview server
	$(NPM) run preview

dev-frontend: ## Start Vue frontend dev server
	VITE_PROXY_TARGET=http://localhost:$(BACKEND_PORT) BACKEND_PORT=$(BACKEND_PORT) $(NPM) run dev -- --port $(FRONTEND_PORT)

up: ## Build and run backend+frontend with Docker Compose
	docker compose up --build -d

up-backend: ## Build and run only backend service with Docker Compose
	docker compose up --build -d backend

down: ## Stop Docker Compose stack
	docker compose down

down-backend: ## Stop only backend service container
	docker compose stop backend

build: ## Build Docker images for backend and frontend
	docker compose build

logs: ## Tail Docker Compose logs
	docker compose logs -f --tail=100

clean: ## Remove Python cache and build artifacts
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name '*.pyc' -delete 2>/dev/null || true
	rm -rf graphify-out 2>/dev/null || true
	echo "Cache cleaned."

test: test-backend ## Run backend tests

test-backend: ## Run backend API tests
	$(PYTHON) -m pytest tests/test_backend_endpoints.py

test-frontend: ## Run Vue frontend tests (vitest)
	$(NPM) run test

graphify-init: ## Initialize the Graphify knowledge graph
	graphify init

graphify-query: ## Query the Graphify knowledge graph (usage: make graphify-query QUERY="<target>")
	graphify query "$(QUERY)"

graphify-update: ## Re-run Graphify to update the knowledge graph after structural changes
	graphify update

lint: ## Run Ruff and pre-commit across the repository
	$(PYTHON) -m pre_commit run --all-files

typecheck: ## Run compile-time checks for app and backend modules
	$(PYTHON) -m py_compile logic.py backend/*.py tests/*.py && echo "Type check passed (compile-time only)."

.DEFAULT_GOAL := help