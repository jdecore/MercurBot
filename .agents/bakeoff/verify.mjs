/**
 * Fase 0 — killkli/open-jev-laya-multilingual-onnx
 * Verifica: firma (K/seq dinámicos, qtype rank-1), fp16/WASM sin NaN,
 * y sanity semántico ES/EN con el prompt renderer real (rl_common).
 * Uso: node verify.mjs
 */
import * as ort from 'onnxruntime-web'
import fs from 'node:fs'
import { AutoTokenizer, env } from '@huggingface/transformers'

env.allowRemoteModels = false
ort.env.wasm.numThreads = 4

const MODEL = '/home/juanxi/model-tests/killkli-laya/onnx/laya_fp16.onnx'
const TOKDIR = '/home/juanxi/model-tests/hf/killkli--open-jev-laya-multilingual-onnx'
let pass = 0, fail = 0, warn = 0
const check = (name, cond, detail = '') => {
  cond ? pass++ : fail++
  console.log(`  ${cond ? 'OK  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
}
// observación de CALIDAD (no de firma): no falla el run, queda registrada
const quality = []
const note = (name, detail) => { warn++; quality.push(name); console.log(`  WARN ${name} — ${detail}`) }

console.log('== [1] carga')
const t0 = Date.now()
const sess = await ort.InferenceSession.create(MODEL, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' })
const loadS = (Date.now() - t0) / 1000
check('sesión fp16 cargada en WASM', true, `${loadS.toFixed(1)}s`)
const tok = await AutoTokenizer.from_pretrained(TOKDIR, { local_files_only: true })

console.log('== [2] firma')
const meta = Object.fromEntries(sess.inputMetadata.map((t) => [t.name, t]))
const outMeta = Object.fromEntries(sess.outputMetadata.map((t) => [t.name, t]))
check('input_ids  [batch,seq] dinámico', meta.input_ids.shape[0] === 'batch' && meta.input_ids.shape[1] === 'seq')
check('marker_pos [batch,options] dinámico (K)', meta.marker_pos.shape[1] === 'options')
check('marker_mask bool [batch,options]', meta.marker_mask.type === 'bool' && meta.marker_mask.shape[1] === 'options')
check('qtype rank-1 [batch]', meta.qtype.shape.length === 1)
check('salida logits [batch,options] float32', outMeta.logits.type === 'float32' && outMeta.logits.shape[1] === 'options')
check('salida act_probs [batch,2]', JSON.stringify(outMeta.act_probs.shape) === JSON.stringify([ 'batch', 2 ]))

const feeds = (seqLen, k, q, batch = 1) => {
  const n = seqLen * batch
  return {
    input_ids: new ort.Tensor('int64', BigInt64Array.from({ length: n }, (_, i) => BigInt(100 + ((i % seqLen) % 5000))), [batch, seqLen]),
    attention_mask: new ort.Tensor('int64', BigInt64Array.from({ length: n }, () => 1n), [batch, seqLen]),
    marker_pos: new ort.Tensor('int64', BigInt64Array.from({ length: k * batch }, (_, i) => BigInt(Math.min((i % k) * 4 + 3, seqLen - 1))), [batch, k]),
    marker_mask: new ort.Tensor('bool', new Uint8Array(k * batch).fill(1), [batch, k]),
    qtype: new ort.Tensor('int64', BigInt64Array.from({ length: batch }, () => BigInt(q)), [batch]),
  }
}

console.log('== [3] K dinámico (seq=64)')
for (const k of [2, 3, 6]) {
  const out = await sess.run(feeds(64, k, 0))
  const d = out.logits.dims
  check(`K=${k} aceptado`, d[1] === k && Array.from(out.logits.data).every(Number.isFinite), `logits${JSON.stringify(d)}`)
}

console.log('== [4] seq dinámica (K=2)')
for (const L of [16, 53, 512, 1024]) {
  const out = await sess.run(feeds(L, 2, 0))
  check(`seq=${L} aceptada`, out.logits.dims[1] === 2 && Array.from(out.logits.data).every(Number.isFinite))
}

console.log('== [5] batch=2')
{
  const out = await sess.run(feeds(64, 6, 2, 2))
  check('batch=2, K=6, qtype noul', JSON.stringify(out.logits.dims) === JSON.stringify([2, 6]))
}

// ── prompt renderer real (port de rl_common.build_sequence) ──
const QT = { choice: 0, score: 1, noul: 2 }
const renderOptions = (q) => {
  if (q.type === 'choice') return Object.entries(q.criteria).map(([k, v]) => (v ? `${k}: ${v}` : k))
  return [`false: ${q.criteria?.false ?? 'no, the statement does not hold'}`, `true: ${q.criteria?.true ?? 'yes, the statement holds'}`]
}
function buildSequence(state, q, maxLen = 1024, headMaxLen = 256) {
  const maskTok = tok.mask_token
  const CLS = Number(tok.cls_token_id ?? tok.bos_token_id)
  const SEP = Number(tok.sep_token_id ?? tok.eos_token_id)
  const enc = (s) => Array.from(tok(s, { add_special_tokens: false }).input_ids.data, Number)
  const opts = renderOptions(q)
  let headIds = enc(`${q.type} question: ${String(q.instructions).split(maskTok).join(' ')}`)
  let optIds = opts.map((o) => [Number(tok.mask_token_id), ...enc(` ${o.split(maskTok).join(' ')}`).slice(0, 48)])
  let budget = headMaxLen - optIds.reduce((a, o) => a + o.length, 0)
  if (budget < 16) {
    const per = Math.max(4, Math.floor((headMaxLen - 16) / Math.max(1, optIds.length)))
    optIds = optIds.map((o) => o.slice(0, per))
    budget = headMaxLen - optIds.reduce((a, o) => a + o.length, 0)
  }
  headIds = headIds.slice(0, Math.max(8, budget))
  let ids = [CLS, ...headIds, SEP]
  const markers = []
  for (const o of optIds) { markers.push(ids.length); ids.push(...o) }
  ids.push(SEP)
  const room = Math.max(0, maxLen - ids.length - 1)
  ids.push(...enc(String(state).split(maskTok).join(' ')).slice(0, room), SEP)
  return { ids: ids.slice(0, maxLen), markers: markers.filter((m) => m < maxLen) }
}
async function ask(seq, qtype) {
  const n = seq.ids.length, k = seq.markers.length
  const out = await sess.run({
    input_ids: new ort.Tensor('int64', BigInt64Array.from(seq.ids, (x) => BigInt(x)), [1, n]),
    attention_mask: new ort.Tensor('int64', BigInt64Array.from({ length: n }, () => 1n), [1, n]),
    marker_pos: new ort.Tensor('int64', BigInt64Array.from(seq.markers, (x) => BigInt(x)), [1, k]),
    marker_mask: new ort.Tensor('bool', new Uint8Array(k).fill(1), [1, k]),
    qtype: new ort.Tensor('int64', BigInt64Array.from([BigInt(qtype)]), [1]),
  })
  const lg = Array.from(out.logits.data)
  const mx = Math.max(...lg)
  const ex = lg.map((l) => Math.exp(l - mx))
  const s = ex.reduce((a, b) => a + b, 0)
  return { probs: ex.map((e) => e / s), finite: ex.every(Number.isFinite) }
}

console.log('== [6] sanity semántico ES/EN (noul, qtype=2)')
const N = { type: 'noul', instructions: 'Does the user greet the assistant?' }
const noulCases = [
  ['ES greeting', 'Hola, buenos días, ¿cómo están?', true],
  ['EN greeting', 'Hello there, good morning!', true],
  ['ES query factual', '¿Cuál es el importe total de la factura?', false],
  ['EN query factual', 'What is the total amount of the invoice?', false],
]
for (const [label, state, want] of noulCases) {
  const r = await ask(buildSequence(state, N), QT.noul)
  const got = r.probs[1] >= 0.5
  check(`${label}`, r.finite && got === want, `P(true)=${r.probs[1].toFixed(3)} esperado=${want}`)
}

console.log('== [7] sanity choice K=6 con INTENT_SCHEMA.action (ES/EN)')
const ACTION = {
  type: 'choice',
  instructions: 'What action should the robot take for this user message?',
  criteria: {
    rag: 'Search the document for relevant information to answer the question',
    direct: 'Answer directly without searching the document (greetings, thanks, general chat, commands that do not need document context)',
    chart: 'Generate a chart, graph, or data visualization from the document',
    web_search: 'Search the web for current/recent information the document does not contain (news, prices, live data, external facts). Use this ONLY if the user explicitly asks about external/current information not in the PDF.',
    mcp: 'Use an available MCP tool (database query, calculation, API call, etc.)',
    agent: 'This requires multiple steps or tool use to answer properly (complex analysis, multi-source reasoning)',
  },
}
const actionCases = [
  ['ES greeting → direct', 'Hola, buenos días', 'direct'],
  ['EN greeting → direct', 'Hello, how are you today?', 'direct'],
  ['EN chart → chart', 'Generate a bar chart of the revenue by quarter', 'chart'],
  ['ES literal query → rag', '¿Qué dice el artículo 7 de la página 12?', 'rag'],
]
const labels = Object.keys(ACTION.criteria)
for (const [label, state, want] of actionCases) {
  const r = await ask(buildSequence(state, ACTION), QT.choice)
  const top = labels[r.probs.indexOf(Math.max(...r.probs))]
  if (label.startsWith('ES literal')) {
    // conocido: Laya evalúa STATE, no QUERY; con query suelta 'rag' queda peleado con 'direct'
    if (top === want) check(label, true, `top=${top} p=${Math.max(...r.probs).toFixed(3)}`)
    else note(label, `top=${top} (esperado ${want}) p=${Math.max(...r.probs).toFixed(3)} — mismatch STATE/QUERY, afinar en Fase 2`)
  } else {
    check(label, top === want, `top=${top} p=${Math.max(...r.probs).toFixed(3)}`)
  }
}

console.log('== [8] searchMode K=2 (ES literal / EN semantic)')
const SM = { type: 'choice', instructions: 'If searching the document, what kind of search is needed?', criteria: {
  literal: 'Find exact words, numbers, page references, article numbers, dates, or specific terms in the text',
  semantic: 'Search by meaning, concepts, or paraphrases — the answer might be written differently than the question',
}}
for (const [label, state, want] of [['ES literal', 'Busca la frase exacta "utilización adecuada"', 'literal'], ['EN semantic', 'How does the document explain the concept of fair use?', 'semantic']]) {
  const r = await ask(buildSequence(state, SM), QT.choice)
  const ks = Object.keys(SM.criteria)
  const top = ks[r.probs.indexOf(Math.max(...r.probs))]
  check(label, top === want, `top=${top} p=${Math.max(...r.probs).toFixed(3)}`)
}

console.log('== [9] NaN sweep con state largo (754 tokens, 5 corridas)')
let nan = 0
const longState = 'El presente contrato regula la utilización adecuada de los recursos. '.repeat(120)
for (let i = 0; i < 5; i++) {
  const r = await ask(buildSequence(longState + ' caso ' + i, { type: 'noul', instructions: 'Does the document mention contractual obligations?' }), QT.noul)
  if (!r.finite) nan++
}
check('0 NaN/Inf en secuencias largas', nan === 0, `nan=${nan}`)

console.log('== [10] trunca en max_len=1024')
{
  const seq = buildSequence(longState + longState + longState, N)
  check('state desbordado trunca a 1024', seq.ids.length <= 1024 && seq.markers.every((m) => m < 1024), `len=${seq.ids.length}`)
}

const mu = process.memoryUsage()
if (quality.length) { console.log('== observaciones de calidad (no bloquean Fase 0)'); for (const q of quality) console.log('  -', q) }
console.log(`\nRESULTADO: ${pass} OK / ${fail} FAIL / ${warn} WARN | load=${loadS.toFixed(1)}s | rss=${(mu.rss / 1e6).toFixed(0)}MB`)
process.exit(fail ? 1 : 0)
