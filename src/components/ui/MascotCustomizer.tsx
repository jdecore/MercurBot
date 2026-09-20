import { useRef, useState } from 'react'
import { DEFAULT_ROBOT_NAME } from '../../lib/storage'
import { ROBOT_UNITS, type RobotUnitId } from '../../types/mascota'
import {
  ROBOT_DESIGN_LIST,
  QUICK_THEMES,
  designFromName,
  sanitizeRobotName,
  type RobotAccessory,
  type RobotColorId,
  type RobotConfig,
  type RobotEyes,
} from '../../lib/robotSeed'
import { Mascota } from './Mascota'
import { Icon } from './Icon'

interface MascotCustomizerProps {
  robot: RobotUnitId
  robotName: string
  config: RobotConfig
  onChange: (robot: RobotUnitId, robotName: string, config: RobotConfig) => void
}

const MAX_NAME = 24

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
export function MascotCustomizer({ robot, robotName, config, onChange }: MascotCustomizerProps) {
  const [robotDraft, setRobotDraft] = useState(robotName)
  const [tab, setTab] = useState<'rapido' | 'avanzado'>('rapido')
  // Si el usuario tocó un rasgo a mano, cambiar el nombre ya no regenera.
  const touchedRef = useRef(false)

  const applyRobotName = () => {
    const clean = sanitizeRobotName(robotDraft, DEFAULT_ROBOT_NAME)
    setRobotDraft(clean)
    if (touchedRef.current) {
      onChange(robot, clean, config)
    } else {
      onChange(robot, clean, designFromName(clean))
    }
  }

  const pickTrait = (patch: Partial<RobotConfig>) => {
    touchedRef.current = true
    onChange(robot, sanitizeRobotName(robotDraft || robotName), { ...config, ...patch })
  }

  const surprise = () => {
    touchedRef.current = true
    const d = ROBOT_DESIGN_LIST[Math.floor(Math.random() * ROBOT_DESIGN_LIST.length)]
    const clean = sanitizeRobotName(robotDraft || robotName)
    onChange(robot, clean, { color: d.color, eyes: d.eyes, accessory: d.accessory })
  }

  return (
    <div className="mascot-customizer" role="group" aria-label="Personalizar mascota">
      <div className="customizer-hero" aria-hidden>
        <Mascota variant={robot} config={config} mood="neutro" size={140} />
        <p className="customizer-hero-name">{sanitizeRobotName(robotDraft || robotName)}</p>
      </div>

      <div className="customizer-tabs" role="tablist" aria-label="Opciones de personalización">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'rapido'}
          className={`customizer-tab ${tab === 'rapido' ? 'active' : ''}`}
          onClick={() => setTab('rapido')}
        >
          Estilo
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'avanzado'}
          className={`customizer-tab ${tab === 'avanzado' ? 'active' : ''}`}
          onClick={() => setTab('avanzado')}
        >
          Detalles
        </button>
      </div>

      {tab === 'rapido' && (
        <>
          <section className="customizer-section" aria-label="Temas rápidos">
            <h3 className="customizer-section-title">Temas</h3>
            <div className="theme-picker" role="radiogroup" aria-label="Temas prearmados">
              {QUICK_THEMES.map((t) => {
                const active = config.color === t.config.color && config.eyes === t.config.eyes && config.accessory === t.config.accessory
                const design = ROBOT_DESIGN_LIST.find((d) => d.id === t.config.color)
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    className={`theme-btn ${active ? 'active' : ''}`}
                    title={`${t.label} — ${t.emoji}`}
                    aria-label={`Tema ${t.label}`}
                    style={{ ['--theme-color' as string]: design?.hex ?? '#888' } as React.CSSProperties}
                    onClick={() => {
                      touchedRef.current = true
                      onChange(robot, sanitizeRobotName(robotDraft || robotName), t.config)
                    }}
                  >
                    <span className="theme-emoji" aria-hidden>{t.emoji}</span>
                    <span className="theme-label">{t.label}</span>
                  </button>
                )
              })}
            </div>
          </section>

          <section className="customizer-section" aria-label="Nombre del robot">
            <h3 className="customizer-section-title">Mi robot se llama</h3>
            <div className="mascot-customizer-row">
              <label className="mascot-name-field">
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
                <Icon name="reload" size={14} /> Sorpréndeme
              </button>
            </div>
          </section>
        </>
      )}

      {tab === 'avanzado' && (
        <>
          <section className="customizer-section" aria-label="Diseño del robot">
            <h3 className="customizer-section-title">Color</h3>
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
          </section>

          <section className="customizer-section" aria-label="Ojos del robot">
            <h3 className="customizer-section-title">Ojos</h3>
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
          </section>

          <section className="customizer-section" aria-label="Accesorio del robot">
            <h3 className="customizer-section-title">Extra</h3>
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
          </section>

          <section className="customizer-section" aria-label="Unidad base del robot">
            <h3 className="customizer-section-title">Unidad base</h3>
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
                    onClick={() => onChange(id, sanitizeRobotName(robotDraft || robotName), config)}
                  >
                    <span className="unit-dot" aria-hidden />
                    {meta.name}
                  </button>
                )
              })}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
