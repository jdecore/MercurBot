/**
 * sounds.ts — Efectos de sonido para el robot via Web Audio API.
 * 0 dependencias. Se inicializa bajo demanda (requiere gesto del usuario).
 */

let ctx: AudioContext | null = null
let muted = false

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    try { ctx = new AudioContext() } catch { return null }
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  return ctx
}

function playTone(freq: number, duration: number, type: OscillatorType = 'sine', volume = 0.12) {
  if (muted) return
  const c = getCtx()
  if (!c) return
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, c.currentTime)
  gain.gain.setValueAtTime(volume, c.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration)
  osc.connect(gain).connect(c.destination)
  osc.start()
  osc.stop(c.currentTime + duration)
}

function playNotes(notes: { freq: number; delay: number; dur: number }[], volume = 0.1) {
  if (muted) return
  const c = getCtx()
  if (!c) return
  for (const n of notes) {
    const osc = c.createOscillator()
    const gain = c.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(n.freq, c.currentTime + n.delay)
    gain.gain.setValueAtTime(volume, c.currentTime + n.delay)
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + n.delay + n.dur)
    osc.connect(gain).connect(c.destination)
    osc.start(c.currentTime + n.delay)
    osc.stop(c.currentTime + n.delay + n.dur)
  }
}

/** Pop suave — al enviar mensaje */
export function pop() {
  playTone(800, 0.08, 'sine', 0.1)
  setTimeout(() => playTone(500, 0.06, 'sine', 0.06), 40)
}

/** Chime ascendente — respuesta lista */
export function chime() {
  playNotes([
    { freq: 523, delay: 0, dur: 0.15 },    // C5
    { freq: 659, delay: 0.08, dur: 0.18 },  // E5
    { freq: 784, delay: 0.16, dur: 0.22 },  // G5
  ])
}

/** Thinking tick — procesando */
let tickInterval: ReturnType<typeof setInterval> | null = null
export function startThinking() {
  if (muted || tickInterval) return
  let count = 0
  tickInterval = setInterval(() => {
    if (count++ > 30 || muted) { stopThinking(); return }
    playTone(1200 + (count % 3) * 200, 0.03, 'sine', 0.04)
  }, 250)
}
export function stopThinking() {
  if (tickInterval) { clearInterval(tickInterval); tickInterval = null }
}

/** Success — gráfica o acción exitosa */
export function success() {
  playNotes([
    { freq: 523, delay: 0, dur: 0.12 },     // C5
    { freq: 659, delay: 0.1, dur: 0.12 },    // E5
    { freq: 784, delay: 0.2, dur: 0.25 },    // G5
  ], 0.08)
}

/** Error — falla de API o validación */
export function error() {
  playTone(220, 0.25, 'sawtooth', 0.06)
  setTimeout(() => playTone(180, 0.3, 'sawtooth', 0.04), 100)
}

/** Click — interacción con robot */
export function click() {
  playTone(1000, 0.04, 'sine', 0.06)
}

/** Whoosh — cambio de mood */
export function whoosh() {
  if (muted) return
  const c = getCtx()
  if (!c) return
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(300, c.currentTime)
  osc.frequency.exponentialRampToValueAtTime(600, c.currentTime + 0.12)
  gain.gain.setValueAtTime(0.06, c.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.15)
  osc.connect(gain).connect(c.destination)
  osc.start()
  osc.stop(c.currentTime + 0.15)
}

/** Greeting — melodía de bienvenida (3 notas ascendentes) */
export function greeting() {
  playNotes([
    { freq: 392, delay: 0, dur: 0.18 },    // G4
    { freq: 494, delay: 0.15, dur: 0.18 },  // B4
    { freq: 659, delay: 0.3, dur: 0.3 },    // E5
  ], 0.09)
}

/** Control de mute */
export function setMuted(value: boolean) { muted = value }
export function isMuted() { return muted }
