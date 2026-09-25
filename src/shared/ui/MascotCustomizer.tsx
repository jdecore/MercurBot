import { useRef, useState } from 'react'
import { DEFAULT_ROBOT_NAME, getPreferences, savePreferences } from '../../shared/lib/storage'
import type { RobotUnitId } from '../../entities/robot/types'
import { ROBOT_DESIGN_LIST, QUICK_THEMES, designFromName, sanitizeRobotName, type RobotAccessory, type RobotConfig, type RobotEyes } from '../../entities/robot/robotSeed'
import { Mascota } from './Mascota'
import { Icon } from './Icon'
import { useLocale, resetLocaleToAuto } from '../../shared/lib/locale'

const MAX_NAME = 24

interface MascotCustomizerProps {
  robot: RobotUnitId; robotName: string; config: RobotConfig
  onChange: (robot: RobotUnitId, robotName: string, config: RobotConfig) => void
}

const EYES_IDS: RobotEyes[] = ['round', 'visor', 'happy', 'sleepy', 'big']
const ACC_IDS: RobotAccessory[] = ['none', 'antenna', 'fins', 'headphones', 'tuft', 'glasses', 'bow', 'cap']

export function MascotCustomizer({ robot, robotName, config, onChange }: MascotCustomizerProps) {
  const [robotDraft, setRobotDraft] = useState(robotName)
  const [tab, setTab] = useState<'rapido' | 'avanzado'>('rapido')
  const touchedRef = useRef(false)
  const { t, locale, setLocale } = useLocale()

  const EYES_LABELS: Record<RobotEyes, string> = { round: t.mcEyesRound, visor: t.mcEyesVisor, happy: t.mcEyesHappy, sleepy: t.mcEyesSleepy, big: t.mcEyesBig }
  const ACC_LABELS: Record<RobotAccessory, string> = { none: t.mcAccNone, antenna: t.mcAccAntenna, fins: t.mcAccFins, headphones: t.mcAccHeadphones, tuft: t.mcAccTuft, glasses: t.mcAccGlasses, bow: t.mcAccBow, cap: t.mcAccCap }

  // Filter designs by locale family: EN→cold, ES→warm, auto→all
  const familyFilter = locale === 'en' ? 'cold' : locale === 'es' ? 'warm' : null
  const filteredDesigns = familyFilter
    ? ROBOT_DESIGN_LIST.filter((d) => d.family === familyFilter || d.family === 'neutral')
    : ROBOT_DESIGN_LIST

  const applyRobotName = () => {
    const clean = sanitizeRobotName(robotDraft, DEFAULT_ROBOT_NAME); setRobotDraft(clean)
    onChange(robot, clean, touchedRef.current ? config : designFromName(clean))
  }
  const pickTrait = (patch: Partial<RobotConfig>) => { touchedRef.current = true; onChange(robot, sanitizeRobotName(robotDraft || robotName), { ...config, ...patch }) }
  const surprise = () => { touchedRef.current = true; const d = ROBOT_DESIGN_LIST[Math.floor(Math.random() * ROBOT_DESIGN_LIST.length)]; onChange(robot, sanitizeRobotName(robotDraft || robotName), { color: d.color, eyes: d.eyes, accessory: d.accessory }) }

  return (
    <div className="mascot-customizer" role="group" aria-label={t.mcAria}>
      <div className="customizer-hero" aria-hidden>
        <Mascota variant={robot} config={config} mood="neutro" size={140} interactive={false} />
        <p className="customizer-hero-name">{sanitizeRobotName(robotDraft || robotName)}</p>
      </div>
      <div className="customizer-tabs" role="tablist" aria-label={t.mcTabsAria}>
        <button type="button" role="tab" aria-selected={tab === 'rapido'} className={`customizer-tab ${tab === 'rapido' ? 'active' : ''}`} onClick={() => setTab('rapido')}>{t.mcTabStyle}</button>
        <button type="button" role="tab" aria-selected={tab === 'avanzado'} className={`customizer-tab ${tab === 'avanzado' ? 'active' : ''}`} onClick={() => setTab('avanzado')}>{t.mcTabDetails}</button>
      </div>
      {tab === 'rapido' && (
        <>
          <section className="customizer-section" aria-label={t.mcThemesLabel}>
            <h3 className="customizer-section-title">{t.mcThemesHeading}</h3>
            <div className="theme-picker" role="radiogroup" aria-label={t.mcThemesAria}>
              {QUICK_THEMES.map((th) => {
                const active = config.color === th.config.color && config.eyes === th.config.eyes && config.accessory === th.config.accessory
                const design = ROBOT_DESIGN_LIST.find((d) => d.id === th.config.color)
                return (
                  <button key={th.id} type="button" role="radio" aria-checked={active} className={`theme-btn ${active ? 'active' : ''}`}
                    title={`${th.label} — ${th.emoji}`} aria-label={t.mcThemeLabel(th.label)}
                    style={{ ['--theme-color' as string]: design?.hex ?? '#888' } as React.CSSProperties}
                    onClick={() => { touchedRef.current = true; onChange(robot, sanitizeRobotName(robotDraft || robotName), th.config) }}>
                    <span className="theme-emoji" aria-hidden>{th.emoji}</span><span className="theme-label">{th.label}</span>
                  </button>
                )
              })}
            </div>
          </section>
          <section className="customizer-section" aria-label={t.mcNameAria}>
            <h3 className="customizer-section-title">{t.mcNameHeading}</h3>
            <div className="mascot-customizer-row">
              <label className="mascot-name-field">
                <input type="text" value={robotDraft} maxLength={MAX_NAME} placeholder={DEFAULT_ROBOT_NAME}
                  onChange={(e) => setRobotDraft(e.target.value)} onBlur={applyRobotName}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                  aria-label={t.mcNameInputAria} />
              </label>
              <button type="button" className="btn btn-secondary small" onClick={surprise} title={t.mcRandomBtn}>
                <Icon name="reload" size={14} /> {t.mcRandomLabel}
              </button>
            </div>
          </section>
        </>
      )}
      {tab === 'avanzado' && (
        <>
          <section className="customizer-section" aria-label={t.mcDesignAria}>
            <h3 className="customizer-section-title">{t.mcDesignHeading}</h3>
            <div className="mascot-design-picker" role="radiogroup" aria-label={t.mcDesignAria}>
              {filteredDesigns.map((d) => (
                <button key={d.id} type="button" role="radio" aria-checked={config.color === d.id} title={d.label}
                  aria-label={t.mcDesignLabel(d.label)} className={`design-btn ${config.color === d.id ? 'active' : ''}`}
                  style={{ ['--design-color' as string]: d.hex } as React.CSSProperties}
                  onClick={() => { const base = ROBOT_DESIGN_LIST.find((x) => x.id === d.id); if (base) pickTrait({ color: d.id, eyes: base.eyes, accessory: base.accessory }) }}>
                  <span className="design-dot" aria-hidden />{d.label}
                </button>
              ))}
            </div>
          </section>
          <section className="customizer-section" aria-label={t.mcEyesGroupAria}>
            <h3 className="customizer-section-title">{t.mcEyesHeading}</h3>
            <div className="mascot-face-toggle" role="radiogroup" aria-label={t.mcEyesGroupAria}>
              {EYES_IDS.map((id) => (
                <button key={id} type="button" role="radio" aria-checked={config.eyes === id} className={`face-btn ${config.eyes === id ? 'active' : ''}`}
                  onClick={() => pickTrait({ eyes: id })}>{EYES_LABELS[id]}</button>
              ))}
            </div>
          </section>
          <section className="customizer-section" aria-label={t.mcAccGroupAria}>
            <h3 className="customizer-section-title">{t.mcAccHeading}</h3>
            <div className="mascot-face-toggle" role="radiogroup" aria-label={t.mcAccGroupAria}>
              {ACC_IDS.map((id) => (
                <button key={id} type="button" role="radio" aria-checked={config.accessory === id} className={`face-btn ${config.accessory === id ? 'active' : ''}`}
                  onClick={() => pickTrait({ accessory: id })}>{ACC_LABELS[id]}</button>
              ))}
            </div>
          </section>
          <section className="customizer-section" aria-label={t.mcLangGroupAria}>
            <h3 className="customizer-section-title">{t.mcLangHeading}</h3>
            <div className="mascot-face-toggle" role="radiogroup" aria-label={t.mcLangGroupAria}>
              {(['auto', 'es', 'en'] as const).map((l) => {
                const active = l === 'auto' ? !getPreferences().locale : locale === l
                const label = l === 'auto' ? t.mcLangAuto : l === 'es' ? t.mcLangEs : t.mcLangEn
                return (
                  <button key={l} type="button" role="radio" aria-checked={active}
                    className={`face-btn ${active ? 'active' : ''}`}
                    onClick={() => {
                      if (l === 'auto') {
                        setLocale(resetLocaleToAuto())
                      } else {
                        savePreferences({ ...getPreferences(), locale: l })
                        setLocale(l)
                      }
                    }}>{label}</button>
                )
              })}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
