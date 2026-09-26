/**
 * Robot intent types — tipos de resultado del clasificador de intents.
 *
 * Los valores los produce classifyIntent() en shared/lib/laya.ts
 * (reglas, sin modelo — ver .agents/skills/laya.md).
 */

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
