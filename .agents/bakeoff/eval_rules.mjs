/**
 * eval_rules.mjs — Fase 3a: evalúa rules.mjs vs baseline sobre los 120.
 * Uso: node eval_rules.mjs
 */
import { DATASET, sanityDataset } from './dataset.mjs'
import { baselineHeuristic, classifyHeuristic } from './heuristic.mjs'
import { rulesIntent, classifyActionRules } from './rules.mjs'
import fs from 'node:fs'

const FIELDS = ['action', 'searchMode', 'needsWeb', 'isPageRef', 'isSummary']
const acc = (g, p) => g.filter((x, i) => x === p[i]).length / g.length
function macroF1(g, p) {
  const classes = [...new Set([...g, ...p])]
  let s = 0
  for (const c of classes) {
    const tp = g.filter((x, i) => x === c && p[i] === c).length
    const fp = g.filter((x, i) => x !== c && p[i] === c).length
    const fn = g.filter((x, i) => x === c && p[i] !== c).length
    const pr = tp + fp === 0 ? 0 : tp / (tp + fp)
    const rc = tp + fn === 0 ? 0 : tp / (tp + fn)
    s += pr + rc === 0 ? 0 : (2 * pr * rc) / (pr + rc)
  }
  return s / classes.length
}
const pc = (x) => `${(x * 100).toFixed(1)}%`

console.log('dataset sanity:', sanityDataset().ok ? 'OK' : 'FAIL')
console.log()
console.log('── action ──')
const systems = { baseline: (d) => baselineHeuristic(d.q).action, rules: (d) => classifyActionRules(d.q) }
for (const [name, fn] of Object.entries(systems)) {
  for (const scope of ['all', 'es', 'en']) {
    const items = scope === 'all' ? DATASET : DATASET.filter((d) => d.lang === scope)
    const g = items.map((d) => d.action), p = items.map(fn)
    console.log(`${name.padEnd(9)} ${scope.padEnd(4)} acc=${pc(acc(g, p))} macroF1=${pc(macroF1(g, p))}`)
  }
}
const A = ['rag', 'direct', 'chart', 'web_search', 'mcp', 'agent']
console.log('\nmatriz confusión REGLAS (filas=gold):')
console.log('        ' + A.map((c) => c.slice(0, 6).padStart(7)).join(''))
for (const gg of A) {
  const row = A.map((c) => DATASET.filter((d) => d.action === gg && classifyActionRules(d.q) === c).length)
  console.log(gg.padEnd(8) + row.map((n) => String(n).padStart(7)).join(''))
}
const actErrors = DATASET.filter((d) => classifyActionRules(d.q) !== d.action)
console.log(`\naction errors (${actErrors.length}):`)
for (const d of actErrors) console.log(`  ${d.id} gold=${d.action} pred=${classifyActionRules(d.q)} :: ${d.q}`)

console.log('\n── guardrails (rules vs baseline-always-false) ──')
for (const f of ['needsWeb', 'isPageRef', 'isSummary']) {
  const g = DATASET.map((d) => d[f])
  const pb = DATASET.map((d) => baselineHeuristic(d.q)[f])
  const pr = DATASET.map((d) => rulesIntent(d.q)[f])
  console.log(`${f.padEnd(10)} baseline acc=${pc(acc(g, pb))} f1=${pc(macroF1(g, pb))} | rules acc=${pc(acc(g, pr))} f1=${pc(macroF1(g, pr))}`)
}

console.log('\n── searchMode (subset action=rag, n=70) ──')
const rag = DATASET.filter((d) => d.action === 'rag')
const gs = rag.map((d) => d.searchMode)
const ps = rag.map((d) => classifyHeuristic(d.q))
console.log(`heuristic acc=${pc(acc(gs, ps))} macroF1=${pc(macroF1(gs, ps))}`)
const smErrors = rag.filter((d) => classifyHeuristic(d.q) !== d.searchMode)
console.log(`errores heuristic (${smErrors.length}):`)
for (const d of smErrors) console.log(`  ${d.id} gold=${d.searchMode} :: ${d.q}`)

console.log('\n── route-exact (los 5 campos) ──')
const route = (fn) => DATASET.filter((d) => FIELDS.every((f) => (f !== 'searchMode' || d.action === 'rag' ? fn(d)[f] === d[f] : true))).length / DATASET.length
console.log(`baseline=${pc(route((d) => baselineHeuristic(d.q)))} | rules=${pc(route((d) => rulesIntent(d.q)))}`)

// comparar con flat-q del bake-off si existe
if (fs.existsSync('results_fase2.json')) {
  const store = JSON.parse(fs.readFileSync('results_fase2.json', 'utf8'))
  if (store['flat-q']) {
    const flatRoute = DATASET.filter((d) => {
      const f = store['flat-q'][d.id].fields
      return f.action.v === d.action && f.searchMode.v === d.searchMode && f.needsWeb.v === d.needsWeb && f.isPageRef.v === d.isPageRef && f.isSummary.v === d.isSummary
    }).length / DATASET.length
    console.log(`(referencia flat-q del bake-off=${pc(flatRoute)})`)
  }
}
