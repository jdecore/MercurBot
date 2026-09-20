import { useEffect, useRef, useState, useMemo } from 'react'
import { speak, isSpeaking } from '../../lib/tts'
import type { MascotaMood, RobotUnitId } from '../../types/mascota'
import { ROBOT_UNITS } from '../../types/mascota'
import { ROBOT_DESIGNS, type RobotConfig } from '../../lib/robotSeed'
import './MascotaSvg.css'

interface MascotaProps {
  mood?: MascotaMood
  subtitulo?: string
  size?: number
  onClick?: () => void
  variant?: RobotUnitId
  config?: RobotConfig
}

export function Mascota({ mood = 'neutro', subtitulo = '', size, onClick, variant = 'helix', config }: MascotaProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [localMood, setLocalMood] = useState<MascotaMood>(mood)
  const [speakingState, setSpeakingState] = useState(isSpeaking())

  useEffect(() => { setLocalMood(mood) }, [mood])

  useEffect(() => {
    const handleTts = (e: Event) => {
      const detail = (e as CustomEvent<{ speaking: boolean }>).detail
      if (detail) {
        setSpeakingState(detail.speaking)
        if (detail.speaking) setLocalMood('hablando')
      }
    }
    window.addEventListener('copixi:tts-speaking', handleTts as EventListener)
    return () => window.removeEventListener('copixi:tts-speaking', handleTts as EventListener)
  }, [])

  // Mouse tracking for eye direction
  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const handler = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height * 0.35
      const dx = (e.clientX - cx) / (rect.width || 1)
      const dy = (e.clientY - cy) / (rect.height || 1)
      el.style.setProperty('--mx', `${Math.max(-2.5, Math.min(2.5, dx * 2.5))}px`)
      el.style.setProperty('--my', `${Math.max(-1.5, Math.min(1.5, dy * 1.5))}px`)
    }
    window.addEventListener('mousemove', handler, { passive: true })
    return () => window.removeEventListener('mousemove', handler)
  }, [])

  // Expose API
  useEffect(() => {
    const api = { setMood: (m: MascotaMood) => setLocalMood(m), speak: (t: string) => speak(t) }
    ;(window as any).setMood = api.setMood
    ;(window as any).mascotaSpeak = api.speak
    return () => { delete (window as any).setMood; delete (window as any).mascotaSpeak }
  }, [])

  const effectiveMood = speakingState ? 'hablando' : localMood

  const design = config ? ROBOT_DESIGNS[config.color] ?? null : null
  const robotMeta = ROBOT_UNITS[variant] || ROBOT_UNITS.helix
  const primary = design?.hex ?? robotMeta.primaryColor
  const accent = design?.aura ?? robotMeta.accentColor
  const accessory = config?.accessory ?? null

  // Eye dimensions by config
  const eyeW = config?.eyes === 'big' ? 16 : 13
  const eyeH = config?.eyes === 'big' ? 18 : config?.eyes === 'sleepy' ? 5 : config?.eyes === 'happy' ? 7 : 14

  // Mouth path by mood
  const mouthPath = useMemo(() => {
    switch (effectiveMood) {
      case 'feliz':
      case 'exito':
        return 'M 89 118 Q 100 127 111 118'
      case 'duda':
        return 'M 89 120 Q 94 117 100 121 Q 106 123 111 119'
      case 'enojado':
        return 'M 89 122 L 95 119 L 105 122 L 111 119'
      case 'dormido':
        return 'M 91 120 L 109 120'
      case 'hablando':
        return 'M 91 118 Q 100 126 109 118'
      default:
        return 'M 93 120 L 107 120'
    }
  }, [effectiveMood])

  // Canvas particles
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    const w = 200
    const h = 200
    canvas.width = w * dpr
    canvas.height = h * dpr
    canvas.style.width = `${w}px`
    canvas.style.height = `${h}px`
    ctx.scale(dpr, dpr)

    type P = { x: number; y: number; vx: number; vy: number; r: number; a: number; life: number; maxLife: number; color: string }
    const particles: P[] = []

    const moodColors: Record<string, string[]> = {
      exito: ['#3DD598', '#0E7C6B', '#E3A008'],
      duda: ['#1D3A5F', '#2F3A3C', '#6B7280'],
      dormido: ['#6B7280', '#9CA3AF', '#D1D5DB'],
      enojado: ['#9E2B47', '#DC2626', '#B91C1C'],
      hablando: [primary, accent, '#ffffff'],
      pensando: [primary, accent, '#6B7280'],
      feliz: ['#3DD598', primary, '#E3A008'],
    }

    let frame = 0
    let running = true

    const spawn = (count: number, cols: string[]) => {
      for (let i = 0; i < count; i++) {
        particles.push({
          x: 30 + Math.random() * 140,
          y: 30 + Math.random() * 100,
          vx: (Math.random() - 0.5) * 0.4,
          vy: -0.2 - Math.random() * 0.5,
          r: 1 + Math.random() * 2,
          a: 0,
          life: 0,
          maxLife: 50 + Math.random() * 50,
          color: cols[Math.floor(Math.random() * cols.length)],
        })
      }
    }

    const animate = () => {
      if (!running) return
      ctx.clearRect(0, 0, w, h)
      frame++

      if (frame % 10 === 0) spawn(1, ['#D1D5DB', '#E5E7EB'])
      const mc = moodColors[effectiveMood]
      if (mc && effectiveMood !== 'neutro' && frame % 14 === 0) spawn(1, mc)

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]
        p.life++
        p.x += p.vx
        p.y += p.vy
        const prog = p.life / p.maxLife
        p.a = prog < 0.15 ? prog / 0.15 : prog > 0.7 ? (1 - prog) / 0.3 : 1
        if (p.life >= p.maxLife) { particles.splice(i, 1); continue }
        ctx.globalAlpha = p.a * 0.5
        ctx.fillStyle = p.color
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fill()
      }
      if (particles.length > 60) particles.splice(0, particles.length - 60)
      ctx.globalAlpha = 1
      requestAnimationFrame(animate)
    }
    animate()
    return () => { running = false }
  }, [effectiveMood, primary, accent])

  const svgSize = size ?? 200

  return (
    <div
      className={`mascota-svg-root mood-${effectiveMood}`}
      ref={rootRef}
      onClick={onClick}
      style={{ width: svgSize, height: svgSize, ['--unit-primary' as string]: primary, ['--unit-accent' as string]: accent } as React.CSSProperties}
      aria-label={`Robot ${design?.label ?? robotMeta.name}, estado: ${effectiveMood}`}
      role="img"
    >
      <canvas ref={canvasRef} className="mascota-particles" aria-hidden />

      <svg className="mascota-svg" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" aria-hidden>
        <defs>
          <linearGradient id="hg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fff" />
            <stop offset="55%" stopColor="#F1F5F9" />
            <stop offset="100%" stopColor="#CBD5E1" />
          </linearGradient>
          <radialGradient id="vg" cx="50%" cy="40%" r="55%">
            <stop offset="0%" stopColor="#2A2118" />
            <stop offset="100%" stopColor="#14100B" />
          </radialGradient>
          <radialGradient id="eg" cx="45%" cy="35%" r="50%">
            <stop offset="0%" stopColor="#fff" />
            <stop offset="30%" stopColor={accent} />
            <stop offset="100%" stopColor={primary} />
          </radialGradient>
          <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#F8FAFC" />
            <stop offset="100%" stopColor="#CBD5E1" />
          </linearGradient>
          <radialGradient id="sg" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(0,0,0,0.22)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </radialGradient>
          <radialGradient id="ag" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={primary} stopOpacity="0.2" />
            <stop offset="100%" stopColor={primary} stopOpacity="0" />
          </radialGradient>
          <radialGradient id="tg" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={primary} stopOpacity="0.6" />
            <stop offset="100%" stopColor={primary} stopOpacity="0" />
          </radialGradient>
          <filter id="gl" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.5" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="hs" x="-15%" y="-10%" width="130%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#000" floodOpacity="0.1" />
          </filter>
        </defs>

        {/* Aura */}
        <ellipse cx="100" cy="85" rx="72" ry="68" fill="url(#ag)" className="svg-aura" />

        {/* === HEAD === */}
        <g filter="url(#hs)" className="svg-head">
          {/* Head shell — rounder, taller */}
          <ellipse cx="100" cy="72" rx="58" ry="50" fill="url(#hg)" stroke="#E2E8F0" strokeWidth="1.5" />
          {/* Gloss highlight */}
          <ellipse cx="100" cy="48" rx="38" ry="14" fill="#fff" opacity="0.5" />

          {/* Accessory */}
          {accessory === 'antenna' && (
            <g>
              <rect x="98" y="10" width="4" height="16" rx="2" fill={primary} />
              <circle cx="100" cy="8" r="5" fill={accent} filter="url(#gl)" />
            </g>
          )}
          {accessory === 'fins' && (
            <g>
              <rect x="30" y="52" width="8" height="24" rx="4" fill={primary} opacity="0.85" transform="rotate(-12 34 64)" />
              <rect x="162" y="52" width="8" height="24" rx="4" fill={primary} opacity="0.85" transform="rotate(12 166 64)" />
            </g>
          )}
          {accessory === 'headphones' && (
            <g>
              <path d="M 46 62 Q 46 26 100 26 Q 154 26 154 62" fill="none" stroke={primary} strokeWidth="4.5" strokeLinecap="round" />
              <rect x="36" y="56" width="13" height="20" rx="6.5" fill={primary} />
              <rect x="151" y="56" width="13" height="20" rx="6.5" fill={primary} />
            </g>
          )}
          {accessory === 'glasses' && (
            <g>
              <rect x="52" y="54" width="32" height="24" rx="8" fill="none" stroke={primary} strokeWidth="2.5" />
              <rect x="116" y="54" width="32" height="24" rx="8" fill="none" stroke={primary} strokeWidth="2.5" />
              <rect x="84" y="63" width="32" height="2.5" rx="1.2" fill={primary} />
            </g>
          )}
          {accessory === 'cap' && (
            <g>
              <path d="M 52 38 Q 52 18 100 18 Q 148 18 148 38 Z" fill={primary} />
              <ellipse cx="96" cy="38" rx="56" ry="7" fill={primary} opacity="0.9" />
            </g>
          )}
          {accessory === 'bow' && (
            <g transform="translate(138,26)">
              <ellipse cx="-9" cy="0" rx="9" ry="11" fill={primary} transform="rotate(-18)" />
              <ellipse cx="9" cy="0" rx="9" ry="11" fill={primary} transform="rotate(18)" />
              <circle cx="0" cy="0" r="4.5" fill={accent} filter="url(#gl)" />
            </g>
          )}
          {accessory === 'tuft' && (
            <polygon points="96,12 104,12 102,4 98,4" fill={primary} transform="rotate(-8 100 8)" />
          )}

          {/* Visor */}
          <rect x="52" y="50" width="96" height="52" rx="24" fill="url(#vg)" stroke="#3A3126" strokeWidth="1.5" />
          <ellipse cx="100" cy="58" rx="36" ry="10" fill="#fff" opacity="0.12" />

          {/* Eyes — larger, centered in visor */}
          <g filter="url(#gl)" className="svg-eyes">
            {/* Left */}
            <ellipse cx="78" cy="74" rx={eyeW} ry={eyeH} fill="url(#eg)" className="svg-eye" />
            <circle cx="78" cy="74" r={eyeW * 0.42} fill="#1C1A10" className="svg-pupil" style={{ transform: 'translate(var(--mx,0px), var(--my,0px))' }} />
            <circle cx="75" cy="71" r="2.2" fill="#fff" opacity="0.9" />
            {/* Right */}
            <ellipse cx="122" cy="74" rx={eyeW} ry={eyeH} fill="url(#eg)" className="svg-eye" />
            <circle cx="122" cy="74" r={eyeW * 0.42} fill="#1C1A10" className="svg-pupil" style={{ transform: 'translate(var(--mx,0px), var(--my,0px))' }} />
            <circle cx="119" cy="71" r="2.2" fill="#fff" opacity="0.9" />
          </g>

          {/* Cheeks */}
          <circle cx="60" cy="92" r="6" fill="#C98A6B" opacity="0.3" className="svg-cheek" />
          <circle cx="140" cy="92" r="6" fill="#C98A6B" opacity="0.3" className="svg-cheek" />

          {/* Mouth */}
          <path d={mouthPath} fill="none" stroke={accent} strokeWidth="2.2" strokeLinecap="round" className="svg-mouth" />

          {/* Audio wave */}
          {effectiveMood === 'hablando' && (
            <g className="svg-wave">
              {[84, 91, 98, 105, 112].map((x, i) => (
                <rect key={i} x={x} y="100" width="2" rx="1" fill={accent} className="wave-rect" style={{ animationDelay: `${i * 0.08}s` }} />
              ))}
            </g>
          )}
        </g>

        {/* === BODY === */}
        <g>
          {/* Neck connector */}
          <rect x="90" y="118" width="20" height="10" rx="4" fill="url(#hg)" stroke="#E2E8F0" strokeWidth="1" />
          {/* Body */}
          <ellipse cx="100" cy="148" rx="36" ry="26" fill="url(#bg)" stroke="#E2E8F0" strokeWidth="1.5" />
          <ellipse cx="100" cy="140" rx="22" ry="8" fill="#fff" opacity="0.35" />
          {/* Arms — attached to body sides */}
          <rect x="56" y="136" width="10" height="30" rx="5" fill="url(#bg)" stroke="#E2E8F0" strokeWidth="1" transform="rotate(8 61 151)" />
          <rect x="134" y="136" width="10" height="30" rx="5" fill="url(#bg)" stroke="#E2E8F0" strokeWidth="1" transform="rotate(-8 139 151)" />
        </g>

        {/* Thruster */}
        <ellipse cx="100" cy="178" rx="14" ry="6" fill="url(#tg)" className="svg-thruster" />

        {/* Shadow */}
        <ellipse cx="100" cy="192" rx="30" ry="5" fill="url(#sg)" />
      </svg>

      {subtitulo && <div className="mascota-subtitles">{subtitulo}</div>}
    </div>
  )
}
