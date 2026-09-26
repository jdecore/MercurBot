/**
 * Laya ONNX classifier — typed question routing (choice/score/noul).
 *
 * Two modes:
 * 1. Heuristic (default, instant, no download): pattern-based classifier
 * 2. Laya ONNX (optional, ~424MB): ModernBERT-based decision model
 *
 * The heuristic runs first; if Laya is downloaded and loaded, it overrides.
 *
 * Ported from laya-ts (https://github.com/NandhaKishorM/laya/tree/main/laya-ts).
 *
 * ── ESTADO (26/09): la ruta ONNX (routeIntent/ensureLayaLoaded) está DESCARTADA ──
 * Bake-off Fase 0→2 contra classifyHeuristic (120 queries ES/EN): ningún candidato Laya
 * supera al baseline (action 35% vs 58%, searchMode 74.3% vs 82.9%, route 16.7% vs 30.8%);
 * causa raíz: el modelo evalúa states de conversación, no queries sueltas (OOD).
 * Además routeIntent fallaría siempre con el candidato killkli (`qtype` dims [n,1], rank-2).
 * El código activo de este módulo es `classifyHeuristic`. Veredicto y números:
 * `.agents/skills/laya.md` → "Veredicto del bake-off".
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
  /\b\d{1,4}\s*[-–]\s*\d{1,4}\b/,
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

export function classifyHeuristic(query: string): QueryClass {
  const q = query.trim()
  if (q.length < 3) return 'literal'
  if (/["""].+["""]/.test(q)) return 'literal'
  if (q.split(/\s+/).length === 1) return 'literal'
  for (const pat of LITERAL_PATTERNS) { if (pat.test(q)) return 'literal' }
  for (const pat of SEMANTIC_PATTERNS) { if (pat.test(q)) return 'semantic' }
  const words = q.split(/\s+/)
  const numericOrCapital = words.filter((w) => /^\d+$/.test(w) || /^[A-Z]/.test(w)).length
  if (numericOrCapital / words.length > 0.6) return 'literal'
  if (words.length > 6) return 'semantic'
  return 'semantic'
}

// ─── Tokenizer (ported from laya-ts/tokenizer.ts) ──────────────────────────

export interface TokenizerLike {
  readonly clsId: number
  readonly sepId: number
  readonly maskId: number
  readonly padId: number
  readonly maskToken: string
  encode(text: string): number[]
}

const CHECKPOINT_IDS = { cls: 50281, sep: 50282, mask: 50284, pad: 50283, unk: 50280 } as const

const SPECIAL_ALIASES = {
  cls: ['[CLS]', '<bos>', '<s>'],
  sep: ['[SEP]', '<eos>', '</s>'],
  pad: ['[PAD]', '<pad>'],
  mask: ['[MASK]', '<mask>'],
  unk: ['[UNK]', '<unk>'],
} as const

function byteUnicodeMaps() {
  const b2u = new Map<number, string>()
  const u2b = new Map<string, number>()
  const extra = (n: number) => (n < 0x100 ? n + 0x100 : n)
  const ranges: Array<[number, number]> = [[0x21, 0x7e], [0xa1, 0xac], [0xae, 0xff]]
  let k = 0
  const inRange = (b: number) => ranges.some(([lo, hi]) => b >= lo && b <= hi)
  for (let b = 0; b < 256; b++) {
    const cp = inRange(b) ? b : extra(k++)
    b2u.set(b, String.fromCodePoint(cp))
    u2b.set(String.fromCodePoint(cp), b)
  }
  return { b2u, u2b }
}

let _cachedMaps: { b2u: Map<number, string>; u2b: Map<string, number> } | null = null
function getMaps() { if (!_cachedMaps) _cachedMaps = byteUnicodeMaps(); return _cachedMaps }

const GPT2_SPLIT = /'s|'t|'re|'ve|'m|'ll|'d| ?\p{L}+| ?\p{N}+| ?[^\s\p{L}\p{N}]+|\s+(?!\S)|\s+/gu
const HEAP_MIN_LEN = 32

function bpeWord(chars: string[], rank: Map<string, number>): string[] {
  if (chars.length >= HEAP_MIN_LEN) return bpeWordHeap(chars, rank)
  let word = chars.slice()
  if (word.length <= 1) return word
  for (;;) {
    let best = Infinity, idx = -1
    for (let i = 0; i < word.length - 1; i++) {
      const r = rank.get(word[i] + ' ' + word[i + 1])
      if (r !== undefined && r < best) { best = r; idx = i }
    }
    if (idx < 0) return word
    word = [...word.slice(0, idx), word[idx] + word[idx + 1], ...word.slice(idx + 2)]
  }
}

function bpeWordHeap(chars: string[], rank: Map<string, number>): string[] {
  const n = chars.length
  const tok = chars.slice()
  if (n <= 1) return tok

  const next = new Int32Array(n), prev = new Int32Array(n)
  const version = new Int32Array(n)
  const dead = new Uint8Array(n)
  for (let i = 0; i < n; i++) { prev[i] = i - 1; next[i] = i + 1 < n ? i + 1 : -1 }

  let heapCap = 3 * n
  let heapRank = new Int32Array(heapCap), heapSlot = new Int32Array(heapCap), heapVer = new Int32Array(heapCap)
  let heapLen = 0

  const offer = (slot: number) => {
    const j = next[slot]
    if (j < 0) return
    const r = rank.get(tok[slot] + ' ' + tok[j])
    if (r === undefined) return
    if (heapLen === heapCap) {
      heapCap *= 2
      const r2 = new Int32Array(heapCap); r2.set(heapRank); heapRank = r2
      const s2 = new Int32Array(heapCap); s2.set(heapSlot); heapSlot = s2
      const v2 = new Int32Array(heapCap); v2.set(heapVer); heapVer = v2
    }
    const ver = version[slot]
    let c = heapLen++
    while (c > 0) {
      const p = (c - 1) >> 1
      if (heapRank[p] < r || (heapRank[p] === r && heapSlot[p] < slot)) break
      heapRank[c] = heapRank[p]; heapSlot[c] = heapSlot[p]; heapVer[c] = heapVer[p]
      c = p
    }
    heapRank[c] = r; heapSlot[c] = slot; heapVer[c] = ver
  }

  for (let i = 0; i < n - 1; i++) offer(i)

  while (heapLen > 0) {
    const slot = heapSlot[0], ver = heapVer[0]
    const lastRank = heapRank[--heapLen], lastSlot = heapSlot[heapLen], lastVer = heapVer[heapLen]
    if (heapLen > 0) {
      let c = 0
      for (;;) {
        const l = 2 * c + 1
        if (l >= heapLen) break
        const r = l + 1
        let m = l
        if (r < heapLen && (heapRank[r] < heapRank[l] || (heapRank[r] === heapRank[l] && heapSlot[r] < heapSlot[l]))) m = r
        if (heapRank[m] > lastRank || (heapRank[m] === lastRank && heapSlot[m] > lastSlot)) break
        heapRank[c] = heapRank[m]; heapSlot[c] = heapSlot[m]; heapVer[c] = heapVer[m]
        c = m
      }
      heapRank[c] = lastRank; heapSlot[c] = lastSlot; heapVer[c] = lastVer
    }

    if (dead[slot] || version[slot] !== ver) continue
    const j = next[slot]
    if (j < 0 || dead[j]) continue

    tok[slot] = tok[slot] + tok[j]
    dead[j] = 1
    const k = next[j]
    next[slot] = k
    if (k >= 0) prev[k] = slot

    version[slot]++
    offer(slot)
    const p = prev[slot]
    if (p >= 0) { version[p]++; offer(p) }
  }

  const out: string[] = []
  for (let i = 0; i >= 0; i = next[i]) out.push(tok[i])
  return out
}

let _sharedEncoder: TextEncoder | null = null

export function bpeEncode(vocab: Map<string, number>, merges: Map<string, number>, text: string): number[] {
  const { b2u } = getMaps()
  const unkId = vocab.get('[UNK]') ?? CHECKPOINT_IDS.unk
  const out: number[] = []
  const enc = (_sharedEncoder ??= new TextEncoder())
  const parts = text.normalize('NFC').match(GPT2_SPLIT)
  if (!parts) return out
  for (const piece of parts) {
    const chars: string[] = []
    for (const b of enc.encode(piece)) chars.push(b2u.get(b) ?? '')
    for (const tok of bpeWord(chars, merges)) out.push(vocab.get(tok) ?? unkId)
  }
  return out
}

export interface TokenizerData {
  vocab: Map<string, number>
  merges: Map<string, number>
  ids: { cls: number; sep: number; mask: number; pad: number; unk: number }
  kind: 'metaspace' | 'bytelevel'
  maskToken: string
  replaces: Array<[string, string]>
}

function hasNodeType(node: unknown, want: string): boolean {
  if (!node || typeof node !== 'object') return false
  if ((node as Record<string, unknown>)['type'] === want) return true
  const o = node as Record<string, unknown>
  for (const k of ['normalizers', 'pre_tokenizers', 'decoders']) {
    const v = o[k]
    if (Array.isArray(v) && v.some((c) => hasNodeType(c, want))) return true
  }
  return false
}

function collectReplaces(node: unknown, out: Array<[string, string]>): void {
  if (!node || typeof node !== 'object') return
  const o = node as Record<string, unknown>
  if (o['type'] === 'Replace') {
    const pat = o['pattern'] as Record<string, unknown> | undefined
    const from = pat?.['String']
    const to = o['content']
    if (typeof from === 'string' && typeof to === 'string') out.push([from, to])
  }
  for (const k of ['normalizers', 'pre_tokenizers', 'decoders']) {
    const v = o[k]
    if (Array.isArray(v)) for (const c of v) collectReplaces(c, out)
  }
}

export function parseTokenizerJson(raw: unknown): TokenizerData | null {
  try {
    const r = raw as {
      model?: { vocab?: Record<string, number>; merges?: Array<string | [string, string]> }
      normalizer?: unknown
      pre_tokenizer?: unknown
      added_tokens?: Array<{ id?: number; content?: string }>
    }
    const vocabObj = r?.model?.vocab
    if (!vocabObj || typeof vocabObj !== 'object') return null
    const vocab = new Map(Object.entries(vocabObj))
    const merges = new Map<string, number>()
    for (const [i, m] of (r.model?.merges ?? []).entries()) {
      const pair = typeof m === 'string' ? m.split(' ') : m
      if (pair.length >= 2) merges.set(pair[0] + ' ' + pair[1], i)
    }
    const added = new Map<string, number>()
    for (const t of r.added_tokens ?? []) {
      if (typeof t?.content === 'string' && typeof t?.id === 'number') added.set(t.content, t.id)
    }
    const pick = (aliases: readonly string[], fb: number) => {
      for (const a of aliases) {
        const v = added.get(a) ?? vocab.get(a)
        if (v !== undefined) return { id: v, token: a }
      }
      return { id: fb, token: aliases[0] }
    }
    const cls = pick(SPECIAL_ALIASES.cls, CHECKPOINT_IDS.cls)
    const sep = pick(SPECIAL_ALIASES.sep, CHECKPOINT_IDS.sep)
    const mask = pick(SPECIAL_ALIASES.mask, CHECKPOINT_IDS.mask)
    const pad = pick(SPECIAL_ALIASES.pad, CHECKPOINT_IDS.pad)
    const unk = pick(SPECIAL_ALIASES.unk, CHECKPOINT_IDS.unk)
    const kind: 'metaspace' | 'bytelevel' = hasNodeType(r?.pre_tokenizer, 'Metaspace') ? 'metaspace' : 'bytelevel'
    const replaces: Array<[string, string]> = []
    collectReplaces(r?.normalizer, replaces)
    if (kind === 'metaspace' && replaces.length === 0) replaces.push([' ', '▁'])
    return {
      vocab, merges,
      ids: { cls: cls.id, sep: sep.id, mask: mask.id, pad: pad.id, unk: unk.id },
      kind,
      maskToken: mask.token,
      replaces,
    }
  } catch { return null }
}

export function createTokenizer(data: TokenizerData): TokenizerLike {
  const encode = (text: string): number[] => bpeEncode(data.vocab, data.merges, text)
  return {
    clsId: data.ids.cls,
    sepId: data.ids.sep,
    maskId: data.ids.mask,
    padId: data.ids.pad,
    maskToken: data.maskToken,
    encode,
  }
}

// ─── Prompt Builder (ported from laya-ts/common.ts) ────────────────────────

function serializeState(state: unknown): string {
  if (typeof state === 'string') return state
  try { return JSON.stringify(state) } catch { return String(state) }
}

function renderCriterion(v: unknown): string {
  return typeof v === 'string' ? v : (typeof v === 'object' ? JSON.stringify(v) : String(v))
}

function renderOptions(q: { t: string; ins: string; crit: unknown }): string[] {
  if (q.t === 'choice') {
    const crit = q.crit as Record<string, unknown>
    return Object.entries(crit).map(([k, v]) =>
      v === null || v === undefined || v === '' ? k : `${k}: ${renderCriterion(v)}`)
  }
  return ['false: no, the statement does not hold', 'true: yes, the statement holds']
}

interface QuestionPrefix {
  ids: number[]
  markers: number[]
  nOptions: number
}

function buildQuestionPrefix(
  tok: TokenizerLike,
  q: { t: string; ins: string; crit: unknown },
  headMaxLen: number,
): QuestionPrefix {
  const opts = renderOptions(q)
  const ins = String(q.ins).split(tok.maskToken).join(' ')
  let headIds = tok.encode(`${q.t} question: ${ins}`)
  let optIds = opts.map((o) =>
    [tok.maskId, ...tok.encode(' ' + o.split(tok.maskToken).join(' ')).slice(0, 48)])
  let budget = headMaxLen - optIds.reduce((a, o) => a + o.length, 0)
  if (budget < 16) {
    const per = Math.max(4, Math.floor((headMaxLen - 16) / Math.max(1, optIds.length)))
    optIds = optIds.map((o) => o.slice(0, per))
    budget = headMaxLen - optIds.reduce((a, o) => a + o.length, 0)
  }
  headIds = headIds.slice(0, Math.max(8, budget))
  const ids = [tok.clsId, ...headIds, tok.sepId]
  const markers: number[] = []
  for (const o of optIds) { markers.push(ids.length); ids.push(...o) }
  ids.push(tok.sepId)
  return { ids, markers, nOptions: opts.length }
}

function sequenceWithState(
  prefix: QuestionPrefix,
  stateIds: number[],
  sepId: number,
  maxLen: number,
): { ids: number[]; markers: number[] } {
  const room = Math.max(0, maxLen - prefix.ids.length - 1)
  const st = stateIds.slice(0, room)
  const ids = [...prefix.ids, ...st, sepId].slice(0, maxLen)
  return { ids, markers: prefix.markers.filter((m) => m < maxLen) }
}

// ─── ONNX Inference ────────────────────────────────────────────────────────

const LAYA_MODEL_URL = 'https://huggingface.co/tozp/laya-onnx/resolve/main/model_int8.onnx'
const LAYA_TOKENIZER_URL = 'https://huggingface.co/tozp/laya-onnx/resolve/main/tokenizer.json'
const CACHE_KEY = 'copixi_laya'

let layaSession: any = null
let ortLib: any = null
let layaTokenizer: TokenizerLike | null = null
let layaConfig: { max_len?: number; head_max_len?: number } = {}
let layaSelfTestPassed = false

const QTYPES: Record<string, number> = { choice: 0, score: 1, noul: 2 }

/** Minimum confidence to trust Laya over heuristic. Below this, routeIntent falls back. */
const CONFIDENCE_THRESHOLD = 0.35

export function softmax(z: number[]): number[] {
  const m = Math.max(...z)
  const e = z.map((v) => Math.exp(v - m))
  const s = e.reduce((a, b) => a + b, 0)
  return e.map((v) => v / s)
}

export function confidenceFromProbs(p: number[]): number {
  const k = p.length
  if (k < 2) return 1.0
  const ent = -p.reduce((a, v) => a + v * Math.log(Math.max(v, 1e-12)), 0)
  return Math.min(1, Math.max(0, 1 - ent / Math.log(k)))
}

// ─── Download & Cache ──────────────────────────────────────────────────────

async function downloadToOPFS(
  url: string, dirName: string, fileName: string,
  onProgress?: (pct: number) => void, retries = 3, baseDelayMs = 1000,
): Promise<ArrayBuffer> {
  const root = await navigator.storage.getDirectory()
  const dir = await root.getDirectoryHandle(dirName, { create: true })
  try {
    const existing = await dir.getFileHandle(fileName)
    const file = await existing.getFile()
    if (file.size > 1000) { onProgress?.(100); return file.arrayBuffer() }
  } catch { /* not cached */ }

  let lastError: unknown
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
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
        if (contentLength > 0) onProgress?.(Math.round((received / contentLength) * 100))
      }
      const totalLength = chunks.reduce((acc, c) => acc + c.length, 0)
      const result = new Uint8Array(totalLength)
      let offset = 0
      for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length }
      const fileHandle = await dir.getFileHandle(fileName, { create: true })
      const writable = await fileHandle.createWritable()
      await writable.write(result)
      await writable.close()
      onProgress?.(100)
      return result.buffer
    } catch (err) {
      lastError = err
      if (attempt < retries - 1) await new Promise((r) => setTimeout(r, baseDelayMs * 2 ** attempt))
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

export async function isLayaCached(): Promise<boolean> {
  try {
    if (!navigator.storage?.getDirectory) return false
    const root = await navigator.storage.getDirectory()
    const dir = await root.getDirectoryHandle(CACHE_KEY)
    const hasTok = await opfsFileExists(dir, 'tokenizer.json')
    const hasModel = await opfsFileExists(dir, 'model_int8.onnx')
    if (!hasTok || !hasModel) return false
    // Verify model is reasonably sized (>200MB for INT8 single-file)
    const modelHandle = await dir.getFileHandle('model_int8.onnx')
    const modelFile = await modelHandle.getFile()
    return modelFile.size > 200_000_000
  } catch { return false }
}

async function opfsFileExists(dir: FileSystemDirectoryHandle, name: string): Promise<boolean> {
  try {
    const h = await dir.getFileHandle(name)
    const f = await h.getFile()
    return f.size > 0
  } catch { return false }
}

async function clearLayaCache(): Promise<void> {
  try {
    if (!navigator.storage?.getDirectory) return
    const root = await navigator.storage.getDirectory()
    await root.removeEntry(CACHE_KEY, { recursive: true })
    console.log('[Laya] Cleared corrupted OPFS cache')
  } catch { /* ignore */ }
}

export async function downloadLayaModel(
  onProgress?: (phase: string, pct: number) => void,
): Promise<void> {
  onProgress?.('model', 0)
  onProgress?.('tokenizer', 0)

  const [_, tokResp] = await Promise.all([
    downloadToOPFS(LAYA_MODEL_URL, CACHE_KEY, 'model_int8.onnx', (p) =>
      onProgress?.('model', p)),
    downloadToOPFS(LAYA_TOKENIZER_URL, CACHE_KEY, 'tokenizer.json', (p) =>
      onProgress?.('tokenizer', p)),
  ])

  // Validate tokenizer downloaded correctly
  const root = await navigator.storage.getDirectory()
  const dir = await root.getDirectoryHandle(CACHE_KEY)
  const tokHandle = await dir.getFileHandle('tokenizer.json')
  const tokFile = await tokHandle.getFile()
  const tokText = await tokFile.text()
  const tokData = JSON.parse(tokText)
  const parsed = parseTokenizerJson(tokData)
  if (!parsed) throw new Error('Invalid tokenizer.json — could not parse vocab/merges')
  void tokResp // used for validation
}

// ─── Load & Inference ──────────────────────────────────────────────────────

/**
 * Self-test: run a minimal inference to verify the ONNX session works.
 * Returns true if the model produces valid logits, false otherwise.
 */
async function selfTestLaya(): Promise<boolean> {
  if (!layaSession || !layaTokenizer) return false
  try {
    console.log('[Laya] Running self-test...')
    const testResult = await routeIntent('hello', {
      _test: {
        type: 'choice',
        instructions: 'Is this a test?',
        criteria: { yes: 'yes', no: 'no' },
      },
    })
    console.log('[Laya] Self-test result:', JSON.stringify(testResult))
    if (testResult?._test?.choice && testResult._test.confidence !== undefined) {
      layaSelfTestPassed = true
      console.log('[Laya] Self-test passed:', testResult._test)
      return true
    }
    console.warn('[Laya] Self-test returned empty results — model loaded but inference failed')
    return false
  } catch (err) {
    console.warn('[Laya] Self-test failed:', err)
    return false
  }
}

export async function loadLayaSession(): Promise<void> {
  if (layaSession) return

  const ort = await import('onnxruntime-web' as string)
  ortLib = ort
  ort.env.wasm.numThreads = 1
  ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/'

  const root = await navigator.storage.getDirectory()
  let dir: FileSystemDirectoryHandle
  try {
    dir = await root.getDirectoryHandle(CACHE_KEY)
  } catch {
    throw new Error('Laya cache directory not found — model was never downloaded')
  }

  // Validate files exist before reading
  const hasTok = await opfsFileExists(dir, 'tokenizer.json')
  const hasModel = await opfsFileExists(dir, 'model_int8.onnx')
  if (!hasTok || !hasModel) {
    await clearLayaCache()
    throw new Error(`Laya cache incomplete (tokenizer: ${hasTok}, model: ${hasModel}) — clearing cache, will re-download`)
  }

  // Load tokenizer
  const tokHandle = await dir.getFileHandle('tokenizer.json')
  const tokFile = await tokHandle.getFile()
  const tokText = await tokFile.text()
  const tokData = JSON.parse(tokText)
  const parsed = parseTokenizerJson(tokData)
  if (!parsed) throw new Error('Invalid tokenizer.json')
  layaTokenizer = createTokenizer(parsed)

  // Load config
  try {
    const cfgHandle = await dir.getFileHandle('rl_agent_config.json')
    const cfgFile = await cfgHandle.getFile()
    const cfgText = await cfgFile.text()
    layaConfig = JSON.parse(cfgText)
  } catch {
    layaConfig = {}
  }

  // Load ONNX session
  const modelHandle = await dir.getFileHandle('model_int8.onnx')
  const modelFile = await modelHandle.getFile()
  const buffer = await modelFile.arrayBuffer()
  layaSession = await ort.InferenceSession.create(buffer, {
    executionProviders: ['wasm'],
  })
  console.log('[Laya] ONNX session created. Output names:', layaSession.outputNames)
  console.log('[Laya] ONNX session created. Input names:', layaSession.inputNames)

  // Self-test: verify the model produces valid output
  await selfTestLaya()
}

/** Whether Laya is loaded and passed its self-test. */
export function isLayaReady(): boolean {
  return layaSession !== null && layaTokenizer !== null && layaSelfTestPassed
}

function toI64(ort: any, arr: number[] | number[][], dims: number[]): any {
  const out = new BigInt64Array(dims.reduce((a, b) => a * b, 1))
  let p = 0
  if (Array.isArray((arr as any)[0])) {
    for (const row of arr as number[][]) for (const v of row) out[p++] = BigInt(Math.trunc(v))
  } else {
    for (const v of arr as number[]) out[p++] = BigInt(Math.trunc(v))
  }
  return new ort.Tensor('int64', out, dims)
}

function buildFeeds(
  batch: { inputIds: number[][]; attentionMask: number[][]; markerPos: number[][]; markerMask: boolean[][]; qtype: number[] },
): Record<string, any> {
  const T = ortLib!.Tensor
  const n = batch.inputIds.length
  let L = 1
  for (const r of batch.inputIds) if (r.length > L) L = r.length
  let K = 1
  for (const r of batch.markerPos) if (r.length > K) K = r.length

  const padRow = (row: number[], len: number, pad: number) => {
    const out = row.slice(0, len)
    while (out.length < len) out.push(pad)
    return out
  }

  return {
    input_ids: toI64(ortLib!, batch.inputIds.map((r) => padRow(r, L, 0)), [n, L]),
    attention_mask: toI64(ortLib!, batch.attentionMask.map((r) => padRow(r, L, 0)), [n, L]),
    marker_pos: toI64(ortLib!, batch.markerPos.map((r) => padRow(r, K, 0)), [n, K]),
    marker_mask: new T('bool', (() => {
      const out = new Uint8Array(n * K)
      let q = 0
      for (const row of batch.markerMask) {
        for (let j = 0; j < K; j++) out[q++] = row[j] ? 1 : 0
        // pad remaining with false
        for (let j = row.length; j < K; j++) out[q++] = 0
      }
      return out
    })(), [n, K]),
    qtype: toI64(ortLib!, batch.qtype.map((v) => [v]), [n, 1]),
  }
}

/**
 * Evaluate typed questions against a state in a single forward pass.
 *
 * Supports choice, noul, and score question types.
 * Returns null if Laya is not loaded, or if confidence is below threshold
 * (caller should use heuristic fallback).
 *
 * @param state - The text or object to evaluate (e.g., user message)
 * @param questions - Record of question ID → {type, instructions, criteria}
 * @returns Answers with choice/noul/score + confidence per question, or null on failure/low confidence
 */
export async function routeIntent(
  state: unknown,
  questions: Record<string, { type: string; instructions: string; criteria?: unknown }>,
): Promise<Record<string, {
  choice?: string
  noul?: number
  score?: number
  confidence?: number
  probabilities?: Record<string, number>
}> | null> {
  if (!layaSession || !layaTokenizer || !layaSelfTestPassed) {
    return null // Not loaded or self-test failed — caller should use heuristic fallback
  }

  const ids = Object.keys(questions)
  if (ids.length === 0) return {}

  const maxLen = layaConfig.max_len ?? 512
  const headMaxLen = layaConfig.head_max_len ?? 192

  try {
    const stAll = layaTokenizer.encode(serializeState(state).split(layaTokenizer.maskToken).join(' '))

    const items: { ids: number[]; markers: number[]; qtype: number }[] = []
    for (const qid of ids) {
      const qdef = questions[qid]
      const qtype = QTYPES[qdef.type] ?? 0
      const prefix = buildQuestionPrefix(layaTokenizer, {
        t: qdef.type, ins: qdef.instructions, crit: qdef.criteria,
      }, headMaxLen)
      const seq = sequenceWithState(prefix, stAll, layaTokenizer.sepId, maxLen)
      items.push({ ids: seq.ids, markers: seq.markers, qtype })
    }

    // Collate
    const padId = layaTokenizer.padId
    let L = 0, K = 0
    for (const it of items) {
      if (it.ids.length > L) L = it.ids.length
      if (it.markers.length > K) K = it.markers.length
    }

    const batch = {
      inputIds: items.map((it) => [...it.ids, ...Array(L - it.ids.length).fill(padId)]),
      attentionMask: items.map((it) => [...Array(it.ids.length).fill(1), ...Array(L - it.ids.length).fill(0)]),
      markerPos: items.map((it) => [...it.markers, ...Array(K - it.markers.length).fill(0)]),
      markerMask: items.map((it) => [...it.markers.map(() => true), ...Array(K - it.markers.length).fill(false)]),
      qtype: items.map((it) => it.qtype),
    }

    // Run ONNX — single forward pass for all questions
    const feeds = buildFeeds(batch)
    const results = await layaSession.run(feeds)

    // Extract logits — verify batch dimensions match
    const logitsTensor = results['logits'] || results[Object.keys(results)[0]]
    if (!logitsTensor) {
      console.warn('[Laya] No logits tensor in ONNX output. Keys:', Object.keys(results))
      return null
    }
    const logitsData = logitsTensor.data as Float32Array | BigInt64Array
    const logitsDims = logitsTensor.dims as number[]

    console.log(`[Laya] Logits shape: [${logitsDims}], nQuestions: ${ids.length}, first 10 values:`, Array.from(logitsData as any).slice(0, 10))

    // Validate: logits shape should be [nQuestions, maxOptions]
    if (logitsDims.length !== 2 || logitsDims[0] !== ids.length) {
      console.warn(`[Laya] Unexpected logits shape: [${logitsDims}], expected [${ids.length}, K]. Falling back.`)
      return null
    }

    // Decode answers
    const answers: Record<string, {
      choice?: string
      noul?: number
      score?: number
      confidence?: number
      probabilities?: Record<string, number>
    }> = {}

    let anyLowConfidence = false

    for (let r = 0; r < ids.length; r++) {
      const k = items[r].markers.length
      const base = r * logitsDims[1]
      const rawLogits: number[] = []
      for (let i = 0; i < k; i++) {
        rawLogits.push(Number(logitsData[base + i]))
      }

      const probs = softmax(rawLogits)
      const conf = confidenceFromProbs(probs)
      const qtype = questions[ids[r]].type

      if (qtype === 'choice') {
        const crit = questions[ids[r]].criteria as Record<string, unknown>
        const keys = Object.keys(crit ?? {})
        let best = 0
        for (let i = 1; i < probs.length; i++) { if (probs[i] > probs[best]) best = i }
        answers[ids[r]] = {
          choice: keys[best] ?? String(best),
          confidence: conf,
          probabilities: Object.fromEntries(keys.map((kk, i) => [kk, Math.round(probs[i] * 1e4) / 1e4])),
        }
      } else if (qtype === 'noul') {
        // noul: P(yes) is probs[1] (true option)
        const pYes = probs[1] ?? 0
        answers[ids[r]] = {
          noul: Math.round(pYes * 1e4) / 1e4,
          confidence: Math.max(pYes, 1 - pYes),
          probabilities: { false: Math.round((1 - pYes) * 1e4) / 1e4, true: Math.round(pYes * 1e4) / 1e4 },
        }
      } else if (qtype === 'score') {
        // score: expected value = sum(i * p[i])
        const expected = probs.reduce((a, v, i) => a + i * v, 0)
        answers[ids[r]] = {
          score: Math.round(expected * 1e4) / 1e4,
          confidence: conf,
          probabilities: Object.fromEntries(probs.map((p, i) => [String(i), Math.round(p * 1e4) / 1e4])),
        }
      }

      if (conf < CONFIDENCE_THRESHOLD) anyLowConfidence = true
    }

    console.log(`[Laya] Decoded answers:`, JSON.stringify(answers))

    // If any question has very low confidence, the model is unsure — return null
    // so the caller falls back to heuristic. This guards against bad INT8
    // quantization producing random logits.
    if (anyLowConfidence) {
      console.warn('[Laya] Low confidence detected, falling back to heuristic')
      return null
    }

    return answers
  } catch (err) {
    console.warn('[Laya] routeIntent failed:', err)
    return null
  }
}

/**
 * Legacy classifyQuery: uses Laya if available, falls back to heuristic.
 * Kept for backward compatibility with debug.ts testFlow.
 */
export async function classifyQuery(query: string): Promise<{ class: QueryClass; confidence: number; method: 'laya' | 'heuristic' }> {
  if (layaSession && layaTokenizer && layaSelfTestPassed) {
    try {
      const result = await routeIntent(query, {
        qtype: {
          type: 'choice',
          instructions: 'Is this query about finding a specific fact, number, or page in the document, or about understanding meaning, summarizing, or analyzing?',
          criteria: {
            literal: 'Finding a specific fact, number, page, date, or exact reference',
            semantic: 'Understanding meaning, summarizing, analyzing, comparing, or interpreting',
          },
        },
      })
      if (result?.qtype?.choice) {
        return { class: result.qtype.choice as QueryClass, confidence: result.qtype.confidence ?? 0.7, method: 'laya' }
      }
    } catch (err) {
      console.warn('[Laya] classifyQuery failed, falling back to heuristic:', err)
    }
  }
  return { class: classifyHeuristic(query), confidence: 0.7, method: 'heuristic' }
}
