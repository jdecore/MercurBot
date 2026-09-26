/**
 * hier.mjs — Layout JERÁRQUICO (K=2) del bake-off Fase 2.
 *
 * Descompone `action` (K=6 en flat) en un árbol de preguntas binarias con
 * early-exit; `searchMode` y los 3 guardrails noul son iguales a flat.
 *
 * Árbol (cada nodo = choice K=2, qtype=0):
 *
 *   N1 ¿es sobre el contenido del documento?
 *   ├─ doc   → N2 ¿multi-paso / análisis complejo?  → sí: agent
 *   │         └─ no → N3 ¿quiere visualización?     → sí: chart / no: rag
 *   └─ other → N4 ¿chat social/funcional?           → sí: direct
 *             └─ no → N5 ¿info externa (web)?       → sí: web_search
 *                   └─ no → N6 ¿herramienta/API/cálculo? → sí: mcp / no: agent
 *
 * Profundidad media ≈ 3 (rag=3, direct=2, web=3, chart=4, mcp=4, agent=3).
 * Los 3 noul + searchMode corren EN PARALELO con la cadena (Promise.all).
 */
import { askBatch } from './layaML.mjs'

export const ACTION_TREE = {
  N1: {
    type: 'choice',
    instructions: 'Is this request about the content of the loaded document?',
    criteria: {
      doc: 'Yes — it asks about, analyzes, summarizes or visualizes the loaded document',
      other: 'No — it is a greeting, a social/functional message, an external information request, or a tool call unrelated to the document content',
    },
  },
  N2: {
    type: 'choice',
    instructions: 'Does this request require multiple steps, tool use, or deep multi-source reasoning?',
    criteria: {
      multi: 'Yes — complex analysis, cross-referencing several parts or sources, or a chain of actions',
      simple: 'No — a single search, answer, summary or visualization is enough',
    },
  },
  N3: {
    type: 'choice',
    instructions: 'Does the user want a chart, graph, table or data visualization?',
    criteria: {
      viz: 'Yes — generate a chart, graph, histogram or visual comparison',
      search: 'No — wants information, an answer, a summary or an explanation from the document',
    },
  },
  N4: {
    type: 'choice',
    instructions: 'Is this a social or functional message that needs no tools?',
    criteria: {
      chat: 'Yes — greeting, thanks, small talk, preference or simple command answerable directly',
      task: 'No — it requires information, a tool, or an external action',
    },
  },
  N5: {
    type: 'choice',
    instructions: 'Does this request need current or external information that is NOT in the document?',
    criteria: {
      web: 'Yes — news, prices, live data, external facts (web search needed)',
      tool: 'No — it needs a database, API, calculation or internal system instead',
    },
  },
  N6: {
    type: 'choice',
    instructions: 'Is this a single tool/database/API call, or a multi-step task?',
    criteria: {
      mcp: 'A single tool call (database query, calculation, API request)',
      agent: 'Multiple steps or complex reasoning to complete',
    },
  },
}

const NEXT = { N1: { doc: 'N2', other: 'N4' }, N2: { multi: 'agent', simple: 'N3' }, N3: { viz: 'chart', search: 'rag' }, N4: { chat: 'direct', task: 'N5' }, N5: { web: 'web_search', tool: 'N6' }, N6: { mcp: 'mcp', agent: 'agent' } }

const GUARD_IDS = ['needsWeb', 'isPageRef', 'isSummary']

/**
 * @param questions — { searchMode, needsWeb, isPageRef, isSummary } (iguales a flat)
 * @returns { answers: {field: {choice|noul, confEntropy, confMargin, probs}}, ms, path }
 */
export async function classifyHier(h, questions, state) {
  const t0 = Date.now()

  const runChain = async () => {
    const path = []
    let node = 'N1'
    for (let depth = 0; depth < 8; depth++) {
      const map = await askBatch(h, [{ id: node, q: ACTION_TREE[node], state }])
      const ans = map.get(node)
      const choice = ans.choice
      path.push({ node, choice, confEntropy: ans.confEntropy, probs: ans.probabilities })
      const next = NEXT[node]?.[choice]
      // hoja: next es una etiqueta de acción (rag/chart/direct/…) y NO un nodo del árbol
      if (!next || !(next in ACTION_TREE)) {
        const action = next ?? choice
        return {
          action: { choice: action, confidence: ans.confEntropy, confidenceMargin: ans.confMargin, probabilities: ans.probabilities, path },
          ms: Date.now() - t0,
        }
      }
      node = next
    }
    throw new Error('hier: profundidad > 8 (ciclo en el árbol)')
  }

  const runParallel = () => Promise.all([
    ...GUARD_IDS.map(async (id) => {
      const map = await askBatch(h, [{ id, q: questions[id], state }])
      return [id, map.get(id)]
    }),
    (async () => {
      const map = await askBatch(h, [{ id: 'searchMode', q: questions.searchMode, state }])
      return ['searchMode', map.get('searchMode')]
    })(),
  ])

  const [chain, parallel] = await Promise.all([runChain(), runParallel()])
  const ms = Date.now() - t0

  const answers = { action: chain.action }
  for (const [id, a] of parallel) {
    if ('choice' in a) answers[id] = { choice: a.choice, confidence: a.confEntropy, confidenceMargin: a.confMargin, probabilities: a.probabilities }
    else answers[id] = { noul: a.noul, confidence: a.confMargin, confidenceEntropy: a.confEntropy, probabilities: a.probabilities }
  }
  return { answers, ms, path: chain.action.path }
}
