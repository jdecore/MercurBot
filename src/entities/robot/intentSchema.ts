/**
 * Robot intent schema — Laya typed questions for routing.
 *
 * Defines what actions the robot can take, what search mode to use,
 * and guardrail checks (noul).
 * Used by routeIntent() in laya.ts to decide the user's intent.
 */

export interface IntentQuestion {
  type: 'choice' | 'noul' | 'score'
  instructions: string
  criteria?: Record<string, string>
}

export interface IntentSchema extends Record<string, IntentQuestion> {
  action: IntentQuestion
  searchMode: IntentQuestion
  needsWeb: IntentQuestion
  isPageRef: IntentQuestion
  isSummary: IntentQuestion
}

export const INTENT_SCHEMA: IntentSchema = {
  action: {
    type: 'choice',
    instructions: 'What action should the robot take for this user message?',
    criteria: {
      rag: 'Search the document for relevant information to answer the question',
      direct: 'Answer directly without searching the document (greetings, thanks, general chat, commands that do not need document context)',
      chart: 'Generate a chart, graph, or data visualization from the document',
      web_search: 'Search the web for current/recent information the document does not contain (news, prices, live data, external facts). Use this ONLY if the user explicitly asks about external/current information not in the PDF.',
      mcp: 'Use an available MCP tool (database query, calculation, API call, etc.)',
      agent: 'This requires multiple steps or tool use to answer properly (complex analysis, multi-source reasoning)',
    },
  },
  searchMode: {
    type: 'choice',
    instructions: 'If searching the document, what kind of search is needed?',
    criteria: {
      literal: 'Find exact words, numbers, page references, article numbers, dates, or specific terms in the text',
      semantic: 'Search by meaning, concepts, or paraphrases — the answer might be written differently than the question',
    },
  },
  needsWeb: {
    type: 'noul',
    instructions: 'Does this query require information that is NOT in the loaded document? For example: current news, external comparisons, general knowledge not found in the PDF.',
  },
  isPageRef: {
    type: 'noul',
    instructions: 'Does this query reference a specific page number, article number, section, clause, or chapter in the document?',
  },
  isSummary: {
    type: 'noul',
    instructions: 'Does the user want a summary, overview, or general explanation of the document content?',
  },
}

export type ActionChoice = 'rag' | 'direct' | 'chart' | 'web_search' | 'mcp' | 'agent'
export type SearchModeChoice = 'literal' | 'semantic'

export interface IntentResult {
  action: ActionChoice
  actionConfidence: number
  searchMode: SearchModeChoice
  searchModeConfidence: number
  needsWeb: boolean
  needsWebConfidence: number
  isPageRef: boolean
  isPageRefConfidence: number
  isSummary: boolean
  isSummaryConfidence: number
}

export function parseIntentResult(
  results: Record<string, { choice?: string; confidence?: number; noul?: number }> | null,
): IntentResult {
  const allowed: ActionChoice[] = ['rag', 'direct', 'chart', 'web_search', 'mcp', 'agent']
  const rawChoice = results?.action?.choice
  const action = allowed.includes(rawChoice as ActionChoice) ? (rawChoice as ActionChoice) : 'rag'
  return {
    action,
    actionConfidence: results?.action?.confidence ?? 0.5,
    searchMode: (results?.searchMode?.choice as SearchModeChoice) ?? 'semantic',
    searchModeConfidence: results?.searchMode?.confidence ?? 0.5,
    needsWeb: (results?.needsWeb?.noul ?? 0) >= 0.5,
    needsWebConfidence: results?.needsWeb?.confidence ?? 0.5,
    isPageRef: (results?.isPageRef?.noul ?? 0) >= 0.5,
    isPageRefConfidence: results?.isPageRef?.confidence ?? 0.5,
    isSummary: (results?.isSummary?.noul ?? 0) >= 0.5,
    isSummaryConfidence: results?.isSummary?.confidence ?? 0.5,
  }
}
