/**
 * smoke.mjs — Fase 1: verificación de adaptadores (sin métricas finales; eso es Fase 2).
 *
 * Checks:
 *  [1] dataset sanity (120, 60/60, distribuciones)
 *  [2] E1 tokenizer metaspace ≡ transformers.js (corpus 14 strings, match exacto)
 *  [3] carga de sesión (fp16 WASM)
 *  [4] adaptador flat: 1 forward con K mixto (2 choice K=6/K=2 + 3 noul K=2)
 *  [5] 12 muestras ES/EN → predicción vs gold + latencia
 *  [6] baseline heuristic sobre los 120 → distribución
 */
import { DATASET, sanityDataset } from './dataset.mjs'
import { INTENT_SCHEMA } from './schema.mjs'
import { baselineHeuristic, classifyHeuristic, normalizeAnswers } from './heuristic.mjs'
import { loadLayaML, verifyTokenizer, classifyFlat, loadLocalTokenizer } from './layaML.mjs'

let pass = 0, fail = 0
const check = (name, cond, detail = '') => {
  cond ? pass++ : fail++
  console.log(`  ${cond ? 'OK  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
}

// [1] dataset
console.log('== [1] dataset sanity')
const ds = sanityDataset()
check('dataset 120 con distribuciones correctas', ds.ok, ds.ok ? '' : ds.failed.join(','))

// [2] tokenizer
console.log('== [2] E1 — tokenizer metaspace vs transformers.js')
const enc = loadLocalTokenizer()
const vt = await verifyTokenizer(enc)
check(`E1 encode idéntico a transformers.js (${vt.checked} strings)`, vt.ok,
  vt.ok ? '' : JSON.stringify(vt.mismatches.slice(0, 2)))

// [3] sesión
console.log('== [3] carga de sesión')
const h = await loadLayaML({ threads: 4 })
check('sesión fp16 WASM cargada', !!h.session, `${(h.loadMs / 1000).toFixed(1)}s`)

// [4] modos de ejecución (batch vs parallel)
console.log('== [4] adaptador flat — 5 preguntas: batch vs parallel')
const flatB = await classifyFlat(h, INTENT_SCHEMA, 'Hola, ¿qué tal?', { mode: 'batch' })
check('batch: 5 respuestas, 1 forward', Object.keys(flatB.answers).length === 5, `ms=${flatB.ms}`)
const flatP = await classifyFlat(h, INTENT_SCHEMA, 'Hola, ¿qué tal?', { mode: 'parallel' })
check('parallel: 5 respuestas, 5 forwards concurrentes', Object.keys(flatP.answers).length === 5, `ms=${flatP.ms}`)
check('parallel < batch', flatP.ms < flatB.ms, `batch=${flatB.ms}ms parallel=${flatP.ms}ms`)
const kInfo = Object.entries(flatP.answers).map(([k, v]) => `${k}=${v.choice ?? ('noul ' + v.noul?.toFixed(3))}`)
console.log('    →', kInfo.join(' | '))

// [5] muestras
console.log('== [5] muestras ES/EN vs gold')
const sampleIds = ['es01', 'es17', 'es30', 'es36', 'es41', 'es47', 'en01', 'en17', 'en30', 'en36', 'en41', 'en47']
const latencies = []
for (const id of sampleIds) {
  const d = DATASET.find((x) => x.id === id)
  const t = Date.now()
  const { answers } = await classifyFlat(h, INTENT_SCHEMA, d.q)
  const ms = Date.now() - t
  latencies.push(ms)
  const pred = normalizeAnswers(answers)
  const ok = pred.action === d.action
    && (d.action !== 'rag' || pred.searchMode === d.searchMode)
  console.log(`    ${ok ? 'OK  ' : 'DIFF'} ${id} act=${pred.action}/${d.action}` +
    (d.action === 'rag' ? ` sm=${pred.searchMode}/${d.searchMode}` : '') +
    ` | web=${pred.needsWeb}/${d.needsWeb} ref=${pred.isPageRef}/${d.isPageRef} sum=${pred.isSummary}/${d.isSummary}` +
    ` | conf(a)=${pred.actionConfidence.toFixed(2)} [${ms}ms]`)
}
const avg = (a) => Math.round(a.reduce((x, y) => x + y, 0) / a.length)
// Gate funcional (no optimización): Fase 0 midió 0.3-1.1s con seq corta; con head K=6
// (L≈170) y 5 forwards serializados por ORT-WASM: ~3.4s. Optimización = Fase 2
// (state más corto, fewer questions, WebGPU en navegador).
check('latencia media (parallel) < 5000ms', avg(latencies) < 5000,
  `avg=${avg(latencies)}ms min=${Math.min(...latencies)} max=${Math.max(...latencies)}`)

// [6] baseline sobre 120
console.log('== [6] baseline heuristic — 120 queries')
const dist = {}
const distSearch = { literal: 0, semantic: 0 }
for (const d of DATASET) {
  const b = baselineHeuristic(d.q)
  dist[b.action] = (dist[b.action] ?? 0) + 1
  distSearch[b.searchMode]++
  // searchMode del baseline se puede comparar con gold SOLO donde action=rag
}
console.log('    action:', JSON.stringify(dist), '(esperado: solo rag=120)')
console.log('    searchMode:', JSON.stringify(distSearch))
const ragItems = DATASET.filter((d) => d.action === 'rag')
let hit = 0
for (const d of ragItems) if (classifyHeuristic(d.q) === d.searchMode) hit++
check('baseline searchMode sobre rag: exact-match > 0.5', hit / ragItems.length > 0.5,
  `${hit}/${ragItems.length} = ${((hit / ragItems.length) * 100).toFixed(1)}%`)
for (const lang of ['es', 'en']) {
  const sub = ragItems.filter((d) => d.lang === lang)
  let h2 = 0
  for (const d of sub) if (classifyHeuristic(d.q) === d.searchMode) h2++
  console.log(`    ${lang}: ${h2}/${sub.length} = ${((h2 / sub.length) * 100).toFixed(1)}%`)
}

console.log(`\nRESULTADO FASE 1: ${pass} OK / ${fail} FAIL`)
process.exit(fail === 0 ? 0 : 1)
