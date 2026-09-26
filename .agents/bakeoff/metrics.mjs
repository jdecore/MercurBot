/**
 * metrics.mjs — Fase 2: métricas del bake-off.
 *
 * Uso: node metrics.mjs
 * Lee results_fase2.json (4 configs × 120) y evalúa:
 *  - exact-match + macro-F1 por campo, overall y por idioma
 *  - searchMode SOLO sobre el subset gold action=rag (70)
 *  - route-exact (los 5 campos correctos)
 *  - latencia media
 *  - calibración: barrido de umbral con fallback al baseline (hybrid)
 * Baselines: 'heuristic' (classifyHeuristic + defaults) y 'defaults' (executeAgent hoy).
 */
import fs from 'node:fs'
import { DATASET } from './dataset.mjs'
import { classifyHeuristic, baselineHeuristic, baselineCurrent } from './heuristic.mjs'

const store = JSON.parse(fs.readFileSync('results_fase2.json', 'utf8'))
const FIELDS = ['action', 'searchMode', 'needsWeb', 'isPageRef', 'isSummary']
const CONFIGS = ['flat-q', 'flat-doc', 'hier-q', 'hier-doc']

// ─── métricas ───────────────────────────────────────────────────────────────
const accuracy = (gold, pred) => gold.filter((g, i) => g === pred[i]).length / gold.length

function macroF1(gold, pred) {
  const classes = [...new Set([...gold, ...pred])]
  let sum = 0
  for (const c of classes) {
    const tp = gold.filter((g, i) => g === c && pred[i] === c).length
    const fp = gold.filter((g, i) => g !== c && pred[i] === c).length
    const fn = gold.filter((g, i) => g === c && pred[i] !== c).length
    const prec = tp + fp === 0 ? 0 : tp / (tp + fp)
    const rec = tp + fn === 0 ? 0 : tp / (tp + fn)
    sum += prec + rec === 0 ? 0 : (2 * prec * rec) / (prec + rec)
  }
  return sum / classes.length
}

function perClassF1(gold, pred) {
  const classes = [...new Set(gold)].sort()
  const out = {}
  for (const c of classes) {
    const tp = gold.filter((g, i) => g === c && pred[i] === c).length
    const fp = gold.filter((g, i) => g !== c && pred[i] === c).length
    const fn = gold.filter((g, i) => g === c && pred[i] !== c).length
    const prec = tp + fp === 0 ? 0 : tp / (tp + fp)
    const rec = tp + fn === 0 ? 0 : tp / (tp + fn)
    out[c] = prec + rec === 0 ? 0 : +((2 * prec * rec) / (prec + rec)).toFixed(3)
  }
  return out
}

const pct = (x) => `${(x * 100).toFixed(1)}%`

// ─── predictores ────────────────────────────────────────────────────────────
const baselineFor = (kind, d) => (kind === 'defaults' ? baselineCurrent() : baselineHeuristic(d.q))

const modelPred = (cfg, d) => {
  const f = store[cfg][d.id].fields
  return {
    action: f.action.v,
    searchMode: f.searchMode.v,
    needsWeb: f.needsWeb.v,
    isPageRef: f.isPageRef.v,
    isSummary: f.isSummary.v,
    _conf: {
      action: { ce: f.action.ce, cm: f.action.cm },
      searchMode: { ce: f.searchMode.ce, cm: f.searchMode.cm },
      needsWeb: { ce: f.needsWeb.ce, cm: f.needsWeb.cm },
      isPageRef: { ce: f.isPageRef.ce, cm: f.isPageRef.cm },
      isSummary: { ce: f.isSummary.ce, cm: f.isSummary.cm },
    },
    _ms: store[cfg][d.id].ms,
  }
}

function evaluate(items, predFn) {
  const out = {}
  for (const field of FIELDS) {
    const scope = field === 'searchMode' ? items.filter((d) => d.action === 'rag') : items
    const gold = scope.map((d) => d[field])
    const pred = scope.map((d) => predFn(d)[field])
    out[field] = { acc: accuracy(gold, pred), f1: macroF1(gold, pred), n: scope.length }
    if (field === 'action') out[field].perClass = perClassF1(gold, pred)
  }
  const goldRoute = items.map((d) => FIELDS.map((f) => d[f]).join('|'))
  const predRoute = items.map((d) => FIELDS.map((f) => predFn(d)[f]).join('|'))
  out.route = { acc: accuracy(goldRoute, predRoute), n: items.length }
  const ms = items.map((d) => predFn(d)._ms).filter((x) => typeof x === 'number')
  out.latency = ms.length ? Math.round(ms.reduce((a, b) => a + b, 0) / ms.length) : null
  return out
}

// ─── reporte ────────────────────────────────────────────────────────────────
const LINES = []
const p = (s = '') => { LINES.push(s); console.log(s) }

p('════════ FASE 2 — BAKE-OFF RESULTADOS ════════')
p(`dataset: 120 (60 ES/60 EN) · searchMode se puntúa sobre action=rag (n=${DATASET.filter((d) => d.action === 'rag').length})`)
p()

const names = { 'flat-q': 'flat · state=query', 'flat-doc': 'flat · state=doc+query', 'hier-q': 'hier · state=query', 'hier-doc': 'hier · state=doc+query', heuristic: 'BASE heuristic', defaults: 'BASE defaults (hoy)' }
const allPred = {}
allPred.heuristic = (d) => baselineHeuristic(d.q)
allPred.defaults = (d) => baselineCurrent()
for (const c of CONFIGS) allPred[c] = (d) => modelPred(c, d)

// tabla por campo
p('── Exact-match / macro-F1 (overall) ──')
const header = ['config'.padEnd(22), ...FIELDS.map((f) => f.padEnd(11)), 'route'.padEnd(9), 'ms']
p(header.join(' '))
const results = {}
for (const [kind, fn] of Object.entries(allPred)) {
  const res = evaluate(DATASET, fn)
  results[kind] = res
  const cells = FIELDS.map((f) => `${pct(res[f].acc)}/${pct(res[f].f1)}`.padEnd(11))
  p([names[kind].padEnd(22), ...cells, pct(res.route.acc).padEnd(9), res.latency ?? '-'].join(' '))
}

for (const lang of ['es', 'en']) {
  p()
  p(`── ${lang.toUpperCase()} ──`)
  p(header.join(' '))
  const items = DATASET.filter((d) => d.lang === lang)
  for (const [kind, fn] of Object.entries(allPred)) {
    const res = evaluate(items, fn)
    const cells = FIELDS.map((f) => `${pct(res[f].acc)}/${pct(res[f].f1)}`.padEnd(11))
    p([names[kind].padEnd(22), ...cells, pct(res.route.acc).padEnd(9), res.latency ?? '-'].join(' '))
  }
}

p()
p('── action: F1 por clase (overall) ──')
for (const kind of ['heuristic', 'flat-q', 'flat-doc', 'hier-q', 'hier-doc']) {
  const pc = results[kind].action.perClass
  p(`${names[kind].padEnd(22)} ` + Object.entries(pc).map(([c, v]) => `${c}=${v}`).join(' '))
}

p()
p('── action: matriz de confusión (filas=gold, cols=pred) ──')
const A_CLASSES = ['rag', 'direct', 'chart', 'web_search', 'mcp', 'agent']
for (const kind of ['heuristic', 'flat-q', 'flat-doc', 'hier-q', 'hier-doc']) {
  const predFn = allPred[kind]
  p(names[kind])
  p('        ' + A_CLASSES.map((c) => c.slice(0, 6).padStart(7)).join(''))
  for (const g of A_CLASSES) {
    const row = A_CLASSES.map((c) => DATASET.filter((d) => d.action === g && predFn(d).action === c).length)
    p(`${g.padEnd(8)}` + row.map((n) => String(n).padStart(7)).join(''))
  }
}

// ─── calibración ────────────────────────────────────────────────────────────
p()
p('── Calibración: hybrid = modelo si conf ≥ t, si no baseline (searchMode=heuristic, resto defaults) ──')
for (const cfg of ['BASE-heuristic', 'flat-q', 'flat-doc', 'hier-q', 'hier-doc']) {
  const rows = []
  const predBase = cfg.startsWith('BASE')
    ? (d) => { const b = baselineHeuristic(d.q); return { action: b.action, needsWeb: b.needsWeb, isPageRef: b.isPageRef, isSummary: b.isSummary, _conf: null } }
    : (d) => modelPred(cfg, d)
  for (const metric of ['ce', 'cm']) {
    for (let t = 0; t <= 0.95; t += 0.1) {
      const gold = [], pred = [], used = []
      for (const d of DATASET) {
        const m = predBase(d)
        const base = baselineHeuristic(d.q)
        const take = m._conf ? m._conf.action[metric] >= t : false
        gold.push(d.action)
        pred.push(take ? m.action : base.action)
        used.push(take)
        gold.push(`${d.needsWeb}|${d.isPageRef}|${d.isSummary}`)
        const takeG = m._conf ? (m._conf.needsWeb[metric] >= t && m._conf.isPageRef[metric] >= t && m._conf.isSummary[metric] >= t) : false
        pred.push(takeG ? `${m.needsWeb}|${m.isPageRef}|${m.isSummary}` : `${base.needsWeb}|${base.isPageRef}|${base.isSummary}`)
        used.push(takeG)
      }
      const acc = accuracy(gold, pred)
      const cov = used.filter(Boolean).length / used.length
      rows.push({ metric, t: +t.toFixed(2), acc, cov })
    }
  }
  const best = rows.reduce((a, b) => (b.acc > a.acc ? b : a))
  const nm = names[cfg] ?? cfg
  p(`${nm.padEnd(22)} mejor hybrid: metric=${best.metric} t=${best.t} → acc(action+guards)=${pct(best.acc)} (coverage=${pct(best.cov)}) · sin fallback (t=0)=${pct(rows.find((r) => r.metric === best.metric && r.t === 0).acc)}`)
  for (const metric of ['ce', 'cm']) {
    const line = rows.filter((r) => r.metric === metric).map((r) => `t${r.t}:${pct(r.acc)}`).join(' ')
    p(`    ${metric}: ${line}`)
  }
}

// searchMode calibration (solo sobre rag)
p()
p('── Calibración searchMode (subset rag, fallback=classifyHeuristic) ──')
for (const cfg of ['flat-q', 'flat-doc', 'hier-q', 'hier-doc']) {
  const items = DATASET.filter((d) => d.action === 'rag')
  let bestLine = ''
  let bestAcc = 0, bestT = 0
  for (const metric of ['ce', 'cm']) {
    const cells = []
    for (let t = 0; t <= 0.95; t += 0.1) {
      const gold = items.map((d) => d.searchMode)
      const pred = items.map((d) => {
        const m = modelPred(cfg, d)
        return m._conf.searchMode[metric] >= t ? m.searchMode : classifyHeuristic(d.q)
      })
      const acc = accuracy(gold, pred)
      cells.push(`t${t.toFixed(1)}:${pct(acc)}`)
      if (metric === 'ce' && acc > bestAcc) { bestAcc = acc; bestT = t }
    }
    if (metric === 'ce') bestLine = cells.join(' ')
  }
  const baseAcc = accuracy(items.map((d) => d.searchMode), items.map((d) => classifyHeuristic(d.q)))
  p(`${names[cfg].padEnd(22)} mejor ce t=${bestT}: ${pct(bestAcc)} | baseline heuristic=${pct(baseAcc)}`)
  p(`    ce: ${bestLine}`)
}

fs.writeFileSync('report_fase2.txt', LINES.join('\n') + '\n')
console.log('\n→ report_fase2.txt escrito')
