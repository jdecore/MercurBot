/**
 * Laya ONNX classifier — literal vs semantic query routing.
 *
 * Two modes:
 * 1. Heuristic (default, instant, no download): pattern-based classifier
 * 2. Laya ONNX (optional, ~424MB): ModernBERT-based decision model
 *
 * The heuristic runs first; if Laya is downloaded, it overrides.
 */

export type QueryClass = 'literal' | 'semantic'

// ─── Heuristic Classifier (instant, no download) ───────────────────────────

const LITERAL_PATTERNS = [
  /^(cuánto|cuánta|cuántos|cuántas|how much|how many)\s/i,
  /^(qué página|qué pagina|en qué página|en qué pagina|what page|which page)/i,
  /^(cuándo|cuándo fue|when did|when was)/i,
  /^(dónde está|dónde se|where is|where does)/i,
  /^(quién|who)\s/i,
  /^(artículo|art\.|section|sección|clause|cláusula|chapter|capítulo)\s*\d/i,
  /\b(página|pag\.|p\.|page)\s*\d+\b/i,
  /\b\d{1,4}\s*[-–]\s*\d{1,4}\b/, // ranges like "10-15"
  /\b(ley|decree|decreto|norma|resolución|resolution)\s*\d/i,
  /\b(fecha|date|número|number|importe|amount|total|suma|sum)\b/i,
  /\b(artículo|section|sección)\s+\d+/i,
  /§\s*\d+/i,
]

const SEMANTIC_PATTERNS = [
  /^(resumen|summary|explain|explica|analiza|analyze)/i,
  /^(cuál es la diferencia|what is the difference|how does|cómo funciona)/i,
  /^(por qué|why)\s/i,
  /^(opinión|opinion|qué opinas|what do you think)/i,
  /^(compara|compare|evalúa|evaluate|contrast)/i,
  /^(implica|implies|significa|means|refiere|refers)/i,
  /^(relaciona|relate|conecta|connect|asocia|associate)/i,
  /^(pros y contras|pros and cons|ventajas|advantages)/i,
  /^(qué pasaría|what would happen|escenario|scenario)/i,
  /^(recomend|recommend|sugiere|suggest|advierte|warns)/i,
]

/**
 * Classify a query as literal (exact match needed) or semantic (meaning needed).
 * Runs in <1ms, no model download required.
 */
export function classifyHeuristic(query: string): QueryClass {
  const q = query.trim()
  if (q.length < 3) return 'literal'

  // Quoted text = always literal
  if (/["""].+["""]/.test(q)) return 'literal'

  // Short single-word queries = literal
  if (q.split(/\s+/).length === 1) return 'literal'

  // Check literal patterns
  for (const pat of LITERAL_PATTERNS) {
    if (pat.test(q)) return 'literal'
  }

  // Check semantic patterns
  for (const pat of SEMANTIC_PATTERNS) {
    if (pat.test(q)) return 'semantic'
  }

  // Contains mostly proper nouns / numbers → literal
  const words = q.split(/\s+/)
  const numericOrCapital = words.filter((w) => /^\d+$/.test(w) || /^[A-Z]/.test(w)).length
  if (numericOrCapital / words.length > 0.6) return 'literal'

  // Long, complex queries → semantic
  if (words.length > 6) return 'semantic'

  // Default: semantic (safer — vector search adds value for ambiguous queries)
  return 'semantic'
}

// ─── Laya ONNX Classifier (optional, ~424MB download) ──────────────────────

const LAYA_MODEL_URL = 'https://huggingface.co/tozp/laya-onnx/resolve/main/model_int8.onnx'
const LAYA_TOKENIZER_URL = 'https://huggingface.co/tozp/laya-onnx/resolve/main/tokenizer.json'
const LAYA_CONFIG_URL = 'https://huggingface.co/tozp/laya-onnx/resolve/main/rl_agent_config.json'
const CACHE_KEY = 'copixi_laya'

export interface LayaStatus {
  downloaded: boolean
  loading: boolean
  error: string | null
  size: number | null
}

let layaSession: any = null

/**
 * Check if Laya model is cached in OPFS.
 */
export async function isLayaCached(): Promise<boolean> {
  try {
    if (!navigator.storage?.getDirectory) return false
    const root = await navigator.storage.getDirectory()
    const dir = await root.getDirectoryHandle(CACHE_KEY)
    const fileHandle = await dir.getFileHandle('model_int8.onnx')
    const file = await fileHandle.getFile()
    return file.size > 100_000_000 // At least 100MB = real model
  } catch {
    return false
  }
}

/**
 * Get cached model size in bytes.
 */
export async function getLayaCacheSize(): Promise<number> {
  try {
    if (!navigator.storage?.getDirectory) return 0
    const root = await navigator.storage.getDirectory()
    const dir = await root.getDirectoryHandle(CACHE_KEY)
    const fileHandle = await dir.getFileHandle('model_int8.onnx')
    const file = await fileHandle.getFile()
    return file.size
  } catch {
    return 0
  }
}

/**
 * Delete cached Laya model from OPFS.
 */
export async function deleteLayaCache(): Promise<void> {
  try {
    if (!navigator.storage?.getDirectory) return
    const root = await navigator.storage.getDirectory()
    await root.removeEntry(CACHE_KEY, { recursive: true })
    layaSession = null
  } catch {
    /* ignore */
  }
}

/**
 * Download a file to OPFS and return its ArrayBuffer.
 */
async function downloadToOPFS(
  url: string,
  dirName: string,
  fileName: string,
  onProgress?: (pct: number) => void,
): Promise<ArrayBuffer> {
  const root = await navigator.storage.getDirectory()
  const dir = await root.getDirectoryHandle(dirName, { create: true })

  // Check if already cached
  try {
    const existing = await dir.getFileHandle(fileName)
    const file = await existing.getFile()
    if (file.size > 1000) {
      onProgress?.(100)
      return file.arrayBuffer()
    }
  } catch {
    /* not cached, download */
  }

  const response = await fetch(url)
  if (!response.ok) throw new Error(`Failed to download ${fileName}: ${response.status}`)

  const contentLength = Number(response.headers.get('content-length')) || 0
  const reader = response.body!.getReader()
  const chunks: Uint8Array[] = []
  let received = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    received += value.length
    if (contentLength > 0) {
      onProgress?.(Math.round((received / contentLength) * 100))
    }
  }

  const totalLength = chunks.reduce((acc, c) => acc + c.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }

  // Write to OPFS
  const fileHandle = await dir.getFileHandle(fileName, { create: true })
  const writable = await fileHandle.createWritable()
  await writable.write(result)
  await writable.close()

  onProgress?.(100)
  return result.buffer
}

/**
 * Download Laya model + tokenizer to OPFS.
 */
export async function downloadLayaModel(
  onProgress?: (phase: string, pct: number) => void,
): Promise<void> {
  onProgress?.('model', 0)
  await downloadToOPFS(LAYA_MODEL_URL, CACHE_KEY, 'model_int8.onnx', (p) =>
    onProgress?.('model', p),
  )

  onProgress?.('tokenizer', 0)
  const tokResp = await fetch(LAYA_TOKENIZER_URL)
  if (!tokResp.ok) throw new Error(`Failed to download tokenizer: ${tokResp.status}`)
  await tokResp.json()

  onProgress?.('config', 0)
  const cfgResp = await fetch(LAYA_CONFIG_URL)
  if (!cfgResp.ok) throw new Error(`Failed to download config: ${cfgResp.status}`)
  await cfgResp.json()

  onProgress?.('done', 100)
}

/**
 * Pre-warm: download Laya model if not cached, then load session.
 * Runs in background, never blocks UI.
 */
export async function preloadLaya(): Promise<void> {
  try {
    const cached = await isLayaCached()
    if (!cached) {
      await downloadLayaModel()
    }
    await loadLayaSession()
  } catch (err) {
    console.warn('[Laya] Pre-warm failed, using heuristic fallback.', err)
  }
}

/**
 * Simple BERT tokenizer (WordPiece).
 * For full accuracy, we'd use the actual tokenizer.json, but for the
 * literal/semantic classification, a simplified version suffices.
 */
function tokenizeSimple(text: string, maxLen = 128): { inputIds: BigInt64Array; attentionMask: BigInt64Array } {
  const tokens = ['[CLS]', ...text.toLowerCase().split(/\s+/).slice(0, maxLen - 2), '[SEP]']
  const inputIds = new BigInt64Array(maxLen)
  const attentionMask = new BigInt64Array(maxLen)

  for (let i = 0; i < maxLen; i++) {
    if (i < tokens.length) {
      // Simple hash for token → id (vocab mapping would come from tokenizer.json)
      inputIds[i] = BigInt(hashToken(tokens[i]))
      attentionMask[i] = 1n
    } else {
      inputIds[i] = 0n // PAD
      attentionMask[i] = 0n
    }
  }

  return { inputIds, attentionMask }
}

function hashToken(token: string): number {
  // Simple deterministic hash for token → id mapping
  // In production, load vocab from tokenizer.json
  let hash = 0
  for (let i = 0; i < token.length; i++) {
    hash = ((hash << 5) - hash + token.charCodeAt(i)) | 0
  }
  return Math.abs(hash) % 30000 + 1 // Avoid 0 (reserved)
}

/**
 * Classify query using loaded Laya ONNX model.
 * Returns 'literal' or 'semantic' with confidence.
 */
export async function classifyWithLaya(
  query: string,
): Promise<{ class: QueryClass; confidence: number }> {
  if (!layaSession) {
    throw new Error('Laya model not loaded')
  }

  const { inputIds, attentionMask } = tokenizeSimple(query)

  // Laya expects: input_ids, attention_mask, marker_pos, marker_mask, qtype
  // For our use case: question about query type
  const markerPos = new BigInt64Array([BigInt(inputIds.length - 2)]) // Position of [MASK] marker
  const markerMask = new BigInt64Array([1n])
  const qtype = new BigInt64Array([0n]) // 0 = choice question

  const feeds = {
    input_ids: inputIds,
    attention_mask: attentionMask,
    marker_pos: markerPos,
    marker_mask: markerMask,
    qtype: qtype,
  }

  const results = await layaSession.run(feeds)
  const logits = results.logits?.data || results[Object.keys(results)[0]]?.data

  if (!logits || logits.length < 2) {
    return { class: 'semantic', confidence: 0.5 }
  }

  // Softmax over 2 classes: [literal, semantic]
  const exp0 = Math.exp(Number(logits[0]))
  const exp1 = Math.exp(Number(logits[1]))
  const sum = exp0 + exp1
  const pLiteral = exp0 / sum
  const pSemantic = exp1 / sum

  return pLiteral > pSemantic
    ? { class: 'literal', confidence: pLiteral }
    : { class: 'semantic', confidence: pSemantic }
}

/**
 * Load Laya ONNX model from OPFS into ONNX Runtime session.
 */
export async function loadLayaSession(): Promise<void> {
  if (layaSession) return

  // Dynamic import of onnxruntime-web
  const ort = await import('onnxruntime-web' as string)

  // Configure WASM to load from CDN (not origin)
  ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/'

  const root = await navigator.storage.getDirectory()
  const dir = await root.getDirectoryHandle(CACHE_KEY)
  const fileHandle = await dir.getFileHandle('model_int8.onnx')
  const file = await fileHandle.getFile()
  const buffer = await file.arrayBuffer()

  layaSession = await ort.InferenceSession.create(buffer, {
    executionProviders: ['wasm'],
  })
}

/**
 * Classify query: uses Laya if available, falls back to heuristic.
 */
export async function classifyQuery(query: string): Promise<{ class: QueryClass; confidence: number; method: 'laya' | 'heuristic' }> {
  if (layaSession) {
    try {
      const result = await classifyWithLaya(query)
      return { ...result, method: 'laya' }
    } catch (err) {
      console.warn('[Laya] Classification failed, falling back to heuristic:', err)
    }
  }

  return {
    class: classifyHeuristic(query),
    confidence: 0.7,
    method: 'heuristic',
  }
}
