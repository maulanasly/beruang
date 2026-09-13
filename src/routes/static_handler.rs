use axum::body::Body;
use axum::extract::OriginalUri;
use axum::http::{header, HeaderMap, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use rust_embed::Embed;
use sha2::{Digest, Sha256};

#[derive(Embed)]
#[folder = "static/"]
struct Assets;

const INDEX: &str = "index.html";
const VERSION_PLACEHOLDER: &str = "{{APP_VERSION}}";

/// Dev hot-reload mode (`BERUANG_DEV=1`, set by `make dev`).
/// Serves `static/` from disk per request (no rebuild for UI edits),
/// disables the long-lived cache, and injects the live-reload poller.
/// Prod (embedded `rust-embed` bytes + tiered cache) is untouched.
fn dev_mode() -> bool {
    matches!(
        std::env::var("BERUANG_DEV").as_deref(),
        Ok("1") | Ok("true") | Ok("yes")
    )
}

fn dev_static_root() -> Option<std::path::PathBuf> {
    if !dev_mode() {
        return None;
    }
    [
        std::path::PathBuf::from("static"),
        std::path::PathBuf::from(concat!(env!("CARGO_MANIFEST_DIR"), "/static")),
    ]
    .into_iter()
    .find(|candidate| candidate.is_dir())
}

/// Load an asset: disk first in dev (hot reload without recompile),
/// otherwise the embedded bytes. `..` never escapes the asset root.
fn load_bytes(path: &str) -> Option<Vec<u8>> {
    if path.contains("..") {
        return None;
    }
    if let Some(root) = dev_static_root() {
        let disk = root.join(path);
        if disk.is_file() {
            if let Ok(bytes) = std::fs::read(&disk) {
                return Some(bytes);
            }
        }
    }
    Assets::get(path).map(|f| f.data.to_vec())
}

/// Asset version baked at compile time by `build.rs` (git SHA, dirty- and
/// content-aware so `?v=` URLs bust without requiring a commit).
fn app_version() -> &'static str {
    option_env!("APP_VERSION").unwrap_or(env!("CARGO_PKG_VERSION"))
}

/// Public origin for absolute share URLs (`og:url`, canonical, sitemap).
/// Indonesian-first canonicals; scrapers need absolute URLs.
fn public_base_url() -> String {
    std::env::var("PUBLIC_BASE_URL")
        .unwrap_or_else(|_| "http://localhost:8000".to_string())
        .trim_end_matches('/')
        .to_string()
}

/// Per-route share metadata. Canonical paths are Indonesian-first;
/// `hreflang_en` is the English alias (client router serves both).
struct PageMeta {
    title_id: &'static str,
    title_en: &'static str,
    desc_id: &'static str,
    desc_en: &'static str,
    canonical: &'static str,
    hreflang_en: Option<&'static str>,
    noscript: &'static str,
}

fn page_meta(path: &str) -> PageMeta {
    match path {
        "" => PageMeta {
            title_id: "Beruang — Kalkulator Investasi Gratis: XIRR, Saham, Deposito",
            title_en: "Beruang — Free Investment Calculators: XIRR, Stocks, Deposits",
            desc_id: "Hitung XIRR reksa dana, return saham dan dividen, serta bunga deposito berjangka. Gratis, tanpa daftar, data tersimpan di perangkatmu.",
            desc_en: "Free calculators for mutual-fund XIRR, stock dividends, and term-deposit maturity. No signup; your data stays on your device.",
            canonical: "/",
            hreflang_en: None,
            noscript: "Beruang adalah kalkulator investasi gratis: XIRR reksa dana, return saham dan dividen, serta simulasi deposito. Aktifkan JavaScript untuk memakai kalkulator interaktif.",
        },
        "portofolio" | "overview" => PageMeta {
            title_id: "Portofolio Saya — Beruang",
            title_en: "My Portfolio — Beruang",
            desc_id: "Ringkasan portofolio: total setor, nilai kini, laba-rugi, XIRR tertimbang, dan TWR.",
            desc_en: "Portfolio at a glance: contributions, current value, profit and loss, weighted XIRR, and TWR.",
            canonical: "/portofolio",
            hreflang_en: None,
            noscript: "Dasbor portofolio Beruang: total setoran, nilai saat ini, laba-rugi, XIRR, dan TWR. Aktifkan JavaScript untuk memuat datamu.",
        },
        "mutual-funds" | "kalkulator/reksa-dana" | "calculators/mutual-funds" => PageMeta {
            title_id: "Kalkulator XIRR Reksa Dana — Beruang",
            title_en: "Mutual Fund XIRR Calculator — Beruang",
            desc_id: "Hitung XIRR dan return bulanan (MoM) reksa dana dari setoran cicilan. Tempel data CSV atau isi manual.",
            desc_en: "Compute mutual-fund XIRR and month-over-month returns from installment entries. Paste CSV or type manually.",
            canonical: "/kalkulator/reksa-dana",
            hreflang_en: Some("/calculators/mutual-funds"),
            noscript: "Kalkulator XIRR reksa dana: masukkan tanggal, setoran, dan nilai saat ini tiap bulan untuk melihat return bulanan dan XIRR. Aktifkan JavaScript untuk menghitung.",
        },
        "stocks" | "kalkulator/saham" | "calculators/stocks" => PageMeta {
            title_id: "Kalkulator Saham dan Dividen — Beruang",
            title_en: "Stock and Dividend Calculator — Beruang",
            desc_id: "Hitung return saham, ROI, XIRR, dan estimasi dividen dengan harga live IDX dan riwayat harga.",
            desc_en: "Compute stock returns, ROI, XIRR, and estimated dividends with live IDX quotes and price history.",
            canonical: "/kalkulator/saham",
            hreflang_en: Some("/calculators/stocks"),
            noscript: "Kalkulator saham dan dividen: catat pembelian saham dan dividen, sinkronkan harga live IDX, lalu hitung ROI dan XIRR. Aktifkan JavaScript untuk menghitung.",
        },
        "term-deposits" | "kalkulator/deposito" | "calculators/term-deposits" => PageMeta {
            title_id: "Kalkulator Deposito Berjangka — Beruang",
            title_en: "Term Deposit Calculator — Beruang",
            desc_id: "Simulasikan bunga deposito (APY), tanggal jatuh tempo, dan saran rollover.",
            desc_en: "Simulate term-deposit interest (APY), maturity dates, and rollover suggestions.",
            canonical: "/kalkulator/deposito",
            hreflang_en: Some("/calculators/term-deposits"),
            noscript: "Kalkulator deposito berjangka: masukkan APY dan setoran untuk melihat bunga berjalan, tanggal jatuh tempo, dan saran rollover. Aktifkan JavaScript untuk menghitung.",
        },
        "ev" | "kalkulator/mobil-listrik" | "calculators/ev" => PageMeta {
            title_id: "Kalkulator Mobil Listrik vs Bensin — Beruang",
            title_en: "EV vs Petrol Cost Calculator — Beruang",
            desc_id: "Bandingkan biaya operasional bulanan mobil listrik vs bensin dan temukan bulan impas.",
            desc_en: "Compare monthly running costs of an electric car vs a petrol car and find the break-even month.",
            canonical: "/kalkulator/mobil-listrik",
            hreflang_en: Some("/calculators/ev"),
            noscript: "Kalkulator mobil listrik vs bensin: isi harga, jarak bulanan, dan biaya energi untuk melihat hemat per bulan dan titik impas. Aktifkan JavaScript untuk menghitung.",
        },
        _ => PageMeta {
            title_id: "Beruang — Kalkulator Investasi",
            title_en: "Beruang — Investment Calculators",
            desc_id: "Kalkulator investasi gratis: XIRR reksa dana, saham dan dividen, serta deposito berjangka.",
            desc_en: "Free investment calculators: mutual-fund XIRR, stocks and dividends, term deposits.",
            canonical: "/",
            hreflang_en: None,
            noscript: "Beruang adalah kalkulator investasi gratis. Aktifkan JavaScript untuk memakai kalkulator interaktif.",
        },
    }
}

fn hreflang_links(base: &str, meta: &PageMeta) -> String {
    let canonical = format!("{base}{}", meta.canonical);
    let mut out = format!(
        "<link rel=\"alternate\" hreflang=\"id\" href=\"{canonical}\">\n    <link rel=\"alternate\" hreflang=\"x-default\" href=\"{canonical}\">"
    );
    if let Some(en) = meta.hreflang_en {
        out.push_str(&format!(
            "\n    <link rel=\"alternate\" hreflang=\"en\" href=\"{base}{en}\">"
        ));
    }
    out
}

fn json_ld_for(title: &str, description: &str, meta: &PageMeta, canonical: &str) -> String {
    let app = serde_json::json!({
        "@context": "https://schema.org",
        "@type": "WebApplication",
        "name": title,
        "url": canonical,
        "description": description,
        "applicationCategory": "FinanceApplication",
        "operatingSystem": "Web",
        "offers": { "@type": "Offer", "price": "0", "priceCurrency": "IDR" },
        "inLanguage": ["id-ID", "en-US"],
    });
    if meta.canonical == "/" {
        let faq = serde_json::json!({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            "mainEntity": [
                {
                    "@type": "Question",
                    "name": "Apakah kalkulator Beruang gratis?",
                    "acceptedAnswer": { "@type": "Answer", "text": "Ya. Semua kalkulator gratis, tanpa daftar, dan datamu tersimpan di perangkatmu sendiri." }
                },
                {
                    "@type": "Question",
                    "name": "Apa itu XIRR?",
                    "acceptedAnswer": { "@type": "Answer", "text": "XIRR adalah return tahunan yang memperhitungkan setoran dan penarikan pada tanggal yang berbeda." }
                },
                {
                    "@type": "Question",
                    "name": "Dari mana harga saham berasal?",
                    "acceptedAnswer": { "@type": "Answer", "text": "Harga live IDX beserta riwayatnya diambil dari Yahoo Finance saat kamu menekan tombol kuotasi." }
                }
            ]
        });
        return serde_json::json!([app, faq]).to_string();
    }
    app.to_string()
}

fn etag_for(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    format!("\"{:x}\"", hasher.finalize())
}

/// Long-lived immutable tier: content-hashed-by-release (`?v=` URLs).
/// Query strings never reach here (`OriginalUri::path` excludes them), so
/// `/js/app.js?v=abc` resolves to the same embedded bytes as `/js/app.js`.
fn is_immutable(path: &str) -> bool {
    path.starts_with("js/")
        || path.starts_with("css/")
        || path == "favicon.svg"
        || path == "og-image.png"
        || path == "apple-touch-icon.png"
        || path == "manifest.webmanifest"
}

fn cache_control(path: &str) -> &'static str {
    if path == INDEX {
        "no-cache"
    } else if is_immutable(path) {
        "public, max-age=31536000, immutable"
    } else {
        "public, max-age=3600"
    }
}

/// Dev serves everything `no-store`: with disk reads per request there is
/// no benefit to caching, and stale dev bytes are the bug being fixed.
fn effective_cache_control(path: &str, dev: bool) -> &'static str {
    if dev {
        "no-store"
    } else {
        cache_control(path)
    }
}

fn content_type_for(path: &str) -> String {
    let mime = mime_guess::from_path(path)
        .first_or_octet_stream()
        .to_string();
    if mime.starts_with("text/") || mime == "application/javascript" || mime == "application/xml" {
        format!("{mime}; charset=utf-8")
    } else {
        mime
    }
}

fn etag_matches(headers: &HeaderMap, etag: &str) -> bool {
    headers
        .get(header::IF_NONE_MATCH)
        .and_then(|v| v.to_str().ok())
        .is_some_and(|v| {
            v.split(',')
                .any(|tag| tag.trim() == etag || tag.trim() == "*")
        })
}

fn serve_bytes(path: &str, bytes: Vec<u8>, headers: &HeaderMap, dev: bool) -> Response {
    let etag = etag_for(&bytes);
    let cache = effective_cache_control(path, dev);
    if etag_matches(headers, &etag) {
        return Response::builder()
            .status(StatusCode::NOT_MODIFIED)
            .header(header::ETAG, etag)
            .header(header::CACHE_CONTROL, cache)
            .body(Body::empty())
            .unwrap_or(StatusCode::INTERNAL_SERVER_ERROR.into_response());
    }
    let content_type = content_type_for(path);
    let mut builder = Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, content_type)
        .header(header::CACHE_CONTROL, cache);
    if let Ok(value) = HeaderValue::from_str(&etag) {
        builder = builder.header(header::ETAG, value);
    }
    builder
        .body(Body::from(bytes))
        .unwrap_or(StatusCode::INTERNAL_SERVER_ERROR.into_response())
}

/// `{{BASE_URL}}`-injected text files (robots/sitemap need absolute URLs).
fn serve_template(name: &str, headers: &HeaderMap) -> Response {
    match load_bytes(name) {
        Some(data) => {
            let base = public_base_url();
            let body = String::from_utf8_lossy(&data).replace("{{BASE_URL}}", &base);
            serve_bytes(name, body.into_bytes(), headers, dev_mode())
        }
        None => StatusCode::NOT_FOUND.into_response(),
    }
}

/// Dev-only live-reload poller, same-origin so the strict
/// `script-src 'self'` / `connect-src 'self'` CSP still holds.
const DEV_RELOAD_TAG: &str = "<script type=\"module\" src=\"/js/dev-reload.js?v=dev\"></script>";

fn inject_dev_script(html: &str) -> String {
    match html.find("</body>") {
        Some(i) => format!("{}{DEV_RELOAD_TAG}{}", &html[..i], &html[i..]),
        None => format!("{html}{DEV_RELOAD_TAG}"),
    }
}

/// Fingerprint of the on-disk `static/` tree for the dev poller.
/// Falls back to the baked version when no dev tree is present.
fn dev_tree_fingerprint() -> String {
    let Some(root) = dev_static_root() else {
        return app_version().to_string();
    };
    let mut files: Vec<std::path::PathBuf> = Vec::new();
    collect_static_files(&root, &root, &mut files);
    files.sort();
    let mut hasher = Sha256::new();
    for path in &files {
        hasher.update(path.to_string_lossy().as_bytes());
        hasher.update([0]);
        // `files` holds root-relative paths; join back for content reads
        // (a bare relative read would miss when CWD != static root parent).
        if let Ok(bytes) = std::fs::read(root.join(path)) {
            hasher.update(&bytes);
        }
        hasher.update([0]);
    }
    format!("{:x}", hasher.finalize())
}

fn collect_static_files(
    root: &std::path::Path,
    dir: &std::path::Path,
    out: &mut Vec<std::path::PathBuf>,
) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_static_files(root, &path, out);
        } else if path.is_file() {
            out.push(path.strip_prefix(root).unwrap_or(&path).to_path_buf());
        }
    }
}

/// Dev poller endpoint: the injected script reloads the page when this
/// value changes. 404 outside dev mode (no extra prod surface).
pub async fn dev_version() -> Response {
    if !dev_mode() {
        return StatusCode::NOT_FOUND.into_response();
    }
    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "text/plain; charset=utf-8")
        .header(header::CACHE_CONTROL, "no-store")
        .body(Body::from(dev_tree_fingerprint()))
        .unwrap_or(StatusCode::INTERNAL_SERVER_ERROR.into_response())
}

fn serve_index(route: &str, headers: &HeaderMap) -> Response {
    match load_bytes(INDEX) {
        Some(data) => {
            let dev = dev_mode();
            let base = public_base_url();
            let meta = page_meta(route);
            // English aliases serve English copy; Indonesian paths serve
            // Indonesian. URL-keyed, so caches and scrapers stay consistent.
            let english = route.starts_with("calculators/");
            let title = if english {
                meta.title_en
            } else {
                meta.title_id
            };
            let description = if english { meta.desc_en } else { meta.desc_id };
            let canonical = format!("{base}{}", meta.canonical);
            let html = String::from_utf8_lossy(&data)
                .replace(VERSION_PLACEHOLDER, app_version())
                .replace("{{TITLE}}", title)
                .replace("{{DESCRIPTION}}", description)
                .replace("{{CANONICAL}}", &canonical)
                .replace("{{OG_IMAGE}}", &format!("{base}/og-image.png"))
                .replace("{{HREFLANG}}", &hreflang_links(&base, &meta))
                .replace(
                    "{{JSON_LD}}",
                    &json_ld_for(title, description, &meta, &canonical),
                )
                .replace("{{NOSCRIPT}}", meta.noscript);
            let html = if dev { inject_dev_script(&html) } else { html };
            serve_bytes(INDEX, html.into_bytes(), headers, dev)
        }
        None => StatusCode::NOT_FOUND.into_response(),
    }
}

pub async fn handler(uri: OriginalUri, headers: HeaderMap) -> Result<Response, StatusCode> {
    let path = uri.path().trim_start_matches('/');
    if path.is_empty() {
        return Ok(serve_index("", &headers));
    }
    // Don't hijack API routes - let them 404 via routing layer
    if path.starts_with("api/") {
        return Err(StatusCode::NOT_FOUND);
    }
    // Crawl infrastructure must never fall through to the SPA shell.
    if path == "robots.txt" || path == "sitemap.xml" {
        return Ok(serve_template(path, &headers));
    }
    match load_bytes(path) {
        Some(data) => Ok(serve_bytes(path, data, &headers, dev_mode())),
        // SPA fallback serves the route-aware shell, never an API route.
        None => Ok(serve_index(path, &headers)),
    }
}

#[cfg(test)]
mod tests {
    use super::{
        app_version, cache_control, content_type_for, effective_cache_control, etag_for,
        inject_dev_script, is_immutable, load_bytes, page_meta, public_base_url, DEV_RELOAD_TAG,
    };

    #[test]
    fn cache_tiers_match_spec() {
        assert_eq!(cache_control("index.html"), "no-cache");
        assert_eq!(
            cache_control("js/app.js"),
            "public, max-age=31536000, immutable"
        );
        assert_eq!(
            cache_control("css/styles.css"),
            "public, max-age=31536000, immutable"
        );
        assert_eq!(
            cache_control("favicon.svg"),
            "public, max-age=31536000, immutable"
        );
        assert_eq!(
            cache_control("og-image.png"),
            "public, max-age=31536000, immutable"
        );
        assert_eq!(cache_control("robots.txt"), "public, max-age=3600");
        assert!(!is_immutable("index.html"));
    }

    #[test]
    fn text_types_carry_charset() {
        assert!(content_type_for("index.html").contains("charset=utf-8"));
        assert!(content_type_for("js/app.js").contains("charset=utf-8"));
        assert!(content_type_for("favicon.svg").contains("svg"));
        assert!(content_type_for("sitemap.xml").contains("charset=utf-8"));
        assert!(!app_version().is_empty());
    }

    #[test]
    fn etag_is_stable_and_quoted() {
        assert_eq!(etag_for(b"abc"), etag_for(b"abc"));
        assert_ne!(etag_for(b"abc"), etag_for(b"abd"));
        assert!(etag_for(b"abc").starts_with('"'));
    }

    #[test]
    fn route_meta_is_indonesian_first() {
        let mf = page_meta("kalkulator/saham");
        assert_eq!(mf.canonical, "/kalkulator/saham");
        assert_eq!(mf.hreflang_en, Some("/calculators/stocks"));
        assert!(mf.title_id.contains("Saham"));
        assert_eq!(page_meta("stocks").canonical, "/kalkulator/saham");
        assert_eq!(
            page_meta("calculators/stocks").canonical,
            "/kalkulator/saham"
        );
        assert_eq!(page_meta("nope-unknown").canonical, "/");
        assert!(!public_base_url().ends_with('/'));
    }

    #[test]
    fn dev_disables_all_caching() {
        for path in ["index.html", "js/app.js", "css/styles.css", "robots.txt"] {
            assert_eq!(effective_cache_control(path, true), "no-store");
            assert_eq!(effective_cache_control(path, false), cache_control(path));
        }
    }

    #[test]
    fn dev_script_injected_before_body_close() {
        let html = inject_dev_script("<html><body><div></div></body></html>");
        assert!(html.contains(DEV_RELOAD_TAG));
        assert!(html.find(DEV_RELOAD_TAG).unwrap() < html.find("</body>").unwrap());
        // Prod shell carries no dev poller.
        let embedded = load_bytes("index.html").expect("index.html is embedded");
        assert!(!String::from_utf8_lossy(&embedded).contains(DEV_RELOAD_TAG));
    }

    #[test]
    fn traversal_never_escapes_asset_root() {
        assert!(load_bytes("../Cargo.toml").is_none());
        assert!(load_bytes("js/../../Cargo.toml").is_none());
    }

    #[test]
    fn locale_nav_keys_stay_in_parity() {
        // Grouped nav + crumbs + footer rely on these keys in BOTH locales
        // (missing keys silently fall back to English).
        let en = String::from_utf8_lossy(
            &load_bytes("js/locales/en-US.js").expect("en-US locale is embedded"),
        )
        .into_owned();
        let id = String::from_utf8_lossy(
            &load_bytes("js/locales/id-ID.js").expect("id-ID locale is embedded"),
        )
        .into_owned();
        for key in [
            "calculators:",
            "breadcrumb:",
            "navLabel:",
            "storageFull:",
            "reviewRestore:",
            "themeDark:",
            "themeToggle:",
        ] {
            assert!(en.contains(key), "en-US missing {key}");
            assert!(id.contains(key), "id-ID missing {key}");
        }
        for dead in [
            "overview: 'Overview'",
            "overview: 'Ringkasan'",
            "pickTicker",
            "applyPrice",
            "Refresh List",
        ] {
            assert!(!en.contains(dead), "en-US still has dead key {dead}");
            assert!(!id.contains(dead), "id-ID still has dead key {dead}");
        }
    }
}
