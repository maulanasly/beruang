.DEFAULT_GOAL := help

# ------------------------------------------------------------------------------
# Variables
# ------------------------------------------------------------------------------
GATEWAY_PORT ?= 8000
RUST_MANIFEST := Cargo.toml

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
# Run / Dev (local, no Docker)
# ------------------------------------------------------------------------------
.PHONY: run dev run-gateway dev-gateway

# Self-contained binary: Axum serves the API + embedded static/ on :8000.
run: ## Run the self-contained binary without Docker (API + UI on :$(GATEWAY_PORT))
	@if lsof -n -iTCP:$(GATEWAY_PORT) -sTCP:LISTEN >/dev/null 2>&1; then \
		echo "Port $(GATEWAY_PORT) is already in use. Stop the existing process or run: make run GATEWAY_PORT=<free_port>"; \
		exit 1; \
	fi
	@echo "Starting beruang on 0.0.0.0:$(GATEWAY_PORT) -> http://localhost:$(GATEWAY_PORT)"
	cargo run --manifest-path $(RUST_MANIFEST)

dev: run ## Alias for run (the binary embeds static/)

run-gateway: run ## Alias for run

dev-gateway: ## Start Rust gateway with auto-reload (cargo watch)
	cargo watch -x 'run --manifest-path $(RUST_MANIFEST)'

# ------------------------------------------------------------------------------
# Docker
# ------------------------------------------------------------------------------
.PHONY: up down build logs
up: ## Build and run the self-contained binary with Docker Compose
	docker compose up --build -d

down: ## Stop Docker Compose stack
	docker compose down

build: ## Build the Docker image
	docker compose build

logs: ## Tail Docker Compose logs
	docker compose logs -f --tail=100

# ------------------------------------------------------------------------------
# Test
# ------------------------------------------------------------------------------
.PHONY: test test-rust test-all
test: test-rust ## Run Rust gateway tests (alias)

test-rust: ## Run Rust gateway tests
	cargo test --manifest-path $(RUST_MANIFEST)

test-all: test-rust ## Run all tests (alias)

# ------------------------------------------------------------------------------
# Lint / Format / Verify
# ------------------------------------------------------------------------------
.PHONY: lint lint-rust fmt fmt-rust fmt-check fmt-check-rust verify verify-rust verify-all

lint: lint-rust ## Lint Rust gateway (clippy, alias)

lint-rust: ## Lint Rust gateway (clippy)
	cargo clippy --manifest-path $(RUST_MANIFEST) --all-targets -- -D warnings

fmt: fmt-rust ## Format Rust gateway (alias)

fmt-rust: ## Format Rust gateway
	cargo fmt --manifest-path $(RUST_MANIFEST)

fmt-check: fmt-check-rust ## Check Rust formatting (alias)

fmt-check-rust: ## Check Rust formatting (no write)
	cargo fmt --manifest-path $(RUST_MANIFEST) -- --check

verify: lint-rust fmt-check-rust test-rust ## Verify Rust gateway (clippy + fmt check + tests)

verify-rust: verify ## Alias for verify

verify-all: verify ## Alias for verify

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
clean: ## Remove Rust target and build artifacts
	cargo clean --manifest-path $(RUST_MANIFEST) 2>/dev/null || true
	echo "Cache cleaned."
