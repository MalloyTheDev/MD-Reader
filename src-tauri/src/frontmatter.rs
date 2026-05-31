// Minimal YAML front-matter splitter - the Rust side of what gray-matter does for the Electron
// build. The renderer only needs the body (content), plus title/author for display, so this
// extracts exactly those rather than pulling in a full YAML dependency. Anything it cannot parse
// falls back to treating the whole input as body with no title/author (same as the JS try/catch).

pub struct Parsed {
    pub content: String,
    pub title: Option<String>,
    pub author: Option<String>,
}

/// Strip a leading `---\n ... \n---` YAML block (if present) and pull `title:` / `author:`
/// (case-insensitive key) from it. Only the simple `key: value` scalar form is read, which is all
/// the UI surfaces; unknown keys are ignored. CRLF and LF are both handled.
pub fn parse(raw: &str) -> Parsed {
    let normalized_start = raw.strip_prefix('\u{feff}').unwrap_or(raw); // tolerate BOM
    // Front-matter must be the very first thing in the file.
    let after_open = match normalized_start.strip_prefix("---\n") {
        Some(s) => Some(s),
        None => normalized_start.strip_prefix("---\r\n"),
    };
    let Some(after_open) = after_open else {
        return Parsed {
            content: raw.to_string(),
            title: None,
            author: None,
        };
    };

    // Find the closing fence at the start of a line.
    let mut fm = String::new();
    let mut body_start: Option<usize> = None;
    let mut offset = 0usize;
    for line in after_open.split_inclusive('\n') {
        let trimmed = line.trim_end_matches(['\r', '\n']);
        if trimmed == "---" {
            body_start = Some(offset + line.len());
            break;
        }
        fm.push_str(line);
        offset += line.len();
    }

    let Some(body_off) = body_start else {
        // No closing fence -> not valid front-matter; treat whole input as body.
        return Parsed {
            content: raw.to_string(),
            title: None,
            author: None,
        };
    };

    let body = &after_open[body_off..];
    let body = body.strip_prefix('\n').or_else(|| body.strip_prefix("\r\n")).unwrap_or(body);

    let mut title = None;
    let mut author = None;
    for line in fm.lines() {
        if let Some((k, v)) = line.split_once(':') {
            let key = k.trim().to_ascii_lowercase();
            let val = v.trim().trim_matches(['"', '\'']).to_string();
            if val.is_empty() {
                continue;
            }
            if key == "title" && title.is_none() {
                title = Some(val);
            } else if key == "author" && author.is_none() {
                author = Some(val);
            }
        }
    }

    Parsed {
        content: body.to_string(),
        title,
        author,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn no_frontmatter_is_passthrough() {
        let p = parse("# Hello\n\nbody");
        assert_eq!(p.content, "# Hello\n\nbody");
        assert!(p.title.is_none());
        assert!(p.author.is_none());
    }

    #[test]
    fn extracts_title_author_and_strips_block() {
        let p = parse("---\ntitle: My Doc\nauthor: Brendan\n---\n# Heading\n\ntext");
        assert_eq!(p.title.as_deref(), Some("My Doc"));
        assert_eq!(p.author.as_deref(), Some("Brendan"));
        assert_eq!(p.content, "# Heading\n\ntext");
    }

    #[test]
    fn quoted_values_and_crlf() {
        let p = parse("---\r\ntitle: \"Quoted\"\r\n---\r\nbody here");
        assert_eq!(p.title.as_deref(), Some("Quoted"));
        assert_eq!(p.content, "body here");
    }

    #[test]
    fn unterminated_frontmatter_is_passthrough() {
        let raw = "---\ntitle: x\nno closing fence";
        let p = parse(raw);
        assert_eq!(p.content, raw);
        assert!(p.title.is_none());
    }
}
