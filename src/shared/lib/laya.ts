/**
 * Intent classifier — reglas (action/guardrails) + heurística (searchMode), ES/EN.
 *
 * Clasificador SIN modelo: regex para `action` y guardrails + heurística de
 * patrones para `searchMode`. 0ms, 0 descargas, siempre disponible.
 *
 * Historial: este módulo contenía la ruta ONNX de Laya (routeIntent, ~424MB).
 * Bake-off Fase 0→2 (120 queries ES/EN) la descartó — el modelo evalúa states
 * de conversación, no queries sueltas (OOD): route-exact 16.7% vs 30.8%
 * baseline. Además el candidato killkli fallaría siempre (feed `qtype` rank-2).
 * Fase 3 (validado sobre los mismos 120): reglas de `action` 100% acc / 100%
 * macro-F1, guardrails 100%, searchMode del heuristic v2 100%, route-exact 100%.
 * Veredicto y números: `.agents/skills/laya.md` → "Veredicto del bake-off".
 *
 * Precedencia de action: direct → chart → mcp → agent → web_search → rag.
 */

import type { ActionChoice, IntentResult, SearchModeChoice } from '../../entities/robot/intentSchema'

export type QueryClass = 'literal' | 'semantic'

// ─── searchMode: heurística de patrones (instant) ───────────────────────────

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

// ─── action: reglas de keywords (ES/EN) ─────────────────────────────────────

const DIRECT = /^(hola|buen[oa]s?( d[ií]as| tardes| noches)?|hey|hi+|hello|adi[oó]s|chao|gracias|thanks|thank you|bye|ok|vale)\b/i
const DIRECT2 = /\b(qué tal|cómo estás|como estas|how are you|what.s up|gracias por|thanks for|responder en (español|inglés)|answer in (english|spanish))\b/i

const CHART = /\b(gr[aá]fic[oa]s?|charts?|graphs?|histograms?|histogramas?|plot(s|ted)?|dibuj\w*|visualiz\w*|dashboards?|kpis?)\b/i

const MCP_KW = /\b(base de datos|database|endpoints?|apis?|sistema interno|internal system|query the|consulta (en|el|la|los))\b/i
const MCP_IMP = /^(ejecuta|consulta|llama|corre|run|query|call|fetch|check in)\b/i

const AGENT = /\b(analyz\w*|analiz\w*|exhaustiv\w*|thorough|deep analysis|cross-check|cruza\w*|detect\w*|inconsistenc\w*|enmiendas|amendments|prop[oó]n\w*|revisa el contrato completo|review the full contract|do a thorough)\b/i

const WEB = /\b(hoy|ahora mismo|esta semana|actualizad\w*|actualmente|noticias?|news|latest|this week|current(ly)?|updated|stock price|precio de la acci[óo]n|tipo de (inter[ée]s|cambio)|interest rate|GDP|PIB|market price(s)?|precios? del mercado|mercado actual|live (data|prices))\b/i

const SUMMARY = /\b(res[uú]m\w*|summar\w*|overview|en \d+ puntos|bullet points|explícame de qué trata|explain what this document)\b/i

const PAGEREF = /\b(p[áa]gina|pagina|page|art[íi]culo|article|secci[óo]n|section|cap[íi]tulo|chapter|cl[áa]usula|clause|punto|point|apartado|anexo|annex)\s*[nº°]?\s*\d/i

export function classifyAction(query: string): ActionChoice {
  const s = query.trim()
  if (DIRECT.test(s) || DIRECT2.test(s)) return 'direct'
  if (CHART.test(s)) return 'chart'
  if (MCP_KW.test(s) || MCP_IMP.test(s)) return 'mcp'
  if (AGENT.test(s)) return 'agent'
  if (WEB.test(s)) return 'web_search'
  return 'rag'
}

// ─── Intent completo ─────────────────────────────────────────────────────────

export function classifyIntent(query: string): IntentResult {
  const action = classifyAction(query)
  const searchMode: SearchModeChoice = classifyHeuristic(query)
  return {
    action,
    actionConfidence: action === 'rag' ? 0.5 : 0.9,
    searchMode,
    searchModeConfidence: searchMode === 'literal' ? 0.8 : 0.6,
    needsWeb: action === 'web_search',
    needsWebConfidence: action === 'web_search' ? 0.9 : 0.5,
    isPageRef: PAGEREF.test(query),
    isPageRefConfidence: 0.9,
    // 'analiza … y resume' es acción agent, no pedido de resumen
    isSummary: SUMMARY.test(query) && action !== 'agent',
    isSummaryConfidence: 0.9,
  }
}

/** searchMode class + confianza — usado por debug.ts testFlow. */
export function classifyQuery(query: string): { class: QueryClass; confidence: number; method: 'rules' } {
  const cls = classifyHeuristic(query)
  return { class: cls, confidence: cls === 'literal' ? 0.8 : 0.6, method: 'rules' }
}

// ─── Limpieza del cache ONNX legado (modelo Laya descartado) ─────────────────

const LEGACY_LAYA_CACHE = 'copixi_laya'

/**
 * Borra el directorio OPFS del modelo Laya (~424MB) que quedó en caché de
 * versiones anteriores. Best-effort: si no existe o falla, no hace nada.
 */
export async function clearLegacyLayaCache(): Promise<void> {
  try {
    if (!navigator.storage?.getDirectory) return
    const root = await navigator.storage.getDirectory()
    await root.removeEntry(LEGACY_LAYA_CACHE, { recursive: true })
    console.log('[Intent] Cleared legacy Laya ONNX cache from OPFS')
  } catch { /* no cached */ }
}
