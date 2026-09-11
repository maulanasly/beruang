.DEFAULT_GOAL := help

# ------------------------------------------------------------------------------
# Variables
# ------------------------------------------------------------------------------
VENV         := .venv
PYTHON       := $(VENV)/bin/python
REQUIREMENTS := requirements.txt
BACKEND_APP  := backend.main:app
BACKEND_HOST ?= 0.0.0.0
BACKEND_PORT ?= 8000
CALC_PORT    ?= 8001
GATEWAY_PORT ?= $(BACKEND_PORT)
FRONTEND_PORT ?= 5173
FRONTEND_DIR := frontend
NPM          := npm --prefix $(FRONTEND_DIR)
RUST_MANIFEST := rust-gateway/Cargo.toml

# ------------------------------------------------------------------------------
# Help
# ------------------------------------------------------------------------------
.PHONY: help
help: ## Show this help message
	@echo "Available targets:"
	@echo ""
	@grep -E '^[a-zA-Z0-9_.-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

# ------------------------------------------------------------------------------
# Install
# ------------------------------------------------------------------------------
.PHONY: install install-backend install-dev install-frontend
install: ## Install Python dependencies
	$(PYTHON) -m pip install --upgrade pip
	$(PYTHON) -m pip install -r $(REQUIREMENTS)

install-backend: ## Install backend runtime dependencies only
	$(PYTHON) -m pip install --upgrade pip
	$(PYTHON) -m pip install pandas numpy-financial fastapi "uvicorn[standard]"

install-dev: install ## Install dev/test tools from pyproject optional dependencies
	$(PYTHON) -m pip install -e ".[dev]"

install-frontend: ## Install frontend dependencies (Vue legacy)
	$(NPM) install

# ------------------------------------------------------------------------------
# Run / Dev (local, no Docker)
# ------------------------------------------------------------------------------
.PHONY: run dev run-backend dev-backend run-backend-local dev-frontend dev-all dev-gateway run-gateway run-calc dev-calc

# Full stack without Docker: calc (internal :8001) + gateway (public :8000, serves static/)
run: ## Run full stack without Docker (gateway :$(GATEWAY_PORT) + calc :$(CALC_PORT))
	@if lsof -n -iTCP:$(CALC_PORT) -sTCP:LISTEN >/dev/null 2>&1; then \
		echo "Port $(CALC_PORT) (calc) is already in use. Stop the existing calc or run: make run CALC_PORT=<free_port>"; \
		exit 1; \
	fi
	@if lsof -n -iTCP:$(GATEWAY_PORT) -sTCP:LISTEN >/dev/null 2>&1; then \
		echo "Port $(GATEWAY_PORT) (gateway) is already in use. Stop the existing gateway or run: make run GATEWAY_PORT=<free_port>"; \
		exit 1; \
	fi
	@echo "Starting calc on 127.0.0.1:$(CALC_PORT) + gateway on 0.0.0.0:$(GATEWAY_PORT) -> http://localhost:$(GATEWAY_PORT)"
	@trap 'kill 0 2>/dev/null || true' INT TERM EXIT; \
	$(PYTHON) -m uvicorn $(BACKEND_APP) --host 127.0.0.1 --port $(CALC_PORT) & \
	CALC_BASE_URL=http://127.0.0.1:$(CALC_PORT) cargo run --manifest-path $(RUST_MANIFEST) & \
	wait

dev: ## Run full stack without Docker with auto-reload (calc --reload + gateway watch)
	@if lsof -n -iTCP:$(CALC_PORT) -sTCP:LISTEN >/dev/null 2>&1; then \
		echo "Port $(CALC_PORT) (calc) is already in use. Stop the existing calc or run: make dev CALC_PORT=<free_port>"; \
		exit 1; \
	fi
	@if lsof -n -iTCP:$(GATEWAY_PORT) -sTCP:LISTEN >/dev/null 2>&1; then \
		echo "Port $(GATEWAY_PORT) (gateway) is already in use. Stop the existing gateway or run: make dev GATEWAY_PORT=<free_port>"; \
		exit 1; \
	fi
	@echo "Starting calc (--reload) on 127.0.0.1:$(CALC_PORT) + gateway (watch) on 0.0.0.0:$(GATEWAY_PORT)"
	@trap 'kill 0 2>/dev/null || true' INT TERM EXIT; \
	$(PYTHON) -m uvicorn $(BACKEND_APP) --host 127.0.0.1 --port $(CALC_PORT) --reload & \
	if command -v cargo-watch >/dev/null 2>&1 || cargo watch --version >/dev/null 2>&1; then \
		CALC_BASE_URL=http://127.0.0.1:$(CALC_PORT) cargo watch -x 'run --manifest-path $(RUST_MANIFEST)'; \
	else \
		echo "cargo-watch not found, falling back to cargo run (no auto-reload for gateway)"; \
		CALC_BASE_URL=http://127.0.0.1:$(CALC_PORT) cargo run --manifest-path $(RUST_MANIFEST) & wait; \
	fi & \
	wait

# Single-service helpers (calc = Python FastAPI; source of truth for all math)
run-backend: ## Start FastAPI calc on $(BACKEND_HOST):$(BACKEND_PORT) (single service)
	$(PYTHON) -m uvicorn $(BACKEND_APP) --host $(BACKEND_HOST) --port $(BACKEND_PORT)

run-calc: run-backend ## Alias for run-backend

run-backend-local: ## Start FastAPI calc on 127.0.0.1:$(BACKEND_PORT) (legacy alias)
	$(PYTHON) -m uvicorn $(BACKEND_APP) --host 127.0.0.1 --port $(BACKEND_PORT)

dev-backend: ## Start FastAPI calc with auto-reload (single service)
	$(PYTHON) -m uvicorn $(BACKEND_APP) --host $(BACKEND_HOST) --port $(BACKEND_PORT) --reload

dev-calc: dev-backend ## Alias for dev-backend

run-frontend: ## Start Vue frontend preview server (legacy)
	$(NPM) run preview

dev-frontend: ## Start Vue frontend dev server (legacy, proxied to calc)
	VITE_PROXY_TARGET=http://localhost:$(BACKEND_PORT) BACKEND_PORT=$(BACKEND_PORT) $(NPM) run dev -- --port $(FRONTEND_PORT)

run-gateway: ## Start Rust gateway on :$(GATEWAY_PORT) (requires calc on :$(CALC_PORT))
	CALC_BASE_URL=http://127.0.0.1:$(CALC_PORT) cargo run --manifest-path $(RUST_MANIFEST)

dev-gateway: ## Start Rust gateway with auto-reload (cargo watch)
	CALC_BASE_URL=http://127.0.0.1:$(CALC_PORT) cargo watch -x 'run --manifest-path $(RUST_MANIFEST)'

dev-all: ## Run calc + Vue frontend together (legacy; Ctrl+C stops both)
	@if lsof -n -iTCP:$(BACKEND_PORT) -sTCP:LISTEN >/dev/null 2>&1; then \
		echo "Port $(BACKEND_PORT) is already in use. Stop the existing calc (e.g. make down) or run: make dev-all BACKEND_PORT=<free_port>"; \
		exit 1; \
	fi
	@if lsof -n -iTCP:$(FRONTEND_PORT) -sTCP:LISTEN >/dev/null 2>&1; then \
		echo "Port $(FRONTEND_PORT) is already in use. Stop the existing frontend or run: make dev-all FRONTEND_PORT=<free_port>"; \
		exit 1; \
	fi
	@trap 'kill 0 2>/dev/null || true' INT TERM EXIT; \
	$(PYTHON) -m uvicorn $(BACKEND_APP) --host $(BACKEND_HOST) --port $(BACKEND_PORT) --reload & \
	VITE_PROXY_TARGET=http://localhost:$(BACKEND_PORT) BACKEND_PORT=$(BACKEND_PORT) $(NPM) run dev -- --port $(FRONTEND_PORT) & \
	wait

# ------------------------------------------------------------------------------
# Docker
# ------------------------------------------------------------------------------
.PHONY: up up-legacy up-backend up-calc down down-backend build logs
up: ## Build and run gateway + calc with Docker Compose
	docker compose up --build -d gateway calc

up-legacy: ## Build and run gateway + calc + Vue frontend (legacy profile)
	docker compose --profile legacy up --build -d

up-calc: ## Build and run only calc service (for pairing with dev gateway/frontend)
	docker compose up --build -d calc

# legacy alias
up-backend: up-calc ## Alias for up-calc

down: ## Stop Docker Compose stack
	docker compose down

down-backend: ## Stop only calc service (legacy alias)
	docker compose stop calc

build: ## Build Docker images (gateway + calc + frontend)
	docker compose build
	docker compose --profile legacy build

logs: ## Tail Docker Compose logs
	docker compose logs -f --tail=100

# ------------------------------------------------------------------------------
# Test
# ------------------------------------------------------------------------------
.PHONY: test test-backend test-frontend test-rust test-all
test: test-backend ## Run backend tests (alias)

test-backend: ## Run backend API tests (pytest)
	$(PYTHON) -m pytest tests/test_backend_endpoints.py

test-frontend: ## Run Vue frontend tests (vitest, legacy)
	$(NPM) run test

test-rust: ## Run Rust gateway tests
	cargo test --manifest-path $(RUST_MANIFEST)

test-all: test-backend test-rust ## Run all tests (backend + rust; add test-frontend if needed)
	@echo "test-all: backend + rust passed"

# ------------------------------------------------------------------------------
# Lint / Format / Typecheck / Verify
# ------------------------------------------------------------------------------
.PHONY: lint lint-rust lint-all fmt fmt-rust fmt-check fmt-check-rust typecheck verify verify-rust

lint: ## Run Ruff and pre-commit across the repository (Python)
	$(PYTHON) -m pre_commit run --all-files

lint-rust: ## Lint Rust gateway (clippy)
	cargo clippy --manifest-path $(RUST_MANIFEST) -- -D warnings

lint-all: lint lint-rust ## Lint Python + Rust

fmt: ## Format Python (ruff format via pre-commit)
	$(PYTHON) -m pre_commit run ruff-format --all-files

fmt-rust: ## Format Rust gateway
	cargo fmt --manifest-path $(RUST_MANIFEST)

fmt-check: ## Check Python formatting (no write)
	$(PYTHON) -m ruff format --check .

fmt-check-rust: ## Check Rust formatting (no write)
	cargo fmt --manifest-path $(RUST_MANIFEST) -- --check

typecheck: ## Run compile-time checks for app and backend modules
	$(PYTHON) -m py_compile logic.py backend/*.py tests/*.py && echo "Type check passed (compile-time only)."

verify: lint typecheck test ## Verify Python (minimum gate: lint + typecheck + test)
	@echo "verify: Python gate passed"

verify-rust: lint-rust fmt-check-rust test-rust ## Verify Rust gateway (clippy + fmt check + tests)

verify-all: lint-all typecheck test-all ## Verify Python + Rust (full gate)

# ------------------------------------------------------------------------------
# Graphify
# ------------------------------------------------------------------------------
.PHONY: graphify-init graphify-query graphify-update
graphify-init: ## Initialize the Graphify knowledge graph
	graphify init

graphify-query: ## Query the Graphify knowledge graph (usage: make graphify-query QUERY="<target>")
	graphify query "$(QUERY)"

graphify-update: ## Re-run Graphify to update the knowledge graph after structural changes
	graphify update

# ------------------------------------------------------------------------------
# Clean
# ------------------------------------------------------------------------------
.PHONY: clean
clean: ## Remove Python cache, Rust target, and build artifacts
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name '*.pyc' -delete 2>/dev/null || true
	rm -rf .pytest_cache .ruff_cache graphify-out 2>/dev/null || true
	cargo clean --manifest-path $(RUST_MANIFEST) 2>/dev/null || true
	echo "Cache cleaned."
