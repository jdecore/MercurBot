export interface PdfProcessingState {
  active: boolean
  filename: string
  percent: number
  phase: 'reading' | 'indexing' | 'ready' | 'error'
  statusText: string
  canCancel: boolean
}

interface PdfProcessingCardProps {
  state: PdfProcessingState
  onCancel: () => void
}

export function PdfProcessingCard({ state, onCancel }: PdfProcessingCardProps) {
  if (!state.active) return null

  return (
    <div className="pdf-progress-card" role="status" aria-live="polite">
      <div className="pdf-progress-header">
        <div className="pdf-progress-title">
          <span className="pdf-badge" aria-hidden>PDF</span>
          <span className="pdf-filename" title={state.filename}>{state.filename}</span>
        </div>
        <span className="pdf-pct" title={`${state.percent}% completado`} aria-label={`${state.percent}% completado`}>{state.percent}%</span>
      </div>

      <div className="pdf-progress-bar-bg" aria-hidden>
        <div
          className="pdf-progress-bar-fill"
          style={{ width: `${Math.min(100, Math.max(5, state.percent))}%` }}
        />
      </div>

      <div className="pdf-progress-footer">
        <span className="pdf-status-text">
          <span className="pulse-dot" aria-hidden />
          {state.statusText}
        </span>
        {state.canCancel && (
          <button
            type="button"
            className="btn btn-secondary small pdf-cancel-btn"
            onClick={onCancel}
            title="Cancelar extracción del documento"
          >
            ✕ Cancelar
          </button>
        )}
      </div>
    </div>
  )
}
