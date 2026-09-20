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
  const mouseRef = useRef({ x: 0, y: 0 })

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
      mouseRef.current = {
        x: Math.max(-3, Math.min(3, dx * 3)),
        y: Math.max(-2, Math.min(2, dy * 2)),
      }
      el.style.setProperty('--mx', `${mouseRef.current.x}px`)
      el.style.setProperty('--my', `${mouseRef.current.y}px`)
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

  // Eye shape by config
  const eyeRx = config?.eyes === 'big' ? 14 : config?.eyes === 'visor' ? 11 : 10
  const eyeRy = config?.eyes === 'big' ? 16 : config?.eyes === 'sleepy' ? 5 : config?.eyes === 'happy' ? 6 : 11

  // Mouth path by mood
  const mouthPath = useMemo(() => {
    switch (effectiveMood) {
      case 'feliz':
      case 'exito':
        return 'M 88 138 Q 100 148 112 138' // smile
      case 'duda':
        return 'M 88 140 Q 95 137 100 141 Q 105 143 112 139' // wavy
      case 'enojado':
        return 'M 88 142 L 96 139 L 104 142 L 112 139' // zigzag
      case 'dormido':
        return 'M 90 140 L 110 140' // flat line
      case 'hablando':
        return 'M 90 138 Q 100 146 110 138' // open mouth
      default:
        return 'M 92 140 L 108 140' // neutral line
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

    type Particle = { x: number; y: number; vx: number; vy: number; r: number; a: number; life: number; maxLife: number; color: string }
    const particles: Particle[] = []

    const colors: Record<string, string[]> = {
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
          x: 40 + Math.random() * 120,
          y: 60 + Math.random() * 80,
          vx: (Math.random() - 0.5) * 0.6,
          vy: -0.3 - Math.random() * 0.8,
          r: 1 + Math.random() * 2.5,
          a: 0,
          life: 0,
          maxLife: 60 + Math.random() * 60,
          color: cols[Math.floor(Math.random() * cols.length)],
        })
      }
    }

    // Ambient dust always
    const ambientCols = ['#D1D5DB', '#9CA3AF', '#E5E7EB']

    const animate = () => {
      if (!running) return
      ctx.clearRect(0, 0, w, h)
      frame++

      // Spawn ambient dust
      if (frame % 8 === 0) spawn(1, ambientCols)
      // Spawn mood particles
      const moodCols = colors[effectiveMood]
      if (moodCols && effectiveMood !== 'neutro' && frame % 12 === 0) spawn(2, moodCols)

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]
        p.life++
        p.x += p.vx
        p.y += p.vy
        // Fade in/out
        const progress = p.life / p.maxLife
        if (progress < 0.15) p.a = progress / 0.15
        else if (progress > 0.7) p.a = (1 - progress) / 0.3
        else p.a = 1

        if (p.life >= p.maxLife) {
          particles.splice(i, 1)
          continue
        }

        ctx.globalAlpha = p.a * 0.6
        ctx.fillStyle = p.color
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fill()
      }

      // Limit particles
      if (particles.length > 80) particles.splice(0, particles.length - 80)

      ctx.globalAlpha = 1
      requestAnimationFrame(animate)
    }
    animate()
    return () => { running = false }
  }, [effectiveMood, primary, accent])

  const svgSize = size ?? 200
  const viewBox = '0 0 200 200'

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

      <svg
        className="mascota-svg"
        viewBox={viewBox}
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        <defs>
          {/* Head gradient */}
          <linearGradient id="headGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="60%" stopColor="#F1F5F9" />
            <stop offset="100%" stopColor="#CBD5E1" />
          </linearGradient>
          {/* Visor gradient */}
          <radialGradient id="visorGrad" cx="50%" cy="40%" r="55%">
            <stop offset="0%" stopColor="#2A2118" />
            <stop offset="100%" stopColor="#14100B" />
          </radialGradient>
          {/* Eye glow */}
          <radialGradient id="eyeGlow" cx="45%" cy="35%" r="50%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="35%" stopColor={accent} />
            <stop offset="100%" stopColor={primary} />
          </radialGradient>
          {/* Body gradient */}
          <linearGradient id="bodyGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#F8FAFC" />
            <stop offset="100%" stopColor="#CBD5E1" />
          </linearGradient>
          {/* Shadow */}
          <radialGradient id="shadowGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(0,0,0,0.25)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </radialGradient>
          {/* Aura */}
          <radialGradient id="auraGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={primary} stopOpacity="0.25" />
            <stop offset="100%" stopColor={primary} stopOpacity="0" />
          </radialGradient>
          {/* Thruster glow */}
          <radialGradient id="thrusterGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={primary} stopOpacity="0.7" />
            <stop offset="100%" stopColor={primary} stopOpacity="0" />
          </radialGradient>
          {/* Eye glow filter */}
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {/* Head shadow filter */}
          <filter id="headShadow" x="-20%" y="-10%" width="140%" height="150%">
            <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="#000" floodOpacity="0.12" />
          </filter>
          {/* Visor inner shadow */}
          <filter id="visorInner">
            <feComponentTransfer in="SourceAlpha">
              <feFuncA type="table" tableValues="1 0" />
            </feComponentTransfer>
            <feGaussianBlur stdDeviation="3" />
            <feOffset dx="0" dy="2" result="offsetblur" />
            <feFlood floodColor="#000" floodOpacity="0.6" result="color" />
            <feComposite in2="offsetblur" operator="in" />
            <feComposite in2="SourceAlpha" operator="in" />
            <feMerge>
              <feMergeNode in="SourceGraphic" />
              <feMergeNode />
            </feMerge>
          </filter>
        </defs>

        {/* Aura */}
        <ellipse cx="100" cy="95" rx="80" ry="75" fill="url(#auraGrad)" className="svg-aura" />

        {/* Head */}
        <g filter="url(#headShadow)" className="svg-head">
          <rect x="30" y="30" width="140" height="100" rx="50" ry="50" fill="url(#headGrad)" stroke="#E2E8F0" strokeWidth="1.5" />
          {/* Gloss */}
          <ellipse cx="100" cy="52" rx="52" ry="18" fill="white" opacity="0.45" />

          {/* Accessory or unit-specific features */}
          {accessory === 'antenna' && (
            <g className="svg-accessory">
              <rect x="98" y="8" width="4" height="18" rx="2" fill={primary} />
              <circle cx="100" cy="6" r="5" fill={accent} filter="url(#glow)" />
            </g>
          )}
          {accessory === 'fins' && (
            <g className="svg-accessory">
              <rect x="16" y="55" width="10" height="28" rx="5" fill={primary} opacity="0.9" transform="rotate(-10 21 69)" />
              <rect x="174" y="55" width="10" height="28" rx="5" fill={primary} opacity="0.9" transform="rotate(10 179 69)" />
            </g>
          )}
          {accessory === 'headphones' && (
            <g className="svg-accessory">
              <path d="M 42 65 Q 42 28 100 28 Q 158 28 158 65" fill="none" stroke={primary} strokeWidth="5" strokeLinecap="round" />
              <rect x="32" y="58" width="14" height="22" rx="7" fill={primary} />
              <rect x="154" y="58" width="14" height="22" rx="7" fill={primary} />
            </g>
          )}
          {accessory === 'glasses' && (
            <g className="svg-accessory">
              <rect x="48" y="56" width="36" height="28" rx="8" fill="none" stroke={primary} strokeWidth="3" />
              <rect x="116" y="56" width="36" height="28" rx="8" fill="none" stroke={primary} strokeWidth="3" />
              <rect x="84" y="66" width="32" height="3" rx="1.5" fill={primary} />
            </g>
          )}
          {accessory === 'cap' && (
            <g className="svg-accessory">
              <path d="M 48 42 Q 48 22 100 22 Q 152 22 152 42 Z" fill={primary} />
              <ellipse cx="96" cy="42" rx="62" ry="8" fill={primary} opacity="0.92" />
            </g>
          )}
          {accessory === 'bow' && (
            <g className="svg-accessory" transform="translate(140, 28)">
              <ellipse cx="-10" cy="0" rx="10" ry="12" fill={primary} transform="rotate(-18)" />
              <ellipse cx="10" cy="0" rx="10" ry="12" fill={primary} transform="rotate(18)" />
              <circle cx="0" cy="0" r="5" fill={accent} filter="url(#glow)" />
            </g>
          )}
          {accessory === 'tuft' && (
            <g className="svg-accessory">
              <polygon points="96,10 104,10 102,2 98,2" fill={primary} transform="rotate(-8 100 6)" />
            </g>
          )}

          {/* Visor */}
          <rect x="48" y="48" width="104" height="68" rx="28" ry="28" fill="url(#visorGrad)" stroke="#3A3126" strokeWidth="1.5" filter="url(#visorInner)" />
          {/* Visor glare */}
          <ellipse cx="100" cy="58" rx="40" ry="14" fill="white" opacity="0.15" />

          {/* Eyes */}
          <g className="svg-eyes" filter="url(#glow)">
            {/* Left eye */}
            <ellipse cx="78" cy="78" rx={eyeRx} ry={eyeRy} fill="url(#eyeGlow)" className="svg-eye" />
            <circle cx="78" cy="78" r={eyeRx * 0.45} fill="#1C1A10" className="svg-pupil" style={{ transform: 'translate(var(--mx, 0px), var(--my, 0px))' }} />
            <circle cx={75 - 2} cy={75 - 3} r="2.5" fill="white" opacity="0.9" />
            {/* Right eye */}
            <ellipse cx="122" cy="78" rx={eyeRx} ry={eyeRy} fill="url(#eyeGlow)" className="svg-eye" />
            <circle cx="122" cy="78" r={eyeRx * 0.45} fill="#1C1A10" className="svg-pupil" style={{ transform: 'translate(var(--mx, 0px), var(--my, 0px))' }} />
            <circle cx={119 - 2} cy={75 - 3} r="2.5" fill="white" opacity="0.9" />
          </g>

          {/* Cheeks */}
          <circle cx="60" cy="98" r="7" fill="#C98A6B" opacity="0.3" className="svg-cheek" />
          <circle cx="140" cy="98" r="7" fill="#C98A6B" opacity="0.3" className="svg-cheek" />

          {/* Mouth */}
          <path d={mouthPath} fill="none" stroke={accent} strokeWidth="2.5" strokeLinecap="round" className="svg-mouth" />

          {/* Audio wave when speaking */}
          {effectiveMood === 'hablando' && (
            <g className="svg-wave">
              {[82, 90, 98, 106, 114].map((x, i) => (
                <rect key={i} x={x} y="108" width="2.5" rx="1" fill={accent} className="wave-rect" style={{ animationDelay: `${i * 0.08}s` }} />
              ))}
            </g>
          )}
        </g>

        {/* Body */}
        <g>
          {/* Arms */}
          <rect x="20" y="138" width="12" height="36" rx="6" fill="url(#bodyGrad)" stroke="#E2E8F0" strokeWidth="1" transform="rotate(6 26 156)" />
          <rect x="168" y="138" width="12" height="36" rx="6" fill="url(#bodyGrad)" stroke="#E2E8F0" strokeWidth="1" transform="rotate(-6 174 156)" />
          {/* Body shell */}
          <rect x="60" y="130" width="80" height="46" rx="30" ry="30" fill="url(#bodyGrad)" stroke="#E2E8F0" strokeWidth="1.5" />
          <ellipse cx="100" cy="138" rx="28" ry="8" fill="white" opacity="0.4" />
        </g>

        {/* Thruster glow */}
        <ellipse cx="100" cy="182" rx="18" ry="8" fill="url(#thrusterGrad)" className="svg-thruster" />

        {/* Shadow */}
        <ellipse cx="100" cy="192" rx="36" ry="6" fill="url(#shadowGrad)" />
      </svg>

      {subtitulo && <div className="mascota-subtitles">{subtitulo}</div>}
    </div>
  )
}
