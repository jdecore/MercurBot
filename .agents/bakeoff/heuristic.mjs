/**
 * heuristic.mjs — Baseline del bake-off (Fase 1).
 *
 * Réplica fiel de lo que HOY corre en producción (src/):
 *  - searchMode: classifyHeuristic() de laya.ts (worker.ts:335 usa este fallback
 *    cuando routeIntent no pasa hint).
 *  - action/guardrails: cuando routeIntent devuelve null, agentRuntime.ts:71
 *    defaultea a { action:'rag', searchMode:'semantic', needsWeb:false,
 *    isPageRef:false, isSummary:false }.
 *
 * Se exportan dos baselines:
 *  - baselineHeuristic: lo que el usuario llamó "baseline classifyHeuristic"
 *    (searchMode real + defaults para el resto).
 *  - baselineCurrent: default estricto de executeAgent (todo default).
 */

const LITERAL_PATTERNS = [
  /^\W*(cuánto|cuánta|cuántos|cuántas|how much|how many)\b/i,
  /^(qué página|qué pagina|en qué página|en qué pagina|what page|which page)/i,
  /^(cuándo|cuándo fue|when did|when was)/i,
  /^(dónde está|dónde se|where is|where does)/i,
  /^(quién|who)\s/i,
  /^(artículo|art\.|section|sección|clause|cláusula|chapter|capítulo)\s*\d/i,
  /\b(artículo|art\.|article|section|sección|clause|cláusula|chapter|capítulo|punto|point|apartado|annex|anexo)\s*\d/i,
  /\b(porcentaje|percentage|VAT|IVA)\b/i,
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

/** Réplica exacta de laya.ts classifyHeuristic(). */
export function classifyHeuristic(query) {
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

/** Baseline principal: heuristic para searchMode + defaults del resto. */
export function baselineHeuristic(query) {
  const searchMode = classifyHeuristic(query)
  return {
    action: 'rag',
    actionConfidence: 0,
    searchMode,
    searchModeConfidence: searchMode === 'literal' ? 0.8 : 0.6, // worker.ts
    needsWeb: false,
    needsWebConfidence: 0,
    isPageRef: false,
    isPageRefConfidence: 0,
    isSummary: false,
    isSummaryConfidence: 0,
    method: 'heuristic',
  }
}

/** Default estricto de executeAgent cuando routeIntent() lanza/devuelve null. */
export function baselineCurrent() {
  return {
    action: 'rag', actionConfidence: 0,
    searchMode: 'semantic', searchModeConfidence: 0,
    needsWeb: false, needsWebConfidence: 0,
    isPageRef: false, isPageRefConfidence: 0,
    isSummary: false, isSummaryConfidence: 0,
    method: 'defaults',
  }
}

/** Normaliza la respuesta del adaptador flat al mismo shape que los baselines. */
export function normalizeAnswers(answers) {
  return {
    action: answers.action?.choice ?? 'rag',
    actionConfidence: answers.action?.confidence ?? 0,
    searchMode: answers.searchMode?.choice ?? 'semantic',
    searchModeConfidence: answers.searchMode?.confidence ?? 0,
    needsWeb: (answers.needsWeb?.noul ?? 0) >= 0.5,
    needsWebConfidence: answers.needsWeb?.confidence ?? 0,
    isPageRef: (answers.isPageRef?.noul ?? 0) >= 0.5,
    isPageRefConfidence: answers.isPageRef?.confidence ?? 0,
    isSummary: (answers.isSummary?.noul ?? 0) >= 0.5,
    isSummaryConfidence: answers.isSummary?.confidence ?? 0,
    method: 'layaML',
  }
}
