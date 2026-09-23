import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocale } from '../../lib/locale'

interface BlackHoleUploadProps {
  onFile: (file: File) => void
  size?: number
}

export function BlackHoleUpload({ onFile, size = 200 }: BlackHoleUploadProps) {
  const { t } = useLocale()
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)
  const particlesRef = useRef<Particle[]>([])
  const [isHover, setIsHover] = useState(false)
  const [isDrag, setIsDrag] = useState(false)
  const [isConsume, setIsConsume] = useState(false)

  // Partículas orbitales
  interface Particle {
    angle: number
    radius: number
    speed: number
    size: number
    opacity: number
    hue: number
  }

  const initParticles = useCallback(() => {
    const particles: Particle[] = []
    for (let i = 0; i < 24; i++) {
      particles.push({
        angle: (Math.PI * 2 * i) / 24,
        radius: 60 + Math.random() * 40,
        speed: 0.002 + Math.random() * 0.003,
        size: 1 + Math.random() * 2,
        opacity: 0.3 + Math.random() * 0.5,
        hue: 200 + Math.random() * 40,
      })
    }
    particlesRef.current = particles
  }, [])

  useEffect(() => {
    initParticles()
  }, [initParticles])

  // Animación principal
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = size * dpr
    canvas.height = size * dpr
    ctx.scale(dpr, dpr)

    const center = size / 2
    const maxRadius = size / 2 - 10

    let time = 0

    const draw = () => {
      time += 1
      ctx.clearRect(0, 0, size, size)

      // Fondo del agujero negro (gradiente radial)
      const bgGrad = ctx.createRadialGradient(center, center, 0, center, center, maxRadius)
      bgGrad.addColorStop(0, 'rgba(0,0,0,1)')
      bgGrad.addColorStop(0.4, 'rgba(0,0,0,0.98)')
      bgGrad.addColorStop(0.7, 'rgba(10,10,20,0.9)')
      bgGrad.addColorStop(1, 'rgba(20,20,40,0)')
      ctx.fillStyle = bgGrad
      ctx.beginPath()
      ctx.arc(center, center, maxRadius, 0, Math.PI * 2)
      ctx.fill()

      // Anillo luminoso (accretion disk)
      const glowIntensity = isHover ? 0.6 : 0.3
      const pulseFactor = Math.sin(time * 0.03) * 0.1 + 1
      const ringRadius = 55 * pulseFactor

      ctx.save()
      ctx.globalAlpha = glowIntensity + Math.sin(time * 0.05) * 0.1
      const ringGrad = ctx.createRadialGradient(center, center, ringRadius - 8, center, center, ringRadius + 8)
      ringGrad.addColorStop(0, 'rgba(100,150,255,0)')
      ringGrad.addColorStop(0.3, 'rgba(100,180,255,0.4)')
      ringGrad.addColorStop(0.5, 'rgba(150,200,255,0.6)')
      ringGrad.addColorStop(0.7, 'rgba(100,180,255,0.4)')
      ringGrad.addColorStop(1, 'rgba(100,150,255,0)')
      ctx.fillStyle = ringGrad
      ctx.beginPath()
      ctx.arc(center, center, ringRadius + 8, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()

      // Segundo anillo (más sutil)
      ctx.save()
      ctx.globalAlpha = glowIntensity * 0.5
      const ring2Grad = ctx.createRadialGradient(center, center, ringRadius * 1.3 - 5, center, center, ringRadius * 1.3 + 5)
      ring2Grad.addColorStop(0, 'rgba(80,120,200,0)')
      ring2Grad.addColorStop(0.5, 'rgba(80,140,220,0.3)')
      ring2Grad.addColorStop(1, 'rgba(80,120,200,0)')
      ctx.fillStyle = ring2Grad
      ctx.beginPath()
      ctx.arc(center, center, ringRadius * 1.3 + 5, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()

      // Partículas orbitales
      const particles = particlesRef.current
      const suckFactor = isDrag ? 3 : isHover ? 1.5 : 1

      for (const p of particles) {
        p.angle += p.speed * suckFactor

        // En hover/drag, las partículas se acercan al centro
        const targetRadius = isDrag ? p.radius * 0.5 : isHover ? p.radius * 0.7 : p.radius
        p.radius += (targetRadius - p.radius) * 0.02

        const x = center + Math.cos(p.angle) * p.radius
        const y = center + Math.sin(p.angle) * p.radius

        // Brillo de partícula
        ctx.save()
        ctx.globalAlpha = p.opacity * (isHover ? 1.3 : 1)
        const particleGrad = ctx.createRadialGradient(x, y, 0, x, y, p.size * 2)
        particleGrad.addColorStop(0, `hsla(${p.hue}, 80%, 70%, 1)`)
        particleGrad.addColorStop(0.5, `hsla(${p.hue}, 70%, 60%, 0.6)`)
        particleGrad.addColorStop(1, `hsla(${p.hue}, 60%, 50%, 0)`)
        ctx.fillStyle = particleGrad
        ctx.beginPath()
        ctx.arc(x, y, p.size * 2, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()

        // Estela de partícula
        ctx.save()
        ctx.globalAlpha = p.opacity * 0.3
        ctx.strokeStyle = `hsla(${p.hue}, 70%, 60%, 0.4)`
        ctx.lineWidth = 0.5
        ctx.beginPath()
        const trailLen = 0.3
        const tx = center + Math.cos(p.angle - trailLen) * p.radius
        const ty = center + Math.sin(p.angle - trailLen) * p.radius
        ctx.moveTo(x, y)
        ctx.lineTo(tx, ty)
        ctx.stroke()
        ctx.restore()
      }

      // Efecto de succión (líneas hacia el centro)
      if (isDrag) {
        ctx.save()
        ctx.globalAlpha = 0.3 + Math.sin(time * 0.1) * 0.1
        for (let i = 0; i < 8; i++) {
          const a = (Math.PI * 2 * i) / 8 + time * 0.02
          const r1 = maxRadius * 0.8
          const r2 = maxRadius * 0.3
          const x1 = center + Math.cos(a) * r1
          const y1 = center + Math.sin(a) * r1
          const x2 = center + Math.cos(a) * r2
          const y2 = center + Math.sin(a) * r2

          const lineGrad = ctx.createLinearGradient(x1, y1, x2, y2)
          lineGrad.addColorStop(0, 'rgba(100,180,255,0)')
          lineGrad.addColorStop(0.5, 'rgba(100,180,255,0.3)')
          lineGrad.addColorStop(1, 'rgba(100,180,255,0)')
          ctx.strokeStyle = lineGrad
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.moveTo(x1, y1)
          ctx.lineTo(x2, y2)
          ctx.stroke()
        }
        ctx.restore()
      }

      animRef.current = requestAnimationFrame(draw)
    }

    draw()

    return () => {
      cancelAnimationFrame(animRef.current)
    }
  }, [size, isHover, isDrag])

  // Efecto de consumo al soltar archivo
  const consumeFile = useCallback((file: File) => {
    setIsConsume(true)
    setTimeout(() => {
      setIsConsume(false)
      onFile(file)
    }, 800)
  }, [onFile])

  // Drag & Drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDrag(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDrag(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDrag(false)

    const files = e.dataTransfer.files
    if (files.length > 0) {
      const file = files[0]
      if (file.type === 'application/pdf') {
        consumeFile(file)
      }
    }
  }, [consumeFile])

  // Click handler
  const handleClick = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.pdf,application/pdf'
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (file) consumeFile(file)
    }
    input.click()
  }, [consumeFile])

  // Keyboard handler
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleClick()
    }
  }, [handleClick])

  return (
    <div
      ref={containerRef}
      className={`black-hole-upload ${isHover ? 'hover' : ''} ${isDrag ? 'drag' : ''} ${isConsume ? 'consume' : ''}`}
      style={{ width: size, height: size }}
      onMouseEnter={() => setIsHover(true)}
      onMouseLeave={() => setIsHover(false)}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label={t.dropTitle}
    >
      <canvas
        ref={canvasRef}
        className="black-hole-canvas"
        style={{ width: size, height: size }}
      />
      <div className="black-hole-text">
        <span className="black-hole-icon">📄</span>
        <span className="black-hole-label">{t.dropTitle}</span>
        <span className="black-hole-hint">{t.dropHint}</span>
      </div>
    </div>
  )
}
