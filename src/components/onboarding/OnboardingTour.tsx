import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Mascota } from '../ui/Mascota'
import { DEFAULT_ROBOT_NAME } from '../../lib/storage'
import { designFromName, sanitizeRobotName } from '../../lib/robotSeed'
import type { RobotConfig } from '../../lib/robotSeed'

interface OnboardingTourProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialUserName: string
  initialRobotName: string
  onFinish: (userName: string, robotName: string, config: RobotConfig) => void
}

/**
 * Tutorial de bienvenida (Fase E): 3 pasos, 30 segundos, saltable.
 * Paso 2 pide el nombre del usuario y el del robot (con preview vivo del
 * diseño que nace de ese nombre). Todo local, sin backend (§8/§31).
 */
export function OnboardingTour({ open, onOpenChange, initialUserName, initialRobotName, onFinish }: OnboardingTourProps) {
  const [step, setStep] = useState(0)
  const [userDraft, setUserDraft] = useState(initialUserName)
  const [robotDraft, setRobotDraft] = useState(initialRobotName || DEFAULT_ROBOT_NAME)

  const robotName = sanitizeRobotName(robotDraft, DEFAULT_ROBOT_NAME)
  const previewConfig = designFromName(robotName)
  const userName = userDraft.trim().slice(0, MAX_USER)

  const finish = () => {
    onFinish(userName, robotName, previewConfig)
    onOpenChange(false)
    setStep(0)
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
            {step === 1 && '¿Cómo nos llamamos?'}
            {step === 2 && 'Así de fácil'}
          </Dialog.Title>

          <p id="onboard-desc" className="sr-only">
            Tutorial de bienvenida de Copixi en 3 pasos
          </p>

          {step === 0 && (
            <div className="onboard-body">
              <div className="onboard-mascot" aria-hidden>
                <Mascota variant="helix" config={previewConfig} mood="feliz" size={120} />
              </div>
              <p>
                Leo tus PDFs contigo y te respondo señalando la página exacta.
              </p>
              <p className="onboard-muted">
                Todo pasa en tu navegador — tu documento nunca se sube a ningún servidor.
              </p>
            </div>
          )}

          {step === 1 && (
            <div className="onboard-body">
              <div className="onboard-mascot" aria-hidden>
                <Mascota variant="helix" config={previewConfig} mood="feliz" size={120} />
              </div>
              <label className="onboard-field">
                <span>¿Cómo te llamo?</span>
                <input
                  type="text"
                  value={userDraft}
                  maxLength={MAX_USER}
                  placeholder="Tu nombre"
                  onChange={(e) => setUserDraft(e.target.value)}
                  aria-label="Tu nombre"
                  autoFocus
                />
              </label>
              <label className="onboard-field">
                <span>Y yo me llamo… (mi cara nace de este nombre)</span>
                <input
                  type="text"
                  value={robotDraft}
                  maxLength={24}
                  placeholder={DEFAULT_ROBOT_NAME}
                  onChange={(e) => setRobotDraft(e.target.value)}
                  aria-label="Nombre del robot (define su diseño)"
                />
              </label>
            </div>
          )}

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
                <button type="button" className="btn btn-primary small" onClick={() => setStep(step + 1)}>
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
