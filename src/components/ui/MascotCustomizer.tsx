import { useState } from 'react'
import { Blobatar } from '@blobatar/react'
import { DEFAULT_BLOBATAR_NAME } from '../../lib/storage'
import { ROBOT_UNITS, type RobotUnitId } from '../../types/mascota'

export type MascotFace = 'robot' | 'blobatar'

interface MascotCustomizerProps {
  face: MascotFace
  robot: RobotUnitId
  name: string
  onChange: (face: MascotFace, robot: RobotUnitId, name: string) => void
}

const MAX_NAME = 24

function sanitize(raw: string): string {
  return raw.trim().slice(0, MAX_NAME) || DEFAULT_BLOBATAR_NAME
}

/**
 * Personalización del robot único: elige una de las 7 unidades del
 * ecosistema o un avatar Blobatar determinista (mismo nombre = mismo
 * avatar). Todo persiste en preferencias locales (sin backend, §8/§31).
 */
export function MascotCustomizer({ face, robot, name, onChange }: MascotCustomizerProps) {
  const [draft, setDraft] = useState(name)

  const applyName = () => onChange(face, robot, sanitize(draft))

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
            onClick={() => onChange('robot', robot, sanitize(draft || name))}
          >
            🤖 Robot
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={face === 'blobatar'}
            className={`face-btn ${face === 'blobatar' ? 'active' : ''}`}
            onClick={() => onChange('blobatar', robot, sanitize(draft || name))}
          >
            🫧 Mi avatar
          </button>
        </div>
      </div>

      {face === 'robot' && (
        <div className="mascot-customizer-row">
          <span className="mascot-customizer-label">Unidad:</span>
          <div className="mascot-unit-picker" role="radiogroup" aria-label="Unidad del robot">
            {(Object.keys(ROBOT_UNITS) as RobotUnitId[]).map((id) => {
              const meta = ROBOT_UNITS[id]
              const selected = robot === id
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  title={`${meta.name} — ${meta.domain}`}
                  aria-label={`${meta.name}, ${meta.domain}`}
                  className={`unit-btn ${selected ? 'active' : ''}`}
                  style={{ ['--unit-color' as string]: meta.primaryColor } as React.CSSProperties}
                  onClick={() => onChange('robot', id, sanitize(draft || name))}
                >
                  <span className="unit-dot" aria-hidden />
                  {meta.name}
                </button>
              )
            })}
          </div>
        </div>
      )}

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
