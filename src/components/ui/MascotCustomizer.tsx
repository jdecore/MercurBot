import { useState } from 'react'
import { Blobatar } from '@blobatar/react'
import { DEFAULT_BLOBATAR_NAME } from '../../lib/storage'

export type MascotFace = 'robot' | 'blobatar'

interface MascotCustomizerProps {
  face: MascotFace
  name: string
  onChange: (face: MascotFace, name: string) => void
}

const MAX_NAME = 24

function sanitize(raw: string): string {
  return raw.trim().slice(0, MAX_NAME) || DEFAULT_BLOBATAR_NAME
}

/**
 * Personalización de la mascota: cara de robot del ecosistema o avatar
 * Blobatar determinista (mismo nombre = mismo avatar), persistido en
 * preferencias locales (sin backend, §8/§31).
 */
export function MascotCustomizer({ face, name, onChange }: MascotCustomizerProps) {
  const [draft, setDraft] = useState(name)

  const applyFace = (f: MascotFace) => onChange(f, sanitize(face === 'blobatar' ? draft || name : name))

  const applyName = () => onChange(face, sanitize(draft))

  return (
    <div className="mascot-customizer" role="group" aria-label="Personalizar mascota">
      <div className="mascot-customizer-row">
        <span className="mascot-customizer-label">Cara:</span>
        <div className="mascot-face-toggle" role="radiogroup" aria-label="Cara de la mascota">
          <button
            type="button"
            role="radio"
            aria-checked={face === 'robot'}
            className={`face-btn ${face === 'robot' ? 'active' : ''}`}
            onClick={() => applyFace('robot')}
          >
            🤖 Robot
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={face === 'blobatar'}
            className={`face-btn ${face === 'blobatar' ? 'active' : ''}`}
            onClick={() => applyFace('blobatar')}
          >
            🫧 Mi avatar
          </button>
        </div>
      </div>

      {face === 'blobatar' && (
        <div className="mascot-customizer-row">
          <span className="mascot-avatar-preview" aria-hidden>
            <Blobatar name={sanitize(draft || name)} size={40} />
          </span>
          <label className="mascot-name-field">
            <span className="mascot-customizer-label">Nombre del avatar:</span>
            <input
              type="text"
              value={draft}
              maxLength={MAX_NAME}
              placeholder={DEFAULT_BLOBATAR_NAME}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={applyName}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
              aria-label="Nombre del avatar (define su apariencia)"
            />
          </label>
        </div>
      )}
    </div>
  )
}
