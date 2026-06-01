// Project source digest for the AI README generator - the Rust port of the walkSource /
// redactSecrets / digestPriority logic in src/main/ipc.ts. Walks a user-picked project folder
// (read-only, not confined to the library since it is an external project the user explicitly
// chose), prioritizes the most descriptive files, and REDACTS obvious secrets before the text can
// be sent to a third-party LLM.

use regex::Regex;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use walkdir::WalkDir;

const DIGEST_SKIP: [&str; 18] = [
    "node_modules", ".git", ".obsidian", ".trash", ".vscode", ".idea", "dist", "out", "build",
    ".next", ".nuxt", "coverage", "vendor", "target", "__pycache__", ".venv", "venv", ".cache",
];

const SRC_EXTS: &[&str] = &[
    "ts", "tsx", "js", "jsx", "mjs", "cjs", "py", "go", "rs", "java", "kt", "rb", "php", "cs", "c",
    "cc", "cpp", "h", "hpp", "m", "swift", "scala", "sh", "css", "scss", "less", "html", "vue",
    "svelte", "sql", "json", "yaml", "yml", "toml", "md", "txt", "gradle",
];

const DIGEST_MAX_FILE: usize = 20_000;
const DIGEST_MAX_TOTAL: usize = 340_000;

fn is_source(p: &Path) -> bool {
    if p.file_name().and_then(|n| n.to_str()).map(|n| n.eq_ignore_ascii_case("dockerfile")) == Some(true) {
        return true;
    }
    p.extension()
        .and_then(|e| e.to_str())
        .map(|e| SRC_EXTS.contains(&e.to_ascii_lowercase().as_str()))
        .unwrap_or(false)
}

// Skip likely-secret files entirely (dotfiles like .env are already skipped by the dot rule).
fn looks_secret(name: &str) -> bool {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r"(?i)(secret|credential|password|token|\.pem$|\.key$|\.pfx$|\.p12$|\.keystore$|\.tfvars$|id_rsa|id_dsa|id_ecdsa)").unwrap()
    })
    .is_match(name)
}

/// Redact obvious secrets from file text before it goes into the digest. Mirrors redactSecrets().
pub fn redact_secrets(text: &str) -> String {
    static PRIV_KEY: OnceLock<Regex> = OnceLock::new();
    static ASSIGN: OnceLock<Regex> = OnceLock::new();
    static AWS: OnceLock<Regex> = OnceLock::new();
    let priv_key = PRIV_KEY.get_or_init(|| {
        Regex::new(r"(?s)-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----.*?-----END [A-Z0-9 ]*PRIVATE KEY-----").unwrap()
    });
    let assign = ASSIGN.get_or_init(|| {
        Regex::new(r#"(?i)\b(api[_-]?key|secret|token|password|passwd|access[_-]?key|client[_-]?secret|auth|bearer)\b(\s*[:=]\s*)(['"]?)[^\s'"]{6,}(['"]?)"#).unwrap()
    });
    let aws = AWS.get_or_init(|| Regex::new(r"\bAKIA[0-9A-Z]{16}\b").unwrap());

    let s = priv_key.replace_all(text, "<redacted private key>");
    let s = assign.replace_all(&s, "$1$2$3<redacted>$4");
    let s = aws.replace_all(&s, "<redacted>");
    s.into_owned()
}

fn priority(rel: &str) -> u8 {
    let r = rel.to_ascii_lowercase();
    if r == "package.json" || r.ends_with("/package.json") {
        return 0;
    }
    if r.contains("readme") {
        return 1;
    }
    for marker in ["cargo.toml", "go.mod", "requirements.txt", "pyproject.toml", "composer.json", "pom.xml", "build.gradle"] {
        if r == marker || r.ends_with(&format!("/{marker}")) {
            return 1;
        }
    }
    if r.contains("tsconfig") || r.contains(".config.") || r.contains(".conf.") || r.ends_with(".yaml") || r.ends_with(".yml") || r.ends_with(".toml") {
        return 2;
    }
    5
}

fn rel_posix(root: &Path, abs: &Path) -> String {
    abs.strip_prefix(root)
        .unwrap_or(abs)
        .components()
        .map(|c| c.as_os_str().to_string_lossy())
        .collect::<Vec<_>>()
        .join("/")
}

/// Build a digest of a project's source. Returns (project_name, digest_text, file_count).
pub fn build_digest(root: &Path) -> (String, String, usize) {
    let name = root.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
    let mut files: Vec<(String, PathBuf, u64)> = Vec::new();

    let walker = WalkDir::new(root).into_iter().filter_entry(|e| {
        let n = e.file_name().to_string_lossy();
        if e.depth() == 0 {
            return true;
        }
        if n.starts_with('.') {
            return false;
        }
        if e.file_type().is_dir() && DIGEST_SKIP.contains(&n.as_ref()) {
            return false;
        }
        true
    });
    for entry in walker.flatten() {
        if files.len() > 4000 {
            break;
        }
        if !entry.file_type().is_file() {
            continue;
        }
        let abs = entry.path();
        let fname = abs.file_name().and_then(|n| n.to_str()).unwrap_or("");
        if !is_source(abs) || looks_secret(fname) {
            continue;
        }
        let Ok(meta) = entry.metadata() else { continue };
        if meta.len() > 400_000 {
            continue; // skip huge/minified files
        }
        files.push((rel_posix(root, abs), abs.to_path_buf(), meta.len()));
    }

    let count = files.len();
    if count == 0 {
        return (name, String::new(), 0);
    }

    files.sort_by(|a, b| priority(&a.0).cmp(&priority(&b.0)).then(a.2.cmp(&b.2)));
    let tree: String = files.iter().map(|f| f.0.clone()).take(600).collect::<Vec<_>>().join("\n");

    let mut parts: Vec<String> = vec![format!("Project: {name}"), String::new(), "File tree:".into(), tree.clone()];
    let mut total = tree.len() + 40;
    for (rel, abs, _) in &files {
        if total >= DIGEST_MAX_TOTAL {
            break;
        }
        let Ok(content) = std::fs::read_to_string(abs) else { continue };
        if content.is_empty() {
            continue;
        }
        let redacted = redact_secrets(&content);
        let slice: String = redacted.chars().take(DIGEST_MAX_FILE).collect();
        let block = format!("\n--- {rel} ---\n{slice}");
        let block_len = block.len();
        if total + block_len > DIGEST_MAX_TOTAL {
            break;
        }
        parts.push(block);
        total += block_len;
    }

    (name, parts.join("\n"), count)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn redacts_assignments_and_keys() {
        let t = "const apiKey = \"abcdef123456\"\nlet x = 1";
        let r = redact_secrets(t);
        assert!(r.contains("<redacted>"));
        assert!(!r.contains("abcdef123456"));
        assert!(r.contains("let x = 1"));
    }

    #[test]
    fn redacts_aws_and_private_key() {
        assert!(redact_secrets("AKIAIOSFODNN7EXAMPLE").contains("<redacted>"));
        let pk = "-----BEGIN RSA PRIVATE KEY-----\nMIIabc\n-----END RSA PRIVATE KEY-----";
        assert_eq!(redact_secrets(pk), "<redacted private key>");
    }

    #[test]
    fn priority_orders_descriptive_files_first() {
        assert!(priority("package.json") < priority("src/util.ts"));
        assert!(priority("README.md") < priority("src/util.ts"));
        assert!(priority("tsconfig.json") < priority("src/util.ts"));
    }

    #[test]
    fn digests_this_crate() {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let (name, digest, count) = build_digest(&root);
        assert_eq!(name, "src-tauri");
        assert!(count > 0);
        assert!(digest.contains("Cargo.toml"));
        // target/ is skipped, so no compiled artifacts leak in
        assert!(!digest.contains("\n--- target/"));
    }
}
