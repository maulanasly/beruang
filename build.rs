// Bakes the asset version (git short SHA, else crate version) into the
// build so `static/index.html` cache-busts versioned `?v=` asset URLs.
// Works without `.git` (Docker): falls back to `CARGO_PKG_VERSION`.
fn main() {
    let sha = std::process::Command::new("git")
        .args(["rev-parse", "--short", "HEAD"])
        .output()
        .ok()
        .filter(|o| o.status.success())
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let version = sha.unwrap_or_else(|| env!("CARGO_PKG_VERSION").to_string());
    println!("cargo:rustc-env=APP_VERSION={version}");
    println!("cargo:rerun-if-changed=build.rs");
    println!("cargo:rerun-if-changed=static");
    println!("cargo:rerun-if-changed=../.git/HEAD");
}
