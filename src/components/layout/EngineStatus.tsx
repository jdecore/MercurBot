import { useEffect, useState } from 'react'
import { useDashboard } from '../../state/DashboardContext'

interface EngineInfo {
  mode: 'hybrid' | 'lexical' | null
  model: string | null
  streaming: boolean
}

/**
 * Estado honesto del motor (arriba-derecha, en vez de créditos falsos):
 * modo RAG local + modelo real que generó la última respuesta.
 * Solo lectura: el fallback de modelo lo decide /api/chat por keys.
 * `compact` para el rail contraído: solo el punto con tooltip.
 */
export function EngineStatus({ compact = false }: { compact?: boolean }) {
  const { pdfDoc } = useDashboard()
  const docId = pdfDoc?.docId ?? null
  const [info, setInfo] = useState<EngineInfo>({ mode: null, model: null, streaming: false })
  const [seenDoc, setSeenDoc] = useState<string | null>(docId)

  useEffect(() => {
    const handler = (e: Event) => {
      const d = (e as CustomEvent<EngineInfo>).detail
      if (d) setInfo({ mode: d.mode ?? null, model: d.model ?? null, streaming: !!d.streaming })
    }
    window.addEventListener('copixi:engine-status', handler as EventListener)
    return () => window.removeEventListener('copixi:engine-status', handler as EventListener)
  }, [])

  // Documento nuevo → el estado anterior no significa nada: se resetea
  // durante el render (patrón "adjust state during render", sin efecto).
  if (seenDoc !== docId) {
    setSeenDoc(docId)
    setInfo({ mode: null, model: null, streaming: false })
  }

  if (!pdfDoc) {
    const idleTitle = 'Carga un PDF para activar la búsqueda local'
    if (compact) {
      return (
        <span className="engine-status compact" title={idleTitle} aria-label="personalización 100% local" role="status">
          <span className="engine-dot idle" aria-hidden />
        </span>
      )
    }
    return (
      <span className="engine-status" title={idleTitle}>
        <span className="engine-dot idle" aria-hidden />
        personalización 100% local
      </span>
    )
  }
  if (info.streaming) {
    const busyTitle = 'La IA está leyendo los fragmentos de tu PDF'
    if (compact) {
      return (
        <span className="engine-status compact" role="status" title={busyTitle} aria-label="pensando…">
          <span className="engine-dot busy" aria-hidden />
        </span>
      )
    }
    return (
      <span className="engine-status" role="status" title={busyTitle}>
        <span className="engine-dot busy" aria-hidden />
        pensando…
      </span>
    )
  }
  const modeLabel = info.mode === 'hybrid' ? 'híbrida' : info.mode === 'lexical' ? 'literal' : 'lista'
  const title = info.mode
    ? `Búsqueda ${info.mode === 'hybrid' ? 'combinada (vectorial + léxica)' : 'literal'} en tu dispositivo${info.model ? ` · última respuesta: ${info.model}` : ''}`
    : 'Documento indexado en tu dispositivo. Pregunta para ver el modelo en uso.'
  if (compact) {
    return (
      <span className="engine-status compact" title={title} aria-label={`${modeLabel}${info.model ? ` · ${info.model}` : ''}`} role="status">
        <span className={`engine-dot${info.mode ? ' ready' : ''}`} aria-hidden />
      </span>
    )
  }
  return (
    <span className="engine-status" title={title}>
      <span className={`engine-dot${info.mode ? ' ready' : ''}`} aria-hidden />
      {modeLabel}
      {info.model ? <span className="engine-model">✦ {info.model}</span> : null}
    </span>
  )
}
