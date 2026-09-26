/**
 * benchmark.mjs — Fase 2: corre un config sobre los 120 del dataset y checkpointea.
 *
 * Uso:  node benchmark.mjs <config>     config ∈ flat-q | flat-doc | hier-q | hier-doc
 * Salida: results_fase2.json (merge incremental; reanuda ids ya corridos)
 *
 *  - flat-q   : adaptador flat,  state = query suelta (realidad de agentRuntime)
 *  - flat-doc : adaptador flat,  state = DOCUMENTO:\n<snippet>\n\nPREGUNTA: <query>
 *  - hier-q   : árbol K=2,      state = query suelta
 *  - hier-doc : árbol K=2,      state = doc+query
 */
import fs from 'node:fs'
import { DATASET } from './dataset.mjs'
import { INTENT_SCHEMA } from './schema.mjs'
import { loadLayaML, classifyFlat } from './layaML.mjs'
import { classifyHier } from './hier.mjs'

const config = process.argv[2]
if (!['flat-q', 'flat-doc', 'hier-q', 'hier-doc'].includes(config)) {
  console.error('uso: node benchmark.mjs <flat-q|flat-doc|hier-q|hier-doc>')
  process.exit(2)
}
const [family, fmt] = config.split('-')

const SNIPPETS = {
  es: `CONTRATO DE PRESTACIÓN DE SERVICIOS\n\nArtículo 1. Las partes acuerdan la prestación de servicios de consultoría por un importe total de 45.000 EUR, pagaderos en cuatro trimestres.\nArtículo 2. El plazo de entrega de los informes será de treinta (30) días naturales desde la recepción de la solicitud.\nArtículo 3. La confidencialidad se mantendrá durante cinco años tras la finalización del contrato.\nArtículo 4. El incumplimiento dará lugar a una penalización del 0,5% por día de retraso.\nArtículo 5. Será aplicable la jurisdicción de los tribunales de Madrid.`,
  en: `SERVICE AGREEMENT\n\nSection 1. The parties agree to consulting services for a total amount of EUR 45,000, payable in four quarterly instalments.\nSection 2. The delivery deadline for reports shall be thirty (30) calendar days from receipt of the request.\nSection 3. Confidentiality shall be maintained for five years after termination of the contract.\nSection 4. Breach shall incur a penalty of 0.5% per day of delay.\nSection 5. The courts of Madrid shall have exclusive jurisdiction.`,
}

const stateOf = (d) => (fmt === 'q' ? d.q : `DOCUMENTO:\n${SNIPPETS[d.lang]}\n\nPREGUNTA: ${d.q}`)

const OUT = 'results_fase2.json'
const store = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {}
store[config] ??= {}

const h = await loadLayaML({ threads: 4 })
console.log(`[${config}] sesión lista en ${(h.loadMs / 1000).toFixed(1)}s | ya corridos: ${Object.keys(store[config]).length}/120`)

const normalize = (answers) => {
  const out = {}
  for (const [id, a] of Object.entries(answers)) {
    if ('choice' in a) out[id] = { v: a.choice, ce: a.confidence ?? a.confEntropy, cm: a.confidenceMargin ?? a.confMargin }
    else out[id] = { v: a.noul >= 0.5, p: a.noul, ce: a.confidenceEntropy ?? a.confEntropy, cm: a.confidence ?? a.confMargin }
  }
  return out
}

let i = 0
for (const d of DATASET) {
  i++
  if (store[config][d.id]) continue
  const t0 = Date.now()
  const res = family === 'flat'
    ? await classifyFlat(h, INTENT_SCHEMA, stateOf(d), { mode: 'parallel' })
    : await classifyHier(h, INTENT_SCHEMA, stateOf(d))
  store[config][d.id] = { fields: normalize(res.answers), ms: Date.now() - t0 }
  if (i % 10 === 0 || i === DATASET.length) {
    fs.writeFileSync(OUT, JSON.stringify(store))
    console.log(`[${config}] ${i}/120 · avg=${Math.round(Object.values(store[config]).reduce((a, b) => a + b.ms, 0) / Object.keys(store[config]).length)}ms`)
  }
}
fs.writeFileSync(OUT, JSON.stringify(store))
console.log(`[${config}] DONE ${Object.keys(store[config]).length}/120`)
