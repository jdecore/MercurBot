import { useEffect, useRef, useState } from 'react'
import type { PdfPageText } from '../../data/extractors/pdf'
import { selectChartFullPages, formatPageRange, type ChartFullSelection } from '../../lib/chartFull'

/**
 * Botón "Generar gráfica" del panel (Fase E): análisis con el documento
 * completo, SOLO bajo orden explícita del usuario.
 *
 * Flujo: idle → confirm (consentimiento inline: qué se envía y a dónde) →
 * working (cancelable con AbortController) → el resultado viaja al chat como
 * mensaje (evento `copixi:chart-full-result`) y se verifica como siempre.
 * Nada se persiste en servidores: solo el proveedor de IA lo procesa.
 */

export interface ChartFullResultDetail {
  docId: string
  text: string
  analyzedPages: number[]
  truncated: boolean
  totalPages: number
  /** Etiqueta del proveedor+modelo que respondió (píldora UI). */
  model?: string
}

type CfState = 'idle' | 'confirm' | 'working' | 'error'

export function ChartFullButton({
  pages,
  filename,
  docId,
  totalPages,
}: {
  pages: PdfPageText[]
  filename: string
  docId: string
  totalPages: number
}) {
  const [state, setState] = useState<CfState>('idle')
  const [sel, setSel] = useState<ChartFullSelection | null>(null)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Sin efectos de sincronización: el panel monta con key={docId}, así que un
  // documento nuevo = estado fresco. El cleanup aborta el fetch en vuelo.
  useEffect(() => () => abortRef.current?.abort(), [])

  const openConfirm = () => {
    const selection = selectChartFullPages(pages.map((p) => ({ pageNumber: p.pageNumber, text: p.text })))
    // Sin texto no hay confirmación que mostrar: aviso honesto directo
    // (PDF escaneado). Antes el botón Enviar quedaba deshabilitado y la UI
    // parecía atascada en el consentimiento.
    if (selection.pages.length === 0) {
      setSel(selection)
      setError(
        'Este documento no tiene texto extraíble — parece un PDF escaneado (solo imágenes). ' +
          'La gráfica necesita texto: súbelo con texto seleccionable o pásalo por un OCR.',
      )
      setState('error')
      return
    }
    setSel(selection)
    setError(null)
    setState('confirm')
  }

  const cancelAll = () => {
    abortRef.current?.abort()
    abortRef.current = null
    setState('idle')
    setSel(null)
  }

  const send = async () => {
    const selection = sel ?? selectChartFullPages(pages.map((p) => ({ pageNumber: p.pageNumber, text: p.text })))
    if (selection.pages.length === 0) {
      setError('El documento no tiene texto analizable.')
      setState('error')
      return
    }
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setState('working')
    setError(null)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mode: 'chart-full',
          filename,
          totalPages,
          truncated: selection.truncated,
          pages: selection.pages,
        }),
        signal: ctrl.signal,
      })
      if (!res.ok) {
        if (res.status === 429) throw new Error('Límite de peticiones alcanzado. Espera un minuto.')
        if (res.status === 413) throw new Error('Documento demasiado grande incluso tras la pre-selección.')
        if (res.status === 404)
          throw new Error(
            'No hay backend /api en este entorno (Vite solo sirve el frontend). ' +
              'En local usa `vercel dev` o `pnpm dev:api` para levantar /api/chat.',
          )
        if (res.status === 502)
          throw new Error(
            'La IA no respondió (502). Revisa las claves del proveedor (GEMINI_API_KEY, GROQ_API_KEY u OPENROUTER_API_KEY válidas) ' +
              'y el modelo configurado (GEMINI_MODEL=gemini-2.0-flash). Reintenta en unos segundos.',
          )
        if (res.status === 504)
          throw new Error(
            'La generación tardó demasiado y el servidor la cortó (504). Suele pasar con documentos grandes: ' +
              'reintenta en unos segundos (a veces el segundo intento responde más rápido) o prueba con un PDF más corto.',
          )
        throw new Error(`El servicio falló (${res.status}). Reintenta en unos segundos.`)
      }
      const data = (await res.json()) as { text?: string; analyzedPages?: number[]; model?: string; error?: string }
      if (!data.text || typeof data.text !== 'string') {
        throw new Error(data.error ?? 'El modelo no devolvió análisis. Reintenta.')
      }
      window.dispatchEvent(
        new CustomEvent<ChartFullResultDetail>('copixi:chart-full-result', {
          detail: {
            docId,
            text: data.text,
            analyzedPages: Array.isArray(data.analyzedPages) ? data.analyzedPages : selection.analyzedPages,
            truncated: selection.truncated,
            totalPages,
            model: typeof data.model === 'string' ? data.model : undefined,
          },
        }),
      )
      setState('idle')
      setSel(null)
    } catch (e) {
      if ((e instanceof DOMException && e.name === 'AbortError') || (e instanceof Error && e.name === 'AbortError')) {
        setState('idle') // Detener es acción del usuario, no error.
        return
      }
      setError(e instanceof Error ? e.message : 'Falló la generación. Reintenta.')
      setState('error')
    } finally {
      if (abortRef.current === ctrl) abortRef.current = null
    }
  }

  const scopeLine = sel
    ? sel.truncated
      ? `Se analizarán ${formatPageRange(sel.analyzedPages)} de ${totalPages} págs. (las de más cifras).`
      : `Se analizará el documento íntegro (${totalPages} págs.).`
    : ''

  return (
    <div className="chart-full">
      {(state === 'idle' || state === 'confirm') && (
        <button
          type="button"
          className="btn btn-primary small"
          onClick={state === 'idle' ? openConfirm : send}
          disabled={state === 'confirm' && (!sel || sel.pages.length === 0)}
          title="Generar una gráfica a partir del documento completo (bajo tu orden)"
          aria-label="Generar gráfica del documento completo"
          aria-expanded={state === 'confirm'}
        >
          {state === 'idle' ? 'Generar gráfica' : 'Enviar'}
        </button>
      )}
      {state === 'confirm' && (
        <div className="chart-full-box" role="dialog" aria-label="Confirmar envío del documento">
          <p className="chart-full-consent">
            Se enviará el texto {sel?.truncated ? 'de las páginas con más cifras' : 'completo'} al modelo de IA.{' '}
            Nada se guarda en servidores salvo el proveedor de IA.
          </p>
          <p className="chart-full-scope">{scopeLine}</p>
          <div className="chart-full-row">
            <button type="button" className="btn btn-secondary small" onClick={cancelAll}>
              Cancelar
            </button>
          </div>
        </div>
      )}
      {state === 'working' && (
        <div className="chart-full-box" role="status">
          <p className="chart-full-scope">Generando gráfica… {sel ? formatPageRange(sel.analyzedPages) : ''}</p>
          <div className="chart-full-row">
            <button type="button" className="btn btn-secondary small" onClick={cancelAll}>
              Detener
            </button>
          </div>
        </div>
      )}
      {state === 'error' && (
        <div className="chart-full-box" role="alert">
          <p className="chart-full-error">{error ?? 'Falló la generación.'}</p>
          <div className="chart-full-row">
            <button type="button" className="btn btn-secondary small" onClick={() => setState('idle')}>
              Cerrar
            </button>
            <button type="button" className="btn btn-primary small" onClick={send}>
              Reintentar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
