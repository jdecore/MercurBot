import { useRef, useState } from 'react'
import { Blobatar } from '@blobatar/react'
import { DEFAULT_BLOBATAR_NAME, DEFAULT_ROBOT_NAME } from '../../lib/storage'
import { ROBOT_UNITS, type RobotUnitId } from '../../types/mascota'
import {
  ROBOT_DESIGN_LIST,
  designFromName,
  sanitizeRobotName,
  type RobotAccessory,
  type RobotColorId,
  type RobotConfig,
  type RobotEyes,
} from '../../lib/robotSeed'
import { Mascota } from './Mascota'
import { Icon } from './Icon'

export type MascotFace = 'robot' | 'blobatar'

interface MascotCustomizerProps {
  face: MascotFace
  robot: RobotUnitId
  name: string
  robotName: string
  config: RobotConfig
  onChange: (face: MascotFace, robot: RobotUnitId, name: string, robotName: string, config: RobotConfig) => void
}

const MAX_NAME = 24

function sanitize(raw: string): string {
  return raw.trim().slice(0, MAX_NAME) || DEFAULT_BLOBATAR_NAME
}

const EYES_OPTIONS: { id: RobotEyes; label: string }[] = [
  { id: 'round', label: 'Redondos' },
  { id: 'visor', label: 'Visor' },
  { id: 'happy', label: 'Felices' },
  { id: 'sleepy', label: 'Soñolientos' },
  { id: 'big', label: 'Grandes' },
]

const ACCESSORY_OPTIONS: { id: RobotAccessory; label: string }[] = [
  { id: 'none', label: 'Ninguno' },
  { id: 'antenna', label: 'Antena' },
  { id: 'fins', label: 'Aletas' },
  { id: 'headphones', label: 'Auriculares' },
  { id: 'tuft', label: 'Mota' },
  { id: 'glasses', label: 'Gafas' },
  { id: 'bow', label: 'Lazo' },
  { id: 'cap', label: 'Gorra' },
]

/**
 * Personalizador del robot único (Fase D): el nombre genera el diseño base
 * (misma semilla = mismo robot) y cada rasgo se ajusta a mano con preview
 * en vivo. El ajuste manual gana a la semilla. Todo persiste en preferencias
 * locales (sin backend, §8/§31).
 */
export function MascotCustomizer({ face, robot, name, robotName, config, onChange }: MascotCustomizerProps) {
  const [draft, setDraft] = useState(name)
  const [robotDraft, setRobotDraft] = useState(robotName)
  // Si el usuario tocó un rasgo a mano, cambiar el nombre ya no regenera.
  const touchedRef = useRef(false)

  const applyName = () => onChange(face, robot, sanitize(draft), robotName, config)

  const applyRobotName = () => {
    const clean = sanitizeRobotName(robotDraft, DEFAULT_ROBOT_NAME)
    setRobotDraft(clean)
    if (touchedRef.current) {
      onChange(face, robot, sanitize(draft || name), clean, config)
    } else {
      onChange(face, robot, sanitize(draft || name), clean, designFromName(clean))
    }
  }

  const pickTrait = (patch: Partial<RobotConfig>) => {
    touchedRef.current = true
    onChange(face, robot, sanitize(draft || name), sanitizeRobotName(robotDraft || robotName), { ...config, ...patch })
  }

  const surprise = () => {
    touchedRef.current = true
    const d = ROBOT_DESIGN_LIST[Math.floor(Math.random() * ROBOT_DESIGN_LIST.length)]
    const clean = sanitizeRobotName(robotDraft || robotName)
    onChange(face, robot, sanitize(draft || name), clean, { color: d.color, eyes: d.eyes, accessory: d.accessory })
  }

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
            onClick={() => onChange('robot', robot, sanitize(draft || name), sanitizeRobotName(robotDraft || robotName), config)}
          >
            <Icon name="robot" size={14} /> Robot
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={face === 'blobatar'}
            className={`face-btn ${face === 'blobatar' ? 'active' : ''}`}
            onClick={() => onChange('blobatar', robot, sanitize(draft || name), sanitizeRobotName(robotDraft || robotName), config)}
          >
            <Icon name="user" size={14} /> Mi avatar
          </button>
        </div>
      </div>

      {face === 'robot' && (
        <>
          <div className="mascot-customizer-preview" aria-hidden>
            <Mascota variant={robot} config={config} mood="neutro" size={120} />
          </div>

          <div className="mascot-customizer-row">
            <label className="mascot-name-field">
              <span className="mascot-customizer-label">Mi robot se llama:</span>
              <input
                type="text"
                value={robotDraft}
                maxLength={MAX_NAME}
                placeholder={DEFAULT_ROBOT_NAME}
                onChange={(e) => setRobotDraft(e.target.value)}
                onBlur={applyRobotName}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                aria-label="Nombre del robot (define su diseño base)"
              />
            </label>
            <button
              type="button"
              className="btn btn-secondary small"
              onClick={surprise}
              title="Generar otro diseño desde el nombre"
            >
              🎲 Sorpréndeme
            </button>
          </div>

          <div className="mascot-customizer-row">
            <span className="mascot-customizer-label">Diseño:</span>
            <div className="mascot-design-picker" role="radiogroup" aria-label="Diseño del robot">
              {ROBOT_DESIGN_LIST.map((d) => {
                const selected = config.color === d.id
                const pick = (color: RobotColorId) => {
                  const base = ROBOT_DESIGN_LIST.find((x) => x.id === color)
                  if (base) pickTrait({ color, eyes: base.eyes, accessory: base.accessory })
                }
                return (
                  <button
                    key={d.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    title={d.label}
                    aria-label={`Diseño ${d.label}`}
                    className={`design-btn ${selected ? 'active' : ''}`}
                    style={{ ['--design-color' as string]: d.hex } as React.CSSProperties}
                    onClick={() => pick(d.id)}
                  >
                    <span className="design-dot" aria-hidden />
                    {d.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="mascot-customizer-row">
            <span className="mascot-customizer-label">Ojos:</span>
            <div className="mascot-face-toggle" role="radiogroup" aria-label="Ojos del robot">
              {EYES_OPTIONS.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  role="radio"
                  aria-checked={config.eyes === o.id}
                  className={`face-btn ${config.eyes === o.id ? 'active' : ''}`}
                  onClick={() => pickTrait({ eyes: o.id })}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mascot-customizer-row">
            <span className="mascot-customizer-label">Extra:</span>
            <div className="mascot-face-toggle" role="radiogroup" aria-label="Accesorio del robot">
              {ACCESSORY_OPTIONS.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  role="radio"
                  aria-checked={config.accessory === o.id}
                  className={`face-btn ${config.accessory === o.id ? 'active' : ''}`}
                  onClick={() => pickTrait({ accessory: o.id })}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mascot-customizer-row">
            <span className="mascot-customizer-label">Unidad base:</span>
            <div className="mascot-unit-picker" role="radiogroup" aria-label="Unidad base del robot">
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
                    onClick={() => onChange('robot', id, sanitize(draft || name), sanitizeRobotName(robotDraft || robotName), config)}
                  >
                    <span className="unit-dot" aria-hidden />
                    {meta.name}
                  </button>
                )
              })}
            </div>
          </div>
        </>
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
