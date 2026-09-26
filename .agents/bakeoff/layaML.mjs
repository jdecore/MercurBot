/**
 * layaML.mjs — Adaptador Laya multilingüe (killkli/open-jev-laya-multilingual-onnx)
 * Fase 1 del bake-off. Test-only: NO se modifica src/.
 *
 * Correcciones críticas respecto a src/shared/lib/laya.ts (todas verificadas en Fase 0):
 *  E1  Tokenizer metaspace: bpeEncode() de laya.ts usa GPT2_SPLIT byte-level e ignora
 *      kind='metaspace'/replaces → ids corruptos. Aquí: applies replaces + prepend '▁'
 *      + split por '▁' + BPE por pieza (verificado vs transformers.js, verifyTokenizer()).
 *  E2  qtype rank-1: buildFeeds() de laya.ts envía dims [n,1] → el modelo lanza
 *      "Invalid rank for input: qtype" (ERROR_CODE 2) → routeIntent() SIEMPRE falla.
 *      Aquí: dims [n].
 *  E3  CLS/SEP: tok.cls_token_id es undefined en transformers.js → fallback
 *      bos_token_id(2)/eos_token_id(1); el parser de laya.ts sí resuelve <bos>/<eos>.
 *  E4  Confianza: rl_common usa entropía normalizada 1-H/ln(k); laya.ts la mezcla con
 *      max(p,1-p) en noul. Aquí se exportan ambas (confEntropy/confMargin) y NO se aplica
 *      umbral: temperature=[1,1,1] (sin calibrar) → calibración en Fase 2.
 *  E5  marker_pos fuera de rango (≥ len) congela el runtime (TopK con índice inválido).
 *      Aquí: guard que filtra markers < len(ids) por fila antes de inferir.
 *
 * Contrato ONNX (Fase 0):
 *  inputs : input_ids [B,seq] i64, attention_mask [B,seq] i64,
 *           marker_pos [B,options] i64, marker_mask bool [B,options], qtype [B] i64
 *  outputs: logits [B,options] f32, act_probs [B,2] f32
 *  seq dinámica (≤ max_len=1024), options dinámico (K≥2), batch OK con K distinto por fila
 *  (logits [B,maxK] → leer primeros k de cada fila).
 */
import * as ort from 'onnxruntime-web'
import fs from 'node:fs'

export const MODEL_PATH = '/home/juanxi/model-tests/killkli-laya/onnx/laya_fp16.onnx'
export const TOKENIZER_JSON = '/home/juanxi/model-tests/killkli-laya/tokenizer.json'
export const HF_TOKENIZER_DIR = '/home/juanxi/model-tests/hf/killkli--open-jev-laya-multilingual-onnx'
export const MAX_LEN = 1024
export const HEAD_MAX_LEN = 256
export const QTYPES = { choice: 0, score: 1, noul: 2 }

// ─── E1: tokenizer ─────────────────────────────────────────────────────────

const SPECIAL_ALIASES = {
  cls: ['[CLS]', '<bos>', '<s>'],
  sep: ['[SEP]', '<eos>', '</s>'],
  pad: ['[PAD]', '<pad>'],
  mask: ['[MASK]', '<mask>'],
  unk: ['[UNK]', '<unk>'],
}

function walk(node, fn) {
  if (!node || typeof node !== 'object') return
  fn(node)
  for (const k of ['normalizers', 'pre_tokenizers', 'decoders']) {
    if (Array.isArray(node[k])) for (const c of node[k]) walk(c, fn)
  }
}

export function parseTokenizerJson(raw) {
  const r = raw
  const vocabObj = r?.model?.vocab
  if (!vocabObj || typeof vocabObj !== 'object') throw new Error('tokenizer sin model.vocab')
  const vocab = new Map(Object.entries(vocabObj))
  const merges = new Map()
  for (const [i, m] of (r.model?.merges ?? []).entries()) {
    const pair = typeof m === 'string' ? m.split(' ') : m
    if (pair.length >= 2) merges.set(pair[0] + ' ' + pair[1], i)
  }
  const added = new Map()
  for (const t of r.added_tokens ?? []) {
    if (typeof t?.content === 'string' && typeof t?.id === 'number') added.set(t.content, t.id)
  }
  const pick = (aliases, fb) => {
    for (const a of aliases) {
      const v = added.get(a) ?? vocab.get(a)
      if (v !== undefined) return { id: v, token: a }
    }
    return { id: fb, token: aliases[0] }
  }
  let metaspace = false
  walk(r?.pre_tokenizer, (n) => { if (n.type === 'Metaspace') metaspace = true })
  const replaces = []
  walk(r?.normalizer, (n) => {
    if (n.type === 'Replace') {
      const from = n.pattern?.String
      if (typeof from === 'string' && typeof n.content === 'string') replaces.push([from, n.content])
    }
  })
  if (metaspace && replaces.length === 0) replaces.push([' ', '▁'])
  const prependScheme = (() => {
    let s = null
    walk(r?.pre_tokenizer, (n) => { if (n.type === 'Metaspace') s = n.prepend_scheme ?? 'always' })
    return s ?? 'always'
  })()
  return {
    vocab, merges,
    cls: pick(SPECIAL_ALIASES.cls, 2),   // E3: <bos> id 2
    sep: pick(SPECIAL_ALIASES.sep, 1),   // E3: <eos> id 1
    mask: pick(SPECIAL_ALIASES.mask, 4),
    pad: pick(SPECIAL_ALIASES.pad, 0),
    unk: pick(SPECIAL_ALIASES.unk, 3),
    kind: metaspace ? 'metaspace' : 'bytelevel',
    replaces, prependScheme,
  }
}

function bpeWord(chars, merges) {
  let word = chars.slice()
  if (word.length <= 1) return word
  for (;;) {
    let best = Infinity, idx = -1
    for (let i = 0; i < word.length - 1; i++) {
      const r = merges.get(word[i] + ' ' + word[i + 1])
      if (r !== undefined && r < best) { best = r; idx = i }
    }
    if (idx < 0) return word
    word = [...word.slice(0, idx), word[idx] + word[idx + 1], ...word.slice(idx + 2)]
  }
}

/** E1 — encoder metaspace: replaces + prepend '▁' + split por '▁' + BPE por pieza. */
export function createEncoder(data) {
  if (data.kind !== 'metaspace') throw new Error('este harness solo soporta kind=metaspace (killkli)')
  const { vocab, merges } = data
  const unkId = data.unk.id
  return {
    clsId: data.cls.id, sepId: data.sep.id, maskId: data.mask.id, padId: data.pad.id,
    unkId,
    encode(text) {
      let t = String(text).normalize('NFC')
      for (const [from, to] of data.replaces) t = t.split(from).join(to)
      if (data.prependScheme === 'always') t = '▁' + t
      const pieces = t.split('▁').filter((p) => p.length > 0).map((p) => '▁' + p)
      const out = []
      for (const piece of pieces) {
        const toks = bpeWord(Array.from(piece), merges)
        for (const tk of toks) out.push(vocab.get(tk) ?? unkId)
      }
      return out
    },
  }
}

export function loadLocalTokenizer() {
  const raw = JSON.parse(fs.readFileSync(TOKENIZER_JSON, 'utf8'))
  return createEncoder(parseTokenizerJson(raw))
}

/**
 * E1 — verificación exacta contra transformers.js. Devuelve {ok, mismatches}.
 * Se corre en smoke.mjs; cualquier mismatch rompe la Fase 1.
 */
export async function verifyTokenizer(enc) {
  const { AutoTokenizer, env } = await import('@huggingface/transformers')
  env.allowRemoteModels = false
  const hf = await AutoTokenizer.from_pretrained(HF_TOKENIZER_DIR, { local_files_only: true })
  const corpus = [
    'hola buenos dias',
    'choice question: What action should the robot take for this user message?',
    '¿Qué dice el artículo 7 de la página 12?',
    'true: yes, the statement holds',
    ' rag: Search the document for relevant information to answer the question',
    'noul question: Does this query reference a specific page number, article number, section, clause, or chapter in the document?',
    ' ¿Cuál es el precio total del contrato firmado el 12/03/2024?',
    'Summary of the confidentiality clause',
    'semantic: Search by meaning, concepts, or paraphrases — the answer might be written differently than the question',
    'Resumen ejecutivo del informe trimestral Q3 2025',
    'web_search: Search the web for current/recent information (news, prices, live data)',
    ' directo: hola, ¿qué tal? — 42 artículos, 3.5% y (test)',
    'What does section 4.2 on page 9 say?',
    ' Página 5, tercer párrafo',
  ]
  const mismatches = []
  for (const s of corpus) {
    const ours = enc.encode(s)
    const theirs = Array.from(hf(s, { add_special_tokens: false }).input_ids.data, Number)
    if (ours.length !== theirs.length || ours.some((v, i) => v !== theirs[i])) {
      mismatches.push({
        text: s.slice(0, 60),
        ours: ours.slice(0, 14), theirs: theirs.slice(0, 14),
        lenOurs: ours.length, lenTheirs: theirs.length,
      })
    }
  }
  return { ok: mismatches.length === 0, checked: corpus.length, mismatches }
}

// ─── Prompt (port fiel de rl_common.build_sequence / laya.ts) ───────────────

function renderOptions(q) {
  if (q.type === 'choice') {
    return Object.entries(q.criteria).map(([k, v]) => (v ? `${k}: ${v}` : k))
  }
  if (q.type === 'score') return Object.entries(q.criteria).map(([k, v], i) => `${k}: ${v}`)
  return ['false: no, the statement does not hold', 'true: yes, the statement holds']
}

export function buildSequence(enc, state, q, maxLen = MAX_LEN, headMaxLen = HEAD_MAX_LEN) {
  const opts = renderOptions(q)
  const ins = String(q.instructions).split('<mask>').join(' ').split('[MASK]').join(' ')
  let headIds = enc.encode(`${q.type} question: ${ins}`)
  let optIds = opts.map((o) => [enc.maskId, ...enc.encode(' ' + o.split('<mask>').join(' ')).slice(0, 48)])
  let budget = headMaxLen - optIds.reduce((a, o) => a + o.length, 0)
  if (budget < 16) {
    const per = Math.max(4, Math.floor((headMaxLen - 16) / Math.max(1, optIds.length)))
    optIds = optIds.map((o) => o.slice(0, per))
    budget = headMaxLen - optIds.reduce((a, o) => a + o.length, 0)
  }
  headIds = headIds.slice(0, Math.max(8, budget))
  const ids = [enc.clsId, ...headIds, enc.sepId]
  const markers = []
  for (const o of optIds) { markers.push(ids.length); ids.push(...o) }
  ids.push(enc.sepId)
  const room = Math.max(0, maxLen - ids.length - 1)
  const st = enc.encode(String(state).split('<mask>').join(' ')).slice(0, room)
  ids.push(...st, enc.sepId)
  const finalIds = ids.slice(0, maxLen)
  // E5: markers fuera de rango congelan el runtime (TopK con índice inválido)
  const finalMarkers = markers.filter((m) => m < finalIds.length)
  if (finalMarkers.length !== markers.length) {
    throw new Error(`E5 guard: ${markers.length - finalMarkers.length} marker(s) descartado(s) fuera de rango`)
  }
  return { ids: finalIds, markers: finalMarkers }
}

// ─── Carga de sesión ────────────────────────────────────────────────────────

export async function loadLayaML({ threads = 4 } = {}) {
  ort.env.wasm.numThreads = threads
  const t = Date.now()
  const session = await ort.InferenceSession.create(MODEL_PATH, {
    executionProviders: ['wasm'], graphOptimizationLevel: 'all',
  })
  const enc = loadLocalTokenizer()
  return { session, enc, loadMs: Date.now() - t }
}

// ─── Confianza (E4: ambas métricas, sin umbral) ─────────────────────────────

/** rl_common.confidence_from_probs / laya.ts confidenceFromProbs: 1 - H/ln(k). */
export function confEntropy(p) {
  const k = p.length
  if (k < 2) return 1.0
  const ent = -p.reduce((a, v) => a + v * Math.log(Math.max(v, 1e-12)), 0)
  return 1 - ent / Math.log(k)
}

/** Margen: max(p). Es lo que laya.ts reporta en noul. */
export function confMargin(p) {
  return Math.max(...p)
}

function softmax(logits) {
  const mx = Math.max(...logits)
  const ex = logits.map((l) => Math.exp(l - mx))
  const s = ex.reduce((a, b) => a + b, 0)
  return ex.map((e) => e / s)
}

// ─── Inferencia (1 forward para N preguntas, K mixto) ───────────────────────

/**
 * items: [{ id, q, state }]  →  Map id → answer
 * answer: { choice|noul|score, probs, confEntropy, confMargin }
 */
export async function askBatch({ session, enc }, items) {
  const built = items.map((it) => ({ ...it, seq: buildSequence(enc, it.state, it.q) }))
  const B = built.length
  const L = Math.max(...built.map((b) => b.seq.ids.length))
  const K = Math.max(...built.map((b) => b.seq.markers.length))
  if (K < 2) throw new Error('K<2: el modelo exige K>=2')

  const inputIds = new BigInt64Array(B * L)
  const attention = new BigInt64Array(B * L)
  const markerPos = new BigInt64Array(B * K)
  const markerMask = new Uint8Array(B * K)
  const qtype = new BigInt64Array(B)

  built.forEach((b, r) => {
    const { ids, markers } = b.seq
    for (let i = 0; i < ids.length; i++) {
      inputIds[r * L + i] = BigInt(ids[i])
      attention[r * L + i] = 1n
    }
    for (let i = 0; i < markers.length; i++) {
      markerPos[r * K + i] = BigInt(markers[i])   // E5: ya validados < len
      markerMask[r * K + i] = 1
    }
    qtype[r] = BigInt(QTYPES[b.q.type] ?? 0)
  })

  const t0 = Date.now()
  const out = await session.run({
    input_ids: new ort.Tensor('int64', inputIds, [B, L]),
    attention_mask: new ort.Tensor('int64', attention, [B, L]),
    marker_pos: new ort.Tensor('int64', markerPos, [B, K]),
    marker_mask: new ort.Tensor('bool', markerMask, [B, K]),
    qtype: new ort.Tensor('int64', qtype, [B]),   // E2: rank-1
  })
  const ms = Date.now() - t0

  const logits = out.logits.data
  const dims = out.logits.dims
  if (dims[0] !== B) throw new Error(`logits dims inesperadas: [${dims}]`)
  const answers = new Map()
  built.forEach((b, r) => {
    const k = b.seq.markers.length
    const base = r * dims[1]
    const raw = []
    for (let i = 0; i < k; i++) raw.push(logits[base + i])
    const probs = softmax(raw)
    const ans = {
      confEntropy: confEntropy(probs),
      confMargin: confMargin(probs),
      probs,
      ms,
    }
    if (b.q.type === 'choice') {
      const keys = Object.keys(b.q.criteria)
      let best = 0
      for (let i = 1; i < probs.length; i++) if (probs[i] > probs[best]) best = i
      ans.choice = keys[best]
      ans.probabilities = Object.fromEntries(keys.map((kk, i) => [kk, probs[i]]))
    } else if (b.q.type === 'noul') {
      ans.noul = probs[1] ?? 0
      ans.probabilities = { false: probs[0] ?? 0, true: probs[1] ?? 0 }
    } else {
      ans.score = probs.reduce((a, v, i) => a + i * v, 0)
    }
    answers.set(b.id, ans)
  })
  answers.set('__ms__', ms)
  return answers
}

/**
 * Clasificación FLAT: las 5 preguntas de INTENT_SCHEMA.
 * mode: 'batch'    → 1 forward con las 5 filas (K mixto, logits [B,maxK])
 *       'parallel' → 5 forwards concurrentes con Promise.all
 * Medido en Fase 1: parallel (2.5s) es ~2× más rápido que batch (4.7s) — el batch
 * de ORT-WASM no paraleliza filas; los runs concurrentes sí se solapan.
 */
export async function classifyFlat(h, questions, state, { mode = 'parallel' } = {}) {
  const items = Object.entries(questions).map(([id, q]) => ({ id, q, state }))
  let answers, ms
  if (mode === 'parallel') {
    const t0 = Date.now()
    const maps = await Promise.all(items.map((it) => askBatch(h, [it])))
    ms = Date.now() - t0
    answers = new Map()
    for (const m of maps) for (const [k, v] of m) if (k !== '__ms__') answers.set(k, v)
  } else {
    answers = await askBatch(h, items)
    ms = answers.get('__ms__')
    answers.delete('__ms__')
  }
  const toResult = (id, fallback) => {
    const a = answers.get(id)
    if (!a) return fallback
    if ('choice' in a) return { choice: a.choice, confidence: a.confEntropy, confidenceMargin: a.confMargin, probabilities: a.probabilities }
    if ('noul' in a) return { noul: a.noul, confidence: a.confMargin, confidenceEntropy: a.confEntropy, probabilities: a.probabilities }
    return { score: a.score, confidence: a.confEntropy }
  }
  return { answers: Object.fromEntries(Object.keys(questions).map((id) => [id, toResult(id, null)])), ms, mode }
}
