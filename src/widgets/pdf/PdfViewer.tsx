import { useCallback, useEffect, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import * as pdfjsLib from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { ragClient, type DocSearchHit } from '../../shared/lib/ragClient'
import { speakInteraction } from '../../shared/lib/tts'
import { matchHighlightSpans } from '../../shared/lib/highlight'
import { ChartFullButton } from './ChartFullButton'
import type { PdfPageText } from '../../entities/pdf/extractors/pdf'
import { useLocale } from '../../shared/lib/locale'

if (typeof window !== 'undefined' && 'GlobalWorkerOptions' in pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
}

async function destroyDoc(d: unknown) {
  try {
    await (d as { destroy?: () => Promise<unknown> }).destroy?.()
  } catch { /* ignore */ }
}

export interface GotoPageDetail {
  page: number
  query?: string
}

function DocSearch({ onJump }: { onJump: (page: number) => void }) {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<DocSearchHit[]>([])
  const [searched, setSearched] = useState(false)
  const { t } = useLocale()

  const run = (value: string) => {
    setQ(value)
    if (value.trim().length < 2) { setHits([]); setSearched(false); return }
    setHits(ragClient.searchPages(value, 20))
    setSearched(true)
    speakInteraction('search-query')
  }

  return (
    <div className="doc-search">
      <input type="search" value={q} onChange={(e) => run(e.target.value)} placeholder={t.searchPlaceholder} aria-label={t.searchAria} className="doc-search-input" />
      {searched && hits.length > 0 && (
        <div className="doc-search-results" role="list" aria-label={t.searchResultsAria}>
          {hits.map((h) => (
            <button key={h.chunkId} type="button" role="listitem" className="doc-search-hit" onClick={() => onJump(h.pageNumber)} title={h.snippet}>
              <span className="doc-search-page">{t.pageLabel(h.pageNumber)}</span>
              <span className="doc-search-snippet">{h.snippet}</span>
            </button>
          ))}
        </div>
      )}
      {searched && hits.length === 0 && <div className="doc-search-empty">{t.searchEmpty}</div>}
    </div>
  )
}

interface PdfViewerBodyProps {
  file: File | null; page: number; onPageChange: (page: number) => void; enabled: boolean
  highlight?: { query: string; nonce: number } | null
}

function PdfViewerBody({ file, page, onPageChange, enabled, highlight }: PdfViewerBodyProps) {
  const docRef = useRef<any>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textLayerRef = useRef<HTMLDivElement>(null)
  const textLayerObjRef = useRef<InstanceType<typeof pdfjsLib.TextLayer> | null>(null)
  const renderSeqRef = useRef(0)
  const docLoadSeqRef = useRef(0)
  const highlightRef = useRef(highlight)
  const { t } = useLocale()
  useEffect(() => { highlightRef.current = highlight }, [highlight])
  const [numPages, setNumPages] = useState(0)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [hitMiss, setHitMiss] = useState(false)
  const safePage = numPages > 0 ? Math.min(Math.max(1, page), numPages) : 1

  useEffect(() => {
    if (!enabled || !file) return
    let cancelled = false
    const seq = ++docLoadSeqRef.current
    setLoadError(null); setNumPages(0)
    ;(async () => {
      try {
        const data = await file.arrayBuffer()
        const doc = await pdfjsLib.getDocument({ data }).promise
        if (cancelled || seq !== docLoadSeqRef.current) { await destroyDoc(doc); return }
        await destroyDoc(docRef.current)
        docRef.current = doc; setNumPages(doc.numPages)
      } catch (err) {
        if (!cancelled && seq === docLoadSeqRef.current) setLoadError(err instanceof Error ? err.message : t.pdfLoadError)
      }
    })()
    return () => { cancelled = true; void destroyDoc(docRef.current); docRef.current = null }
  }, [enabled, file])

  const applyHighlight = useCallback((): boolean => {
    try {
      const container = textLayerRef.current
      const layer = textLayerObjRef.current
      container?.querySelectorAll('.pdf-hit').forEach((el) => el.classList.remove('pdf-hit'))
      const divs = layer?.textDivs as unknown as HTMLElement[] | undefined
      if (!divs || divs.length === 0) return false
      const idx = matchHighlightSpans(divs.map((d) => d.textContent ?? ''), highlightRef.current?.query ?? '')
      idx.forEach((i) => { if (divs[i]) divs[i].classList.add('pdf-hit') })
      return idx.length > 0
    } catch { return false }
  }, [])

  const highlightNonce = highlight?.nonce
  useEffect(() => {
    if (!enabled || !docRef.current || numPages === 0) return
    let cancelled = false; const seq = ++renderSeqRef.current; setHitMiss(false)
    ;(async () => {
      try {
        const pdfPage = await docRef.current.getPage(safePage)
        if (cancelled || seq !== renderSeqRef.current) return
        const viewport = pdfPage.getViewport({ scale: 1 })
        const scale = Math.min(1.75, 640 / viewport.width)
        const scaled = pdfPage.getViewport({ scale })
        const canvas = canvasRef.current; if (!canvas) return
        canvas.width = Math.floor(scaled.width); canvas.height = Math.floor(scaled.height)
        const ctx = canvas.getContext('2d'); if (!ctx) return
        await pdfPage.render({ canvasContext: ctx, viewport: scaled }).promise
        if (cancelled || seq !== renderSeqRef.current) return
        const container = textLayerRef.current
        try { textLayerObjRef.current?.cancel() } catch { /* ignore */ }
        textLayerObjRef.current = null
        if (container) {
          container.innerHTML = ''; container.style.width = `${canvas.width}px`; container.style.height = `${canvas.height}px`
          try {
            const textContent = await pdfPage.getTextContent()
            if (cancelled || seq !== renderSeqRef.current) return
            const layer = new pdfjsLib.TextLayer({ container, viewport: scaled, textContentSource: textContent })
            textLayerObjRef.current = layer; await layer.render()
            if (cancelled || seq !== renderSeqRef.current) return
            if (highlightRef.current?.query) setHitMiss(!applyHighlight())
          } catch (tlErr) { console.warn('[PdfViewer] text layer falló', tlErr) }
        }
        try { pdfPage.cleanup() } catch { /* ignore */ }
      } catch (err) { if (!cancelled) console.warn('[PdfViewer] render falló', err) }
    })()
    return () => { cancelled = true }
  }, [enabled, safePage, numPages, highlightNonce, applyHighlight])

  const go = useCallback((next: number) => {
    if (numPages === 0) return; onPageChange(Math.min(Math.max(1, next), numPages))
  }, [numPages, onPageChange])

  if (!file) return <div className="pdf-viewer-empty">{t.emptyState}</div>

  return (
    <>
      {loadError ? (
        <div className="pdf-viewer-error" role="alert">{loadError}</div>
      ) : (
        <>
          <DocSearch onJump={(p) => go(p)} />
          {hitMiss && <div className="pdf-hit-miss" role="status">{t.highlightMiss}</div>}
          <div className="pdf-viewer-body">
            <div className="pdf-viewer-canvas-wrap">
              <canvas ref={canvasRef} className="pdf-viewer-canvas" role="img" aria-label={t.pageInfo(safePage, numPages, file?.name ?? '')} />
              <div ref={textLayerRef} className="pdf-text-layer" aria-hidden="true" />
            </div>
          </div>
          {numPages > 0 && (
            <div className="pdf-viewer-nav">
              <button type="button" className="btn btn-secondary small" onClick={() => go(safePage - 1)} disabled={safePage <= 1} aria-label={t.prevPage}>{t.prevBtn}</button>
              <span className="pdf-viewer-counter" aria-live="polite">{safePage} / {numPages}</span>
              <button type="button" className="btn btn-secondary small" onClick={() => go(safePage + 1)} disabled={safePage >= numPages} aria-label={t.nextPage}>{t.nextBtn}</button>
            </div>
          )}
        </>
      )}
    </>
  )
}

interface PdfViewerDialogProps {
  open: boolean; file: File | null; page: number; onPageChange: (p: number) => void; onOpenChange: (open: boolean) => void
  highlight?: { query: string; nonce: number } | null
}

export function PdfViewerDialog({ open, file, page, onPageChange, onOpenChange, highlight }: PdfViewerDialogProps) {
  const { t } = useLocale()
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="pdf-viewer-overlay" />
        <Dialog.Content className="pdf-viewer-content" aria-describedby={undefined} onOpenAutoFocus={(e) => e.preventDefault()}>
          <div className="pdf-viewer-head">
            <Dialog.Title className="pdf-viewer-title">{t.viewerTitle(file?.name ?? '', page)}</Dialog.Title>
            <Dialog.Close className="btn btn-secondary small" aria-label={t.closeViewer}>✕ {t.closeViewer}</Dialog.Close>
          </div>
          <PdfViewerBody file={file} page={page} onPageChange={onPageChange} enabled={open} highlight={highlight} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

interface PdfViewerPanelProps {
  file: File | null; page: number; onPageChange: (p: number) => void; onHide: () => void
  highlight?: { query: string; nonce: number } | null
  docPages?: PdfPageText[]; docFilename?: string; docId?: string
}

export function PdfViewerPanel({ file, page, onPageChange, onHide, highlight, docPages, docFilename, docId }: PdfViewerPanelProps) {
  const { t } = useLocale()
  return (
    <section className="pdf-panel" id="pdf-panel" aria-label={t.docPanelAria}>
      <div className="pdf-panel-head">
        <h2 className="pdf-panel-title" title={file?.name ?? t.docPanelTitle}>{file?.name ?? t.docPanelTitle}</h2>
        <div className="pdf-panel-actions">
          {docPages && docPages.length > 0 && docId ? (
            <ChartFullButton key={docId} pages={docPages} filename={docFilename ?? file?.name ?? t.docFallback} docId={docId} totalPages={docPages.length} />
          ) : (
            <button type="button" className="btn btn-primary small" disabled title={t.chartDisabledTip} aria-label={t.chartDisabledAria}>{t.chartGenBtn}</button>
          )}
          <button type="button" className="btn btn-secondary small" onClick={onHide} title={t.hidePanel} aria-label={t.hidePanelAria}>{t.hideBtn}</button>
        </div>
      </div>
      <PdfViewerBody file={file} page={page} onPageChange={onPageChange} enabled highlight={highlight} />
    </section>
  )
}
