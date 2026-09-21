import { createContext, useContext } from 'react'

export interface MercurBotContextValue {
  pdfDoc: { filename: string; totalPages: number; pages: { text: string }[]; docId: string } | null
  pdfFile: File | null
  ragClient: {
    indexDocument: (docId: string, filename: string, chunks: { text: string }[]) => Promise<void>
    searchMainThread: (query: string) => Promise<{ text: string; page: number }[]>
  }
  appendChatMessage: (text: string) => void
  setMascotaMood: (mood: string) => void
}

export const MercurBotContext = createContext<MercurBotContextValue>({
  pdfDoc: null,
  pdfFile: null,
  ragClient: {
    indexDocument: async () => {},
    searchMainThread: async () => [],
  },
  appendChatMessage: () => {},
  setMascotaMood: () => {},
})

export function useMercurBot() {
  return useContext(MercurBotContext)
}
