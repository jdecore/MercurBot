import { useEffect, useState } from 'react'
import { listLibrary, removeFromLibrary, type LibDoc } from '../../lib/docLibrary'
import { Icon } from '../ui/Icon'
import { EngineStatus } from './EngineStatus'
import { useLocale } from '../../lib/locale'

interface SidebarProps {
  currentId: string | null
  refreshToken: number
  hasDocument: boolean
  userName: string
  robotName: string
  collapsed: boolean
  onToggleRail: () => void
  onOpenDoc: (doc: LibDoc) => void
  onRemoved: () => void
  onCustomize: () => void
  onHowItWorks: () => void
  onToggleWayflow: () => void
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function Sidebar({
  currentId,
  refreshToken,
  hasDocument,
  userName,
  robotName,
  collapsed,
  onToggleRail,
  onOpenDoc,
  onRemoved,
  onCustomize,
  onHowItWorks,
  onToggleWayflow,
}: SidebarProps) {
  const [docs, setDocs] = useState<LibDoc[]>([])
  const { locale, setLocale, t } = useLocale()

  useEffect(() => {
    setDocs(listLibrary())
  }, [refreshToken])

  const removeDoc = async (id: string) => {
    setDocs(await removeFromLibrary(id))
    onRemoved()
  }

  if (collapsed) {
    return (
      <div className="sidebar-body rail-body">
        <EngineStatus compact />
        <button type="button" className="btn btn-secondary rail-btn" onClick={onToggleWayflow} title={t.sbWorkflow} aria-label={t.sbWorkflow}>
          <Icon name="send" size={16} />
        </button>
        <button type="button" className="btn btn-secondary rail-btn" onClick={onToggleRail} title={t.sbRecentsExpand} aria-label={t.sbRecentsExpand} aria-expanded={false}>
          <Icon name="file" size={16} />
        </button>
        <div className="sidebar-footer rail-footer">
          <div className="locale-toggle" role="radiogroup" aria-label="Idioma / Language">
            <button type="button" className={`locale-toggle-btn${locale === 'en' ? ' active' : ''}`} onClick={() => setLocale('en')} role="radio" aria-checked={locale === 'en'} aria-label="English">EN</button>
            <button type="button" className={`locale-toggle-btn${locale === 'es' ? ' active' : ''}`} onClick={() => setLocale('es')} role="radio" aria-checked={locale === 'es'} aria-label="Español">ES</button>
          </div>
          <button
            type="button"
            className="btn btn-secondary rail-btn"
            onClick={onCustomize}
            title={t.sbCustomize(userName, robotName)}
            aria-label={t.sbCustomize(userName, robotName)}
          >
            <Icon name="user" size={16} />
          </button>
          <button
            type="button"
            className="btn btn-secondary rail-btn"
            onClick={onToggleRail}
            title={t.sbExpand}
            aria-label={t.sbExpand}
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
      <button type="button" className="btn btn-secondary sidebar-new" onClick={onToggleWayflow}>
        <Icon name="send" size={16} /> {t.sbWorkflow}
      </button>

      <nav className="sidebar-section" aria-label={t.sbRecents}>
        <h2 className="sidebar-heading">{t.sbRecents}</h2>
        {docs.length === 0 ? (
          <p className="sidebar-empty">{t.sbEmpty}</p>
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
                  title={t.sbRemove(d.name)}
                  aria-label={t.sbRemove(d.name)}
                >
                  <Icon name="close" size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </nav>

      <p className="sidebar-privacy">
        <Icon name="lock" size={14} /> {t.sbPrivacy}
      </p>

      <div className="sidebar-footer">
        <div className="sidebar-user" title={userName || t.sbLocalUser}>
          <Icon name="user" size={16} />
          <span className="sidebar-user-names">
            <strong>{userName || t.sbLocalUser}</strong>
            <small>{hasDocument ? t.sbReadingPdf : t.sbNoDoc} · {robotName}</small>
          </span>
        </div>
        <div className="sidebar-footer-actions">
          <button type="button" className="btn btn-secondary small" onClick={onCustomize}>
            <Icon name="robot" size={14} /> {t.sbCustomizeBtn}
          </button>
          <button type="button" className="btn btn-secondary small" onClick={onHowItWorks}>
            {t.sbHowItWorks}
          </button>
          <div className="locale-toggle" role="radiogroup" aria-label="Idioma / Language">
            <button type="button" className={`locale-toggle-btn${locale === 'en' ? ' active' : ''}`} onClick={() => setLocale('en')} role="radio" aria-checked={locale === 'en'} aria-label="English">EN</button>
            <button type="button" className={`locale-toggle-btn${locale === 'es' ? ' active' : ''}`} onClick={() => setLocale('es')} role="radio" aria-checked={locale === 'es'} aria-label="Español">ES</button>
          </div>
          <button
            type="button"
            className="btn btn-secondary small"
            onClick={onToggleRail}
            title={t.sbCollapse}
            aria-label={t.sbCollapse}
            aria-expanded={true}
          >
            <Icon name="chevron-left" size={14} /> {t.sbCollapse}
          </button>
        </div>
      </div>
    </div>
  )
}
