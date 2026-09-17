import { useEffect, useState } from 'react'
import { listLibrary, removeFromLibrary, type LibDoc } from '../../lib/docLibrary'
import { Icon } from '../ui/Icon'

interface SidebarProps {
  currentId: string | null
  refreshToken: number
  hasDocument: boolean
  userName: string
  robotName: string
  onNewAnalysis: () => void
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
  onNewAnalysis,
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

  return (
    <div className="sidebar-body">
      <button type="button" className="btn btn-primary sidebar-new" onClick={onNewAnalysis}>
        <Icon name="plus" size={16} /> Nuevo análisis
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
        </div>
      </div>
    </div>
  )
}
