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

dev: ## Run with hot reload: static/ served from disk (no rebuild for UI edits) + browser auto-reload
	@if lsof -n -iTCP:$(GATEWAY_PORT) -sTCP:LISTEN >/dev/null 2>&1; then \
		echo "Port $(GATEWAY_PORT) is already in use. Stop the existing process or run: make dev GATEWAY_PORT=<free_port>"; \
		exit 1; \
	fi
	@echo "Starting beruang (DEV: disk-served static/ + live reload) on 0.0.0.0:$(GATEWAY_PORT) -> http://localhost:$(GATEWAY_PORT)"
	BERUANG_DEV=1 cargo run --manifest-path $(RUST_MANIFEST)

run-gateway: run ## Alias for run

dev-gateway: ## Start Rust gateway with auto-reload (cargo watch if installed, else plain dev)
	@if cargo watch --version >/dev/null 2>&1; then \
		BERUANG_DEV=1 cargo watch -x 'run --manifest-path $(RUST_MANIFEST)'; \
	else \
		echo "cargo-watch not found; falling back to 'make dev' (static hot reload still works)."; \
		echo "Install the Rust reloader with: make dev-watch-install"; \
		$(MAKE) dev GATEWAY_PORT=$(GATEWAY_PORT); \
	fi

dev-watch-install: ## Install cargo-watch (auto-restart on Rust changes)
	cargo install cargo-watch

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
# Release (production deploys trigger on published GitHub Releases;
# see docs/DEPLOY.md for the full runbook)
# ------------------------------------------------------------------------------
.PHONY: release
release: ## Cut a GitHub Release to deploy (usage: make release VERSION=0.2.0)
	@if [ -z "$(VERSION)" ]; then \
		echo "usage: make release VERSION=<semver, e.g. 0.2.0>"; \
		exit 1; \
	fi
	@$(MAKE) verify
	gh release create "v$(VERSION)" --generate-notes

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
