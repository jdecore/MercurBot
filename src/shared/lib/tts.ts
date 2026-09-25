/**
 * MercurBot — Native TTS via Web Speech API (browser-only, §8: stays local).
 * Synchronized with Mascota mood & audio waves.
 * Extended: speaks on mood changes and user interactions (Option 2).
 */

const STORAGE_KEY = 'copixi:tts-muted'

let muted = false
try {
  muted = typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY) === '1'
} catch {
  muted = false
}

const queue: string[] = []
let speaking = false
// Generation counter: stale onend callbacks from a cancelled utterance are
// ignored so they don't flicker the mood/speaking state.
let generation = 0

function isSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

function notifyState(isSpeaking: boolean) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('copixi:tts-speaking', { detail: { speaking: isSpeaking } }))
  if (isSpeaking) {
    window.dispatchEvent(new CustomEvent('copixi:mascota-mood', { detail: 'hablando' }))
  } else {
    window.dispatchEvent(new CustomEvent('copixi:mascota-mood', { detail: 'feliz' }))
  }
}

function pickVoice(): SpeechSynthesisVoice | null {
  if (!isSupported()) return null
  const voices = window.speechSynthesis.getVoices()
  return (
    voices.find((v) => v.lang.startsWith('es') && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Neural'))) ??
    voices.find((v) => v.lang.startsWith('es')) ??
    voices.find((v) => v.lang.startsWith('en')) ??
    null
  )
}

function processQueue() {
  if (speaking || queue.length === 0 || !isSupported()) return
  if (muted) {
    queue.length = 0
    notifyState(false)
    return
  }
  speaking = true
  notifyState(true)

  const text = queue.shift()!
  // Clean special characters or markdown code blocks for smoother speech
  const cleanText = text
    .replace(/```[\s\S]*?```/g, 'código omitido.')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/[#*_~>]/g, '')
    .trim()

  if (!cleanText) {
    speaking = false
    notifyState(false)
    processQueue()
    return
  }

  const myGen = ++generation
  const utterance = new SpeechSynthesisUtterance(cleanText)
  const voice = pickVoice()
  if (voice) utterance.voice = voice
  utterance.rate = 1.02
  utterance.pitch = 1.05

  utterance.onend = () => {
    if (myGen !== generation) return // stale callback, ignore
    speaking = false
    notifyState(false)
    processQueue()
  }

  utterance.onerror = () => {
    if (myGen !== generation) return // stale callback, ignore
    speaking = false
    notifyState(false)
    processQueue()
  }

  window.speechSynthesis.speak(utterance)
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

/* ==================== OPTION 2: SPEECH ON INTERACTIONS ==================== */

/** Mood-change phrases: robot says something when its mood changes. */
const MOOD_PHRASES: Record<string, string[]> = {
  exito: ['¡Encontré algo interesante!', 'Listo, ya quedó.', '¡Eso quedó genial!', 'Perfecto, ahí lo tienes.'],
  enojado: ['Hmm, algo no salió bien.', 'Hubo un problemilla.', 'Eso no funcionó como esperaba.'],
  duda: ['Hmm, no estoy seguro de esto.', 'Déjame pensarlo un momento.', 'Esta parte me genera dudas.'],
  pensando: ['Déjame ver...', 'Estoy pensando...', 'Un momento...', 'Analizando...'],
  dormido: ['...', 'Zzz...', 'Ah, estoy aquí.'],
  feliz: ['¡Me gusta esto!', '¡Genial!', 'Bien, continuamos.'],
}

/** Interaction phrases keyed by event type. */
const INTERACTION_PHRASES: Record<string, string[]> = {
  'file-upload': ['Voy a leer tu documento.', 'Perfecto, dame un momento con esto.', 'Empezando la lectura.'],
  'tab-data': ['Aquí tienes los datos crudos.', 'Veamos los datos.'],
  'tab-insights': ['Vamos a ver los hallazgos.', 'Aquí están los insights.'],
  'tab-overview': ['De vuelta al resumen.', 'Veamos el panorama general.'],
  'filter-applied': ['Filtro aplicado.', 'Ya filtré los datos.'],
  'filter-cleared': ['Filtros eliminados.', 'Todo limpio de nuevo.'],
  'chart-generated': ['Gráfica lista.', 'Aquí tienes la gráfica.'],
  'search-query': ['Buscando en el documento...', 'Déjame buscar eso.'],
  'export': ['Exportando datos.', 'Listo para descargar.'],
  'copy-response': ['Copiado.', 'Listo para pegar.'],
}

/**
 * Say a phrase when mood changes. Picks a random phrase for that mood.
 * Cooldown: won't repeat the same mood within 4 seconds.
 */
let lastMoodTime = 0
let lastMood = ''
export function speakMood(mood: string): void {
  if (muted || mood === lastMood) return
  const now = Date.now()
  if (now - lastMoodTime < 4000) return
  lastMoodTime = now
  lastMood = mood
  const phrases = MOOD_PHRASES[mood]
  if (phrases) speak(pickRandom(phrases))
}

/**
 * Say a phrase for a user interaction event.
 * Cooldown: won't repeat the same event within 6 seconds.
 */
const interactionCooldowns: Record<string, number> = {}
export function speakInteraction(event: string): void {
  if (muted) return
  const now = Date.now()
  if (interactionCooldowns[event] && now - interactionCooldowns[event] < 6000) return
  interactionCooldowns[event] = now
  const phrases = INTERACTION_PHRASES[event]
  if (phrases) speak(pickRandom(phrases))
}

export function speak(text: string): void {
  if (!isSupported() || muted || !text) return
  cancel() // stop any ongoing to start fresh
  queue.push(text)
  processQueue()
}

export function cancel(): void {
  if (isSupported()) window.speechSynthesis.cancel()
  queue.length = 0
  speaking = false
  notifyState(false)
}

export function isTtsSupported(): boolean {
  return isSupported()
}

export function getMuted(): boolean {
  return muted
}

export function isSpeaking(): boolean {
  return speaking
}

export function setMuted(value: boolean): void {
  muted = value
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, value ? '1' : '0')
  } catch {
    /* ignore */
  }
  if (value) cancel()
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('copixi:tts-muted-change', { detail: { muted: value } }))
  }
}

if (typeof window !== 'undefined') {
  ;(window as unknown as { mascotaSpeak: (t: string) => void }).mascotaSpeak = speak
  if (isSupported() && window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.onvoiceschanged = () => {
      // voice list ready
    }
  }
  // Speak on mood changes (Option 2).
  window.addEventListener('copixi:mascota-mood', ((e: Event) => {
    const mood = (e as CustomEvent<string>).detail
    if (mood && typeof mood === 'string') speakMood(mood)
  }) as EventListener)
}
