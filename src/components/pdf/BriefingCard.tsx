import { useMemo } from 'react'
import { sanitizeRichText, ModelPill } from '../excel/ExcelChat'

const PAGE_CITE_RE = /\[P[áa]g\.?\s*(\d+)\]|\[P[áa]gina\s*(\d+)\]|\[p\.\s*(\d+)\]/gi

function gotoPage(page: number) {
  if (Number.isFinite(page) && page > 0) {
    window.dispatchEvent(new CustomEvent('copixi:goto-page', { detail: { page } }))
  }
}

function renderWithCites(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  const re = new RegExp(PAGE_CITE_RE.source, 'gi')
  let last = 0
  let m: RegExpExecArray | null
  let key = 0
  while ((m = re.exec(text))) {
    if (m.index > last) nodes.push(<span key={`${keyPrefix}-t${key}`}>{text.slice(last, m.index)}</span>)
    const page = m[1] ?? m[2] ?? m[3] ?? '?'
    const pageNum = Number.parseInt(String(page), 10)
    nodes.push(
      <button
        key={`${keyPrefix}-c${key++}`}
        type="button"
        className="citation-badge citation-inline"
        title={`Ver página ${page} en el visor`}
        aria-label={`Ver página ${page} en el visor`}
        onClick={() => gotoPage(pageNum)}
      >
        [Pág. {page}]
      </button>,
    )
    last = m.index + m[0].length
  }
  if (last < text.length) nodes.push(<span key={`${keyPrefix}-u${key}`}>{text.slice(last)}</span>)
  return nodes
}

interface BriefingCardProps {
  text: string | null
  loading: boolean
  model?: string
}

/**
 * Briefing proactivo (Fase 24C): la IA trabaja antes de que escribas.
 * Muestra los 3 puntos clave del documento con citas clicables al visor.
 * Si la generación falla, App no la monta (degradado silencioso).
 */
export function BriefingCard({ text, loading, model }: BriefingCardProps) {
  const points = useMemo(() => {
    if (!text) return []
    return text
      .split('\n')
      .map((l) => l.replace(/^[-*+\d.)\s]+/, '').trim())
      .filter(Boolean)
      .slice(0, 5)
  }, [text])

  if (!loading && points.length === 0) return null

  return (
    <div className="briefing-card" aria-label="Resumen del documento" aria-live="polite">
      <div className="briefing-head">
        <span className="briefing-sparkle" aria-hidden>✦</span>
        <strong>Este documento en 3 puntos</strong>
        <ModelPill model={model} />
      </div>
      {loading ? (
        <div className="briefing-loading">
          <span className="skeleton-dot" />
          <span className="skeleton-dot" />
          <span className="skeleton-dot" />
          <span>Leyendo lo esencial…</span>
        </div>
      ) : (
        <ul className="briefing-list">
          {points.map((p, i) => (
            <li key={i}>{renderWithCites(sanitizeRichText(p), `b${i}`)}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
