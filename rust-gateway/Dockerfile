FROM rust:1.89-bookworm AS builder
WORKDIR /app
COPY rust-gateway/Cargo.toml rust-gateway/Cargo.lock* ./
COPY rust-gateway/src ./src
COPY static ../static
RUN cargo build --release --manifest-path ./Cargo.toml

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/beruang-gateway /usr/local/bin/beruang-gateway
EXPOSE 8000
CMD ["beruang-gateway"]
