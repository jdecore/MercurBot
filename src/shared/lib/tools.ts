/**
 * Tool registry for Laya-driven agent routing.
 *
 * Tools are the executable units behind Laya-classified actions.
 * Frontend tools run in the browser; server tools execute in Vercel.
 */

export interface Tool {
  name: string
  description: string
  parameters: Record<string, unknown>
  execute: (params: Record<string, unknown>) => Promise<ToolResult>
}

export interface ToolResult {
  success: boolean
  data?: unknown
  error?: string
  display?: string
}

const registry = new Map<string, Tool>()

export function registerTool(tool: Tool) {
  registry.set(tool.name, tool)
}

export function getTool(name: string): Tool | undefined {
  return registry.get(name)
}

export function listTools(): Tool[] {
  return Array.from(registry.values())
}

export function clearTools() {
  registry.clear()
}

export function buildToolsCatalog() {
  return listTools().map(t => ({ name: t.name, description: t.description, parameters: t.parameters }))
}

export function resetToolRegistry() {
  clearTools()
  registerDefaultTools()
}

function safeCalculation(expr: string): { value: number | null; error?: string } {
  try {
    const sanitized = expr.replace(/[^0-9+\-*/().%\s]/g, '').trim()
    if (!sanitized) return { value: null, error: 'Empty expression' }
    const result = new Function(`"use strict"; return (${sanitized})`)()
    if (typeof result !== 'number' || !Number.isFinite(result)) return { value: null, error: 'Invalid result' }
    return { value: result }
  } catch {
    return { value: null, error: 'Invalid expression' }
  }
}

async function searchWeb(params: Record<string, unknown>): Promise<ToolResult> {
  const query = String(params.query || '').trim()
  if (!query) return { success: false, error: 'Empty query', display: 'Empty search query' }
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'web_search', query, lang: (params.lang as string) || 'es' }),
    })
    if (!res.ok) return { success: false, error: `HTTP ${res.status}`, display: `Web search failed (${res.status})` }
    const data = (await res.json()) as { text?: string; error?: string }
    if (data.error) return { success: false, error: data.error, display: data.error }
    return { success: true, data: data.text, display: data.text ? `Web result: ${String(data.text).slice(0, 120)}...` : 'No results' }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Network error', display: 'Web search error' }
  }
}

async function callMcp(params: Record<string, unknown>): Promise<ToolResult> {
  const toolName = String(params.tool || params.action || '')
  const toolParams = (params.params || params.arguments || {}) as Record<string, unknown>
  if (!toolName) return { success: false, error: 'Missing MCP tool name', display: 'Missing MCP tool name' }
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'mcp', tool: toolName, params: toolParams, lang: (params.lang as string) || 'es' }),
    })
    if (!res.ok) return { success: false, error: `HTTP ${res.status}`, display: `MCP call failed (${res.status})` }
    const data = (await res.json()) as { result?: unknown; error?: string; display?: string }
    if (data.error) return { success: false, error: data.error, display: data.error }
    return { success: true, data: data.result, display: data.display ? String(data.display) : `MCP ${toolName} done` }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Network error', display: 'MCP call error' }
  }
}

async function generateChartFull(params: Record<string, unknown>): Promise<ToolResult> {
  const pages = (params.pages as Array<{ page: number; text: string }>) || []
  const totalPages = Number(params.totalPages || 0)
  const truncated = params.truncated === true
  const filename = String(params.filename || 'document.pdf')
  const lang = String(params.lang || 'es')
  if (!pages.length) return { success: false, error: 'No pages for chart', display: 'No pages for chart' }
  try {
    const body = {
      mode: 'chart-full',
      filename,
      totalPages,
      truncated,
      pages,
      lang,
    }
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const msg = `HTTP ${res.status}`
      return { success: false, error: msg, display: msg }
    }
    const data = (await res.json()) as { text?: string; analyzedPages?: number[]; model?: string; error?: string }
    if (data.error || !data.text) return { success: false, error: data.error || 'Empty chart response', display: data.error || 'Empty chart response' }
    const chartMatch = data.text.match(/```chart-json\s*([\s\S]*?)```/i)
    let chart: { chartType: string; title: string; unit?: string; data: Array<{ label: string; value: number; sourcePage: number }> } | null = null
    if (chartMatch) {
      try {
        const parsed = JSON.parse(chartMatch[1].trim())
        chart = parsed
      } catch {
        chart = null
      }
    }
    return {
      success: true,
      data: { text: data.text, chart, analyzedPages: data.analyzedPages, model: data.model },
      display: `Chart generated from ${Array.isArray(data.analyzedPages) ? data.analyzedPages.length : pages.length} pages`,
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Network error', display: 'Chart generation failed' }
  }
}

export function registerDefaultTools() {
  registerTool({
    name: 'rag_search',
    description: 'Search the loaded PDF document for relevant passages using RAG.',
    parameters: { type: 'object', properties: { query: { type: 'string' }, topK: { type: 'number' }, searchMode: { type: 'string', enum: ['literal', 'semantic'] } } },
    execute: async (params) => {
      const query = String(params.query || '').trim()
      const topK = Number(params.topK || 3)
      const searchMode = params.searchMode === 'literal' ? 'literal' : 'semantic'
      if (!query) return { success: false, error: 'Empty query', display: 'Empty search query' }
      try {
        const result = await import('../../features/rag/ragPipeline').then(m => m.runRagPipeline(query, topK, searchMode))
        const hits = result.hits
        return { success: true, data: hits, display: `Found ${hits.length} passages` }
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Search failed', display: 'Search failed' }
      }
    },
  })

  registerTool({
    name: 'chart_full',
    description: 'Generate a chart from the full document.',
    parameters: { type: 'object', properties: { filename: { type: 'string' }, totalPages: { type: 'number' }, pages: { type: 'array' }, truncated: { type: 'boolean' }, lang: { type: 'string' } } },
    execute: generateChartFull,
  })

  registerTool({
    name: 'web_search',
    description: 'Search the web for external information not in the document.',
    parameters: { type: 'object', properties: { query: { type: 'string' }, lang: { type: 'string' } } },
    execute: searchWeb,
  })

  registerTool({
    name: 'mcp_tool',
    description: 'Call an MCP tool by name.',
    parameters: { type: 'object', properties: { tool: { type: 'string' }, params: { type: 'object' }, lang: { type: 'string' } } },
    execute: callMcp,
  })

  registerTool({
    name: 'calculate',
    description: 'Evaluate a simple mathematical expression.',
    parameters: { type: 'object', properties: { expression: { type: 'string' } } },
    execute: async (params) => {
      const expr = String(params.expression || '').trim()
      if (!expr) return { success: false, error: 'Empty expression', display: 'Empty expression' }
      const { value, error } = safeCalculation(expr)
      if (error) return { success: false, error, display: error }
      return { success: true, data: value, display: `Result: ${value}` }
    },
  })
}
