/**
 * Copixi — Dictado por voz via Web Speech API (STT nativo del navegador).
 *
 * Por qué Web Speech API y no otra cosa (§34):
 * - Es el único STT 100% nativo del navegador: cero deps, cero descargas,
 *   resultados parciales en streaming, excelente en es-ES, gratis.
 * - Soporte 2026: Chrome/Edge (completo), Safari 14.1+ macOS / 14.5+ iOS
 *   (parcial, prefijo webkit), Samsung Internet y Chrome Android. Firefox lo
 *   mantiene desactivado por defecto (llegando en 155/156 según Mozilla).
 * - Alternativa evaluada y descartada: Whisper local con
 *   `@xenova/transformers` (ya es dep del proyecto) funcionaría en Firefox y
 *   offline, pero exige descargar ~40-250 MB y tarda segundos por frase corta:
 *   sobreingeniería para dictar una pregunta (§40.1 simplicidad primero).
 *   Si Firefox gana peso, ese es el fallback a añadir — sin servidor (§8).
 *
 * Requiere contexto seguro (HTTPS o localhost) y gesto del usuario.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

interface DictationResult {
  length: number
  [index: number]: { transcript: string }
  isFinal: boolean
}

interface DictationResultList {
  length: number
  resultIndex: number
  [index: number]: DictationResult
}

export interface DictationInstance {
  lang: string
  interimResults: boolean
  continuous: boolean
  maxAlternatives: number
  onresult: ((e: { results: DictationResultList }) => void) | null
  onend: (() => void) | null
  onerror: ((e: { error: string }) => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

export type DictationCtor = new () => DictationInstance

export function getDictationCtor(): DictationCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    SpeechRecognition?: DictationCtor
    webkitSpeechRecognition?: DictationCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export type DictationUnsupportedReason =
  | 'supported'
  | 'no-api' // Firefox, navegadores sin implementación
  | 'insecure-context' // http:// no-localhost: Chrome lo bloquea

export function getDictationSupport(): DictationUnsupportedReason {
  if (!getDictationCtor()) return 'no-api'
  if (typeof window !== 'undefined' && !window.isSecureContext) return 'insecure-context'
  return 'supported'
}

/** Mensaje accionable por código de error de la API (SpeechRecognitionErrorEvent.error). */
export function dictationErrorMessage(code: string): string {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Micrófono bloqueado: permite el acceso al micrófono en el icono del navegador y reintenta.'
    case 'no-speech':
      return 'No se escuchó nada: acércate al micrófono y habla un poco más alto.'
    case 'audio-capture':
      return 'Sin micrófono disponible: conecta un micrófono y reintenta.'
    case 'network':
      return 'El dictado necesita conexión (Chrome transcribe en la nube). Revisa tu red o escribe la pregunta.'
    case 'aborted':
      return ''
    default:
      return 'El dictado se detuvo. Reintenta o escribe la pregunta.'
  }
}

const MAX_LISTEN_MS = 60_000

interface UseDictationOpts {
  lang?: string
  disabled?: boolean
  onFinalText?: (text: string) => void
}

/**
 * Hook de dictado robusto:
 * - continuous=true para que no corte en la primera pausa
 * - acumula solo segmentos finales; el interim se muestra sin pisar lo final
 * - expone interim + error accionable para la UI
 * - auto-stop a los 60 s para no dejar el mic abierto
 */
export function useDictation(opts: UseDictationOpts = {}) {
  const { lang = 'es-ES', disabled = false, onFinalText } = opts
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [dictationError, setDictationError] = useState<string | null>(null)
  const recRef = useRef<DictationInstance | null>(null)
  const finalRef = useRef('')
  const timerRef = useRef<number | null>(null)
  const onFinalRef = useRef(onFinalText)
  useEffect(() => {
    onFinalRef.current = onFinalText
  }, [onFinalText])

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  const stop = useCallback(() => {
    clearTimer()
    try {
      recRef.current?.stop()
    } catch {
      /* ya detenido */
    }
    // onend hace el cleanup de estado
  }, [])

  const start = useCallback(() => {
    if (disabled) return
    const Ctor = getDictationCtor()
    if (!Ctor || (typeof window !== 'undefined' && !window.isSecureContext)) return
    if (recRef.current) return // ya grabando: evita InvalidStateError
    setDictationError(null)
    // Corta el TTS para que el mic no capture al propio altavoz
    try {
      window.speechSynthesis?.cancel()
    } catch {
      /* sin TTS */
    }
    finalRef.current = ''
    setInterim('')
    const rec = new Ctor()
    rec.lang = lang
    rec.interimResults = true
    rec.continuous = true
    rec.maxAlternatives = 1
    rec.onresult = (e) => {
      let interimText = ''
      for (let i = e.results.resultIndex ?? 0; i < e.results.length; i++) {
        const r = e.results[i]
        const transcript = r[0]?.transcript ?? ''
        if (r.isFinal) {
          finalRef.current += transcript
          onFinalRef.current?.(finalRef.current.trim())
        } else {
          interimText += transcript
        }
      }
      setInterim(interimText)
    }
    rec.onerror = (e) => {
      const msg = dictationErrorMessage(e?.error ?? '')
      if (msg) setDictationError(msg)
    }
    rec.onend = () => {
      recRef.current = null
      clearTimer()
      setInterim('')
      setListening(false)
    }
    try {
      rec.start()
      recRef.current = rec
      setListening(true)
      timerRef.current = window.setTimeout(stop, MAX_LISTEN_MS)
    } catch {
      recRef.current = null
      setListening(false)
    }
  }, [disabled, lang, stop])

  const toggle = useCallback(() => {
    if (listening) stop()
    else start()
  }, [listening, start, stop])

  useEffect(
    () => () => {
      clearTimer()
      try {
        recRef.current?.abort()
      } catch {
        /* ignore */
      }
      recRef.current = null
    },
    [],
  )

  return { listening, interim, dictationError, start, stop, toggle, clearDictationError: () => setDictationError(null) }
}
