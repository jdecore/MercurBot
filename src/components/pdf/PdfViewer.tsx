import { useCallback, useEffect, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import * as pdfjsLib from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { ragClient, type DocSearchHit } from '../../lib/ragClient'
import { matchHighlightSpans } from '../../lib/highlight'
import { ChartFullButton } from './ChartFullButton'
import type { PdfPageText } from '../../data/extractors/pdf'

// El worker ya se configura en extractors/pdf.ts; se reafirma aquí por si el
// visor se monta sin haber pasado por la extracción.
if (typeof window !== 'undefined' && 'GlobalWorkerOptions' in pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
}

async function destroyDoc(d: unknown) {
  try {
    await (d as { destroy?: () => Promise<unknown> }).destroy?.()
  } catch {
    /* ignore */
  }
}

/** Payload del evento `copixi:goto-page` (Fase B): página + texto a resaltar. */
export interface GotoPageDetail {
  page: number
  /** Primeras palabras del snippet fuente; si falta, solo se navega. */
  query?: string
}

/**
 * Buscar en el documento (P1): coincidencias léxicas del índice MiniSearch
 * local, ordenadas por página. Click → salta a la página en el visor.
 */
function DocSearch({ onJump }: { onJump: (page: number) => void }) {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<DocSearchHit[]>([])
  const [searched, setSearched] = useState(false)

  const run = (value: string) => {
    setQ(value)
    if (value.trim().length < 2) {
      setHits([])
      setSearched(false)
      return
    }
    setHits(ragClient.searchPages(value, 20))
    setSearched(true)
  }

  return (
    <div className="doc-search">
      <input
        type="search"
        value={q}
        onChange={(e) => run(e.target.value)}
        placeholder="Buscar en el documento…"
        aria-label="Buscar en el documento"
        className="doc-search-input"
      />
      {searched && hits.length > 0 && (
        <div className="doc-search-results" role="list" aria-label="Páginas con coincidencias">
          {hits.map((h) => (
            <button
              key={h.chunkId}
              type="button"
              role="listitem"
              className="doc-search-hit"
              onClick={() => onJump(h.pageNumber)}
              title={h.snippet}
            >
              <span className="doc-search-page">Pág. {h.pageNumber}</span>
              <span className="doc-search-snippet">{h.snippet}</span>
            </button>
          ))}
        </div>
      )}
      {searched && hits.length === 0 && (
        <div className="doc-search-empty">Sin coincidencias en el documento.</div>
      )}
    </div>
  )
}

interface PdfViewerBodyProps {
  file: File | null
  page: number
  onPageChange: (page: number) => void
  /** false = no carga ni renderiza (el diálogo está cerrado). */
  enabled: boolean
  /** Fase B: texto a resaltar tras navegar (query + nonce para re-disparar). */
  highlight?: { query: string; nonce: number } | null
}

/**
 * Cuerpo del visor (Fase A): carga del documento + canvas + búsqueda +
 * navegación. Sin cromo de diálogo, para reutilizarlo embebido en el panel
 * lateral y dentro del diálogo modal.
 *
 * Fase B: capa de texto invisible de pdf.js sobre el canvas, solo para
 * buscar y resaltar el fragmento fuente al llegar desde una cita.
 */
function PdfViewerBody({ file, page, onPageChange, enabled, highlight }: PdfViewerBodyProps) {
  const docRef = useRef<any>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textLayerRef = useRef<HTMLDivElement>(null)
  const textLayerObjRef = useRef<InstanceType<typeof pdfjsLib.TextLayer> | null>(null)
  const renderSeqRef = useRef(0)
  const docLoadSeqRef = useRef(0)
  const highlightRef = useRef(highlight)
  useEffect(() => {
    highlightRef.current = highlight
  }, [highlight])
  const [numPages, setNumPages] = useState(0)
  const [loadError, setLoadError] = useState<string | null>(null)
  /** true = se pidió resaltar pero el texto no apareció en la página. */
  const [hitMiss, setHitMiss] = useState(false)

  const safePage = numPages > 0 ? Math.min(Math.max(1, page), numPages) : 1

  // Cargar documento (una vez por archivo)
  useEffect(() => {
    if (!enabled || !file) return
    let cancelled = false
    const seq = ++docLoadSeqRef.current
    setLoadError(null)
    setNumPages(0)
    ;(async () => {
      try {
        const data = await file.arrayBuffer()
        const task = pdfjsLib.getDocument({ data })
        const doc = await task.promise
        if (cancelled || seq !== docLoadSeqRef.current) {
          await destroyDoc(doc)
          return
        }
        await destroyDoc(docRef.current)
        docRef.current = doc
        setNumPages(doc.numPages)
      } catch (err) {
        if (!cancelled && seq === docLoadSeqRef.current) setLoadError(err instanceof Error ? err.message : 'No se pudo abrir el PDF.')
      }
    })()
    return () => {
      cancelled = true
      // Destroy the previous document this effect opened (captured before
      // the async load). A newer effect will have its own prevDoc.
      void destroyDoc(docRef.current)
      docRef.current = null
    }
  }, [enabled, file])

  // Marca coincidencias del snippet en la capa de texto. Devuelve true si
  // marcó al menos una. Lógica pura en src/lib/highlight.ts (testeable).
  // Nunca lanza: el fallo es solo "miss" honesto.
  const applyHighlight = useCallback((): boolean => {
    try {
      const container = textLayerRef.current
      const layer = textLayerObjRef.current
      container?.querySelectorAll('.pdf-hit').forEach((el) => el.classList.remove('pdf-hit'))
      const divs = layer?.textDivs as unknown as HTMLElement[] | undefined
      if (!divs || divs.length === 0) return false
      const idx = matchHighlightSpans(
        divs.map((d) => d.textContent ?? ''),
        highlightRef.current?.query ?? '',
      )
      idx.forEach((i) => {
        if (divs[i]) divs[i].classList.add('pdf-hit')
      })
      return idx.length > 0
    } catch {
      return false
    }
  }, [])

  // Renderizar página actual. Si llega una query nueva con la página ya
  // visible (misma página citada dos veces), el efecto re-corre y la aplica:
  // una sola vía, sin condiciones de carrera entre render y resaltado.
  // El resaltado vive dentro del bloque async (DOM externo), igual que el
  // render del canvas.
  const highlightNonce = highlight?.nonce
  useEffect(() => {
    if (!enabled || !docRef.current || numPages === 0) return
    let cancelled = false
    const seq = ++renderSeqRef.current
    setHitMiss(false)
    ;(async () => {
      try {
        const pdfPage = await docRef.current.getPage(safePage)
        if (cancelled || seq !== renderSeqRef.current) return
        const viewport = pdfPage.getViewport({ scale: 1 })
        const scale = Math.min(1.75, 640 / viewport.width)
        const scaled = pdfPage.getViewport({ scale })
        const canvas = canvasRef.current
        if (!canvas) return
        canvas.width = Math.floor(scaled.width)
        canvas.height = Math.floor(scaled.height)
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        await pdfPage.render({ canvasContext: ctx, viewport: scaled }).promise
        if (cancelled || seq !== renderSeqRef.current) return
        // TextLayer invisible sobre el canvas (Fase B): solo búsqueda y
        // resaltado. Si falla, la página sigue visible sin marcas.
        const container = textLayerRef.current
        try {
          textLayerObjRef.current?.cancel()
        } catch {
          /* ignore */
        }
        textLayerObjRef.current = null
        if (container) {
          container.innerHTML = ''
          container.style.width = `${canvas.width}px`
          container.style.height = `${canvas.height}px`
          try {
            const textContent = await pdfPage.getTextContent()
            if (cancelled || seq !== renderSeqRef.current) return
            const layer = new pdfjsLib.TextLayer({
              container,
              viewport: scaled,
              textContentSource: textContent,
            })
            textLayerObjRef.current = layer
            await layer.render()
            if (cancelled || seq !== renderSeqRef.current) return
            if (highlightRef.current?.query) {
              setHitMiss(!applyHighlight())
            }
          } catch (tlErr) {
            console.warn('[PdfViewer] text layer falló (se sigue sin resaltado)', tlErr)
          }
        }
        try {
          pdfPage.cleanup()
        } catch {
          /* ignore */
        }
      } catch (err) {
        if (!cancelled) console.warn('[PdfViewer] render falló', err)
      }
    })()
    return () => { cancelled = true }
  }, [enabled, safePage, numPages, highlightNonce, applyHighlight])

  const go = useCallback((next: number) => {
    if (numPages === 0) return
    onPageChange(Math.min(Math.max(1, next), numPages))
  }, [numPages, onPageChange])

  if (!file) {
    return <div className="pdf-viewer-empty">Carga un PDF para verlo aquí.</div>
  }

  return (
    <>
      {loadError ? (
        <div className="pdf-viewer-error" role="alert">{loadError}</div>
      ) : (
        <>
          <DocSearch onJump={(p) => go(p)} />
          {hitMiss && (
            <div className="pdf-hit-miss" role="status">
              Fragmento no localizado en esta página, revísala directamente.
            </div>
          )}
          <div className="pdf-viewer-body">
            <div className="pdf-viewer-canvas-wrap">
              <canvas
                ref={canvasRef}
                className="pdf-viewer-canvas"
                role="img"
                aria-label={`Página ${safePage}${numPages > 0 ? ` de ${numPages}` : ''} de ${file?.name ?? 'documento'}`}
              />
              <div ref={textLayerRef} className="pdf-text-layer" aria-hidden="true" />
            </div>
          </div>
          {numPages > 0 && (
            <div className="pdf-viewer-nav">
              <button
                type="button"
                className="btn btn-secondary small"
                onClick={() => go(safePage - 1)}
                disabled={safePage <= 1}
                aria-label="Página anterior"
              >
                ← Anterior
              </button>
              <span className="pdf-viewer-counter" aria-live="polite">
                {safePage} / {numPages}
              </span>
              <button
                type="button"
                className="btn btn-secondary small"
                onClick={() => go(safePage + 1)}
                disabled={safePage >= numPages}
                aria-label="Página siguiente"
              >
                Siguiente →
              </button>
            </div>
          )}
        </>
      )}
    </>
  )
}

interface PdfViewerDialogProps {
  open: boolean
  file: File | null
  page: number
  onPageChange: (page: number) => void
  onOpenChange: (open: boolean) => void
  highlight?: { query: string; nonce: number } | null
}

/**
 * Visor PDF en diálogo modal (P0 + mobile): las citas `[Pág. N]` del chat
 * emiten `copixi:goto-page` y App abre este diálogo en esa página.
 * 100% local (pdfjs-dist ya era dependencia).
 */
export function PdfViewerDialog({ open, file, page, onPageChange, onOpenChange, highlight }: PdfViewerDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="pdf-viewer-overlay" />
        <Dialog.Content
          className="pdf-viewer-content"
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="pdf-viewer-head">
            <Dialog.Title className="pdf-viewer-title">
              {file?.name ?? 'Documento'} — Pág. {page}
            </Dialog.Title>
            <Dialog.Close className="btn btn-secondary small" aria-label="Cerrar visor">
              ✕ Cerrar
            </Dialog.Close>
          </div>

          <PdfViewerBody file={file} page={page} onPageChange={onPageChange} enabled={open} highlight={highlight} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

interface PdfViewerPanelProps {
  file: File | null
  page: number
  onPageChange: (page: number) => void
  onHide: () => void
  highlight?: { query: string; nonce: number } | null
  /** Fase E: datos para el botón "Generar gráfica" (texto completo bajo demanda). */
  docPages?: PdfPageText[]
  docFilename?: string
  docId?: string
}

/**
 * Panel lateral del documento (Fase A): el mismo visor embebido en la
 * columna derecha del layout split. Las citas del chat navegan aquí sin
 * modal en desktop. El botón de gráficas queda reservado deshabilitado
 * (hueco de Fase E) con tooltip honesto.
 */
export function PdfViewerPanel({ file, page, onPageChange, onHide, highlight, docPages, docFilename, docId }: PdfViewerPanelProps) {
  return (
    <section className="pdf-panel" id="pdf-panel" aria-label="Documento PDF">
      <div className="pdf-panel-head">
        <h2 className="pdf-panel-title" title={file?.name ?? 'Documento'}>
          {file?.name ?? 'Documento'}
        </h2>
        <div className="pdf-panel-actions">
          {docPages && docPages.length > 0 && docId ? (
            <ChartFullButton key={docId} pages={docPages} filename={docFilename ?? file?.name ?? 'documento.pdf'} docId={docId} totalPages={docPages.length} />
          ) : (
            <button
              type="button"
              className="btn btn-primary small"
              disabled
              title="Disponible cuando el documento termine de cargarse"
              aria-label="Generar gráfica del documento (cargando)"
            >
              Generar gráfica
            </button>
          )}
          <button
            type="button"
            className="btn btn-secondary small"
            onClick={onHide}
            title="Ocultar el panel y volver a la vista centrada"
            aria-label="Ocultar panel del documento"
          >
            Ocultar
          </button>
        </div>
      </div>
      <PdfViewerBody file={file} page={page} onPageChange={onPageChange} enabled highlight={highlight} />
    </section>
  )
}
