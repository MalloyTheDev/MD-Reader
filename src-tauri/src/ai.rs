// AI backend - the Rust port of src/main/ai.ts + src/shared/{ai-endpoints,ai-models}.ts.
//
// SECURITY (must match the Electron model exactly):
//  - API keys live in the OS keyring (Windows Credential Manager via the `keyring` crate), never
//    in config.json and never returned to the renderer. ai_status exposes only booleans.
//  - SSRF host-pin: resolve_base_url forces openai/anthropic to their official hosts, ignoring any
//    renderer-supplied base URL, so a compromised renderer can never send the key elsewhere.
//  - The HTTP client uses redirect::Policy::none() and we reject any 3xx, so a key-bearing request
//    cannot be bounced to another host by a redirect.
//  - Friendly, non-leaky error messages (no raw internals surfaced to the user).
//
// Streaming uses reqwest bytes_stream + manual SSE parsing for both wire formats (Anthropic
// /v1/messages content_block_delta, OpenAI-compatible /chat/completions choices[].delta). Active
// runs are tracked by run id so ai_cancel can abort them.

use futures_util::StreamExt;
use keyring::Entry;
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use tauri::{AppHandle, Emitter};
use tokio::sync::Notify;

const SERVICE: &str = "com.malloythedev.mdreader";
const MAX_DOC_CHARS: usize = 600_000;
const SYSTEM_PROMPT: &str = "You are a focused study assistant for a Markdown reading app. Be accurate and concise, and format answers in Markdown.";

// $/1M tokens (input, output). Only where rates are known; others report tokens with zero cost.
fn pricing(model: &str) -> (f64, f64) {
    match model {
        "claude-opus-4-7" => (5.0, 25.0),
        "claude-sonnet-4-6" => (3.0, 15.0),
        "claude-haiku-4-5" => (1.0, 5.0),
        "gpt-4o" => (2.5, 10.0),
        "gpt-4o-mini" => (0.15, 0.6),
        "gpt-4.1" => (2.0, 8.0),
        "gpt-4.1-mini" => (0.4, 1.6),
        "o4-mini" => (1.1, 4.4),
        _ => (0.0, 0.0),
    }
}

// ── Request shape (mirror of AiRequest in src/shared/types.ts) ──────────────
#[derive(Deserialize, Clone)]
pub struct AiTurn {
    pub role: String,
    pub text: String,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AiRequest {
    pub run_id: String,
    pub action: String,
    pub provider: String,
    pub model: String,
    #[serde(default)]
    pub base_url: Option<String>,
    #[serde(default)]
    pub doc: String,
    #[serde(default)]
    pub question: Option<String>,
    #[serde(default)]
    pub selection: Option<String>,
    #[serde(default)]
    pub history: Option<Vec<AiTurn>>,
    #[serde(default)]
    pub context: Option<String>,
    #[serde(default)]
    pub titles: Option<Vec<String>>,
    #[serde(default)]
    pub repurpose_format: Option<String>,
    #[serde(default)]
    pub write_mode: Option<String>,
    #[serde(default)]
    pub language: Option<String>,
    #[serde(default)]
    pub tone: Option<String>,
    #[serde(default)]
    pub diagram_kind: Option<String>,
}

// ── Active-run registry (for cancellation) ──────────────────────────────────
struct RunHandle {
    notify: Arc<Notify>,
    cancelled: Arc<AtomicBool>,
}

#[derive(Default, Clone)]
pub struct AiRuns(Arc<Mutex<HashMap<String, RunHandle>>>);

impl AiRuns {
    fn register(&self, run_id: &str) -> (Arc<Notify>, Arc<AtomicBool>) {
        let notify = Arc::new(Notify::new());
        let cancelled = Arc::new(AtomicBool::new(false));
        self.0.lock().unwrap().insert(
            run_id.to_string(),
            RunHandle { notify: notify.clone(), cancelled: cancelled.clone() },
        );
        (notify, cancelled)
    }
    fn finish(&self, run_id: &str) {
        self.0.lock().unwrap().remove(run_id);
    }
    pub fn cancel(&self, run_id: &str) {
        if let Some(h) = self.0.lock().unwrap().get(run_id) {
            h.cancelled.store(true, Ordering::Relaxed);
            h.notify.notify_waiters();
        }
    }
}

// ── Keyring (safeStorage parity) ────────────────────────────────────────────
fn entry(provider: &str) -> keyring::Result<Entry> {
    Entry::new(SERVICE, provider)
}

/// True if the OS secret store is usable. Non-invasive probe: reading a missing entry returns
/// NoEntry (backend works); a backend/access failure returns something else.
pub fn keyring_available() -> bool {
    match Entry::new(SERVICE, "__probe__").and_then(|e| e.get_password()) {
        Ok(_) | Err(keyring::Error::NoEntry) => true,
        Err(_) => false,
    }
}

fn get_key(provider: &str) -> Option<String> {
    match entry(provider).and_then(|e| e.get_password()) {
        Ok(k) if !k.is_empty() => Some(k),
        _ => None,
    }
}

fn has_key(provider: &str) -> bool {
    get_key(provider).is_some()
}

/// Store a provider key in the OS keyring. Empty string clears it. Refuses to store if the secret
/// store is unavailable (never falls back to plaintext), mirroring setKey() in ai.ts.
pub fn set_key(provider: &str, key: &str) -> Result<(), String> {
    clear_model_cache(provider); // a new key may unlock a different model set
    if key.is_empty() {
        let _ = entry(provider).and_then(|e| e.delete_credential());
        return Ok(());
    }
    if !keyring_available() {
        return Err("Secure key storage is not available on this system; refusing to store the key in plaintext.".into());
    }
    entry(provider)
        .and_then(|e| e.set_password(key))
        .map_err(|e| e.to_string())
}

pub fn clear_key(provider: &str) {
    clear_model_cache(provider);
    let _ = entry(provider).and_then(|e| e.delete_credential());
}

pub fn is_configured(provider: &str) -> bool {
    provider == "ollama" || has_key(provider)
}

// ── SSRF-pinned base URL (mirror of resolveBaseUrl) ─────────────────────────
pub fn resolve_base_url(provider: &str, given: &str) -> String {
    let trimmed = given.trim().trim_end_matches('/');
    match provider {
        "openai" => "https://api.openai.com/v1".to_string(),
        "anthropic" => "https://api.anthropic.com/v1".to_string(),
        "ollama" => {
            if trimmed.is_empty() {
                "http://localhost:11434/v1".to_string()
            } else {
                trimmed.to_string()
            }
        }
        _ => trimmed.to_string(), // custom: caller-supplied
    }
}

fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none()) // never auto-follow: could leak the key cross-host
        .build()
        .map_err(|e| e.to_string())
}

// ── Errors (mirror of friendlyError) ────────────────────────────────────────
fn friendly_status(status: u16, _body: Option<String>) -> String {
    match status {
        401 | 403 => "Your API key was rejected. Check that it is valid and has access.".into(),
        429 => "Rate limited - wait a moment and try again.".into(),
        400 | 404 => "That model may be unavailable for your key. Pick another model and try again.".into(),
        500 | 502 | 503 | 529 => "The provider had a service issue - please try again.".into(),
        _ => format!("HTTP {status}"),
    }
}

fn friendly_reqwest(e: &reqwest::Error) -> String {
    if e.is_connect() || e.is_timeout() {
        "Could not reach the AI endpoint. Check the base URL (and that Ollama/your server is running).".into()
    } else {
        e.to_string()
    }
}

// ── Prompts (verbatim ports; not secrets) ───────────────────────────────────
fn instruction_for(req: &AiRequest) -> String {
    let q = req.question.clone().unwrap_or_default();
    let sel = req.selection.clone().unwrap_or_default();
    let titles = req.titles.clone().unwrap_or_default().join(" | ");
    match req.action.as_str() {
        "summarize" => "Summarize the document above in a few clear paragraphs, then list the key takeaways as concise bullet points.".into(),
        "ask" | "library" => format!("Answer this question using primarily the source material above. If it is not covered, say so briefly.\n\nQuestion: {q}"),
        "explain" => format!("Explain the following excerpt in simple, clear terms. Define any jargon.\n\n\"\"\"{sel}\"\"\""),
        "flashcards" => "Create 6-10 study flashcards from the document above. Respond with ONLY a JSON array of objects shaped {\"q\": \"question\", \"a\": \"answer\"} - no prose, no code fences.".into(),
        "studyguide" => "Create a structured study guide for the document above: key concepts, definitions, and a few review questions. Use Markdown headings and bullet points.".into(),
        "quiz" => "Write a 5-question quiz based on the document above (mix of multiple-choice and short-answer), then an answer key at the end. Use Markdown.".into(),
        "suggestlinks" => format!("From the document above, suggest cross-links to related notes. Available note titles: {titles}. Recommend 3-8 as a Markdown list, each formatted \"[[Title]] - one-line reason\". Only use titles from the list."),
        "keyterms" => "Extract the key terms and vocabulary from the document above. Return a Markdown list where each item is \"**term** - a concise definition\".".into(),
        "eli5" => "Explain the document above simply, as if to a curious beginner (ELI5). Use short paragraphs, plain language, and a helpful analogy where it fits.".into(),
        "critique" => "Critically analyze the document above. Cover its key claims, possible weaknesses or counter-arguments, and open questions. Use Markdown bullet points grouped under short headings.".into(),
        "repurpose" => repurpose_instruction(req.repurpose_format.as_deref().unwrap_or("onepager")),
        "write" => write_instruction(req.write_mode.as_deref().unwrap_or("rewrite"), &sel),
        "organize" => format!("Analyze the document above and suggest organization metadata. Respond with ONLY a JSON object shaped {{\"title\": \"A concise descriptive title\", \"tags\": [\"tag1\", \"tag2\"], \"links\": [\"Existing Note Title\"]}} - no prose, no code fences. Choose 3-6 short lowercase tags. For \"links\", recommend up to 5 related notes, using ONLY titles from this list (omit if none fit): {titles}."),
        "courseoutline" => format!("You are designing a focused self-study course on the topic: \"{q}\". Respond with ONLY a JSON object shaped {{\"title\": \"Course Title\", \"lessons\": [{{\"title\": \"Lesson title\", \"summary\": \"one-sentence description\"}}]}} containing 4-7 lessons that build progressively - no prose, no code fences."),
        "courselesson" => format!("Write a clear, self-contained lesson for a self-study course on \"{q}\". The lesson to write is: {sel}\n\nUse Markdown: start with a single \"# \" heading for the lesson title, then short explanatory sections, concrete examples, and end with a brief \"## Key points\" bullet list. Do not include quiz questions."),
        "readme" => "You are writing a README.md for the software project whose source code is provided above. Study the code, dependencies, and structure, then produce a complete, professional README in Markdown with: a project title and one-line description, a short overview, key features (bullets), tech stack, installation steps, usage examples, an overview of the project structure, and a License section. Infer details from the actual code; do not invent features that are not present. Output only the README Markdown.".into(),
        "translate" => format!("Translate the document above into {}. Preserve all Markdown structure and formatting; translate prose and headings, but leave code blocks, URLs, and technical identifiers unchanged. Output only the translated Markdown - no preamble.", if req.language.as_deref().unwrap_or("").is_empty() { "English" } else { req.language.as_deref().unwrap() }),
        "tone" => format!("Rewrite the document above in a {} tone, preserving its meaning and Markdown formatting. Return only the rewritten Markdown - no preamble or explanation.", req.tone.as_deref().unwrap_or("clear")),
        "tasks" => "Extract every action item, task, decision, and follow-up from the document above. Return a Markdown checklist using \"- [ ] \" for each open item, grouped under short \"## \" headings (for example Action items, Decisions, Open questions) where it helps. If there are none, say so briefly.".into(),
        "diagram" => {
            if req.diagram_kind.as_deref() == Some("table") {
                "Turn the key information in the document above into a clear Markdown table. Choose sensible columns, include a header row, and keep cells concise. Output only the table.".into()
            } else {
                "Create a Mermaid diagram capturing the main structure or flow in the document above. Pick the most fitting diagram type (flowchart, sequence, etc.). Output ONLY a single fenced ```mermaid code block - no prose.".into()
            }
        }
        _ => "Summarize the document above.".into(),
    }
}

fn repurpose_instruction(format: &str) -> String {
    match format {
        "blog" => "Rewrite the document above as an engaging blog post for a general audience. Open with a hook, use clear section headings, keep paragraphs short and lively, and end with a takeaway. Use Markdown.".into(),
        "exec" => "Distill the document above into a concise executive summary. Use short sections: Overview, Key Points (bullets), Risks/Considerations, and Recommended Next Steps. Keep it tight and decision-focused. Use Markdown.".into(),
        "slides" => "Turn the document above into a presentation deck. Separate each slide with a line containing only \"---\". Start with a title slide. Each subsequent slide should have a short \"## \" heading and a few concise bullet points. Aim for 6-12 slides.".into(),
        "lesson" => "Turn the document above into a teaching lesson plan. Include: Learning objectives, Prerequisites, a step-by-step Lesson outline with short explanations, a worked Example, and a few Review questions. Use Markdown headings and bullets.".into(),
        _ => "Repurpose the document above into a polished one-page marketing sheet. Include a punchy headline, a one-line tagline, 3-5 key value propositions as bullets, a short \"Why it matters\" paragraph, and a closing call to action. Use Markdown.".into(),
    }
}

fn write_instruction(mode: &str, selection: &str) -> String {
    let target = format!("\n\n\"\"\"{selection}\"\"\"");
    match mode {
        "expand" => format!("Expand the text below with more detail, supporting points, and a concrete example where helpful, matching the original tone. Return ONLY the expanded text - no preamble, no quotes, no explanation.{target}"),
        "grammar" => format!("Correct any spelling, grammar, and punctuation mistakes in the text below. Preserve the meaning, voice, and Markdown formatting. Return ONLY the corrected text - no preamble, no quotes, no explanation.{target}"),
        "continue" => format!("Continue writing naturally from where the text below ends, matching its tone, style, and formatting. Return ONLY the new continuation text - do not repeat the existing text, and add no preamble or explanation.{target}"),
        _ => format!("Rewrite the text below to improve clarity, flow, and word choice while preserving its meaning and any Markdown formatting. Return ONLY the rewritten text - no preamble, no quotes, no explanation.{target}"),
    }
}

fn is_long_action(action: &str) -> bool {
    matches!(
        action,
        "readme" | "courselesson" | "courseoutline" | "repurpose" | "studyguide" | "quiz" | "critique" | "translate" | "tone"
    )
}

fn max_tokens_for(action: &str) -> u32 {
    if is_long_action(action) {
        8192
    } else {
        4096
    }
}

// Adaptive thinking is supported on Claude 4.x; older/unknown models omit it.
fn claude_supports_adaptive_thinking(model: &str) -> bool {
    static RE: OnceLock<regex::Regex> = OnceLock::new();
    RE.get_or_init(|| regex::Regex::new(r"(?i)claude-(opus|sonnet|haiku)-[4-9]").unwrap())
        .is_match(model)
}

fn corpus_for(req: &AiRequest) -> String {
    let src = if req.action == "library" {
        req.context.clone().unwrap_or_default()
    } else {
        req.doc.clone()
    };
    src.chars().take(MAX_DOC_CHARS).collect()
}

fn build_convo(req: &AiRequest) -> Vec<Value> {
    match &req.history {
        Some(h) if !h.is_empty() => h
            .iter()
            .map(|t| json!({ "role": t.role, "content": t.text }))
            .collect(),
        _ => vec![json!({ "role": "user", "content": instruction_for(req) })],
    }
}

// ── Event emission ──────────────────────────────────────────────────────────
fn emit(app: &AppHandle, payload: Value) {
    let _ = app.emit("ai:event", payload);
}
fn emit_chunk(app: &AppHandle, run_id: &str, text: &str) {
    emit(app, json!({ "runId": run_id, "kind": "chunk", "text": text }));
}
fn emit_error(app: &AppHandle, run_id: &str, error: &str) {
    emit(app, json!({ "runId": run_id, "kind": "error", "error": error }));
}
fn emit_done(app: &AppHandle, run_id: &str, full: &str, usage: Value) {
    emit(app, json!({ "runId": run_id, "kind": "done", "text": full, "usage": usage }));
}

// ── Streaming runners ───────────────────────────────────────────────────────
async fn run_openai(app: &AppHandle, req: &AiRequest, key: &str, runs: &AiRuns) -> Result<(), String> {
    let base = resolve_base_url(&req.provider, req.base_url.as_deref().unwrap_or(""));
    if base.is_empty() {
        return Err("No base URL configured for this provider.".into());
    }
    let corpus = corpus_for(req);
    let mut messages = vec![json!({ "role": "system", "content": SYSTEM_PROMPT })];
    if !corpus.trim().is_empty() {
        messages.push(json!({ "role": "user", "content": format!("{corpus}\n\n---\nThe text above is the source material for this conversation. Base your answers on it.") }));
        messages.push(json!({ "role": "assistant", "content": "Understood - what would you like to know?" }));
    }
    messages.extend(build_convo(req));

    let mut body = json!({ "model": req.model, "messages": messages, "stream": true });
    if req.provider == "openai" {
        body["stream_options"] = json!({ "include_usage": true });
    }

    let mut rb = http_client()?
        .post(format!("{base}/chat/completions"))
        .header("content-type", "application/json")
        .json(&body);
    if !key.is_empty() {
        rb = rb.bearer_auth(key);
    }
    let resp = rb.send().await.map_err(|e| friendly_reqwest(&e))?;
    if resp.status().is_redirection() {
        return Err("The AI endpoint attempted a redirect, which is not allowed for security.".into());
    }
    if !resp.status().is_success() {
        let status = resp.status().as_u16();
        let body = resp.text().await.ok();
        return Err(friendly_status(status, body));
    }

    let (notify, cancelled) = runs.register(&req.run_id);
    let mut stream = Box::pin(resp.bytes_stream());
    let mut buffer = String::new();
    let mut full = String::new();
    let mut usage_raw: Option<Value> = None;

    loop {
        if cancelled.load(Ordering::Relaxed) {
            break;
        }
        tokio::select! {
            biased;
            _ = notify.notified() => break,
            item = stream.next() => {
                let Some(item) = item else { break };
                let bytes = item.map_err(|e| friendly_reqwest(&e))?;
                buffer.push_str(&String::from_utf8_lossy(&bytes));
                while let Some(nl) = buffer.find('\n') {
                    let line: String = buffer[..nl].trim().to_string();
                    buffer.drain(..=nl);
                    let Some(data) = line.strip_prefix("data:") else { continue };
                    let data = data.trim();
                    if data == "[DONE]" { continue; }
                    if let Ok(v) = serde_json::from_str::<Value>(data) {
                        if let Some(delta) = v["choices"][0]["delta"]["content"].as_str() {
                            if !delta.is_empty() {
                                full.push_str(delta);
                                emit_chunk(app, &req.run_id, delta);
                            }
                        }
                        if !v["usage"].is_null() { usage_raw = Some(v["usage"].clone()); }
                    }
                }
            }
        }
    }

    let in_tok = usage_raw.as_ref().and_then(|u| u["prompt_tokens"].as_f64()).unwrap_or(0.0);
    let out_tok = usage_raw.as_ref().and_then(|u| u["completion_tokens"].as_f64()).unwrap_or(0.0);
    let (in_rate, out_rate) = pricing(&req.model);
    emit_done(app, &req.run_id, &full, json!({
        "inputTokens": in_tok,
        "outputTokens": out_tok,
        "cachedTokens": 0,
        "costUsd": (in_tok * in_rate + out_tok * out_rate) / 1e6
    }));
    Ok(())
}

async fn run_anthropic(app: &AppHandle, req: &AiRequest, key: &str, runs: &AiRuns) -> Result<(), String> {
    let base = resolve_base_url("anthropic", "");
    let corpus = corpus_for(req);
    let mut messages = Vec::new();
    if !corpus.trim().is_empty() {
        messages.push(json!({
            "role": "user",
            "content": [
                { "type": "text", "text": corpus, "cache_control": { "type": "ephemeral" } },
                { "type": "text", "text": "The text above is the source material for this conversation. Base your answers on it." }
            ]
        }));
        messages.push(json!({ "role": "assistant", "content": "Understood - what would you like to know?" }));
    }
    messages.extend(build_convo(req));

    let mut body = json!({
        "model": req.model,
        "max_tokens": max_tokens_for(&req.action),
        "system": SYSTEM_PROMPT,
        "messages": messages,
        "stream": true
    });
    if claude_supports_adaptive_thinking(&req.model) {
        body["thinking"] = json!({ "type": "adaptive" });
    }

    let resp = http_client()?
        .post(format!("{base}/messages"))
        .header("content-type", "application/json")
        .header("x-api-key", key)
        .header("anthropic-version", "2023-06-01")
        .json(&body)
        .send()
        .await
        .map_err(|e| friendly_reqwest(&e))?;
    if resp.status().is_redirection() {
        return Err("The AI endpoint attempted a redirect, which is not allowed for security.".into());
    }
    if !resp.status().is_success() {
        let status = resp.status().as_u16();
        let body = resp.text().await.ok();
        return Err(friendly_status(status, body));
    }

    let (notify, cancelled) = runs.register(&req.run_id);
    let mut stream = Box::pin(resp.bytes_stream());
    let mut buffer = String::new();
    let mut full = String::new();
    let mut in_tok = 0.0f64;
    let mut cached = 0.0f64;
    let mut out_tok = 0.0f64;

    loop {
        if cancelled.load(Ordering::Relaxed) {
            break;
        }
        tokio::select! {
            biased;
            _ = notify.notified() => break,
            item = stream.next() => {
                let Some(item) = item else { break };
                let bytes = item.map_err(|e| friendly_reqwest(&e))?;
                buffer.push_str(&String::from_utf8_lossy(&bytes));
                while let Some(nl) = buffer.find('\n') {
                    let line: String = buffer[..nl].trim().to_string();
                    buffer.drain(..=nl);
                    let Some(data) = line.strip_prefix("data:") else { continue };
                    let data = data.trim();
                    if data.is_empty() { continue; }
                    if let Ok(v) = serde_json::from_str::<Value>(data) {
                        match v["type"].as_str() {
                            Some("content_block_delta") => {
                                if let Some(t) = v["delta"]["text"].as_str() {
                                    if !t.is_empty() {
                                        full.push_str(t);
                                        emit_chunk(app, &req.run_id, t);
                                    }
                                }
                            }
                            Some("message_start") => {
                                let u = &v["message"]["usage"];
                                in_tok = u["input_tokens"].as_f64().unwrap_or(0.0);
                                cached = u["cache_read_input_tokens"].as_f64().unwrap_or(0.0);
                            }
                            Some("message_delta") => {
                                if let Some(o) = v["usage"]["output_tokens"].as_f64() {
                                    out_tok = o;
                                }
                            }
                            _ => {}
                        }
                    }
                }
            }
        }
    }

    let (in_rate, out_rate) = pricing(&req.model);
    emit_done(app, &req.run_id, &full, json!({
        "inputTokens": in_tok,
        "outputTokens": out_tok,
        "cachedTokens": cached,
        "costUsd": (in_tok * in_rate + cached * in_rate * 0.1 + out_tok * out_rate) / 1e6
    }));
    Ok(())
}

/// Entry point for the ai_run command. Always resolves Ok; failures are surfaced as ai:event
/// 'error' events (matching the Electron handler, which never throws to the renderer).
pub async fn run(app: AppHandle, request: Value, runs: AiRuns) -> Result<(), String> {
    let req: AiRequest = serde_json::from_value(request).map_err(|e| e.to_string())?;
    let key = if req.provider == "ollama" {
        String::new()
    } else {
        get_key(&req.provider).unwrap_or_default()
    };
    if req.provider != "ollama" && key.is_empty() {
        emit_error(&app, &req.run_id, "No API key set for this provider.");
        return Ok(());
    }
    let result = if req.provider == "anthropic" {
        run_anthropic(&app, &req, &key, &runs).await
    } else {
        run_openai(&app, &req, &key, &runs).await
    };
    runs.finish(&req.run_id);
    if let Err(e) = result {
        emit_error(&app, &req.run_id, &e);
    }
    Ok(())
}

// ── Model lists (mirror of ai-models.ts + listModels) ───────────────────────
fn model_cache() -> &'static Mutex<HashMap<String, Vec<String>>> {
    static CACHE: OnceLock<Mutex<HashMap<String, Vec<String>>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}
fn clear_model_cache(provider: &str) {
    model_cache().lock().unwrap().remove(provider);
}

fn fallback_models(provider: &str) -> Vec<String> {
    match provider {
        "anthropic" => vec!["claude-opus-4-7".into(), "claude-sonnet-4-6".into(), "claude-haiku-4-5".into()],
        "openai" => vec!["gpt-4o".into(), "gpt-4o-mini".into(), "gpt-4.1".into(), "gpt-4.1-mini".into(), "o4-mini".into()],
        _ => vec![],
    }
}

fn ids_from(json: &Value) -> Vec<String> {
    json["data"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|m| m["id"].as_str())
                .filter(|s| !s.is_empty())
                .map(|s| s.to_string())
                .collect()
        })
        .unwrap_or_default()
}

pub fn parse_openai_models(json: &Value) -> Vec<String> {
    static CHAT: OnceLock<regex::Regex> = OnceLock::new();
    static EXCLUDE: OnceLock<regex::Regex> = OnceLock::new();
    let chat = CHAT.get_or_init(|| regex::Regex::new(r"(?i)^(gpt-|o\d|chatgpt)").unwrap());
    let exclude = EXCLUDE.get_or_init(|| {
        regex::Regex::new(r"(?i)(embedding|whisper|tts|audio|realtime|image|dall-?e|moderation|transcribe|search|davinci|babbage|ada|curie)").unwrap()
    });
    let mut ids: Vec<String> = ids_from(json)
        .into_iter()
        .filter(|id| chat.is_match(id) && !exclude.is_match(id))
        .collect();
    ids.sort();
    ids.dedup();
    ids.reverse(); // newest-first (descending), approximating the JS numeric localeCompare
    ids
}

pub fn parse_anthropic_models(json: &Value) -> Vec<String> {
    let mut ids = ids_from(json);
    let mut seen = std::collections::HashSet::new();
    ids.retain(|id| seen.insert(id.clone())); // dedup, preserve order (already newest-first)
    ids
}

pub async fn list_models(provider: &str, base_url: Option<&str>, refresh: bool) -> Vec<String> {
    if provider == "ollama" {
        let root = resolve_base_url("ollama", base_url.unwrap_or("")).replace("/v1", "");
        let Ok(client) = http_client() else { return vec![] };
        match client.get(format!("{root}/api/tags")).send().await {
            Ok(resp) if resp.status().is_success() => {
                let json: Value = resp.json().await.unwrap_or(json!({}));
                return json["models"]
                    .as_array()
                    .map(|a| a.iter().filter_map(|m| m["name"].as_str().map(String::from)).collect())
                    .unwrap_or_default();
            }
            _ => return vec![],
        }
    }
    if provider == "custom" {
        return vec![];
    }
    if !refresh {
        if let Some(cached) = model_cache().lock().unwrap().get(provider) {
            if !cached.is_empty() {
                return cached.clone();
            }
        }
    }
    let Some(key) = get_key(provider) else {
        return fallback_models(provider);
    };
    let live = if provider == "openai" {
        fetch_openai_models(&key).await
    } else {
        fetch_anthropic_models(&key).await
    };
    if !live.is_empty() {
        model_cache().lock().unwrap().insert(provider.to_string(), live.clone());
        live
    } else {
        fallback_models(provider)
    }
}

async fn fetch_openai_models(key: &str) -> Vec<String> {
    let Ok(client) = http_client() else { return vec![] };
    match client
        .get(format!("{}/models", resolve_base_url("openai", "")))
        .bearer_auth(key)
        .send()
        .await
    {
        Ok(resp) if resp.status().is_success() => parse_openai_models(&resp.json().await.unwrap_or(json!({}))),
        _ => vec![],
    }
}

async fn fetch_anthropic_models(key: &str) -> Vec<String> {
    let Ok(client) = http_client() else { return vec![] };
    match client
        .get(format!("{}/models?limit=1000", resolve_base_url("anthropic", "")))
        .header("x-api-key", key)
        .header("anthropic-version", "2023-06-01")
        .send()
        .await
    {
        Ok(resp) if resp.status().is_success() => parse_anthropic_models(&resp.json().await.unwrap_or(json!({}))),
        _ => vec![],
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ssrf_pins_openai_and_anthropic() {
        // A malicious base URL must be ignored for the pinned providers.
        assert_eq!(resolve_base_url("openai", "http://evil.example.com"), "https://api.openai.com/v1");
        assert_eq!(resolve_base_url("anthropic", "http://evil.example.com"), "https://api.anthropic.com/v1");
    }

    #[test]
    fn ssrf_honors_ollama_and_custom() {
        assert_eq!(resolve_base_url("ollama", ""), "http://localhost:11434/v1");
        assert_eq!(resolve_base_url("ollama", "http://host:1234/v1/"), "http://host:1234/v1");
        assert_eq!(resolve_base_url("custom", "https://proxy.local/v1/"), "https://proxy.local/v1");
        assert_eq!(resolve_base_url("custom", ""), "");
    }

    #[test]
    fn openai_model_parse_filters_and_dedups() {
        let json = json!({ "data": [
            { "id": "gpt-4o" }, { "id": "gpt-4o" }, { "id": "o4-mini" },
            { "id": "text-embedding-3-small" }, { "id": "dall-e-3" }, { "id": "whisper-1" },
            { "id": "chatgpt-4o-latest" }, { "id": "davinci-002" }
        ]});
        let models = parse_openai_models(&json);
        assert!(models.contains(&"gpt-4o".to_string()));
        assert!(models.contains(&"o4-mini".to_string()));
        assert!(models.contains(&"chatgpt-4o-latest".to_string()));
        assert!(!models.iter().any(|m| m.contains("embedding")));
        assert!(!models.iter().any(|m| m.contains("dall")));
        assert!(!models.iter().any(|m| m.contains("whisper")));
        assert!(!models.iter().any(|m| m.contains("davinci")));
        // deduped
        assert_eq!(models.iter().filter(|m| *m == "gpt-4o").count(), 1);
    }

    #[test]
    fn anthropic_model_parse_dedups_preserving_order() {
        let json = json!({ "data": [ { "id": "claude-opus-4-7" }, { "id": "claude-sonnet-4-6" }, { "id": "claude-opus-4-7" } ]});
        let models = parse_anthropic_models(&json);
        assert_eq!(models, vec!["claude-opus-4-7", "claude-sonnet-4-6"]);
    }

    #[test]
    fn friendly_status_maps_known_codes() {
        assert!(friendly_status(401, None).contains("rejected"));
        assert!(friendly_status(429, None).contains("Rate limited"));
        assert!(friendly_status(404, None).contains("unavailable"));
        assert!(friendly_status(503, None).contains("service issue"));
    }

    #[test]
    fn max_tokens_long_vs_short() {
        assert_eq!(max_tokens_for("readme"), 8192);
        assert_eq!(max_tokens_for("translate"), 8192);
        assert_eq!(max_tokens_for("ask"), 4096);
        assert_eq!(max_tokens_for("summarize"), 4096);
    }

    #[test]
    fn adaptive_thinking_only_for_claude_4plus() {
        assert!(claude_supports_adaptive_thinking("claude-opus-4-7"));
        assert!(claude_supports_adaptive_thinking("claude-sonnet-4-6"));
        assert!(!claude_supports_adaptive_thinking("claude-3-opus"));
        assert!(!claude_supports_adaptive_thinking("gpt-4o"));
    }

    // Touches the real OS credential store, so it is #[ignore]'d (not run in CI). Run locally with
    // `cargo test --lib -- --ignored keyring_roundtrip` to confirm the secret-store path works on a
    // given machine. Uses a throwaway provider name so it can never clobber a real provider key.
    #[test]
    #[ignore]
    fn keyring_roundtrip() {
        let p = "__test_provider__";
        assert!(keyring_available(), "OS secret store should be available");
        let _ = clear_key(p);
        assert!(!is_configured(p), "should start unconfigured");
        set_key(p, "secret-test-value").expect("set_key should succeed");
        assert!(is_configured(p), "should be configured after set");
        assert_eq!(get_key(p).as_deref(), Some("secret-test-value"));
        // setting empty clears it
        set_key(p, "").expect("clear via empty should succeed");
        assert!(!is_configured(p), "empty set should clear the key");
        // explicit clear is idempotent
        clear_key(p);
        assert!(get_key(p).is_none());
    }

    #[test]
    fn instruction_includes_question_and_titles() {
        let mut req = AiRequest {
            run_id: "r".into(), action: "ask".into(), provider: "anthropic".into(), model: "m".into(),
            base_url: None, doc: String::new(), question: Some("What is X?".into()), selection: None,
            history: None, context: None, titles: None, repurpose_format: None, write_mode: None,
            language: None, tone: None, diagram_kind: None,
        };
        assert!(instruction_for(&req).contains("What is X?"));
        req.action = "organize".into();
        req.titles = Some(vec!["Note A".into(), "Note B".into()]);
        assert!(instruction_for(&req).contains("Note A | Note B"));
    }
}
