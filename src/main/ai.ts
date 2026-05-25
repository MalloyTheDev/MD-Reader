import { ipcMain, safeStorage } from 'electron'
import Anthropic from '@anthropic-ai/sdk'
import * as store from './store'
import type { AiProvider, AiRequest, AiUsage, RepurposeFormat, WriteMode } from '../shared/types'
import { resolveBaseUrl } from '../shared/ai-endpoints'

const MAX_DOC_CHARS = 600_000

const PRESET_MODELS: Record<AiProvider, string[]> = {
  anthropic: ['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5'],
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini', 'o4-mini'],
  ollama: [],
  custom: []
}

// $/1M tokens (input, output). Only used where we know the rates; others show tokens only.
const PRICING: Record<string, [number, number]> = {
  'claude-opus-4-7': [5, 25],
  'claude-sonnet-4-6': [3, 15],
  'claude-haiku-4-5': [1, 5],
  'gpt-4o': [2.5, 10],
  'gpt-4o-mini': [0.15, 0.6],
  'gpt-4.1': [2, 8],
  'gpt-4.1-mini': [0.4, 1.6],
  'o4-mini': [1.1, 4.4]
}

const active = new Map<string, { abort: () => void }>()

function encryptionAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

async function setKey(provider: AiProvider, plain: string): Promise<void> {
  if (!plain) {
    await store.setAiKeyBlob(provider, null)
    return
  }
  if (!encryptionAvailable()) {
    throw new Error(
      'Secure key storage is not available on this system; refusing to store the key in plaintext.'
    )
  }
  await store.setAiKeyBlob(provider, 'enc:' + safeStorage.encryptString(plain).toString('base64'))
}

async function getKey(provider: AiProvider): Promise<string | null> {
  const blob = await store.getAiKeyBlob(provider)
  if (!blob || !blob.startsWith('enc:')) return null
  try {
    return safeStorage.decryptString(Buffer.from(blob.slice(4), 'base64'))
  } catch {
    return null
  }
}

// SSRF pin lives in the shared, unit-tested resolveBaseUrl (src/shared/ai-endpoints.ts).
const baseUrlFor = resolveBaseUrl

function instructionFor(req: AiRequest): string {
  switch (req.action) {
    case 'summarize':
      return 'Summarize the document above in a few clear paragraphs, then list the key takeaways as concise bullet points.'
    case 'ask':
    case 'library':
      return `Answer this question using primarily the source material above. If it is not covered, say so briefly.\n\nQuestion: ${req.question ?? ''}`
    case 'explain':
      return `Explain the following excerpt in simple, clear terms. Define any jargon.\n\n"""${req.selection ?? ''}"""`
    case 'flashcards':
      return 'Create 6-10 study flashcards from the document above. Respond with ONLY a JSON array of objects shaped {"q": "question", "a": "answer"} — no prose, no code fences.'
    case 'studyguide':
      return 'Create a structured study guide for the document above: key concepts, definitions, and a few review questions. Use Markdown headings and bullet points.'
    case 'quiz':
      return 'Write a 5-question quiz based on the document above (mix of multiple-choice and short-answer), then an answer key at the end. Use Markdown.'
    case 'suggestlinks':
      return `From the document above, suggest cross-links to related notes. Available note titles: ${(req.titles ?? []).join(' | ')}. Recommend 3-8 as a Markdown list, each formatted "[[Title]] — one-line reason". Only use titles from the list.`
    case 'keyterms':
      return 'Extract the key terms and vocabulary from the document above. Return a Markdown list where each item is "**term** — a concise definition".'
    case 'eli5':
      return 'Explain the document above simply, as if to a curious beginner (ELI5). Use short paragraphs, plain language, and a helpful analogy where it fits.'
    case 'critique':
      return 'Critically analyze the document above. Cover its key claims, possible weaknesses or counter-arguments, and open questions. Use Markdown bullet points grouped under short headings.'
    case 'repurpose':
      return repurposeInstruction(req.repurposeFormat ?? 'onepager')
    case 'write':
      return writeInstruction(req.writeMode ?? 'rewrite', req.selection ?? '')
    case 'organize':
      return `Analyze the document above and suggest organization metadata. Respond with ONLY a JSON object shaped {"title": "A concise descriptive title", "tags": ["tag1", "tag2"], "links": ["Existing Note Title"]} — no prose, no code fences. Choose 3-6 short lowercase tags. For "links", recommend up to 5 related notes, using ONLY titles from this list (omit if none fit): ${(req.titles ?? []).join(' | ')}.`
    case 'courseoutline':
      return `You are designing a focused self-study course on the topic: "${req.question ?? ''}". Respond with ONLY a JSON object shaped {"title": "Course Title", "lessons": [{"title": "Lesson title", "summary": "one-sentence description"}]} containing 4-7 lessons that build progressively — no prose, no code fences.`
    case 'courselesson':
      return `Write a clear, self-contained lesson for a self-study course on "${req.question ?? ''}". The lesson to write is: ${req.selection ?? ''}\n\nUse Markdown: start with a single "# " heading for the lesson title, then short explanatory sections, concrete examples, and end with a brief "## Key points" bullet list. Do not include quiz questions.`
    case 'readme':
      return 'You are writing a README.md for the software project whose source code is provided above. Study the code, dependencies, and structure, then produce a complete, professional README in Markdown with: a project title and one-line description, a short overview, key features (bullets), tech stack, installation steps, usage examples, an overview of the project structure, and a License section. Infer details from the actual code; do not invent features that are not present. Output only the README Markdown.'
  }
}

function repurposeInstruction(format: RepurposeFormat): string {
  switch (format) {
    case 'onepager':
      return 'Repurpose the document above into a polished one-page marketing sheet. Include a punchy headline, a one-line tagline, 3-5 key value propositions as bullets, a short "Why it matters" paragraph, and a closing call to action. Use Markdown.'
    case 'blog':
      return 'Rewrite the document above as an engaging blog post for a general audience. Open with a hook, use clear section headings, keep paragraphs short and lively, and end with a takeaway. Use Markdown.'
    case 'exec':
      return 'Distill the document above into a concise executive summary. Use short sections: Overview, Key Points (bullets), Risks/Considerations, and Recommended Next Steps. Keep it tight and decision-focused. Use Markdown.'
    case 'slides':
      return 'Turn the document above into a presentation deck. Separate each slide with a line containing only "---". Start with a title slide. Each subsequent slide should have a short "## " heading and a few concise bullet points. Aim for 6-12 slides.'
    case 'lesson':
      return 'Turn the document above into a teaching lesson plan. Include: Learning objectives, Prerequisites, a step-by-step Lesson outline with short explanations, a worked Example, and a few Review questions. Use Markdown headings and bullets.'
  }
}

function writeInstruction(mode: WriteMode, selection: string): string {
  const target = `\n\n"""${selection}"""`
  switch (mode) {
    case 'rewrite':
      return `Rewrite the text below to improve clarity, flow, and word choice while preserving its meaning and any Markdown formatting. Return ONLY the rewritten text — no preamble, no quotes, no explanation.${target}`
    case 'expand':
      return `Expand the text below with more detail, supporting points, and a concrete example where helpful, matching the original tone. Return ONLY the expanded text — no preamble, no quotes, no explanation.${target}`
    case 'grammar':
      return `Correct any spelling, grammar, and punctuation mistakes in the text below. Preserve the meaning, voice, and Markdown formatting. Return ONLY the corrected text — no preamble, no quotes, no explanation.${target}`
    case 'continue':
      return `Continue writing naturally from where the text below ends, matching its tone, style, and formatting. Return ONLY the new continuation text — do not repeat the existing text, and add no preamble or explanation.${target}`
  }
}

const SYSTEM_PROMPT =
  'You are a focused study assistant for a Markdown reading app. Be accurate and concise, and format answers in Markdown.'

function friendlyError(err: unknown): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const status = (err as any)?.status as number | undefined
  if (status === 401 || status === 403)
    return 'Your API key was rejected. Check that it is valid and has access.'
  if (status === 429) return 'Rate limited — wait a moment and try again.'
  if (status === 500 || status === 529)
    return 'The provider had a service issue — please try again.'
  const msg = err instanceof Error ? err.message : String(err)
  if (/fetch failed|ECONNREFUSED|ENOTFOUND/i.test(msg))
    return 'Could not reach the AI endpoint. Check the base URL (and that Ollama/your server is running).'
  return msg
}

interface SendEvent {
  (ev: { runId: string; kind: string; text?: string; error?: string; usage?: AiUsage }): void
}

function buildConvo(req: AiRequest): { role: 'user' | 'assistant'; content: string }[] {
  return req.history && req.history.length > 0
    ? req.history.map((t) => ({ role: t.role, content: t.text }))
    : [{ role: 'user' as const, content: instructionFor(req) }]
}

async function runAnthropic(req: AiRequest, send: SendEvent, key: string): Promise<void> {
  const corpus = (req.action === 'library' ? (req.context ?? '') : req.doc).slice(0, MAX_DOC_CHARS)
  const client = new Anthropic({ apiKey: key })
  // Topic-based actions (e.g. course generation) have no source doc — skip the cached
  // source block entirely so we don't send an empty text block to the API.
  const sourceFraming = corpus.trim()
    ? [
        {
          role: 'user' as const,
          content: [
            { type: 'text' as const, text: corpus, cache_control: { type: 'ephemeral' as const } },
            {
              type: 'text' as const,
              text: 'The text above is the source material for this conversation. Base your answers on it.'
            }
          ]
        },
        { role: 'assistant' as const, content: 'Understood — what would you like to know?' }
      ]
    : []
  const stream = client.messages.stream({
    model: req.model,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [...sourceFraming, ...buildConvo(req)]
  })
  active.set(req.runId, { abort: () => stream.abort() })
  stream.on('text', (t: string) => send({ runId: req.runId, kind: 'chunk', text: t }))
  const final = await stream.finalMessage()
  const full = final.content.map((b) => (b.type === 'text' ? b.text : '')).join('')
  const [inRate, outRate] = PRICING[req.model] ?? [0, 0]
  const u = final.usage
  const cached = u.cache_read_input_tokens ?? 0
  send({
    runId: req.runId,
    kind: 'done',
    text: full,
    usage: {
      inputTokens: u.input_tokens,
      outputTokens: u.output_tokens,
      cachedTokens: cached,
      costUsd: (u.input_tokens * inRate + cached * inRate * 0.1 + u.output_tokens * outRate) / 1e6
    }
  })
}

async function runOpenAICompatible(req: AiRequest, send: SendEvent, key: string): Promise<void> {
  const base = baseUrlFor(req.provider, req.baseUrl)
  if (!base) throw new Error('No base URL configured for this provider.')
  const corpus = (req.action === 'library' ? (req.context ?? '') : req.doc).slice(0, MAX_DOC_CHARS)
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...(corpus.trim()
      ? [
          {
            role: 'user',
            content:
              corpus +
              '\n\n---\nThe text above is the source material for this conversation. Base your answers on it.'
          },
          { role: 'assistant', content: 'Understood — what would you like to know?' }
        ]
      : []),
    ...buildConvo(req)
  ]
  const controller = new AbortController()
  active.set(req.runId, { abort: () => controller.abort() })
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (key) headers['Authorization'] = `Bearer ${key}`
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers,
    signal: controller.signal,
    // Never auto-follow a redirect: it could bounce the key-bearing request to another host.
    redirect: 'manual',
    body: JSON.stringify({
      model: req.model,
      messages,
      stream: true,
      ...(req.provider === 'openai' ? { stream_options: { include_usage: true } } : {})
    })
  })
  if (res.type === 'opaqueredirect' || (res.status >= 300 && res.status < 400)) {
    throw new Error('The AI endpoint attempted a redirect, which is not allowed for security.')
  }
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => '')
    const e = new Error(detail || `HTTP ${res.status}`) as Error & { status?: number }
    e.status = res.status
    throw e
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let full = ''
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let usageRaw: any = null
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let nl: number
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim()
      buffer = buffer.slice(nl + 1)
      if (!line.startsWith('data:')) continue
      const data = line.slice(5).trim()
      if (data === '[DONE]') continue
      try {
        const json = JSON.parse(data)
        const delta = json.choices?.[0]?.delta?.content
        if (typeof delta === 'string' && delta) {
          full += delta
          send({ runId: req.runId, kind: 'chunk', text: delta })
        }
        if (json.usage) usageRaw = json.usage
      } catch {
        /* ignore keep-alive / partial lines */
      }
    }
  }
  const inTok = usageRaw?.prompt_tokens ?? 0
  const outTok = usageRaw?.completion_tokens ?? 0
  const [inRate, outRate] = PRICING[req.model] ?? [0, 0]
  send({
    runId: req.runId,
    kind: 'done',
    text: full,
    usage: {
      inputTokens: inTok,
      outputTokens: outTok,
      cachedTokens: 0,
      costUsd: (inTok * inRate + outTok * outRate) / 1e6
    }
  })
}

async function listModels(provider: AiProvider, baseUrl?: string): Promise<string[]> {
  if (provider !== 'ollama') return PRESET_MODELS[provider]
  try {
    const root = baseUrlFor('ollama', baseUrl).replace(/\/v1$/, '')
    const res = await fetch(`${root}/api/tags`)
    if (!res.ok) return []
    const json = await res.json()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return Array.isArray(json?.models) ? json.models.map((m: any) => m.name as string) : []
  } catch {
    return []
  }
}

export function registerAiIpc(): void {
  ipcMain.handle('ai:status', async (_e, provider: AiProvider) => ({
    available: encryptionAvailable(),
    configured: provider === 'ollama' ? true : !!(await store.getAiKeyBlob(provider))
  }))

  ipcMain.handle('ai:setKey', async (_e, provider: AiProvider, key: string) => {
    try {
      await setKey(provider, key)
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle('ai:clearKey', async (_e, provider: AiProvider) => {
    await store.setAiKeyBlob(provider, null)
  })

  ipcMain.handle('ai:listModels', (_e, provider: AiProvider, baseUrl?: string) =>
    listModels(provider, baseUrl)
  )

  ipcMain.handle('ai:cancel', (_e, runId: string) => {
    active.get(runId)?.abort()
  })

  ipcMain.handle('ai:run', async (e, req: AiRequest) => {
    const send: SendEvent = (ev) => {
      if (!e.sender.isDestroyed()) e.sender.send('ai:event', ev)
    }
    try {
      const key = req.provider === 'ollama' ? '' : ((await getKey(req.provider)) ?? '')
      if (req.provider !== 'ollama' && !key) {
        send({ runId: req.runId, kind: 'error', error: 'No API key set for this provider.' })
        return
      }
      if (req.provider === 'anthropic') await runAnthropic(req, send, key)
      else await runOpenAICompatible(req, send, key)
    } catch (err) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const name = (err as any)?.name
      if (name === 'APIUserAbortError' || name === 'AbortError') {
        send({ runId: req.runId, kind: 'done' })
      } else {
        send({ runId: req.runId, kind: 'error', error: friendlyError(err) })
      }
    } finally {
      active.delete(req.runId)
    }
  })
}
