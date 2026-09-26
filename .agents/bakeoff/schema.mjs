/**
 * schema.mjs — Espejo de src/entities/robot/intentSchema.ts (INTENT_SCHEMA).
 * Copia literal: si cambia el schema en src/, actualizar aquí (el bake-off compara
 * exactamente las 5 preguntas que ejecuta executeAgent en producción).
 */

export const INTENT_SCHEMA = {
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
