/**
 * Robot intent schema — Laya choice questions for routing.
 *
 * Defines what actions the robot can take and what search mode to use.
 * Used by routeIntent() in laya.ts to decide the user's intent.
 */

export interface IntentQuestion {
  type: 'choice'
  instructions: string
  criteria: Record<string, string>
}

export interface IntentSchema extends Record<string, IntentQuestion> {
  action: IntentQuestion
  searchMode: IntentQuestion
}

/**
 * Default routing questions for MercurBot.
 *
 * - action: What should the robot do with this message?
 *   - rag: Search the document for relevant information
 *   - direct: Answer directly without searching (greetings, small talk, etc.)
 *   - chart: Generate a chart or visualization
 *
 * - searchMode: How should RAG search work?
 *   - literal: Find exact words, numbers, pages, articles
 *   - semantic: Search by meaning (synonyms, paraphrases, concepts)
 */
export const INTENT_SCHEMA: IntentSchema = {
  action: {
    type: 'choice',
    instructions: 'What action should the robot take for this user message?',
    criteria: {
      rag: 'Search the document for relevant information to answer the question',
      direct: 'Answer directly without searching the document (greetings, thanks, general chat, commands that do not need document context)',
      chart: 'Generate a chart, graph, or data visualization from the document',
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
}

export type ActionChoice = 'rag' | 'direct' | 'chart'
export type SearchModeChoice = 'literal' | 'semantic'

export interface IntentResult {
  action: ActionChoice
  actionConfidence: number
  searchMode: SearchModeChoice
  searchModeConfidence: number
}

/**
 * Parse Laya routeIntent results into typed intent.
 * Falls back to defaults if results are missing.
 */
export function parseIntentResult(
  results: Record<string, { choice?: string; confidence?: number }> | null,
): IntentResult {
  return {
    action: (results?.action?.choice as ActionChoice) ?? 'rag',
    actionConfidence: results?.action?.confidence ?? 0.5,
    searchMode: (results?.searchMode?.choice as SearchModeChoice) ?? 'semantic',
    searchModeConfidence: results?.searchMode?.confidence ?? 0.5,
  }
}
