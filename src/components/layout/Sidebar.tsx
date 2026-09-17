import { useEffect, useState } from 'react'
import { listLibrary, removeFromLibrary, type LibDoc } from '../../lib/docLibrary'
import { Icon } from '../ui/Icon'
import { EngineStatus } from './EngineStatus'

interface SidebarProps {
  currentId: string | null
  refreshToken: number
  hasDocument: boolean
  userName: string
  robotName: string
  collapsed: boolean
  onToggleRail: () => void
  onNewAnalysis: () => void
  onUpload: () => void
  onOpenDoc: (doc: LibDoc) => void
  onRemoved: () => void
  onCustomize: () => void
  onHowItWorks: () => void
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

const CAPABILITIES = [
  { icon: 'message' as const, label: 'Resumir en 3 puntos' },
  { icon: 'search' as const, label: 'Preguntar con citas [Pág. N]' },
  { icon: 'file' as const, label: 'Buscar en el documento' },
  { icon: 'chart' as const, label: 'Graficar cifras verificadas' },
]

/**
 * Sidebar estilo QwenWork, contenido honesto (sin backend §5.4/§31):
 * Nuevo análisis + Recientes reales (OPFS) + Capacidades locales +
 * usuario local. Sin Skills/Connectors/Drive/Scheduled.
 */
export function Sidebar({
  currentId,
  refreshToken,
  hasDocument,
  userName,
  robotName,
  collapsed,
  onToggleRail,
  onNewAnalysis,
  onUpload,
  onOpenDoc,
  onRemoved,
  onCustomize,
  onHowItWorks,
}: SidebarProps) {
  const [docs, setDocs] = useState<LibDoc[]>([])

  useEffect(() => {
    setDocs(listLibrary())
  }, [refreshToken])

  const removeDoc = async (id: string) => {
    setDocs(await removeFromLibrary(id))
    onRemoved()
  }

  // Rail contraído estilo Copilot: mismos accesos, solo iconos con tooltip.
  // Recientes no se hojea a ciegas: su icono expande el menú.
  if (collapsed) {
    return (
      <div className="sidebar-body rail-body">
        <EngineStatus compact />
        <button type="button" className="btn btn-secondary rail-btn" onClick={onNewAnalysis} title="Nuevo análisis" aria-label="Nuevo análisis">
          <Icon name="plus" size={16} />
        </button>
        <button type="button" className="btn btn-secondary rail-btn" onClick={onUpload} title="Cargar PDF" aria-label="Cargar PDF">
          <Icon name="upload" size={16} />
        </button>
        <button type="button" className="btn btn-secondary rail-btn" onClick={onToggleRail} title="Recientes — expandir menú" aria-label="Recientes — expandir menú" aria-expanded={false}>
          <Icon name="file" size={16} />
        </button>
        <div className="sidebar-footer rail-footer">
          <button
            type="button"
            className="btn btn-secondary rail-btn"
            onClick={onCustomize}
            title={`${userName || 'Lector local'} · Personalizar ${robotName}`}
            aria-label={`${userName || 'Lector local'} · Personalizar ${robotName}`}
          >
            <Icon name="user" size={16} />
          </button>
          <button
            type="button"
            className="btn btn-secondary rail-btn"
            onClick={onToggleRail}
            title="Expandir menú"
            aria-label="Expandir menú"
            aria-expanded={false}
          >
            <Icon name="chevron-right" size={16} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="sidebar-body">
      <EngineStatus />
      <button type="button" className="btn btn-primary sidebar-new" onClick={onNewAnalysis}>
        <Icon name="plus" size={16} /> Nuevo análisis
      </button>
      <button type="button" className="btn btn-secondary sidebar-new" onClick={onUpload}>
        <Icon name="upload" size={16} /> Cargar PDF
      </button>

      <nav className="sidebar-section" aria-label="Documentos recientes">
        <h2 className="sidebar-heading">Recientes</h2>
        {docs.length === 0 ? (
          <p className="sidebar-empty">Aún no hay documentos. Carga tu primer PDF.</p>
        ) : (
          <ul className="sidebar-recents">
            {docs.map((d) => (
              <li key={d.id} className={d.id === currentId ? 'is-current' : ''}>
                <button
                  type="button"
                  className="sidebar-recent-item"
                  onClick={() => onOpenDoc(d)}
                  title={`${d.name} · ${fmtSize(d.size)}`}
                  aria-current={d.id === currentId ? 'true' : undefined}
                >
                  <Icon name="file" size={14} />
                  <span className="sidebar-recent-name">{d.name}</span>
                  <span className="sidebar-recent-size">{fmtSize(d.size)}</span>
                </button>
                <button
                  type="button"
                  className="sidebar-recent-remove"
                  onClick={() => void removeDoc(d.id)}
                  title="Quitar de recientes"
                  aria-label={`Quitar ${d.name} de recientes`}
                >
                  <Icon name="close" size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </nav>

      <div className="sidebar-section" aria-label="Capacidades">
        <h2 className="sidebar-heading">Capacidades</h2>
        <ul className="sidebar-caps">
          {CAPABILITIES.map((c) => (
            <li key={c.label}>
              <Icon name={c.icon} size={14} />
              <span>{c.label}</span>
            </li>
          ))}
        </ul>
        <p className="sidebar-privacy">
          <Icon name="lock" size={14} /> Tu PDF nunca sale de este navegador.
        </p>
      </div>

      <div className="sidebar-footer">
        <div className="sidebar-user" title={userName || 'Lector local'}>
          <Icon name="user" size={16} />
          <span className="sidebar-user-names">
            <strong>{userName || 'Lector local'}</strong>
            <small>{hasDocument ? 'leyendo un PDF' : 'sin documento'} · {robotName}</small>
          </span>
        </div>
        <div className="sidebar-footer-actions">
          <button type="button" className="btn btn-secondary small" onClick={onCustomize}>
            <Icon name="robot" size={14} /> Personalizar
          </button>
          <button type="button" className="btn btn-secondary small" onClick={onHowItWorks}>
            ¿Cómo funciona?
          </button>
          <button
            type="button"
            className="btn btn-secondary small"
            onClick={onToggleRail}
            title="Contraer menú (solo iconos)"
            aria-label="Contraer menú (solo iconos)"
            aria-expanded={true}
          >
            <Icon name="chevron-left" size={14} /> Contraer
          </button>
        </div>
      </div>
    </div>
  )
}
