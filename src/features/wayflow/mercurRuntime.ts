import { createRuntime, type Runtime } from 'wayflow/runtime'

export interface MercurBotRuntimeContext {
  pdfDoc: { filename: string; totalPages: number; pages: { text: string }[]; docId: string } | null
  ragClient: {
    searchMainThread: (query: string, topK: number) => { text: string; pageNumber: number }[]
  }
}

export function createMercurRuntime(mercur: MercurBotRuntimeContext): Runtime {
  return createRuntime({
    handlers: {
      pdfLoad: () => Promise.resolve({ pdf: mercur.pdfDoc }),
      pdfExtractPage: (node) => {
        const page = Number(node.data.page ?? 1)
        const total = mercur.pdfDoc?.totalPages ?? 1
        const clamped = Number.isFinite(page) ? Math.max(1, Math.min(page, total)) : 1
        const text = mercur.pdfDoc?.pages[clamped - 1]?.text ?? ''
        return Promise.resolve({ text })
      },
      ragSearch: async (node, inputs) => {
        const query = String(inputs.query ?? '')
        if (!query) return Promise.resolve({ results: [] as { text: string; pageNumber: number }[] })
        const limit = Number(node.data.limit ?? 3)
        const results = mercur.ragClient.searchMainThread(query, Number.isFinite(limit) ? limit : 3)
        return Promise.resolve({ results: results.slice(0, Number.isFinite(limit) ? limit : 3) })
      },
      chatQuery: async (node, inputs, ctx) => {
        const prompt = String(node.data.prompt ?? '')
        const context = String(inputs.context ?? '')
        const fullPrompt = context ? `${context}\n\n${prompt}` : prompt
        try {
          const res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: fullPrompt, mode: 'chat' }),
            signal: ctx.signal,
          })
          const json = (await res.json()) as { text?: string }
          return Promise.resolve({ answer: json.text ?? '' })
        } catch {
          return Promise.resolve({ answer: 'Error al consultar la IA.' })
        }
      },
      outputChat: (_node, inputs) => {
        const text = String(inputs.text ?? '')
        if (text) {
          window.dispatchEvent(new CustomEvent('copixi:append-message', { detail: text }))
        }
        return Promise.resolve({})
      },
    },
  })
}
