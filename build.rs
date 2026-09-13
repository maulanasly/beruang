// Bakes the asset version into the build so `static/index.html`
// cache-busts versioned `?v=` asset URLs.
//
// The version must change whenever served bytes change — including
// uncommitted edits (the common dev case). A bare git SHA does not, so
// browsers holding `immutable` (1y) js/css keep stale copies across
// rebuilds. Scheme:
//
// - git present, clean worktree  -> `{sha}` (stable, prod-friendly)
// - git present, dirty worktree  -> `{sha}-dirty.{static_hash}`
// - no git (e.g. Docker build)  -> `{pkgver}-{static_hash}`
//
// `static_hash` is a short FNV-1a hex over relative paths + bytes of
// `static/`, so the version moves exactly when content moves.
fn main() {
    let sha = git_short_sha();
    let dirty = is_worktree_dirty();
    let version = match (sha, dirty) {
        (Some(sha), false) => sha,
        (Some(sha), true) => format!("{sha}-dirty.{}", static_hash()),
        (None, _) => format!("{}-{}", env!("CARGO_PKG_VERSION"), static_hash()),
    };
    println!("cargo:rustc-env=APP_VERSION={version}");
    println!("cargo:rerun-if-changed=build.rs");
    println!("cargo:rerun-if-changed=static");
    println!("cargo:rerun-if-changed=.git/HEAD");
}

fn git_short_sha() -> Option<String> {
    std::process::Command::new("git")
        .args(["rev-parse", "--short", "HEAD"])
        .output()
        .ok()
        .filter(|o| o.status.success())
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

fn is_worktree_dirty() -> bool {
    // Only `static/` dirtiness matters: backend-only edits must not
    // bust the long-lived asset cache.
    std::process::Command::new("git")
        .args(["status", "--porcelain", "--", "static"])
        .output()
        .ok()
        .filter(|o| o.status.success())
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .is_some_and(|s| !s.trim().is_empty())
}

/// Short deterministic hash of the `static/` tree (std only).
fn static_hash() -> String {
    let mut files: Vec<std::path::PathBuf> = Vec::new();
    collect_files(std::path::Path::new("static"), &mut files);
    files.sort();
    // FNV-1a 64-bit over path names + contents.
    let mut hash: u64 = 0xcbf29ce484222325;
    let mut mix = |bytes: &[u8]| {
        for b in bytes {
            hash ^= u64::from(*b);
            hash = hash.wrapping_mul(0x100000001b3);
        }
    };
    for path in &files {
        mix(path.to_string_lossy().as_bytes());
        mix(&[0]);
        if let Ok(bytes) = std::fs::read(path) {
            mix(&bytes);
        }
        mix(&[0]);
    }
    format!("{hash:016x}")
}

fn collect_files(dir: &std::path::Path, out: &mut Vec<std::path::PathBuf>) {
    let entries = std::fs::read_dir(dir).map(|r| r.collect::<Vec<_>>());
    let Ok(entries) = entries else {
        return;
    };
    for entry in entries {
        let Ok(entry) = entry else { continue };
        let path = entry.path();
        if path.is_dir() {
            collect_files(&path, out);
        } else if path.is_file() {
            out.push(path);
        }
    }
}
