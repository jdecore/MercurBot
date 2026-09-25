/**
 * MercurBot — Live Voice Session (Phase 6)
 *
 * Continuous mic session with:
 * - Auto-send after 1.2s silence
 * - Barge-in: cancel TTS when user speaks
 * - Volume meter: AnalyserNode → --level CSS var
 * - X/Esc to stop
 *
 * Uses Web Speech API (STT) + Web Audio API (volume meter).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { getDictationCtor, type DictationInstance, dictationErrorMessage } from './dictation'
import { cancel as cancelTts, isSpeaking } from './tts'

const SILENCE_TIMEOUT_MS = 1200
const MAX_SESSION_MS = 120_000 // 2 min max

interface UseVoiceSessionOpts {
  lang?: string
  onFinalText: (text: string) => void
  onVolume?: (level: number) => void // 0–1 RMS
}

export function useVoiceSession(opts: UseVoiceSessionOpts) {
  const { lang = 'es-ES', onFinalText, onVolume } = opts

  const [active, setActive] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [interim, setInterim] = useState('')
  const [error, setError] = useState<string | null>(null)

  const recRef = useRef<DictationInstance | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number | null>(null)
  const silenceTimerRef = useRef<number | null>(null)
  const sessionTimerRef = useRef<number | null>(null)
  const finalTextRef = useRef('')
  const onFinalRef = useRef(onFinalText)
  const onVolumeRef = useRef(onVolume)
  const bargeInRef = useRef(false)

  useEffect(() => { onFinalRef.current = onFinalText }, [onFinalText])
  useEffect(() => { onVolumeRef.current = onVolume }, [onVolume])

  const clearTimers = useCallback(() => {
    if (silenceTimerRef.current !== null) {
      clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }
    if (sessionTimerRef.current !== null) {
      clearTimeout(sessionTimerRef.current)
      sessionTimerRef.current = null
    }
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [])

  const cleanupAudio = useCallback(() => {
    clearTimers()
    try { analyserRef.current?.disconnect() } catch { /* */ }
    try { audioCtxRef.current?.close() } catch { /* */ }
    try { streamRef.current?.getTracks().forEach(t => t.stop()) } catch { /* */ }
    analyserRef.current = null
    audioCtxRef.current = null
    streamRef.current = null
  }, [clearTimers])

  const stop = useCallback(() => {
    clearTimers()
    try { recRef.current?.stop() } catch { /* */ }
    recRef.current = null
    cleanupAudio()
    setActive(false)
    setTranscript('')
    setInterim('')
    finalTextRef.current = ''
    // Notify app of voice session end
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('copixi:voice-session', { detail: { active: false } }))
    }
  }, [clearTimers, cleanupAudio])

  const startVolumeMeter = useCallback((stream: MediaStream) => {
    try {
      const ctx = new AudioContext()
      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.3
      source.connect(analyser)
      audioCtxRef.current = ctx
      analyserRef.current = analyser
      streamRef.current = stream

      const bufLen = analyser.frequencyBinCount
      const data = new Uint8Array(bufLen)

      const tick = () => {
        analyser.getByteFrequencyData(data)
        let sum = 0
        for (let i = 0; i < bufLen; i++) sum += data[i]
        const rms = sum / (bufLen * 255) // 0–1
        onVolumeRef.current?.(rms)
        // Set CSS var on document root
        document.documentElement.style.setProperty('--voice-level', rms.toFixed(3))
        rafRef.current = requestAnimationFrame(tick)
      }
      tick()
    } catch {
      /* AudioContext not available: volume meter disabled */
    }
  }, [])

  // Barge-in: if TTS is speaking and user starts talking, cancel TTS
  const checkBargeIn = useCallback(() => {
    if (isSpeaking() && !bargeInRef.current) {
      bargeInRef.current = true
      cancelTts()
    }
  }, [])

  const start = useCallback(() => {
    if (active) return
    const Ctor = getDictationCtor()
    if (!Ctor || (typeof window !== 'undefined' && !window.isSecureContext)) return

    setError(null)
    setTranscript('')
    setInterim('')
    finalTextRef.current = ''
    bargeInRef.current = false

    // Cancel TTS on start
    cancelTts()

    // Request mic stream for volume meter
    navigator.mediaDevices?.getUserMedia({ audio: true })
      .then(startVolumeMeter)
      .catch(() => { /* volume meter disabled */ })

    const rec = new Ctor()
    rec.lang = lang
    rec.interimResults = true
    rec.continuous = true
    rec.maxAlternatives = 1

    rec.onresult = (e) => {
      const from = e.resultIndex ?? e.results.resultIndex ?? 0
      let interimText = ''
      let finalText = ''
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i]
        const t = r[0]?.transcript ?? ''
        if (r.isFinal) finalText += t
        else if (i >= from) interimText += t
      }

      // Barge-in check on any speech
      if (finalText.trim() || interimText.trim()) {
        checkBargeIn()
      }

      finalTextRef.current = finalText
      setTranscript(finalText)
      setInterim(interimText)

      // Reset silence timer on each final segment
      if (finalText.trim()) {
        if (silenceTimerRef.current !== null) clearTimeout(silenceTimerRef.current)
        silenceTimerRef.current = window.setTimeout(() => {
          // Auto-send after silence
          const text = finalTextRef.current.trim()
          if (text) {
            onFinalRef.current(text)
            finalTextRef.current = ''
            setTranscript('')
          }
        }, SILENCE_TIMEOUT_MS)
      }
    }

    rec.onerror = (e) => {
      const msg = dictationErrorMessage(e?.error ?? '')
      if (msg) setError(msg)
      // 'no-speech' and 'aborted' are non-fatal
      if (e.error !== 'no-speech' && e.error !== 'aborted') {
        stop()
      }
    }

    rec.onend = () => {
      // Auto-restart if session is still active (Chrome auto-stops after silence)
      if (recRef.current === rec) {
        try {
          rec.start()
        } catch {
          stop()
        }
      }
    }

    try {
      rec.start()
      recRef.current = rec
      setActive(true)
      // Notify app of voice session start
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('copixi:voice-session', { detail: { active: true } }))
      }

      // Max session timer
      sessionTimerRef.current = window.setTimeout(() => {
        stop()
      }, MAX_SESSION_MS)
    } catch {
      stop()
    }
  }, [active, lang, stop, startVolumeMeter, checkBargeIn])

  // X/Esc to stop
  useEffect(() => {
    if (!active) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || (e.key === 'x' && !e.ctrlKey && !e.metaKey && !e.altKey)) {
        // Only stop if not typing in an input
        const tag = (e.target as HTMLElement)?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA') return
        stop()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [active, stop])

  // Cleanup on unmount
  useEffect(() => () => {
    clearTimers()
    try { recRef.current?.abort() } catch { /* */ }
    recRef.current = null
    cleanupAudio()
  }, [clearTimers, cleanupAudio])

  // Reset --voice-level when session ends
  useEffect(() => {
    if (!active) {
      document.documentElement.style.setProperty('--voice-level', '0')
      onVolumeRef.current?.(0)
    }
  }, [active])

  return {
    active,
    transcript,
    interim,
    error,
    start,
    stop,
    clearError: () => setError(null),
  }
}
