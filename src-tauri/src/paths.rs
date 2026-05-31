// Pure path-safety helpers - the Rust port of src/main/safe-path.ts. No Tauri / app state, so
// they unit-test directly. Used by commands.rs to confine file access to the library root and to
// sanitize user/AI-supplied file & folder names.

use std::path::{Component, Path, PathBuf};

/// Lexically resolve `.` and `..` components without touching the filesystem (so it also works
/// for not-yet-existing targets like a new file). Mirrors the effect of Node's path.resolve on
/// an already-absolute path.
pub fn normalize(p: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for comp in p.components() {
        match comp {
            Component::ParentDir => {
                out.pop();
            }
            Component::CurDir => {}
            other => out.push(other.as_os_str()),
        }
    }
    out
}

/// True if `candidate` is inside (or equal to) `root`. Purely lexical: it collapses `..`/`.`
/// first, then checks a component-wise prefix - so `..` traversal and absolute escapes are
/// rejected. Matches isInside() in safe-path.ts. Does NOT resolve symlinks; the mdimg:// handler
/// additionally canonicalize-checks before reading bytes (STEP 8).
pub fn is_inside(root: &Path, candidate: &Path) -> bool {
    let root_n = normalize(root);
    let cand_n = normalize(candidate);
    let mut rc = root_n.components();
    let mut cc = cand_n.components();
    loop {
        match (rc.next(), cc.next()) {
            (Some(a), Some(b)) => {
                if a != b {
                    return false;
                }
            }
            // root has more components than candidate -> candidate is above root
            (Some(_), None) => return false,
            // consumed all of root -> candidate is root or below it
            (None, _) => return true,
        }
    }
}

const ILLEGAL: &str = "\\/:*?\"<>|";

fn is_win_reserved(stem: &str) -> bool {
    let s = stem.to_ascii_lowercase();
    if s == "con" || s == "prn" || s == "aux" || s == "nul" {
        return true;
    }
    // com1-9 / lpt1-9
    for prefix in ["com", "lpt"] {
        if let Some(rest) = s.strip_prefix(prefix) {
            if rest.len() == 1 && matches!(rest.as_bytes()[0], b'1'..=b'9') {
                return true;
            }
        }
    }
    false
}

/// Sanitize a user/AI-supplied name to one safe path segment. Strips control chars, path
/// separators and illegal filename chars, neutralizes `..` runs, trims leading/trailing dots and
/// spaces, avoids reserved Windows device names, and never returns empty. Mirrors safeSeg().
pub fn safe_seg(name: &str, fallback: &str) -> String {
    // drop control chars (< 0x20) and illegal filename chars
    let filtered: String = name
        .chars()
        .filter(|&ch| (ch as u32) >= 0x20 && !ILLEGAL.contains(ch))
        .collect();

    // collapse runs of 2+ dots into a single dot
    let mut collapsed = String::with_capacity(filtered.len());
    let mut prev_dot = false;
    for ch in filtered.chars() {
        if ch == '.' {
            if !prev_dot {
                collapsed.push('.');
            }
            prev_dot = true;
        } else {
            collapsed.push(ch);
            prev_dot = false;
        }
    }

    // trim leading/trailing dots and spaces, then surrounding whitespace
    let trimmed = collapsed
        .trim_start_matches(['.', ' '])
        .trim_end_matches(['.', ' '])
        .trim();

    if trimmed.is_empty() {
        return fallback.to_string();
    }

    let stem = trimmed.split('.').next().unwrap_or("");
    let mut s = if is_win_reserved(stem) {
        format!("_{trimmed}")
    } else {
        trimmed.to_string()
    };

    // cap length (by char, close enough to the JS UTF-16 slice for filenames)
    if s.chars().count() > 120 {
        s = s.chars().take(120).collect();
    }
    s
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn inside_basic() {
        let root = Path::new("/vault");
        assert!(is_inside(root, Path::new("/vault")));
        assert!(is_inside(root, Path::new("/vault/a.md")));
        assert!(is_inside(root, Path::new("/vault/sub/a.md")));
    }

    #[test]
    fn rejects_traversal_and_siblings() {
        let root = Path::new("/vault");
        assert!(!is_inside(root, Path::new("/vault/../secret")));
        assert!(!is_inside(root, Path::new("/etc/passwd")));
        assert!(!is_inside(root, Path::new("/vaultsibling/a.md")));
        assert!(!is_inside(root, Path::new("/")));
    }

    #[test]
    fn traversal_that_returns_inside_is_ok() {
        let root = Path::new("/vault");
        assert!(is_inside(root, Path::new("/vault/sub/../a.md")));
    }

    #[test]
    fn safe_seg_strips_illegal_and_traversal() {
        assert_eq!(safe_seg("../../etc/passwd", "x"), "etcpasswd");
        assert_eq!(safe_seg("a/b\\c:d*e", "x"), "abcde");
        assert_eq!(safe_seg("..", "Untitled"), "Untitled");
        assert_eq!(safe_seg("", "Untitled"), "Untitled");
        assert_eq!(safe_seg("   ", "Untitled"), "Untitled");
    }

    #[test]
    fn safe_seg_handles_reserved_and_dots() {
        assert_eq!(safe_seg("CON", "x"), "_CON");
        assert_eq!(safe_seg("con.md", "x"), "_con.md");
        assert_eq!(safe_seg("a...b", "x"), "a.b");
        assert_eq!(safe_seg(".hidden", "x"), "hidden");
        assert_eq!(safe_seg("normal-name", "x"), "normal-name");
    }

    #[test]
    fn safe_seg_caps_length() {
        let long = "a".repeat(300);
        assert_eq!(safe_seg(&long, "x").chars().count(), 120);
    }
}
