// mdimg:// local-image protocol - the Rust port of the protocol.handle('mdimg', ...) handler in
// src/main/index.ts. The reader rewrites local <img src> to
//   mdimg://local/img?base=<encoded baseDir>&p=<encoded relative-or-abs path>
// and this resolves the bytes, but ONLY for files inside the open library root.
//
// SECURITY (must match Electron exactly): two-stage confinement.
//   1. Lexical: resolve base+p, reject anything not lexically inside the root (fast reject of ..).
//   2. Symlink defense: canonicalize the target AND the root, then re-check containment, so a
//      symlink placed inside the library cannot be used to read a file outside it.
// On Windows std::fs::canonicalize returns a \\?\ verbatim-prefixed path, so BOTH sides are
// canonicalized to keep the prefix symmetric - canonicalizing only the target would make every
// legitimate in-root path fail the containment check.

use crate::paths::{is_inside, normalize};
use std::path::{Path, PathBuf};

/// Parse the `base` and `p` query params (percent-decoded) out of an mdimg URL's query string.
pub fn parse_base_p(query: &str) -> (String, String) {
    let mut base = String::new();
    let mut p = String::new();
    for pair in query.split('&') {
        if let Some((k, v)) = pair.split_once('=') {
            let decoded = urlencoding::decode(v).map(|c| c.into_owned()).unwrap_or_default();
            match k {
                "base" => base = decoded,
                "p" => p = decoded,
                _ => {}
            }
        }
    }
    (base, p)
}

/// Resolve base+p to an absolute path confined to `root`, with the symlink-safe re-check. Returns
/// the canonicalized real path on success. Any escape, missing file, or missing root -> Err.
pub fn confine_image_path(root: &Path, base: &str, p: &str) -> Result<PathBuf, String> {
    let p_path = Path::new(p);
    let abs = if p_path.is_absolute() {
        p_path.to_path_buf()
    } else {
        Path::new(base).join(p)
    };
    let abs = normalize(&abs);

    // Stage 1: lexical containment (rejects ../ escapes before touching the disk).
    if !is_inside(root, &abs) {
        return Err("Forbidden: image outside library root".into());
    }

    // Stage 2: canonicalize both sides and re-check (symlink-escape defense).
    let real = std::fs::canonicalize(&abs).map_err(|_| "Not found".to_string())?;
    let canon_root = std::fs::canonicalize(root).map_err(|_| "Forbidden: no library open".to_string())?;
    if !is_inside(&canon_root, &real) {
        return Err("Forbidden: image outside library root".into());
    }
    Ok(real)
}

/// Best-effort content type from the file extension (the only image types the reader emits).
pub fn content_type_for(path: &Path) -> &'static str {
    match path.extension().and_then(|e| e.to_str()).map(|e| e.to_ascii_lowercase()).as_deref() {
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("svg") => "image/svg+xml",
        Some("bmp") => "image/bmp",
        Some("avif") => "image/avif",
        _ => "application/octet-stream",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_base_and_p() {
        let q = "base=C%3A%5Cvault&p=assets%2Fimg.png";
        let (base, p) = parse_base_p(q);
        assert_eq!(base, "C:\\vault");
        assert_eq!(p, "assets/img.png");
    }

    #[test]
    fn content_types() {
        assert_eq!(content_type_for(Path::new("a.png")), "image/png");
        assert_eq!(content_type_for(Path::new("a.JPG")), "image/jpeg");
        assert_eq!(content_type_for(Path::new("a.svg")), "image/svg+xml");
        assert_eq!(content_type_for(Path::new("a.xyz")), "application/octet-stream");
    }

    #[test]
    fn confines_to_root_and_reads_real_file() {
        let root = std::env::temp_dir().join("mdreader-proto-ok");
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(root.join("assets")).unwrap();
        std::fs::write(root.join("assets").join("img.png"), b"PNGDATA").unwrap();
        // canonicalize the root we pass so the test compares like-for-like with the impl
        let root_c = std::fs::canonicalize(&root).unwrap();
        let real = confine_image_path(&root_c, &root_c.to_string_lossy(), "assets/img.png").unwrap();
        assert_eq!(std::fs::read(&real).unwrap(), b"PNGDATA");
    }

    #[test]
    fn rejects_escape_via_parent() {
        let root = std::env::temp_dir().join("mdreader-proto-esc");
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).unwrap();
        let err = confine_image_path(&root, &root.to_string_lossy(), "..\\..\\secret.png").unwrap_err();
        assert!(err.contains("Forbidden"));
    }

    #[test]
    fn missing_file_is_not_found() {
        let root = std::env::temp_dir().join("mdreader-proto-missing");
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).unwrap();
        let err = confine_image_path(&root, &root.to_string_lossy(), "nope.png").unwrap_err();
        assert!(err.contains("Not found"));
    }
}
