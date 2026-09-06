// Wiki-embed expansion - the Rust port of expandEmbeds / buildNameMap / sectionOf from the
// Electron src/main/ipc.ts. The reader inlines `![[Note]]` and `![[Note#Heading]]` transclusions:
// each embed is replaced with the referenced note's body (or the named section), so the reading
// view shows the same expanded content the Electron app produced.
//
// SECURITY: confined to the library root. An embed can only pull in a note that resolves inside
// `root` (direct path is is_inside-checked; the name map is built only from files under root).

use crate::commands::list_markdown_impl;
use crate::frontmatter;
use crate::paths::{is_inside, normalize};
use regex::Regex;
use std::collections::HashMap;
use std::path::Path;
use std::sync::OnceLock;

const MD_EXTS: [&str; 5] = ["md", "markdown", "mdown", "mkd", "mdx"];

fn embed_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    // ![[ name (no ] # | newline) optional #heading ]]  - mirrors EMBED_RE in ipc.ts
    RE.get_or_init(|| Regex::new(r"!\[\[([^\]#|\n]+?)(?:#([^\]|\n]+))?\]\]").unwrap())
}

fn heading_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"^(#{1,6})\s+(.+)$").unwrap())
}

fn heading_level_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"^(#{1,6})\s+").unwrap())
}

fn has_md_ext(s: &str) -> bool {
    let lower = s.to_ascii_lowercase();
    MD_EXTS.iter().any(|e| lower.ends_with(&format!(".{e}")))
}

fn strip_md_ext(s: &str) -> String {
    let lower = s.to_ascii_lowercase();
    for e in MD_EXTS {
        let suffix = format!(".{e}");
        if lower.ends_with(&suffix) {
            return s[..s.len() - suffix.len()].to_string();
        }
    }
    s.to_string()
}

// Map basename-without-extension (lowercase) and relative-path-without-extension (lowercase) to the
// absolute path, so `![[Note]]` resolves by name or by relative path. First basename wins on
// collision (matching buildNameMap's `if (!map.has(base))`).
fn build_name_map(root: &Path) -> HashMap<String, String> {
    let mut map: HashMap<String, String> = HashMap::new();
    for m in list_markdown_impl(root) {
        let base = strip_md_ext(&m.name).to_ascii_lowercase();
        map.entry(base).or_insert_with(|| m.absolute_path.clone());
        let rel = strip_md_ext(&m.relative_path).to_ascii_lowercase();
        map.insert(rel, m.absolute_path.clone());
    }
    map
}

/// Extract the section under `heading` (that heading line through just before the next heading of
/// the same or higher level). Returns the whole content if the heading is not found. Ports sectionOf.
pub fn section_of(content: &str, heading: &str) -> String {
    let lines: Vec<&str> = content.split('\n').collect();
    let target = heading.trim().to_ascii_lowercase();
    let mut start: Option<usize> = None;
    let mut level = 0usize;
    for (i, line) in lines.iter().enumerate() {
        if let Some(c) = heading_re().captures(line) {
            if c[2].trim().to_ascii_lowercase() == target {
                start = Some(i);
                level = c[1].len();
                break;
            }
        }
    }
    let Some(start) = start else { return content.to_string() };
    let mut end = lines.len();
    for (offset, line) in lines.iter().enumerate().skip(start + 1) {
        if let Some(c) = heading_level_re().captures(line) {
            if c[1].len() <= level {
                end = offset;
                break;
            }
        }
    }
    lines[start..end].join("\n")
}

/// Expand `![[Note]]` / `![[Note#Heading]]` embeds in `body`, inlining the referenced note's content
/// (or named section), confined to `root`. Mirrors Electron expandEmbeds exactly, including the
/// visible markers for found/not-found/unreadable embeds.
pub fn expand_embeds(body: &str, base_dir: &Path, root: &Path) -> String {
    if !body.contains("![[") {
        return body.to_string();
    }
    let map = build_name_map(root);
    let mut result = body.to_string();
    // Snapshot the matches first (regex borrows `body`); then apply string replacements.
    let matches: Vec<(String, String, Option<String>)> = embed_re()
        .captures_iter(body)
        .map(|c| {
            (
                c.get(0).unwrap().as_str().to_string(),
                c.get(1).map(|m| m.as_str().trim().to_string()).unwrap_or_default(),
                c.get(2).map(|m| m.as_str().trim().to_string()),
            )
        })
        .collect();

    for (full, name, heading) in matches {
        let candidate = if has_md_ext(&name) { name.clone() } else { format!("{name}.md") };
        let direct = normalize(&base_dir.join(&candidate));
        let abs: Option<String> = if is_inside(root, &direct) && direct.exists() {
            Some(direct.to_string_lossy().to_string())
        } else {
            map.get(&name.to_ascii_lowercase())
                .or_else(|| map.get(&strip_md_ext(&name).to_ascii_lowercase()))
                .cloned()
        };

        let replacement = match abs {
            None => format!("*↳ embedded note \"{name}\" not found*"),
            Some(abs) => match std::fs::read_to_string(&abs) {
                Ok(raw) => {
                    let inner = frontmatter::parse(&raw).content;
                    let slice = match &heading {
                        Some(h) => section_of(&inner, h),
                        None => inner,
                    };
                    format!("\n\n*↳ {name}*\n\n{}\n\n", slice.trim())
                }
                Err(_) => format!("*↳ could not read \"{name}\"*"),
            },
        };
        result = result.replace(&full, &replacement);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp_root(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("mdreader-embeds-{name}"));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn inlines_a_simple_embed() {
        let root = tmp_root("simple");
        std::fs::write(root.join("target.md"), "# Target\n\nInlined body here.").unwrap();
        let out = expand_embeds("Before\n\n![[target]]\n\nAfter", &root, &root);
        assert!(out.contains("Inlined body here."), "embed body should be inlined: {out}");
        assert!(!out.contains("![[target]]"), "raw embed token should be gone");
        assert!(out.contains("Before") && out.contains("After"));
    }

    #[test]
    fn inlines_a_named_section() {
        let root = tmp_root("section");
        std::fs::write(
            root.join("notes.md"),
            "# Intro\n\nignore me\n\n## Details\n\nkeep this\n\n## Other\n\nnope",
        )
        .unwrap();
        let out = expand_embeds("![[notes#Details]]", &root, &root);
        assert!(out.contains("keep this"), "named section should be inlined: {out}");
        assert!(!out.contains("nope"), "content past the section must be excluded");
        assert!(!out.contains("ignore me"), "content before the section must be excluded");
    }

    #[test]
    fn missing_embed_shows_marker() {
        let root = tmp_root("missing");
        let out = expand_embeds("![[does-not-exist]]", &root, &root);
        assert!(out.contains("not found"), "missing embed should show a marker: {out}");
    }

    #[test]
    fn no_embed_tokens_returns_unchanged() {
        let root = tmp_root("none");
        let body = "Plain content with a [[wikilink]] but no embed.";
        assert_eq!(expand_embeds(body, &root, &root), body);
    }

    #[test]
    fn section_of_returns_whole_when_heading_absent() {
        let content = "# A\n\nbody";
        assert_eq!(section_of(content, "Nonexistent"), content);
    }
}
