import { useEffect, useRef, useState, useMemo, useCallback, useId } from 'react'
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
  interactive?: boolean
  voiceActive?: boolean
}

// Iris bounds: max offset from eye center so iris stays inside sclera
const IRIS_MAX_X = 5
const IRIS_MAX_Y = 3

// Mood → iris scale (dilation/constriction)
const MOOD_IRIS_SCALE: Record<string, number> = {
  neutro: 1,
  feliz: 1.15,
  exito: 1.18,
  enojado: 0.82,
  dormido: 0.55,
  duda: 1.05,
  pensando: 1.08,
  hablando: 1.05,
  escuchando: 1.1,
  guino: 1,
  limpiando: 0.9,
  escaneando: 1.12,
}

// Mood → sclera Y scale (squint)
const MOOD_SCLERA_SCALE: Record<string, number> = {
  neutro: 1,
  feliz: 0.5,
  exito: 0.5,
  enojado: 0.7,
  dormido: 0.12,
  duda: 0.9,
  pensando: 0.85,
  hablando: 0.8,
  escuchando: 0.9,
  guino: 1,
  limpiando: 0.8,
  escaneando: 0.9,
}

// Mood → eyebrow rotations [left, right]
const MOOD_BROWS: Record<string, [number, number]> = {
  neutro: [0, 0],
  feliz: [8, 8],
  exito: [10, 10],
  enojado: [-14, 14],
  dormido: [0, 0],
  duda: [-10, 4],
  pensando: [6, 6],
  hablando: [4, 4],
  escuchando: [6, -2],
  guino: [0, 0],
  limpiando: [-4, -4],
  escaneando: [6, 6],
}

export function Mascota({ mood = 'neutro', subtitulo = '', size, onClick, variant = 'helix', config, interactive = true, voiceActive = false }: MascotaProps) {
  const uid = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [localMood, setLocalMood] = useState<MascotaMood>(mood)
  const [speakingState, setSpeakingState] = useState(isSpeaking())

  // ── Eye behavior state ──
  const [blinkPhase, setBlinkPhase] = useState<'open' | 'closing' | 'closed' | 'opening'>('open')
  const [ wink, setWink ] = useState(false)
  const [ irisPos, setIrisPos ] = useState({ x: 0, y: 0 })
  const [ hoverActive, setHoverActive ] = useState(false)
  const targetRef = useRef({ x: 0, y: 0 })
  const irisRef = useRef({ x: 0, y: 0 })
  const rafRef = useRef<number>(0)
  const blinkTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const winkTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { setLocalMood(mood) }, [mood])

  // ── TTS listener ──
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

  // ── Expose API ──
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

  // Eye dimensions by config — each type must be visually distinct
  const eyeW = config?.eyes === 'big' ? 16 : config?.eyes === 'visor' ? 16 : 13
  const eyeH = config?.eyes === 'big' ? 18 : config?.eyes === 'visor' ? 8 : config?.eyes === 'round' ? 13 : config?.eyes === 'sleepy' ? 5 : config?.eyes === 'happy' ? 7 : 14

  // ── Clear all blink timeouts helper ──
  const clearAllBlinkTimeouts = useCallback(() => {
    blinkTimeoutsRef.current.forEach(clearTimeout)
    blinkTimeoutsRef.current = []
  }, [])

  // ── Schedule a blink sequence (closing→closed→opening→open) via ref ──
  const scheduleBlinkRef = useRef<(delays: number[], idx?: number) => void>(() => {})
  // Assign via effect to avoid accessing ref during render
  useEffect(() => {
    scheduleBlinkRef.current = (delays: number[], idx = 0) => {
      if (idx >= delays.length) return
      const t = setTimeout(() => {
        const phases: Array<'closing' | 'closed' | 'opening' | 'open'> = ['closing', 'closed', 'opening', 'open']
        setBlinkPhase(phases[idx] ?? 'open')
        scheduleBlinkRef.current(delays, idx + 1)
      }, delays[idx])
      blinkTimeoutsRef.current.push(t)
    }
  }, [])
  const scheduleBlinkSequence = useCallback((delays: number[]) => {
    scheduleBlinkRef.current(delays)
  }, [])

  // ── 1. Mouse tracking (only when interactive) ──
  useEffect(() => {
    if (!interactive) return
    const el = rootRef.current
    if (!el) return
    const handler = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height * 0.37
      const dx = (e.clientX - cx) / (rect.width || 1)
      const dy = (e.clientY - cy) / (rect.height || 1)
      // Distance-based: closer = gentler, far = full tracking
      const dist = Math.sqrt(dx * dx + dy * dy)
      const factor = Math.min(1, dist * 2) // ramps up over ~50% of viewport
      targetRef.current = {
        x: Math.max(-IRIS_MAX_X, Math.min(IRIS_MAX_X, dx * IRIS_MAX_X * 1.2 * factor)),
        y: Math.max(-IRIS_MAX_Y, Math.min(IRIS_MAX_Y, dy * IRIS_MAX_Y * 1.2 * factor)),
      }
    }
    window.addEventListener('mousemove', handler, { passive: true })
    return () => window.removeEventListener('mousemove', handler)
  }, [interactive])

  // ── 2. Saccades (only when interactive, paused when mouse active) ──
  useEffect(() => {
    if (!interactive) return
    let outerTimeout: ReturnType<typeof setTimeout>
    let innerTimeout: ReturnType<typeof setTimeout>
    const schedule = () => {
      const delay = 2000 + Math.random() * 3000
      outerTimeout = setTimeout(() => {
        if (!hoverActive) {
          targetRef.current = {
            x: (Math.random() - 0.5) * IRIS_MAX_X * 1.2,
            y: (Math.random() - 0.5) * IRIS_MAX_Y * 1.2,
          }
          innerTimeout = setTimeout(() => {
            if (!hoverActive) targetRef.current = { x: 0, y: 0 }
          }, 150 + Math.random() * 100)
        }
        schedule()
      }, delay)
    }
    schedule()
    return () => { clearTimeout(outerTimeout); clearTimeout(innerTimeout) }
  }, [hoverActive, interactive])

  // ── 3. Periodic blink (only when interactive) ──
  useEffect(() => {
    if (!interactive) return
    let outerTimeout: ReturnType<typeof setTimeout>
    const scheduleBlink = () => {
      const delay = 2200 + Math.random() * 3800
      outerTimeout = setTimeout(() => {
        // Single blink: closing(0) → closed(60) → opening(140) → open(190)
        scheduleBlinkSequence([0, 60, 80, 50])
        // Double blink: 30% chance, adds second sequence after 120ms pause
        if (Math.random() < 0.3) {
          const t = setTimeout(() => {
            scheduleBlinkSequence([0, 50, 60, 50])
          }, 120)
          blinkTimeoutsRef.current.push(t)
        }
        scheduleBlink()
      }, delay)
    }
    scheduleBlink()
    return () => { clearTimeout(outerTimeout); clearAllBlinkTimeouts() }
  }, [interactive, scheduleBlinkSequence, clearAllBlinkTimeouts])

  // ── Hover → soft single blink (not aggressive double) ──
  const handleMouseEnter = useCallback(() => {
    if (!interactive) return
    setHoverActive(true)
    clearAllBlinkTimeouts()
    // Soft single blink: closing→closed→opening→open
    scheduleBlinkSequence([0, 50, 60, 50])
  }, [interactive, clearAllBlinkTimeouts, scheduleBlinkSequence])

  const handleMouseLeave = useCallback(() => {
    setHoverActive(false)
    targetRef.current = { x: 0, y: 0 }
  }, [])

  // ── Click → wink (cancels ongoing blink first) ──
  const handleClick = useCallback(() => {
    clearAllBlinkTimeouts()
    setWink(true)
    winkTimeoutRef.current = setTimeout(() => setWink(false), 350)
    onClick?.()
  }, [onClick, clearAllBlinkTimeouts])

  // ── 5. Look at UI elements ──
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ direction: 'left' | 'right' | 'up' | 'down' | 'center' }>).detail
      if (!detail) return
      const d = detail.direction
      const mag = IRIS_MAX_X * 0.8
      const map: Record<string, { x: number; y: number }> = {
        left: { x: -mag, y: 0 },
        right: { x: mag, y: 0 },
        up: { x: 0, y: -IRIS_MAX_Y * 0.8 },
        down: { x: 0, y: IRIS_MAX_Y * 0.8 },
        center: { x: 0, y: 0 },
      }
      targetRef.current = map[d] ?? map.center
      // Return to center after 2s
      setTimeout(() => { targetRef.current = { x: 0, y: 0 } }, 2000)
    }
    window.addEventListener('copixi:eye-target', handler as EventListener)
    return () => window.removeEventListener('copixi:eye-target', handler as EventListener)
  }, [])

  // ── Smooth iris interpolation (RAF loop — only re-renders when position changes) ──
  useEffect(() => {
    if (!interactive) return
    let running = true
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t
    const TICK_THRESHOLD = 0.05
    const tick = () => {
      if (!running) return
      const t = targetRef.current
      const c = irisRef.current
      // Adaptive speed: fast when far, slow when close (ease-out feel)
      const dist = Math.abs(t.x - c.x) + Math.abs(t.y - c.y)
      const speed = dist > 2 ? 0.14 : dist > 0.5 ? 0.1 : 0.06
      const nx = Math.max(-IRIS_MAX_X, Math.min(IRIS_MAX_X, lerp(c.x, t.x, speed)))
      const ny = Math.max(-IRIS_MAX_Y, Math.min(IRIS_MAX_Y, lerp(c.y, t.y, speed)))
      // Only trigger re-render if position changed meaningfully
      if (Math.abs(nx - c.x) > TICK_THRESHOLD || Math.abs(ny - c.y) > TICK_THRESHOLD) {
        c.x = nx; c.y = ny
        setIrisPos({ x: c.x, y: c.y })
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { running = false; cancelAnimationFrame(rafRef.current) }
  }, [interactive])

  // ── Derived eye values ──
  const irisScale = MOOD_IRIS_SCALE[effectiveMood] ?? 1
  const scleraScale = MOOD_SCLERA_SCALE[effectiveMood] ?? 1
  const [browL, browR] = MOOD_BROWS[effectiveMood] ?? [0, 0]

  const isBlinking = blinkPhase === 'closing' || blinkPhase === 'closed'
  const scleraY = isBlinking ? 0.08 : scleraScale
  const isWinking = wink && effectiveMood !== 'enojado'

  // Glow for exito
  const glowOpacity = effectiveMood === 'exito' ? 0.6 : effectiveMood === 'feliz' ? 0.3 : 0

  // Mouth path by mood
  const mouthPath = useMemo(() => {
    switch (effectiveMood) {
      case 'feliz':
      case 'exito':
        return 'M 90 108 Q 100 116 110 108'
      case 'duda':
        return 'M 90 110 Q 95 107 100 111 Q 105 113 110 109'
      case 'enojado':
        return 'M 90 112 L 96 109 L 104 112 L 110 109'
      case 'dormido':
        return 'M 92 110 L 108 110'
      case 'hablando':
        return 'M 92 108 Q 100 115 108 108'
      default:
        return 'M 94 110 L 106 110'
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

  // CSS vars for eye behavior
  const eyeVars = {
    ['--iris-x' as string]: `${irisPos.x}px`,
    ['--iris-y' as string]: `${irisPos.y}px`,
    ['--iris-scale' as string]: irisScale,
    ['--sclera-sy' as string]: scleraY,
    ['--brow-l' as string]: `${browL}deg`,
    ['--brow-r' as string]: `${browR}deg`,
    ['--glow-opacity' as string]: glowOpacity,
  } as React.CSSProperties

  return (
    <div
      className={`mascota-svg-root mood-${effectiveMood} ${hoverActive ? 'eye-hover' : ''} ${voiceActive ? 'voice-active' : ''}`}
      ref={rootRef}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{ width: svgSize, height: svgSize, ['--unit-primary' as string]: primary, ['--unit-accent' as string]: accent, ...eyeVars }}
      aria-label={`Robot ${design?.label ?? robotMeta.name}, estado: ${effectiveMood}`}
      role="img"
    >
      <canvas ref={canvasRef} className="mascota-particles" aria-hidden />

      <svg className="mascota-svg" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" aria-hidden>
        <defs>
          <linearGradient id={`hg-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fff" />
            <stop offset="55%" stopColor="#F1F5F9" />
            <stop offset="100%" stopColor="#CBD5E1" />
          </linearGradient>
          <radialGradient id={`vg-${uid}`} cx="50%" cy="40%" r="55%">
            <stop offset="0%" stopColor="#2A2118" />
            <stop offset="100%" stopColor="#14100B" />
          </radialGradient>
          <linearGradient id={`bg-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#F8FAFC" />
            <stop offset="100%" stopColor="#CBD5E1" />
          </linearGradient>
          <radialGradient id={`sg-${uid}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(0,0,0,0.22)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </radialGradient>
          <radialGradient id={`ag-${uid}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={primary} stopOpacity="0.2" />
            <stop offset="100%" stopColor={primary} stopOpacity="0" />
          </radialGradient>
          <radialGradient id={`tg-${uid}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={primary} stopOpacity="0.6" />
            <stop offset="100%" stopColor={primary} stopOpacity="0" />
          </radialGradient>
          <filter id={`gl-${uid}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.5" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id={`hs-${uid}`} x="-15%" y="-10%" width="130%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#000" floodOpacity="0.1" />
          </filter>
          {/* Eye glow filter for exito/feliz */}
          <filter id={`eg-${uid}`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="4" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* Aura */}
        <ellipse cx="100" cy="85" rx="72" ry="68" fill={`url(#ag-${uid})`} className="svg-aura" />

        {/* === HEAD === */}
        <g filter={`url(#hs-${uid})`} className="svg-head">
          {/* Head shell */}
          <ellipse cx="100" cy="72" rx="58" ry="50" fill={`url(#hg-${uid})`} stroke="#E2E8F0" strokeWidth="1.5" />
          {/* Gloss highlight */}
          <ellipse cx="100" cy="48" rx="38" ry="14" fill="#fff" opacity="0.5" />

          {/* Accessory */}
          {accessory === 'antenna' && (
            <g>
              <rect x="98" y="10" width="4" height="16" rx="2" fill={primary} />
              <circle cx="100" cy="8" r="5" fill={accent} filter={`url(#gl-${uid})`} />
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
              <circle cx="0" cy="0" r="4.5" fill={accent} filter={`url(#gl-${uid})`} />
            </g>
          )}
          {accessory === 'tuft' && (
            <polygon points="96,12 104,12 102,4 98,4" fill={primary} transform="rotate(-8 100 8)" />
          )}

          {/* Visor */}
          <rect x="52" y="50" width="96" height="52" rx="24" fill={`url(#vg-${uid})`} stroke="#3A3126" strokeWidth="1.5" />
          <ellipse cx="100" cy="58" rx="36" ry="10" fill="#fff" opacity="0.12" />

          {/* === EYEBROWS === */}
          <g className="svg-brows">
            <line x1="62" y1="48" x2="88" y2="46" stroke={primary} strokeWidth="2.5" strokeLinecap="round" className="svg-brow-l" />
            <line x1="112" y1="46" x2="138" y2="48" stroke={primary} strokeWidth="2.5" strokeLinecap="round" className="svg-brow-r" />
          </g>

          {/* === EYES === */}
          <g className="svg-eyes">
            {/* Left eye group */}
            <g className="svg-eye-group" filter={glowOpacity > 0 ? `url(#eg-${uid})` : undefined} style={{ opacity: glowOpacity > 0 ? 1 : undefined }}>
              {/* Sclera */}
              <ellipse cx="78" cy="74" rx={eyeW} ry={eyeH} fill="#FFFFFF" stroke="#E2E8F0" strokeWidth="0.8" className="svg-eye-l" />
              {/* Parallax depth (subtle sclera shadow when looking sideways) */}
              <ellipse cx="78" cy="74" rx={eyeW * 0.85} ry={eyeH * 0.85} fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth="1" className="svg-eye-depth-l" />
              {/* Iris */}
              <ellipse cx="78" cy="75" rx={eyeW * 0.6} ry={eyeH * 0.6} fill={primary} className="svg-iris-l" />
              {/* Glow ring for exito */}
              {glowOpacity > 0 && <ellipse cx="78" cy="75" rx={eyeW * 0.7} ry={eyeH * 0.7} fill="none" stroke={accent} strokeWidth="1" opacity={glowOpacity} className="svg-iris-glow" />}
              {/* Sparkles */}
              <circle cx={76} cy={72} r="2.2" fill="#fff" opacity="0.92" />
              <circle cx={80} cy={77} r="1.1" fill="#fff" opacity="0.5" />
            </g>

            {/* Right eye group */}
            <g className="svg-eye-group" filter={glowOpacity > 0 ? `url(#eg-${uid})` : undefined} style={{ opacity: glowOpacity > 0 ? 1 : undefined }}>
              {/* Wink: right eye closes */}
              {isWinking ? (
                <path d={`M ${122 - eyeW} 74 Q 122 ${74 - 3} ${122 + eyeW} 74`} fill="none" stroke="#E2E8F0" strokeWidth="1.5" strokeLinecap="round" className="svg-eye-wink" />
              ) : (
                <>
                  <ellipse cx="122" cy="74" rx={eyeW} ry={eyeH} fill="#FFFFFF" stroke="#E2E8F0" strokeWidth="0.8" className="svg-eye-r" />
                  <ellipse cx="122" cy="74" rx={eyeW * 0.85} ry={eyeH * 0.85} fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth="1" className="svg-eye-depth-r" />
                  <ellipse cx="122" cy="75" rx={eyeW * 0.6} ry={eyeH * 0.6} fill={primary} className="svg-iris-r" />
                  {glowOpacity > 0 && <ellipse cx="122" cy="75" rx={eyeW * 0.7} ry={eyeH * 0.7} fill="none" stroke={accent} strokeWidth="1" opacity={glowOpacity} className="svg-iris-glow" />}
                  <circle cx={120} cy={72} r="2.2" fill="#fff" opacity="0.92" />
                  <circle cx={124} cy={77} r="1.1" fill="#fff" opacity="0.5" />
                </>
              )}
            </g>
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

          {/* Dormido Z's */}
          {effectiveMood === 'dormido' && (
            <g className="svg-zzz">
              <text x="130" y="40" fontSize="10" fill={accent} opacity="0.6" className="zzz-1">z</text>
              <text x="140" y="30" fontSize="13" fill={accent} opacity="0.4" className="zzz-2">z</text>
              <text x="152" y="18" fontSize="16" fill={accent} opacity="0.25" className="zzz-3">z</text>
            </g>
          )}

          {/* Pensando dots */}
          {effectiveMood === 'pensando' && (
            <g className="svg-thinking">
              {[0, 1, 2].map(i => (
                <circle key={i} cx={140 + i * 8} cy={38 - i * 6} r={2 + i} fill={accent} opacity={0.6 - i * 0.15} className={`think-dot-${i}`} />
              ))}
            </g>
          )}
        </g>

        {/* === BODY === */}
        <g>
          {/* Neck connector */}
          <rect x="90" y="118" width="20" height="10" rx="4" fill={`url(#hg-${uid})`} stroke="#E2E8F0" strokeWidth="1" />
          {/* Body */}
          <ellipse cx="100" cy="148" rx="36" ry="26" fill={`url(#bg-${uid})`} stroke="#E2E8F0" strokeWidth="1.5" />
          <ellipse cx="100" cy="140" rx="22" ry="8" fill="#fff" opacity="0.35" />
          {/* Orb in chest */}
          <circle cx="100" cy="148" r="6" fill={`url(#tg-${uid})`} className="svg-orb" />
          <circle cx="100" cy="148" r="4" fill={accent} opacity="0.7" className="svg-orb-core" />
          <circle cx="98" cy="146" r="1.5" fill="#fff" opacity="0.8" />
          {/* Left arm */}
          <g transform="rotate(-12 64 138)">
            <rect x="54" y="136" width="12" height="34" rx="6" fill={`url(#bg-${uid})`} stroke="#E2E8F0" strokeWidth="1" />
          </g>
          {/* Right arm */}
          <g transform="rotate(12 136 138)">
            <rect x="134" y="136" width="12" height="34" rx="6" fill={`url(#bg-${uid})`} stroke="#E2E8F0" strokeWidth="1" />
          </g>
        </g>

        {/* Thruster */}
        <ellipse cx="100" cy="178" rx="14" ry="6" fill={`url(#tg-${uid})`} className="svg-thruster" />

        {/* Shadow */}
        <ellipse cx="100" cy="192" rx="30" ry="5" fill={`url(#sg-${uid})`} />
      </svg>

      {subtitulo && <div className="mascota-subtitles">{subtitulo}</div>}
    </div>
  )
}
