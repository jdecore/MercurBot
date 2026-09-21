import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Mascota } from '../ui/Mascota'
import { DEFAULT_ROBOT_NAME } from '../../lib/storage'
import { designFromName, sanitizeRobotName, QUICK_THEMES, ROBOT_DESIGN_LIST, type RobotConfig, type RobotEyes } from '../../lib/robotSeed'

interface OnboardingTourProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialUserName: string
  initialRobotName: string
  onFinish: (userName: string, robotName: string, config: RobotConfig) => void
}

const EYES_OPTIONS: { id: RobotEyes; label: string }[] = [
  { id: 'round', label: 'Redondos' },
  { id: 'visor', label: 'Visor' },
  { id: 'happy', label: 'Felices' },
  { id: 'sleepy', label: 'Soñolientos' },
  { id: 'big', label: 'Grandes' },
]

/**
 * Tutorial de bienvenida: 3 pasos.
 * Paso 0: presentación + nombres.
 * Paso 1: elección de estilo (temas + ojos).
 * Paso 2: instrucciones + saludo.
 */
export function OnboardingTour({ open, onOpenChange, initialUserName, initialRobotName, onFinish }: OnboardingTourProps) {
  const [step, setStep] = useState(0)
  const [userDraft, setUserDraft] = useState(initialUserName)
  const [robotDraft, setRobotDraft] = useState(initialRobotName || DEFAULT_ROBOT_NAME)
  const [pickedConfig, setPickedConfig] = useState<RobotConfig | null>(null)

  const robotName = sanitizeRobotName(robotDraft, DEFAULT_ROBOT_NAME)
  const baseConfig = designFromName(robotName)
  const activeConfig = pickedConfig ?? baseConfig
  const userName = userDraft.trim().slice(0, MAX_USER)

  const finish = () => {
    onFinish(userName, robotName, activeConfig)
    onOpenChange(false)
    setStep(0)
    setPickedConfig(null)
  }

  const goNext = () => {
    if (step === 0 && !pickedConfig) setPickedConfig(baseConfig)
    setStep(step + 1)
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="onboard-overlay" />
        <Dialog.Content
          className="onboard-content"
          aria-describedby="onboard-desc"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <Dialog.Title className="onboard-title">
            {step === 0 && 'Hola, soy tu lector atento'}
            {step === 1 && 'Elige tu estilo'}
            {step === 2 && 'Así de fácil'}
          </Dialog.Title>

          <p id="onboard-desc" className="sr-only">
            Tutorial de bienvenida de MercurBot en 3 pasos
          </p>

          {/* Paso 0: Presentación + Nombres */}
          {step === 0 && (
            <div className="onboard-body">
              <div className="onboard-mascot" aria-hidden>
                <Mascota variant="helix" config={activeConfig} mood="feliz" size={120} />
              </div>
              <p>
                Leo tus PDFs contigo y te respondo señalando la página exacta.
              </p>
              <p className="onboard-muted">
                Todo pasa en tu navegador — tu documento nunca se sube a ningún servidor.
              </p>
              <label className="onboard-field">
                <span>¿Cómo te llamo?</span>
                <input
                  type="text"
                  value={userDraft}
                  maxLength={MAX_USER}
                  placeholder="Tu nombre"
                  onChange={(e) => setUserDraft(e.target.value)}
                  aria-label="Tu nombre"
                />
              </label>
              <label className="onboard-field">
                <span>Y yo me llamo… (mi cara nace de este nombre)</span>
                <input
                  type="text"
                  value={robotDraft}
                  maxLength={24}
                  placeholder={DEFAULT_ROBOT_NAME}
                  onChange={(e) => { setRobotDraft(e.target.value); setPickedConfig(null) }}
                  aria-label="Nombre del robot (define su diseño)"
                />
              </label>
            </div>
          )}

          {/* Paso 1: Estilo — temas + ojos */}
          {step === 1 && (
            <div className="onboard-body">
              <div className="onboard-mascot" aria-hidden>
                <Mascota variant="helix" config={activeConfig} mood="feliz" size={120} />
              </div>

              <p className="onboard-section-label">Tema rápido</p>
              <div className="onboard-theme-grid" role="radiogroup" aria-label="Temas prearmados">
                {QUICK_THEMES.map((t) => {
                  const active = activeConfig.color === t.config.color && activeConfig.eyes === t.config.eyes && activeConfig.accessory === t.config.accessory
                  const design = ROBOT_DESIGN_LIST.find((d) => d.id === t.config.color)
                  return (
                    <button
                      key={t.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      className={`onboard-theme-btn ${active ? 'active' : ''}`}
                      style={{ ['--theme-color' as string]: design?.hex ?? '#888' } as React.CSSProperties}
                      onClick={() => setPickedConfig(t.config)}
                    >
                      <span className="onboard-theme-emoji" aria-hidden>{t.emoji}</span>
                      <span>{t.label}</span>
                    </button>
                  )
                })}
              </div>

              <p className="onboard-section-label">Ojos</p>
              <div className="onboard-eyes-grid" role="radiogroup" aria-label="Ojos del robot">
                {EYES_OPTIONS.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    role="radio"
                    aria-checked={activeConfig.eyes === o.id}
                    className={`onboard-eye-btn ${activeConfig.eyes === o.id ? 'active' : ''}`}
                    onClick={() => setPickedConfig((prev) => ({ ...(prev ?? baseConfig), eyes: o.id }))}
                  >
                    {o.label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                className="onboard-random-btn"
                onClick={() => {
                  const d = ROBOT_DESIGN_LIST[Math.floor(Math.random() * ROBOT_DESIGN_LIST.length)]
                  setPickedConfig({ color: d.color, eyes: d.eyes, accessory: d.accessory })
                }}
              >
                🎲 Sorpréndeme
              </button>
            </div>
          )}

          {/* Paso 2: Instrucciones */}
          {step === 2 && (
            <div className="onboard-body">
              <ol className="onboard-steps">
                <li><strong>Suelta tu PDF aquí</strong> — lo leo en tu dispositivo.</li>
                <li><strong>Pregúntame lo que quieras</strong> — con tus palabras.</li>
                <li><strong>Toca [Pág. N]</strong> — te muestro la fuente exacta.</li>
              </ol>
              {userName && (
                <p className="onboard-hello">
                  ¡Encantado, {userName}! Soy {robotName}. Empecemos.
                </p>
              )}
            </div>
          )}

          <div className="onboard-nav">
            <span className="onboard-dots" aria-hidden>
              {[0, 1, 2].map((i) => (
                <span key={i} className={`onboard-dot ${i === step ? 'active' : ''}`} />
              ))}
            </span>
            <div className="onboard-btns">
              {step > 0 && (
                <button type="button" className="btn btn-secondary small" onClick={() => setStep(step - 1)}>
                  ← Atrás
                </button>
              )}
              {step < 2 ? (
                <button type="button" className="btn btn-primary small" onClick={goNext}>
                  Siguiente →
                </button>
              ) : (
                <button type="button" className="btn btn-primary small" onClick={finish}>
                  ¡Empezar!
                </button>
              )}
            </div>
          </div>

          <Dialog.Close asChild>
            <button type="button" className="onboard-skip" aria-label="Saltar tutorial">
              Saltar
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

const MAX_USER = 24
