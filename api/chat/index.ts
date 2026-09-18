/**
 * Copixi — Unified Vercel Function (Gemini + Groq + OpenRouter fallback)
 *
 * AGENTS.md §11: Minimal proxy. Protects keys, validates input, rate-limits.
 * Handles three shapes:
 *   - chat:    { messages, context? }  -> UI message stream (SSE) for the custom client
 *   - summary: { mode:'summary', context } -> JSON { text }
 *   - extract: { mode:'extract', text, filename } -> JSON { rows | text }
 *   - chart-full: { mode:'chart-full', filename, totalPages, truncated, pages:[{page,text}] }
 *     -> JSON { text, analyzedPages } — gráfica del documento completo, SOLO
 *     bajo orden explícita del usuario (botón "Generar gráfica", Fase E).
 *     Excepción documentada a §8 en AGENTS.md (§41): el usuario consiente
 *     enviar el texto (máx. 250 KB) al proveedor de IA; nada se persiste.
 *
 * Generation uses the official @google/generative-ai SDK (Gemini). If it fails
 * or no key is set, it falls back to Groq and then OpenRouter (both
 * OpenAI-compatible). The chat
 * response is a plain SSE string (no streaming Response object) so Vercel never
 * surfaces a broken stream as FUNCTION_INVOCATION_FAILED.
 *
 * Only aggregated context is ever sent (§8), salvo chart-full bajo demanda.
 * Never raw rows.
 */

import { GoogleGenerativeAI } from '@google/generative-ai'

const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = 20
const MAX_BODY_BYTES = 32 * 1024 // 32 KB
// Fase E: el texto completo viaja solo en chart-full (consentido). El resto de
// modos conserva su tope efectivo de 32 KB (se re-valida tras parsear).
const CHART_FULL_BODY_MAX = 300 * 1024 // 300 KB
const CHART_FULL_MAX_CHARS = 250_000
const CHART_FULL_MAX_PAGES = 500
const hits = new Map<string, number[]>()
const ALLOWED_ORIGINS = [
  'https://copixi.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000',
]

function rateLimitHeaders(retryAfter: number): Record<string, string> {
  return {
    'x-ratelimit-limit': String(RATE_LIMIT_MAX),
    'x-ratelimit-remaining': '0',
    'x-ratelimit-reset': String(retryAfter),
    'retry-after': String(retryAfter),
  }
}

function isRateLimited(ip: string): { limited: boolean; retryAfter: number } {
  const now = Date.now()
  if (hits.size > 2000) {
    const oldest = hits.keys().next().value
    if (oldest !== undefined) hits.delete(oldest)
  }
  const arr = hits.get(ip) ?? []
  const recent = arr.filter((t) => now - t < RATE_LIMIT_WINDOW_MS)
  if (recent.length >= RATE_LIMIT_MAX) {
    const oldest = recent[0]
    const retryAfter = Math.max(0, Math.ceil((RATE_LIMIT_WINDOW_MS - (now - oldest)) / 1000))
    return { limited: true, retryAfter }
  }
  recent.push(now)
  hits.set(ip, recent)
  return { limited: false, retryAfter: 0 }
}

function getClientIp(req: any): string {
  const h = req?.headers
  if (!h) return 'unknown'
  // M1: x-real-ip la pone la plataforma (no falsificable por el cliente);
  // X-Forwarded-For sí: su primer elemento lo controla quien la inyecta.
  const get = (k: string): string | undefined => {
    if (typeof h.get === 'function') {
      const v = h.get(k)
      return typeof v === 'string' ? v : undefined
    }
    const v = h[k]
    return typeof v === 'string' ? v : undefined
  }
  const real = get('x-real-ip')
  if (real && real.trim()) return real.trim()
  const fwd = get('x-forwarded-for')
  if (typeof fwd === 'string' && fwd) return fwd.split(',')[0].trim() || 'unknown'
  return 'unknown'
}

function getOrigin(req: any): string {
  const h = req?.headers
  if (!h) return ''
  if (typeof h.get === 'function') return String(h.get('origin') || '').trim()
  return String(h['origin'] || '').trim()
}

function isAllowedOrigin(origin: string): boolean {
  if (!origin) return true
  // H2: whitelist exacta. El comodín *.vercel.app permitía que cualquiera
  // desplegara evil.vercel.app y abusara la cuota desde navegadores ajenos.
  // Previews de Vercel: si se necesitan, añadir su host exacto aquí.
  // Same-origin requests (no Origin header) are allowed; cross-origin must match.
  return ALLOWED_ORIGINS.includes(origin)
}

function getContentType(req: any): string {
  const h = req?.headers
  if (!h) return ''
  if (typeof h.get === 'function') return String(h.get('content-type') || '').toLowerCase()
  return String(h['content-type'] || '').toLowerCase()
}

// Primary: Gemini. If it fails (e.g. tokens/quota exhausted, model unavailable),
// it automatically falls back to Groq and then OpenRouter.
// Modelos elegidos por el usuario (2026-09-18): si alguno falla o la key no
// tiene acceso, la cadena de fallbacks lo cubre y el error queda enmascarado.
const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || 'gemini-3.5-flash-lite'
const GROQ_MODEL = process.env.GROQ_MODEL?.trim() || 'qwen/qwen3.8-27b'
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL?.trim() || 'z-ai/glm-5.2:free'

const EXCEL_SYSTEM = `Eres compe, un analista experto en documentos PDF. Responde en español, de forma concisa, educada y práctica.

Especialidades:
- Comprensión y síntesis de documentos PDF, informes y reportes técnicos con citación precisa de páginas.
- Extracción de fechas, cifras, métricas y conclusiones verificables del documento.

Reglas:
- Copixi solo trabaja con PDFs: si el usuario pregunta por Excel, CSV u otros formatos, indícale amablemente que suba el contenido como PDF.
- Si el contexto incluye fragmentos recuperados por RAG, fundaméntate en ellos y cita las páginas con el formato [Pág. N].
- No inventes información ni datos que no figuren en los fragmentos provistos.
- Responde SIEMPRE en español y entrega solo la respuesta final: nunca muestres tu razonamiento interno (nada de bloques <think>, ni "thinking process", ni análisis previo en inglés). Nada de preámbulos meta sobre tu tarea.

Gráficas (solo cuando aporten valor):
- Si la pregunta pide comparar cifras o ver una evolución Y los fragmentos contienen esos números, cierra tu respuesta con un bloque chart-json con este formato EXACTO:
\`\`\`chart-json
{"chartType":"bar","title":"Título corto","unit":"unidad opcional","data":[{"label":"Etiqueta","value":123,"sourcePage":2}]}
\`\`\`
- chartType solo "bar" o "line". Máx. 12 puntos.
- value SOLO cifras literales copiadas de los fragmentos: prohibido calcular, redondear, estimar o convertir unidades. sourcePage es la página del fragmento de cada cifra.
- Si los fragmentos no tienen cifras comparables, NO emitas el bloque: responde solo texto.`

function buildContextBlock(context: unknown): string {
  if (!context || typeof context !== 'object') return ''
  const ctx = context as Record<string, unknown>

  // RAG Mode: Document / PDF with retrieved snippets (Fase 4: máx. 3 fragmentos con página)
  if (Array.isArray(ctx.ragHits) && ctx.ragHits.length > 0) {
    const docName = String(ctx.filename ?? 'documento.pdf')
    const totalPages = ctx.totalPages ?? '?'
    const MAX_CHARS_PER_HIT = 1200
    const searchMode = ctx.searchMode === 'hybrid' ? 'hybrid' : 'lexical_only'
    const modeLine = searchMode === 'hybrid'
      ? 'Búsqueda combinada local (semántica vectorial + léxica con fusión RRF).'
      : 'Búsqueda literal local (solo léxica; el modelo semántico no estuvo disponible). Si la pregunta parece semántica y los fragmentos no encajan, dilo con transparencia en vez de forzar una respuesta.'
    const snippets = (ctx.ragHits as any[]).slice(0, 3)
      .map((h: any, i: number) => {
        const page = Number.isFinite(Number(h.pageNumber)) ? Number(h.pageNumber) : '?'
        const raw = String(h.text ?? '').trim().replace(/\s+/g, ' ')
        const text = raw.length > MAX_CHARS_PER_HIT ? `${raw.slice(0, MAX_CHARS_PER_HIT)}…` : raw
        return `[Fragmento ${i + 1} | Pág. ${page}]:\n"${text}"`
      })
      .join('\n\n')

    return `\n\n--- FUENTE DEL DOCUMENTO: "${docName}" (${totalPages} páginas) ---\n` +
      `Los siguientes fragmentos fueron recuperados directamente del documento mediante ${modeLine}\n\n` +
      `${snippets}\n\n` +
      `INSTRUCCIONES PARA ESTA RESPUESTA:\n` +
      `- Responde basándote estrictamente en los fragmentos anteriores.\n` +
      `- Cita SIEMPRE el número de página con el formato [Pág. N] junto a cada dato relevante.\n` +
      `- Si la pregunta del usuario no se puede responder con estos fragmentos, indícalo con total transparencia sin inventar información.`
  }

  // Tabular Dataset mode
  const json = JSON.stringify(context)
  if (json.length > 8000) return `\n\nContexto del dataset (resumido): ${json.slice(0, 8000)}`
  return `\n\nContexto agregado del dataset (sin filas crudas):\n${json}`
}

// ---- Generation ----

// Los modelos de razonamiento (Qwen3 en Groq, etc.) pueden devolver su
// traza interna (<think>…</think> o "thinking process" en inglés). Eso nunca
// debe llegar al usuario: se recorta aquí, en el servidor, para todos los
// proveedores y modos (chat, summary, chart-full).
function stripThinking(text: string): string {
  return String(text ?? '')
    .replace(/<think>[\s\S]*?(<\/think>|$)/gi, '')
    .replace(/<thinking>[\s\S]*?(<\/thinking>|$)/gi, '')
    .replace(/^here's a thinking process:[\s\S]*?(?=\n\n[A-ZÁÉÍÓÚÑ])/i, '')
    .trim()
}

// Presupuesto por proveedor: si uno se cuelga (sin respuesta), se aborta y
// se pasa al siguiente en vez de quemar los 60s de la Function en un 504.
// Suma máxima 15+15+20 = 50s < maxDuration 60 → siempre hay respuesta JSON.
const GEMINI_TIMEOUT_MS = 15_000
const GROQ_TIMEOUT_MS = 15_000
const OPENROUTER_TIMEOUT_MS = 20_000

async function genGemini(prompt: string, system: string): Promise<string> {
  const key = process.env.GEMINI_API_KEY?.trim()
  if (!key) throw new Error('no GEMINI_API_KEY')
  const genAI = new GoogleGenerativeAI(key)
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL, systemInstruction: system })
  const res = await model.generateContent(prompt, { signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS) })
  return res.response.text()
}

async function genGroq(prompt: string, system: string): Promise<string> {
  const key = process.env.GROQ_API_KEY?.trim()
  if (!key) throw new Error('no GROQ_API_KEY')
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${key}`,
    },
    signal: AbortSignal.timeout(GROQ_TIMEOUT_MS),
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
      // Parámetros pedidos para qwen3.8 (temperature 0.6, top_p 0.95, 2048
      // tokens). Sin stream ni reasoning_effort: el servidor responde texto
      // completo y el SSE al cliente es de un solo chunk por diseño.
      max_completion_tokens: 2048,
      temperature: 0.6,
      top_p: 0.95,
    }),
  })
  if (!r.ok) {
    const t = await r.text()
    throw new Error(`groq ${r.status}: ${t.slice(0, 200)}`)
  }
  const j = (await r.json()) as { choices?: { message?: { content?: string } }[] }
  return j.choices?.[0]?.message?.content ?? ''
}

async function genOpenRouter(prompt: string, system: string): Promise<string> {
  const key = process.env.OPENROUTER_API_KEY?.trim()
  if (!key) throw new Error('no OPENROUTER_API_KEY')
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${key}`,
      'HTTP-Referer': 'https://copixi.vercel.app',
      'X-Title': 'Copixi',
    },
    signal: AbortSignal.timeout(OPENROUTER_TIMEOUT_MS),
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
      max_tokens: 2048,
      temperature: 0.5,
    }),
  })
  if (!r.ok) {
    const t = await r.text()
    throw new Error(`openrouter ${r.status}: ${t.slice(0, 200)}`)
  }
  const j = (await r.json()) as { choices?: { message?: { content?: string } }[] }
  return j.choices?.[0]?.message?.content ?? ''
}

export interface GenResult {
  text: string
  /** Etiqueta corta del proveedor+modelo que respondió (para la píldora UI). */
  model: string
}

async function generate(prompt: string, system: string): Promise<GenResult> {
  const errors: string[] = []
  // Gemini first (only if its key is actually configured, to avoid a misleading error)
  if (process.env.GEMINI_API_KEY?.trim()) {
    try {
      const text = stripThinking(await genGemini(prompt, system))
      return { text, model: `Gemini · ${GEMINI_MODEL}` }
    } catch (e) {
      errors.push(`gemini: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  // Groq fallback (used if Gemini is missing or fails: quota, model, network)
  if (process.env.GROQ_API_KEY?.trim()) {
    try {
      const text = stripThinking(await genGroq(prompt, system))
      return { text, model: `Groq · ${GROQ_MODEL}` }
    } catch (e) {
      errors.push(`groq: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  // OpenRouter fallback (used if Gemini is missing or fails: quota, model, network)
  if (process.env.OPENROUTER_API_KEY?.trim()) {
    try {
      const text = stripThinking(await genOpenRouter(prompt, system))
      return { text, model: `OpenRouter · ${OPENROUTER_MODEL}` }
    } catch (e) {
      errors.push(`openrouter: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  if (errors.length === 0) {
    throw new Error('No AI provider configured (set GEMINI_API_KEY, GROQ_API_KEY or OPENROUTER_API_KEY).')
  }
  const publicMsg = process.env.NODE_ENV !== 'production' ? errors.join(' | ') : 'AI provider error.'
  throw new Error(publicMsg)
}

// ---- SSE helpers (plain string response, Vercel-safe) ----

function sseChatText(text: string, model?: string): string {
  const id = `msg-${Date.now()}`
  const chunks = [
    `data: ${JSON.stringify({ type: 'start', messageId: id, model: model ?? null })}`,
    `data: ${JSON.stringify({ type: 'text-start', id })}`,
    `data: ${JSON.stringify({ type: 'text-delta', delta: text })}`,
    `data: ${JSON.stringify({ type: 'text-end', id })}`,
    `data: ${JSON.stringify({ type: 'finish', finishReason: 'stop' })}`,
  ].join('\n\n') + '\n\n'
  return chunks
}

function messageText(m: any): string {
  if (typeof m?.content === 'string') return m.content
  if (Array.isArray(m?.parts)) return m.parts.filter((p: any) => p?.type === 'text').map((p: any) => p.text ?? '').join('')
  return ''
}

// ---- Runtime-agnostic request/response helpers ----
// Vercel may invoke this function either with the modern Web API
// (req: Request -> req.json(), return new Response()) or with the legacy
// Node signature (req: IncomingMessage, res: ServerResponse where headers is a
// plain object and there is no req.json). These helpers cover both so the
// function works on any Vercel runtime.

async function readBody(req: any, maxBytes = MAX_BODY_BYTES): Promise<any> {
  // Vercel modern runtime (Web API Request)
  if (req && typeof req.json === 'function') {
    const cl = req.headers?.get?.('content-length')
    if (cl && Number(cl) > maxBytes) {
      throw new Error(`Body too large (max ${maxBytes} bytes).`)
    }
    // M3: sin content-length (chunked) no hay pre-chequeo: leer el stream con
    // contador para no materializar cuerpos gigantes en memoria.
    if (!cl && req.body && typeof req.body.getReader === 'function') {
      const reader = req.body.getReader()
      const chunks: Uint8Array[] = []
      let size = 0
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > maxBytes) {
          try { await reader.cancel() } catch { /* ignore */ }
          throw new Error(`Body too large (max ${maxBytes} bytes).`)
        }
        chunks.push(value)
      }
      const text = Buffer.concat(chunks).toString('utf8')
      return text ? JSON.parse(text) : {}
    }
    // Vercel may already parse JSON for us; fall back only if needed
    try {
      return await req.json()
    } catch {
      // On Web API Request, req.on doesn't exist — return error instead of
      // falling through to the Legacy Node path which would hang forever.
      throw new Error('Invalid JSON body')
    }
  }
  // Legacy Node runtime or fallback
  return new Promise((resolve, reject) => {
    let size = 0
    let data = ''
    req.on('data', (chunk: any) => {
      size += Buffer.byteLength(chunk)
      if (size > maxBytes) {
        req.destroy()
        reject(new Error(`Body too large (max ${maxBytes} bytes).`))
        return
      }
      data += chunk
    })
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}) } catch (e) { reject(e) }
    })
    req.on('error', reject)
  })
}

function makeResponder(res: any) {
  const isNode = typeof res !== 'undefined' && typeof res.setHeader === 'function'
  const corsHeaders: Record<string, string> = {
    // B1: sin ACAO. 'same-origin' no es un valor CORS válido (los navegadores
    // lo tratan como "sin CORS"); las llamadas mismo-origen no lo necesitan.
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400',
    'vary': 'origin',
  }
  return {
    json(status: number, data: any, extraHeaders: Record<string, string> = {}) {
      const body = JSON.stringify(data)
      if (isNode) {
        res.statusCode = status
        for (const [k, v] of Object.entries({ ...corsHeaders, ...extraHeaders })) res.setHeader(k, v)
        res.setHeader('content-type', 'application/json')
        res.end(body)
        return
      }
      return new Response(body, { status, headers: { ...corsHeaders, ...extraHeaders, 'content-type': 'application/json' } })
    },
    sse(sseText: string, extraHeaders: Record<string, string> = {}) {
      const headers: Record<string, string> = {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache, no-transform',
        connection: 'close',
        ...corsHeaders,
        ...extraHeaders,
      }
      if (isNode) {
        res.statusCode = 200
        for (const [k, v] of Object.entries(headers)) res.setHeader(k, v)
        res.end(sseText)
        return
      }
      return new Response(sseText, { status: 200, headers })
    },
  }
}

// ---- Handler ----

export default async function handler(req: any, res?: any): Promise<Response | void> {
  const respond = makeResponder(res)

  const method = req?.method || 'GET'
  if (method === 'OPTIONS') {
    return respond.json(204, {})
  }
  if (method !== 'POST') {
    return respond.json(405, { error: 'Method not allowed. Use POST.' })
  }

  // Origin check: solo permitimos llamadas desde el mismo origen o desde
  // nuestra propia app en Vercel / localhost. Bloquea CSRF cross-origin.
  const origin = getOrigin(req)
  if (process.env.NODE_ENV !== 'production') console.log('[chat] origin=', origin, 'allowed=', isAllowedOrigin(origin))
  if (origin && !isAllowedOrigin(origin)) {
    return respond.json(403, { error: 'Forbidden origin.' })
  }

  const ip = getClientIp(req)
  const rl = isRateLimited(ip)
  if (rl.limited) {
    return respond.json(429, { error: 'Rate limit exceeded. Try again later.' }, rateLimitHeaders(rl.retryAfter))
  }

  const ct = getContentType(req)
  if (!ct.includes('application/json')) {
    return respond.json(415, { error: 'Unsupported Media Type. Use application/json.' })
  }

  let body: Record<string, unknown>
  try {
    body = (await readBody(req, CHART_FULL_BODY_MAX)) as Record<string, unknown>
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Invalid request body'
    if (msg.includes('Body too large')) return respond.json(413, { error: msg })
    return respond.json(400, { error: 'Invalid JSON body' })
  }

  const mode = typeof body.mode === 'string' ? body.mode : undefined

  // Tope histórico de 32 KB para todo lo que no sea chart-full: el cuerpo ya
  // se leyó con el tope elevado, así que se re-valida aquí por modo.
  if (mode !== 'chart-full' && JSON.stringify(body).length > MAX_BODY_BYTES) {
    return respond.json(413, { error: `Body too large (max ${MAX_BODY_BYTES} bytes).` })
  }

  if (mode === 'summary' || mode === 'extract') {
    try {
      if (mode === 'summary') {
        const ctx = body.context
        if (!ctx || typeof ctx !== 'object') {
          return respond.json(400, { error: 'summary requires context object' })
        }
        const ctxStr = JSON.stringify(ctx)
        if (ctxStr.length > 8000) {
          return respond.json(400, { error: 'context too large (max 8000 chars)' })
        }
        const isPdf = (ctx as Record<string, unknown>).documentType === 'pdf'
        const prompt = isPdf
          ? `Resume este documento PDF en español en exactamente 3 puntos clave. Empieza cada punto con la información directa (sin introducciones). Cita la página de cada dato con el formato [Pág. N]. No inventes datos. Texto plano con "-" por punto, sin JSON.\n\nContexto: ${ctxStr}`
          : `Genera un resumen en español en 3-5 bullets concisos + 1 insight accionable sobre este dataset. Cita números reales del contexto. No inventes columnas. Texto plano, sin JSON.\n\nContexto: ${ctxStr}`
        const out = await generate(prompt, EXCEL_SYSTEM)
        const text = out.text.trim()
        if (!text) return respond.json(200, { error: 'Empty summary' })
        return respond.json(200, { text, model: out.model })
      }

      const text = typeof body.text === 'string' ? body.text : ''
      const filename = String(body.filename ?? 'document')
      if (!text.trim()) {
        return respond.json(400, { error: 'extract requires text string' })
      }
      if (text.length > 8000) {
        return respond.json(400, { error: 'text too large (max 8000 chars, send truncated)' })
      }
      const prompt = `Extrae datos tabulares de este documento "${filename}". Texto (truncado):\n"""${text}"""\n\nInstrucciones: Si hay tabla, retorna JSON array de objetos con keys = columnas normalizadas (lowercase, sin espacios). Valores string o number. Si no hay tabla pero hay datos estructurados, inventa columnas razonables y extrae hasta 30 filas. Si no hay datos tabulares, retorna []. Responde SOLO con el JSON array, sin markdown ni explicación.`
      const out = await generate(prompt, EXCEL_SYSTEM)
      const raw = out.text
      const cleaned = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
      let rows: unknown = null
      try {
        const parsed = JSON.parse(cleaned)
        if (Array.isArray(parsed)) rows = parsed.slice(0, 50)
      } catch {
        rows = null
      }
      if (!rows) {
        return respond.json(200, { text: raw, rows: null, model: out.model, error: 'No valid JSON array extracted' })
      }
      return respond.json(200, { rows, model: out.model })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      const safe = process.env.NODE_ENV !== 'production' ? message.slice(0, 500) : 'AI provider error.'
      return respond.json(502, { error: 'AI provider error', detail: safe })
    }
  }

  // Chart-full mode (Fase E): gráfica del documento completo bajo demanda.
  // Mismos guards que el resto (origen, rate-limit); tope elevado propio.
  if (mode === 'chart-full') {
    try {
      const filename = String(body.filename ?? 'documento.pdf').slice(0, 200)
      const totalPages = Number(body.totalPages)
      const truncated = body.truncated === true
      const rawPages = Array.isArray(body.pages) ? body.pages : null
      if (!rawPages || rawPages.length === 0 || rawPages.length > CHART_FULL_MAX_PAGES) {
        return respond.json(400, { error: 'chart-full requires pages array (1-500).' })
      }
      const clean: { page: number; text: string }[] = []
      let chars = 0
      for (const p of rawPages) {
        const page = Math.floor(Number((p as Record<string, unknown>)?.page))
        const text = String((p as Record<string, unknown>)?.text ?? '').replace(/\s+/g, ' ').trim()
        if (!Number.isFinite(page) || page < 1 || !text) {
          return respond.json(400, { error: 'chart-full: each page needs {page>=1, text}.' })
        }
        chars += text.length
        clean.push({ page, text })
      }
      if (chars > CHART_FULL_MAX_CHARS) {
        return respond.json(413, { error: `chart-full text too large (max ${CHART_FULL_MAX_CHARS} chars).` })
      }
      clean.sort((a, b) => a.page - b.page)
      const analyzedPages = clean.map((p) => p.page)
      const scope = truncated && Number.isFinite(totalPages)
        ? `Páginas analizadas: ${analyzedPages.join(', ')} (de ${Math.floor(totalPages)} totales; pre-selección de las páginas con más cifras).`
        : `Páginas analizadas: ${analyzedPages.join(', ')} (documento íntegro).`
      const docText = clean.map((p) => `[Pág. ${p.page}]:\n"""${p.text}"""`).join('\n\n')
      const prompt = `Analiza este documento PDF "${filename}" y devuelve LA comparación o evolución numérica más relevante en forma de gráfica, más 2-3 líneas de lectura en español.\n\n${scope}\n\nBasa cada cifra SOLO en el texto siguiente; el sourcePage de cada dato debe ser una de las páginas analizadas.\n\n${docText}\n\nResponde solo la lectura final en español y cierra con el bloque chart-json (chartType bar|line, máx. 12 puntos, value SOLO cifras literales del texto — prohibido calcular, redondear o estimar). Sin razonamiento visible ni bloques <think>. Si no hay cifras comparables, responde solo texto sin bloque. Cita páginas con [Pág. N] en la lectura.`
      const out = await generate(prompt, EXCEL_SYSTEM)
      const text = out.text.trim()
      if (!text) return respond.json(200, { error: 'Empty chart-full response' })
      return respond.json(200, { text, analyzedPages, model: out.model })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      const safe = process.env.NODE_ENV !== 'production' ? message.slice(0, 500) : 'AI provider error.'
      return respond.json(502, { error: 'AI provider error', detail: safe })
    }
  }

  // Chat mode
  const messages = Array.isArray(body.messages) ? (body.messages as any[]) : null
  if (!messages || messages.length === 0) {
    return respond.json(400, { error: 'Invalid request: expected messages array.' })
  }

  const contextBlock = buildContextBlock(body.context)
  const conversation = messages
    .map((m) => `${m.role === 'assistant' ? 'Asistente' : 'Usuario'}: ${messageText(m)}`)
    .join('\n')
  const prompt = `${conversation}${contextBlock}`

  try {
    const out = await generate(prompt, EXCEL_SYSTEM)
    return respond.sse(sseChatText(out.text, out.model))
  } catch (err) {
    // H1: en producción no se expone el error crudo del proveedor (puede
    // traer nombres de modelo, cuota o fragmentos internos). Igual que
    // summary/extract/chart-full.
    const message = err instanceof Error ? err.message : 'Unknown error'
    const safe = process.env.NODE_ENV !== 'production' ? message.slice(0, 500) : 'AI provider error.'
    return respond.json(502, { error: 'AI provider error', detail: safe })
  }
}
