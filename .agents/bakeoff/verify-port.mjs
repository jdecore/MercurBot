// Verifica que el port en src/shared/lib/laya.ts (TS) reproduce el harness.
import { classifyIntent, classifyHeuristic, classifyAction } from '../../src/shared/lib/laya.ts'
import { rulesIntent } from './rules.mjs'
import { DATASET } from './dataset.mjs'

const FIELDS = ['action', 'searchMode', 'needsWeb', 'isPageRef', 'isSummary']
let mismatches = 0, routeExact = 0, actionOk = 0, smOk = 0
for (const d of DATASET) {
  const a = classifyIntent(d.q)
  const b = rulesIntent(d.q)
  for (const f of FIELDS) {
    if (a[f] !== b[f]) { mismatches++; console.log('MISMATCH', d.id, f, a[f], 'vs', b[f], '::', d.q) }
  }
  if (a.action === d.action) actionOk++
  if (d.action !== 'rag' || a.searchMode === d.searchMode) smOk++
  const exact = FIELDS.every(f => f !== 'searchMode' || d.action === 'rag' ? a[f] === d[f] : true)
  if (exact) routeExact++
}
console.log(`src vs harness mismatches: ${mismatches}`)
console.log(`src acc: action=${(actionOk/DATASET.length*100).toFixed(1)}% searchMode(non-rag skip)=${(smOk/DATASET.length*100).toFixed(1)}% route-exact=${(routeExact/DATASET.length*100).toFixed(1)}%`)
process.exit(mismatches === 0 ? 0 : 1)
