import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import type { PdfExtractResult } from '../../entities/pdf/extractors/pdf'

type DashboardContextValue = {
  error: string | null
  loading: boolean
  pdfDoc: PdfExtractResult | null
  setError: (msg: string | null) => void
  setLoading: (v: boolean) => void
  setPdfDoc: (doc: PdfExtractResult | null) => void
}

const DashboardContext = createContext<DashboardContextValue | null>(null)

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [pdfDoc, setPdfDocState] = useState<PdfExtractResult | null>(null)

  const setPdfDoc = useCallback((doc: PdfExtractResult | null) => {
    setPdfDocState(doc)
    if (doc) setError(null)
  }, [])

  const value: DashboardContextValue = {
    error, loading, pdfDoc, setError, setLoading, setPdfDoc,
  }

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>
}

export function useDashboard() {
  const ctx = useContext(DashboardContext)
  if (!ctx) throw new Error('useDashboard must be used within DashboardProvider')
  return ctx
}
