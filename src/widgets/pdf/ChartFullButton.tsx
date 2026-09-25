import { useEffect, useRef, useState } from 'react'
import type { PdfPageText } from '../../entities/pdf/extractors/pdf'
import { selectChartFullPages, formatPageRange, countSelectionFigures, type ChartFullSelection } from '../../shared/lib/chartFull'
import { useLocale } from '../../shared/lib/locale'

export interface ChartFullResultDetail {
  docId: string; text: string; analyzedPages: number[]; truncated: boolean; totalPages: number; model?: string
}

type CfState = 'idle' | 'confirm' | 'working' | 'error'

export function ChartFullButton({ pages, filename, docId, totalPages }: { pages: PdfPageText[]; filename: string; docId: string; totalPages: number }) {
  const [state, setState] = useState<CfState>('idle')
  const [sel, setSel] = useState<ChartFullSelection | null>(null)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const { t, locale } = useLocale()

  useEffect(() => () => abortRef.current?.abort(), [])

  const openConfirm = () => {
    const selection = selectChartFullPages(pages.map((p) => ({ pageNumber: p.pageNumber, text: p.text })))
    if (selection.pages.length === 0) { setSel(selection); setError(t.cfScanned); setState('error'); return }
    setSel(selection); setError(null); setState('confirm')
  }

  const cancelAll = () => { abortRef.current?.abort(); abortRef.current = null; setState('idle'); setSel(null) }

  const send = async () => {
    const selection = sel ?? selectChartFullPages(pages.map((p) => ({ pageNumber: p.pageNumber, text: p.text })))
    if (selection.pages.length === 0) { setError(t.cfNoText); setState('error'); return }
    const ctrl = new AbortController(); abortRef.current = ctrl; setState('working'); setError(null)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: 'chart-full', filename, totalPages, truncated: selection.truncated, pages: selection.pages, lang: locale }),
        signal: ctrl.signal,
      })
      if (!res.ok) {
        if (res.status === 429) throw new Error(t.cf429)
        if (res.status === 413) throw new Error(t.cf413)
        if (res.status === 404) throw new Error(t.cf404)
        if (res.status === 502) throw new Error(t.cf502)
        if (res.status === 504) throw new Error(t.cf504)
        throw new Error(t.cfHttp(res.status))
      }
      const data = (await res.json()) as { text?: string; analyzedPages?: number[]; model?: string; error?: string }
      if (!data.text || typeof data.text !== 'string') throw new Error(data.error ?? t.cfEmpty)
      window.dispatchEvent(new CustomEvent<ChartFullResultDetail>('copixi:chart-full-result', {
        detail: { docId, text: data.text, analyzedPages: Array.isArray(data.analyzedPages) ? data.analyzedPages : selection.analyzedPages, truncated: selection.truncated, totalPages, model: typeof data.model === 'string' ? data.model : undefined },
      }))
      setState('idle'); setSel(null)
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') { setState('idle'); return }
      setError(e instanceof Error ? e.message : t.cfCatch); setState('error')
    } finally { if (abortRef.current === ctrl) abortRef.current = null }
  }

  const scopeLine = sel ? (sel.truncated ? t.cfScopeTrunc(formatPageRange(sel.analyzedPages), totalPages) : t.cfScopeFull(totalPages)) : ''
  const figCount = sel ? countSelectionFigures(sel.pages) : 0
  const figWarning = sel && sel.pages.length > 0 && figCount === 0 ? t.cfWarnZero
    : sel && sel.pages.length > 0 && figCount < 10 ? t.cfWarnLow(figCount) : null

  return (
    <div className="chart-full">
      {(state === 'idle' || state === 'confirm') && (
        <button type="button" className="btn btn-primary small" onClick={state === 'idle' ? openConfirm : send}
          disabled={state === 'confirm' && (!sel || sel.pages.length === 0)} title={t.cfTitle} aria-label={t.cfAria} aria-expanded={state === 'confirm'}>
          {state === 'idle' ? t.cfBtn : t.cfSend}
        </button>
      )}
      {state === 'confirm' && (
        <div className="chart-full-box" role="dialog" aria-label={t.cfConfirmAria}>
          <p className="chart-full-consent">{t.cfConsentPrefix} {sel?.truncated ? t.cfConsentTrunc : t.cfConsentFull} {t.cfConsentSuffix}</p>
          <p className="chart-full-scope">{scopeLine}</p>
          {figWarning && <p className="chart-full-warning" role="status">{figWarning}</p>}
          <div className="chart-full-row"><button type="button" className="btn btn-secondary small" onClick={cancelAll}>{t.cfCancel}</button></div>
        </div>
      )}
      {state === 'working' && (
        <div className="chart-full-box" role="status">
          <p className="chart-full-scope">{t.cfWorking(sel ? formatPageRange(sel.analyzedPages) : '')}</p>
          <div className="chart-full-row"><button type="button" className="btn btn-secondary small" onClick={cancelAll}>{t.cfStop}</button></div>
        </div>
      )}
      {state === 'error' && (
        <div className="chart-full-box" role="alert">
          <p className="chart-full-error">{error ?? t.cfFailed}</p>
          <div className="chart-full-row">
            <button type="button" className="btn btn-secondary small" onClick={() => setState('idle')}>{t.cfClose}</button>
            <button type="button" className="btn btn-primary small" onClick={send}>{t.cfRetry}</button>
          </div>
        </div>
      )}
    </div>
  )
}
