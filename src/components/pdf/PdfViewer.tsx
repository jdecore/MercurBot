import { useCallback, useEffect, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import * as pdfjsLib from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { ragClient, type DocSearchHit } from '../../lib/ragClient'

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

interface PdfViewerDialogProps {
  open: boolean
  file: File | null
  page: number
  onPageChange: (page: number) => void
  onOpenChange: (open: boolean) => void
}

/**
 * Visor PDF embebido (P0): muestra la página citada sin salir de la app.
 * Las citas `[Pág. N]` del chat emiten `copixi:goto-page` y App abre este
 * diálogo en esa página. 100% local (pdfjs-dist ya era dependencia).
 */
export function PdfViewerDialog({ open, file, page, onPageChange, onOpenChange }: PdfViewerDialogProps) {
  const docRef = useRef<any>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [numPages, setNumPages] = useState(0)
  const [loadError, setLoadError] = useState<string | null>(null)

  const safePage = numPages > 0 ? Math.min(Math.max(1, page), numPages) : 1

  // Cargar documento (una vez por archivo)
  useEffect(() => {
    if (!open || !file) return
    let cancelled = false
    setLoadError(null)
    setNumPages(0)
    ;(async () => {
      try {
        const data = await file.arrayBuffer()
        const task = pdfjsLib.getDocument({ data })
        const doc = await task.promise
        if (cancelled) {
          await destroyDoc(doc)
          return
        }
        await destroyDoc(docRef.current)
        docRef.current = doc
        setNumPages(doc.numPages)
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'No se pudo abrir el PDF.')
      }
    })()
    return () => {
      cancelled = true
      void destroyDoc(docRef.current)
      docRef.current = null
    }
  }, [open, file])

  // Renderizar página actual
  useEffect(() => {
    if (!open || !docRef.current || numPages === 0) return
    let cancelled = false
    ;(async () => {
      try {
        const pdfPage = await docRef.current.getPage(safePage)
        if (cancelled) return
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
      } catch (err) {
        if (!cancelled) console.warn('[PdfViewer] render falló', err)
      }
    })()
    return () => { cancelled = true }
  }, [open, safePage, numPages])

  const go = useCallback((next: number) => {
    if (numPages === 0) return
    onPageChange(Math.min(Math.max(1, next), numPages))
  }, [numPages, onPageChange])

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
              {file?.name ?? 'Documento'} — Pág. {safePage}{numPages > 0 ? ` de ${numPages}` : ''}
            </Dialog.Title>
            <Dialog.Close className="btn btn-secondary small" aria-label="Cerrar visor">
              ✕ Cerrar
            </Dialog.Close>
          </div>

          {loadError ? (
            <div className="pdf-viewer-error" role="alert">{loadError}</div>
          ) : (
            <>
              <DocSearch onJump={(p) => go(p)} />
              <div className="pdf-viewer-body">
              <canvas
                ref={canvasRef}
                className="pdf-viewer-canvas"
                role="img"
                aria-label={`Página ${safePage}${numPages > 0 ? ` de ${numPages}` : ''} de ${file?.name ?? 'documento'}`}
              />
              </div>
            </>
          )}

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
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
