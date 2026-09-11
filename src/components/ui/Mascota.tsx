import { useEffect, useRef, useState } from 'react'
import { Blobatar } from '@blobatar/react'
import 'blobatar/motion.css'
import './Mascota.css'
import { speak, isSpeaking } from '../../lib/tts'
import type { MascotaMood, MascotVariant, RobotUnitId } from '../../types/mascota'
import { ROBOT_UNITS } from '../../types/mascota'
import { DEFAULT_BLOBATAR_NAME } from '../../lib/storage'

interface MascotaProps {
  mood?: MascotaMood
  subtitulo?: string
  size?: number
  onClick?: () => void
  variant?: MascotVariant
  /** Nombre semilla del avatar Blobatar (solo usado con variant="blobatar"). */
  avatarName?: string
}

export function Mascota({ mood = 'neutro', subtitulo = '', size, onClick, variant = 'helix', avatarName }: MascotaProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [localMood, setLocalMood] = useState<MascotaMood>(mood)
  const [speakingState, setSpeakingState] = useState<boolean>(isSpeaking())

  useEffect(() => { setLocalMood(mood) }, [mood])

  useEffect(() => {
    const handleTts = (e: Event) => {
      const detail = (e as CustomEvent<{ speaking: boolean }>).detail
      if (detail) {
        setSpeakingState(detail.speaking)
        if (detail.speaking) {
          setLocalMood('hablando')
        }
      }
    }
    window.addEventListener('copixi:tts-speaking', handleTts as EventListener)
    return () => window.removeEventListener('copixi:tts-speaking', handleTts as EventListener)
  }, [])

  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const handler = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height * 0.35
      const dx = (e.clientX - cx) / (rect.width || 1)
      const dy = (e.clientY - cy) / (rect.height || 1)
      el.style.setProperty('--mouse-x', `${Math.max(-4, Math.min(4, dx * 5))}px`)
      el.style.setProperty('--mouse-y', `${Math.max(-3, Math.min(3, dy * 4))}px`)
      el.style.setProperty('--head-rot', `${Math.max(-8, Math.min(8, dx * 7))}deg`)
    }
    window.addEventListener('mousemove', handler, { passive: true })
    return () => window.removeEventListener('mousemove', handler)
  }, [])

  useEffect(() => {
    const api = {
      setMood: (m: MascotaMood) => setLocalMood(m),
      speak: (t: string) => speak(t),
    }
    ;(window as unknown as Record<string, unknown>).setMood = (m: string) => api.setMood(m as MascotaMood)
    ;(window as unknown as Record<string, unknown>).mascotaSpeak = (t: string) => api.speak(t)
    return () => {
      delete (window as unknown as Record<string, unknown>).setMood
      delete (window as unknown as Record<string, unknown>).mascotaSpeak
    }
  }, [])

  const effectiveMood = speakingState ? 'hablando' : localMood
  const moodClass = `mood-${effectiveMood}`

  // Cara personalizable (Blobatar): avatar determinista derivado del nombre.
  // Conserva el sistema de moods por fuera (clase mood-*) y subtítulos/TTS.
  if (variant === 'blobatar') {
    const displayName = (avatarName ?? '').trim() || DEFAULT_BLOBATAR_NAME
    return (
      <div
        id="mascota"
        ref={rootRef}
        className={`robot-eve face-blobatar ${moodClass}`}
        onClick={onClick}
        style={{
          ...(size ? { ['--robot-size' as string]: `${size}px` } : {}),
        } as React.CSSProperties}
        aria-label={`Avatar personalizado de ${displayName}, estado: ${effectiveMood}`}
        role="img"
      >
        <div className="robot-container blobatar-face">
          <Blobatar name={displayName} animate="hover" size={size ?? 180} />
        </div>

        {subtitulo && <div id="subtitulos">{subtitulo}</div>}
      </div>
    )
  }

  // Mapeo a unidad de robot
  const isRobotUnit = variant in ROBOT_UNITS
  const activeUnitId: RobotUnitId = isRobotUnit ? (variant as RobotUnitId) : 'helix'
  const robotMeta = ROBOT_UNITS[activeUnitId] || ROBOT_UNITS.helix

  const unitClass = `unit-${activeUnitId}`

  return (
    <div
      id="mascota"
      ref={rootRef}
      className={`robot-eve ${unitClass} ${moodClass}`}
      onClick={onClick}
      style={{
        ...(size ? { ['--robot-size' as string]: `${size}px` } : {}),
        ['--unit-primary' as string]: robotMeta.primaryColor,
        ['--unit-accent' as string]: robotMeta.accentColor,
      } as React.CSSProperties}
      aria-label={`${robotMeta.name} (${robotMeta.domain}), estado: ${effectiveMood}`}
      role="img"
    >
      <div className="robot-container">
        {/* Halo / Ambiente del Hábitat */}
        <div className="robot-habitat-aura" aria-hidden />

        <div className={`robot-head chasis-${activeUnitId}`}>
          <div className="robot-head-shell">
            <div className="head-gloss" aria-hidden />
            
            {/* Chasis y orejitas/sensores únicos y tiernos por robot */}
            {activeUnitId === 'curio' && (
              <div className="curio-antennae" aria-hidden>
                <span className="antenna-stalk" /><span className="antenna-bulb" />
              </div>
            )}
            {activeUnitId === 'helix' && (
              <div className="helix-fins" aria-hidden>
                <span className="fin left" /><span className="fin right" />
              </div>
            )}
            {activeUnitId === 'datum' && (
              <div className="datum-ears" aria-hidden>
                <span className="ear left" /><span className="ear right" />
              </div>
            )}
            {activeUnitId === 'synapse' && (
              <div className="synapse-halo" aria-hidden>
                <span className="halo-ring" />
              </div>
            )}
            {activeUnitId === 'nexus' && (
              <div className="nexus-headwings" aria-hidden>
                <span className="hwing left" /><span className="hwing right" />
              </div>
            )}
            {activeUnitId === 'vektor' && (
              <div className="vektor-crest" aria-hidden>
                <span className="crest-bar" />
              </div>
            )}
            {activeUnitId === 'gaia' && (
              <div className="gaia-orbital-halo" aria-hidden>
                <span className="orb-dot left" /><span className="orb-dot right" />
              </div>
            )}

            <div className={`robot-visor visor-${activeUnitId}`}>
              <div className="visor-glare" aria-hidden />

              {/* Ojos Neón Expresivos y Amigables (tipo EVE / WALL-E) con personalidad por Robot */}
              <div className="robot-friendly-eyes">
                <div className="friendly-eye left">
                  <div className="eye-pupil" />
                  <div className="eye-sparkle" />
                  {/* Glifo de especialidad sutil en el ojo */}
                  <span className="eye-symbol" />
                </div>
                <div className="friendly-eye right">
                  <div className="eye-pupil" />
                  <div className="eye-sparkle" />
                  <span className="eye-symbol" />
                </div>
              </div>

              {/* Mejillas sonrojadas amigables en estado feliz / éxito */}
              <div className="robot-cheeks" aria-hidden>
                <span className="cheek left" />
                <span className="cheek right" />
              </div>

              {/* Onda de audio al hablar */}
              <div className="visor-audio-wave" aria-hidden>
                <span className="wave-bar" />
                <span className="wave-bar" />
                <span className="wave-bar" />
                <span className="wave-bar" />
                <span className="wave-bar" />
              </div>
            </div>
          </div>
        </div>

        {/* Cuerpo del Robot Flotante */}
        <div className={`robot-body body-shape-${activeUnitId}`}>
          <div className="robot-body-shell">
            <div className="body-gloss" aria-hidden />
            <div className="chest-core">
              <div className="core-light" />
              <span className="unit-badge-text">{robotMeta.code}</span>
            </div>
          </div>
          <div className="robot-arm left" aria-hidden />
          <div className="robot-arm right" aria-hidden />
        </div>

        <div className="robot-thruster-glow" aria-hidden />
        <div className="robot-shadow" aria-hidden />
      </div>

      {subtitulo && <div id="subtitulos">{subtitulo}</div>}
    </div>
  )
}
