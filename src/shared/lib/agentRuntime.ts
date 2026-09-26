/**
 * Agent Runtime — intent-driven orchestration for MercurBot.
 *
 * Responsibilities:
 *  - Classify the user query with classifyIntent() (rule-based, instant).
 *  - Execute the chosen action/tool pipeline via the tool registry.
 *  - Return a structured result for the UI to render.
 *
 * The LLM is only used for text generation; the rule-based intent decides actions.
 */

import { classifyIntent } from './laya'
import type { IntentResult } from '../../entities/robot/intentSchema'
import { selectChartFullPages } from './chartFull'
import { getTool, type ToolResult } from './tools'

export interface AgentStep {
  tool: string
  params: Record<string, unknown>
  result?: ToolResult
  display?: string
}

export interface AgentContext {
  pdfDoc?: { filename: string; totalPages?: number; pages?: { pageNumber: number; text: string }[] }
  locale?: string
  history?: Array<{ role: 'user' | 'assistant'; content: string }>
}

export interface AgentResult {
  action: string
  searchMode?: 'literal' | 'semantic'
  steps: AgentStep[]
  finalText?: string
  displayChain: string[]
  error?: string
}

function buildWebSearchQuery(query: string): string {
  const q = query.trim()
  if (q.length <= 80) return q
  const words = q.split(/\s+/)
  const stop = new Set(['qué','que','cómo','como','cuál','cual','dónde','donde','cuándo','cuando','por','qué','razón','tiene','esta','este','esto','una','un','el','la','los','las','de','del','en','es','y','o','a','para','con','sin','sobre','entre','desde','hasta','hay','ser','tener','puede','puedo','the','what','how','why','when','where','who','which','and','or','but','for','not','with','from','that','this'])
  const keywords = words.filter(w => !stop.has(w.toLowerCase()) && !/^[¿?¡!.,;:]+$/.test(w))
  const max = 8
  return keywords.slice(0, max).join(' ')
}

async function runWebSearch(query: string): Promise<ToolResult> {
  const tool = getTool('web_search')
  if (!tool) return { success: false, error: 'web_search tool not registered', display: 'Búsqueda web no disponible' }
  const searchQuery = buildWebSearchQuery(query)
  return tool.execute({ query: searchQuery })
}

async function runMcpTool(action: string, query: string): Promise<ToolResult> {
  const tool = getTool('mcp_tool')
  if (!tool) return { success: false, error: 'mcp_tool not registered', display: 'MCP no disponible' }
  return tool.execute({ action, query })
}

export async function executeAgent(query: string, ctx: AgentContext = {}): Promise<AgentResult> {
  const steps: AgentStep[] = []
  const displayChain: string[] = []

  let intent: IntentResult
  try {
    intent = classifyIntent(query)
  } catch {
    intent = { action: 'rag', searchMode: 'semantic', actionConfidence: 0, searchModeConfidence: 0, needsWeb: false, needsWebConfidence: 0, isPageRef: false, isPageRefConfidence: 0, isSummary: false, isSummaryConfidence: 0 }
  }

  const action = intent.action

  try {
    if (action === 'direct') {
      return { action, steps: [], displayChain: [], finalText: '' }
    }

    if (action === 'rag') {
      const searchMode = intent.searchMode === 'literal' ? 'literal' : 'semantic'
      const tool = getTool('rag_search')
      if (!tool) {
        return { action, searchMode, steps: [], displayChain: [], finalText: '', error: 'rag_search tool not registered' }
      }
      const result = await tool.execute({ query, topK: 3, searchMode })
      const hits = (result.data as any[]) || []
      if (hits.length === 0) {
        return { action, searchMode, steps: [{ tool: 'rag_search', params: { query, topK: 3, searchMode }, result, display: result.display }], displayChain: [result.display || 'No passages found'], finalText: '', error: 'No relevant information found in the document.' }
      }
      return {
        action,
        searchMode,
        steps: [{ tool: 'rag_search', params: { query, topK: 3, searchMode }, result, display: result.display }],
        displayChain: [result.display || `Found ${hits.length} passages`],
      }
    }

    if (action === 'chart') {
      if (!ctx.pdfDoc?.pages || ctx.pdfDoc.pages.length === 0) {
        return { action, steps: [], displayChain: [], finalText: '', error: 'No document loaded for chart generation.' }
      }
      const selection = selectChartFullPages(ctx.pdfDoc.pages.map(p => ({ pageNumber: p.pageNumber, text: p.text })))
      if (selection.pages.length === 0) {
        return { action, steps: [], displayChain: [], finalText: '', error: 'No analyzable pages for chart generation.' }
      }
      const display = `Analyzing ${selection.analyzedPages.length} pages`
      const tool = getTool('chart_full')
      const result: ToolResult = tool ? await tool.execute({ pages: selection.pages, totalPages: ctx.pdfDoc.totalPages ?? selection.totalPages, truncated: selection.truncated, filename: ctx.pdfDoc.filename, lang: ctx.locale }) : { success: false, error: 'chart_full tool not registered', display }
      return {
        action,
        steps: [{ tool: 'chart_full', params: { pages: selection.pages, totalPages: ctx.pdfDoc.totalPages ?? selection.totalPages, truncated: selection.truncated }, result, display }],
        displayChain: [result.display || display],
      }
    }

    if (action === 'web_search') {
      const display = 'Searching the web...'
      displayChain.push(display)
      const result = await runWebSearch(query)
      steps.push({ tool: 'web_search', params: { query }, result, display: result.display || display })
      return { action, steps, displayChain, finalText: result.data ? String(result.data) : undefined, error: result.error }
    }

    if (action === 'mcp') {
      const display = 'Running tool...'
      displayChain.push(display)
      const result = await runMcpTool(action, query)
      steps.push({ tool: 'mcp_tool', params: { action, query }, result, display: result.display || display })
      return { action, steps, displayChain, finalText: result.data ? String(result.data) : undefined, error: result.error }
    }

    if (action === 'agent') {
      const maxSteps = 3
      let currentQuery = query
      const agentSteps: AgentStep[] = []
      const agentDisplayChain: string[] = []

      for (let i = 0; i < maxSteps; i++) {
        let stepIntent: IntentResult
        try {
          stepIntent = classifyIntent(currentQuery)
        } catch {
          stepIntent = { action: 'rag' as const, searchMode: 'semantic' as const, actionConfidence: 0, searchModeConfidence: 0, needsWeb: false, needsWebConfidence: 0, isPageRef: false, isPageRefConfidence: 0, isSummary: false, isSummaryConfidence: 0 }
        }

        const stepAction = stepIntent.action
        if (stepAction === 'direct' || stepAction === 'agent') {
          break
        }

        if (stepAction === 'rag') {
          const searchMode = stepIntent.searchMode === 'literal' ? 'literal' : 'semantic'
          const tool = getTool('rag_search')
          const result = tool ? await tool.execute({ query: currentQuery, topK: 3, searchMode }) : { success: false, error: 'rag_search tool not registered', display: 'Search tool unavailable' }
          const hits = (result.data as any[]) || []
          const display = `Searching document... (${hits.length} passages)`
          agentDisplayChain.push(display)
          agentSteps.push({ tool: 'rag_search', params: { query: currentQuery, topK: 3, searchMode }, result, display })
          if (hits.length > 0) break
          currentQuery = `${currentQuery} — no results, retry`
          continue
        }

        if (stepAction === 'chart') {
          if (!ctx.pdfDoc?.pages || ctx.pdfDoc.pages.length === 0) {
            agentSteps.push({ tool: 'chart_full', params: {}, result: { success: false, error: 'No document loaded', display: 'No document for chart' }, display: 'No document for chart' })
            break
          }
          const selection = selectChartFullPages(ctx.pdfDoc.pages.map(p => ({ pageNumber: p.pageNumber, text: p.text })))
          const display = `Analyzing ${selection.analyzedPages.length} pages for chart`
          agentDisplayChain.push(display)
          const tool = getTool('chart_full')
          const result = tool ? await tool.execute({ pages: selection.pages, totalPages: ctx.pdfDoc.totalPages ?? selection.totalPages, truncated: selection.truncated, filename: ctx.pdfDoc.filename, lang: ctx.locale }) : { success: false, error: 'chart_full tool not registered', display }
          agentSteps.push({ tool: 'chart_full', params: { pages: selection.pages, totalPages: ctx.pdfDoc.totalPages ?? selection.totalPages, truncated: selection.truncated }, result, display })
          break
        }

        if (stepAction === 'web_search') {
          const display = 'Searching the web...'
          agentDisplayChain.push(display)
          const result = await runWebSearch(currentQuery)
          agentSteps.push({ tool: 'web_search', params: { query: currentQuery }, result, display: result.display || display })
          if (result.success && result.data) break
          currentQuery = `${currentQuery} — web search failed, retry`
          continue
        }

        if (stepAction === 'mcp') {
          const display = 'Running tool...'
          agentDisplayChain.push(display)
          const result = await runMcpTool(stepAction, currentQuery)
          agentSteps.push({ tool: 'mcp_tool', params: { action: stepAction, query: currentQuery }, result, display: result.display || display })
          break
        }

        break
      }

      return { action, steps: agentSteps, displayChain: agentDisplayChain }
    }

    return { action, steps: [], displayChain: [], finalText: '', error: `Unhandled action: ${action}` }
  } catch (err) {
    return { action, steps, displayChain, error: err instanceof Error ? err.message : 'Agent execution failed' }
  }
}
