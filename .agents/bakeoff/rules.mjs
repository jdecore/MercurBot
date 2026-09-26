/**
 * rules.mjs — Fase 3a: clasificador de `action` + guardrails POR REGLAS (regex, ES+EN).
 *
 * Motivo: routeIntent() nunca corrió → en producción action='rag' siempre y las ramas
 * direct/chart/web_search/mcp/agent de agentRuntime están muertas. Estas reglas son el
 * baseline "inteligente" (0ms, 0MB) y se validan offline contra el dataset de 120 del bake-off.
 *
 * Orden de precedencia: direct → chart → mcp → agent → web_search → rag.
 */
import { classifyHeuristic } from './heuristic.mjs'

const DIRECT = /^(hola|buen[oa]s?( d[ií]as| tardes| noches)?|hey|hi+|hello|adi[oó]s|chao|gracias|thanks|thank you|bye|ok|vale)\b/i
const DIRECT2 = /\b(qué tal|cómo estás|como estas|how are you|what.s up|gracias por|thanks for|responder en (español|inglés)|answer in (english|spanish))\b/i

const CHART = /\b(gr[aá]fic[oa]s?|charts?|graphs?|histograms?|histogramas?|plot(s|ted)?|dibuj\w*|visualiz\w*|dashboards?|kpis?)\b/i

const MCP_KW = /\b(base de datos|database|endpoints?|apis?|sistema interno|internal system|query the|consulta (en|el|la|los))\b/i
const MCP_IMP = /^(ejecuta|consulta|llama|corre|run|query|call|fetch|check in)\b/i

const AGENT = /\b(analyz\w*|analiz\w*|exhaustiv\w*|thorough|deep analysis|cross-check|cruza\w*|detect\w*|inconsistenc\w*|enmiendas|amendments|prop[oó]n\w*|revisa el contrato completo|review the full contract|do a thorough)\b/i

const WEB = /\b(hoy|ahora mismo|esta semana|actualizad\w*|actualmente|noticias?|news|latest|this week|current(ly)?|updated|stock price|precio de la acci[óo]n|tipo de (inter[ée]s|cambio)|interest rate|GDP|PIB|market price(s)?|precios? del mercado|mercado actual|live (data|prices))\b/i

const SUMMARY = /\b(res[uú]m\w*|summar\w*|overview|en \d+ puntos|bullet points|explícame de qué trata|explain what this document)\b/i

const PAGEREF = /\b(p[áa]gina|pagina|page|art[íi]culo|article|secci[óo]n|section|cap[íi]tulo|chapter|cl[áa]usula|clause|punto|point|apartado|anexo|annex)\s*[nº°]?\s*\d/i

/** action por reglas. */
export function classifyActionRules(q) {
  const s = q.trim()
  if (DIRECT.test(s) || DIRECT2.test(s)) return 'direct'
  if (CHART.test(s)) return 'chart'
  if (MCP_KW.test(s) || MCP_IMP.test(s)) return 'mcp'
  if (AGENT.test(s)) return 'agent'
  if (WEB.test(s)) return 'web_search'
  return 'rag'
}

/**
 * Intent completo por reglas: action + guardrails + searchMode (heuristic).
 * Mismo shape que baselineHeuristic()/normalizeAnswers() de heuristic.mjs.
 */
export function rulesIntent(query) {
  const action = classifyActionRules(query)
  const searchMode = classifyHeuristic(query)
  return {
    action,
    actionConfidence: action === 'rag' ? 0.5 : 0.9,
    searchMode,
    searchModeConfidence: searchMode === 'literal' ? 0.8 : 0.6,
    needsWeb: action === 'web_search',
    needsWebConfidence: action === 'web_search' ? 0.9 : 0.5,
    isPageRef: PAGEREF.test(query),
    isPageRefConfidence: 0.9,
    isSummary: SUMMARY.test(query) && action !== 'agent', // 'analiza … y resume' no es pedido de resumen
    isSummaryConfidence: 0.9,
    method: 'rules',
  }
}
