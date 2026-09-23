import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Mascota } from '../ui/Mascota'
import { DEFAULT_ROBOT_NAME } from '../../lib/storage'
import { designFromName, sanitizeRobotName, QUICK_THEMES, ROBOT_DESIGN_LIST, type RobotConfig, type RobotEyes } from '../../lib/robotSeed'
import { useLocale } from '../../lib/locale'

const MAX_USER = 24

interface OnboardingTourProps {
  open: boolean; onOpenChange: (open: boolean) => void
  initialUserName: string; initialRobotName: string
  onFinish: (userName: string, robotName: string, config: RobotConfig) => void
}

const EYES_IDS: RobotEyes[] = ['round', 'visor', 'happy', 'sleepy', 'big']

export function OnboardingTour({ open, onOpenChange, initialUserName, initialRobotName, onFinish }: OnboardingTourProps) {
  const [step, setStep] = useState(0)
  const [userDraft, setUserDraft] = useState(initialUserName)
  const [robotDraft, setRobotDraft] = useState(initialRobotName || DEFAULT_ROBOT_NAME)
  const [pickedConfig, setPickedConfig] = useState<RobotConfig | null>(null)
  const { t } = useLocale()

  const EYES_LABELS: Record<RobotEyes, string> = { round: t.otEyesRound, visor: t.otEyesVisor, happy: t.otEyesHappy, sleepy: t.otEyesSleepy, big: t.otEyesBig }

  const robotName = sanitizeRobotName(robotDraft, DEFAULT_ROBOT_NAME)
  const baseConfig = designFromName(robotName)
  const activeConfig = pickedConfig ?? baseConfig
  const userName = userDraft.trim().slice(0, MAX_USER)

  const finish = () => { onFinish(userName, robotName, activeConfig); onOpenChange(false); setStep(0); setPickedConfig(null) }
  const goNext = () => { if (step === 0 && !pickedConfig) setPickedConfig(baseConfig); setStep(step + 1) }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="onboard-overlay" />
        <Dialog.Content className="onboard-content" aria-describedby="onboard-desc" onOpenAutoFocus={(e) => e.preventDefault()}>
          <Dialog.Title className="onboard-title">
            {step === 0 && t.otStep0Title}
            {step === 1 && t.otStep1Title}
            {step === 2 && t.otStep2Title}
          </Dialog.Title>
          <p id="onboard-desc" className="sr-only">{t.otSrDesc}</p>

          {step === 0 && (
            <div className="onboard-body">
              <div className="onboard-mascot" aria-hidden>
                <Mascota variant="helix" config={activeConfig} mood="feliz" size={120} interactive={false} />
              </div>
              <p>{t.otIntro}</p>
              <p className="onboard-muted">{t.otPrivacy}</p>
              <label className="onboard-field">
                <span>{t.otNameLabel}</span>
                <input type="text" value={userDraft} maxLength={MAX_USER} placeholder={t.otNamePlaceholder} onChange={(e) => setUserDraft(e.target.value)} aria-label={t.otNameAria} />
              </label>
              <label className="onboard-field">
                <span>{t.otRobotLabel}</span>
                <input type="text" value={robotDraft} maxLength={24} placeholder={DEFAULT_ROBOT_NAME} onChange={(e) => { setRobotDraft(e.target.value); setPickedConfig(null) }} aria-label={t.otRobotAria} />
              </label>
            </div>
          )}

          {step === 1 && (
            <div className="onboard-body">
              <div className="onboard-mascot" aria-hidden>
                <Mascota variant="helix" config={activeConfig} mood="feliz" size={120} interactive={false} />
              </div>
              <p className="onboard-section-label">{t.otThemesLabel}</p>
              <div className="onboard-theme-grid" role="radiogroup" aria-label={t.otThemesAria}>
                {QUICK_THEMES.map((th) => {
                  const active = activeConfig.color === th.config.color && activeConfig.eyes === th.config.eyes && activeConfig.accessory === th.config.accessory
                  const design = ROBOT_DESIGN_LIST.find((d) => d.id === th.config.color)
                  return (
                    <button key={th.id} type="button" role="radio" aria-checked={active} className={`onboard-theme-btn ${active ? 'active' : ''}`}
                      style={{ ['--theme-color' as string]: design?.hex ?? '#888' } as React.CSSProperties} onClick={() => setPickedConfig(th.config)}>
                      <span className="onboard-theme-emoji" aria-hidden>{th.emoji}</span>
                      <span>{th.label}</span>
                    </button>
                  )
                })}
              </div>
              <p className="onboard-section-label">{t.otEyesLabel}</p>
              <div className="onboard-eyes-grid" role="radiogroup" aria-label={t.otEyesAria}>
                {EYES_IDS.map((id) => (
                  <button key={id} type="button" role="radio" aria-checked={activeConfig.eyes === id} className={`onboard-eye-btn ${activeConfig.eyes === id ? 'active' : ''}`}
                    onClick={() => setPickedConfig((prev) => ({ ...(prev ?? baseConfig), eyes: id }))}>
                    {EYES_LABELS[id]}
                  </button>
                ))}
              </div>
              <button type="button" className="onboard-random-btn" onClick={() => { const d = ROBOT_DESIGN_LIST[Math.floor(Math.random() * ROBOT_DESIGN_LIST.length)]; setPickedConfig({ color: d.color, eyes: d.eyes, accessory: d.accessory }) }}>
                {t.otRandomBtn}
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="onboard-body">
              <ol className="onboard-steps">
                <li><strong>{t.otStep2Drop}</strong>{t.otStep2DropSub}</li>
                <li><strong>{t.otStep2Ask}</strong>{t.otStep2AskSub}</li>
                <li><strong>{t.otStep2Cite}</strong>{t.otStep2CiteSub}</li>
              </ol>
              {userName && <p className="onboard-hello">{t.otClosing(userName, robotName)}</p>}
            </div>
          )}

          <div className="onboard-nav">
            <span className="onboard-dots" aria-hidden>{[0, 1, 2].map((i) => <span key={i} className={`onboard-dot ${i === step ? 'active' : ''}`} />)}</span>
            <div className="onboard-btns">
              {step > 0 && <button type="button" className="btn btn-secondary small" onClick={() => setStep(step - 1)}>{t.otBack}</button>}
              {step < 2 ? (
                <button type="button" className="btn btn-primary small" onClick={goNext}>{t.otNext}</button>
              ) : (
                <button type="button" className="btn btn-primary small" onClick={finish}>{t.otStart}</button>
              )}
            </div>
          </div>
          <Dialog.Close asChild>
            <button type="button" className="onboard-skip" aria-label={t.otSkipAria}>{t.otSkip}</button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
