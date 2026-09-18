/**
 * Copixi — Native TTS via Web Speech API (browser-only, §8: stays local).
 * Synchronized with Mascota mood & audio waves.
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
}
