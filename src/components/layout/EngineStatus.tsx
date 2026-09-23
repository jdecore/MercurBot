import { useEffect, useState } from 'react'
import { useDashboard } from '../../state/DashboardContext'
import { useLocale } from '../../lib/locale'

interface EngineInfo {
  mode: 'hybrid' | 'lexical' | null
  model: string | null
  streaming: boolean
}

export function EngineStatus({ compact = false }: { compact?: boolean }) {
  const { pdfDoc } = useDashboard()
  const { t } = useLocale()
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

  if (seenDoc !== docId) {
    setSeenDoc(docId)
    setInfo({ mode: null, model: null, streaming: false })
  }

  if (!pdfDoc) {
    if (compact) {
      return (
        <span className="engine-status compact" title={t.esIdleTitle} aria-label={t.esIdleCompact} role="status">
          <span className="engine-dot idle" aria-hidden />
        </span>
      )
    }
    return (
      <span className="engine-status" title={t.esIdleTitle}>
        <span className="engine-dot idle" aria-hidden />
        {t.esIdleFull}
      </span>
    )
  }
  if (info.streaming) {
    if (compact) {
      return (
        <span className="engine-status compact" role="status" title={t.esStreamTitle} aria-label={t.esStreamCompact}>
          <span className="engine-dot busy" aria-hidden />
        </span>
      )
    }
    return (
      <span className="engine-status" role="status" title={t.esStreamTitle}>
        <span className="engine-dot busy" aria-hidden />
        {t.esStreamFull}
      </span>
    )
  }
  const modeLabel = info.mode === 'hybrid' ? t.esModeHybrid : info.mode === 'lexical' ? t.esModeLiteral : t.esModeReady
  const title = info.mode ? t.esReadyTitle(info.mode, info.model ?? undefined) : t.esIndexedTitle
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
