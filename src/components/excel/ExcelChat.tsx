import { useEffect, useMemo, useRef, useState } from 'react'
import { useDashboard } from '../../state/DashboardContext'
import { speak, getMuted, setMuted as setTtsMuted, isTtsSupported, cancel as cancelTts, isSpeaking } from '../../lib/tts'
import type { MascotaMood } from '../../types/mascota'
import { ragClient } from '../../lib/ragClient'
import { getChatHistory, saveChatHistory, clearChatHistory, type ChatHistoryMsg } from '../../lib/storage'
import { runRagPipeline, RAG_TOP_K, type RagPipelineHit, type RagPipelineMode } from '../../lib/ragPipeline'

function setMascotaMood(m: MascotaMood) {
  window.dispatchEvent(new CustomEvent('copixi:mascota-mood', { detail: m }))
}

const DEFAULT_SUGGESTIONS = [
  '¿Qué puedes hacer por mí?',
  'Subí un PDF, ¿por dónde empiezo?',
  '¿Cómo citas las fuentes de mis preguntas?',
]

// Strip the trailing JSON action block (e.g. {"action":"setFilter",...}) so it
// isn't shown to the user.
function cleanAI(text: string): string {
  const idx = text.lastIndexOf('{')
  if (idx !== -1 && text.slice(idx).includes('"action"')) {
    const tail = text.slice(idx).trim()
    if (tail.startsWith('{') && tail.endsWith('}')) return text.slice(0, idx).trim()
  }
  return text
}

// Minimal, dependency-free markdown: **bold**, *italic*, `code`.
function renderInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  const re = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`)/g
  let last = 0
  let m: RegExpExecArray | null
  let key = 0
  while ((m = re.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index))
    if (m[2] !== undefined) nodes.push(<strong key={key++}>{m[2]}</strong>)
    else if (m[3] !== undefined) nodes.push(<em key={key++}>{m[3]}</em>)
    else if (m[4] !== undefined) nodes.push(<code key={key++} className="ai-inline-code">{m[4]}</code>)
    last = m.index + m[0].length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

// Render AI text as paragraphs / lists with inline formatting + citas [Pág. N] verificables.
// Las citas son botones: abren el visor embebido en esa página (evento copixi:goto-page).
const PAGE_CITE_RE = /\[P[áa]g\.?\s*(\d+)\]|\[P[áa]gina\s*(\d+)\]|\[p\.\s*(\d+)\]/gi

function gotoPage(page: number) {
  if (Number.isFinite(page) && page > 0) {
    window.dispatchEvent(new CustomEvent('copixi:goto-page', { detail: page }))
  }
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      return ok
    } catch {
      return false
    }
  }
}

function downloadMarkdown(filename: string, body: string) {
  const blob = new Blob([body], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

function renderInlineWithCites(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  const re = new RegExp(PAGE_CITE_RE.source, 'gi')
  let last = 0
  let m: RegExpExecArray | null
  let key = 0
  while ((m = re.exec(text))) {
    if (m.index > last) nodes.push(...renderInline(text.slice(last, m.index)).map((n, i) => <span key={`${keyPrefix}-t${key}-${i}`}>{n}</span>))
    const page = m[1] ?? m[2] ?? m[3] ?? '?'
    const pageNum = Number.parseInt(String(page), 10)
    nodes.push(
      <button
        key={`${keyPrefix}-cite${key++}`}
        type="button"
        className="citation-badge citation-inline"
        title={`Ver página ${page} en el visor`}
        aria-label={`Ver página ${page} en el visor`}
        onClick={() => gotoPage(pageNum)}
      >
        [Pág. {page}]
      </button>,
    )
    last = m.index + m[0].length
  }
  if (last < text.length) nodes.push(...renderInline(text.slice(last)).map((n, i) => <span key={`${keyPrefix}-u${key}-${i}`}>{n}</span>))
  return nodes
}

function renderRichText(text: string): React.ReactNode {
  const lines = text.split('\n')
  const blocks: React.ReactNode[] = []
  let i = 0
  let key = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) {
      i++
      continue
    }
    // Bloque de código ``` (P1)
    if (/^```/.test(line)) {
      const code: string[] = []
      i++
      while (i < lines.length && !/^```/.test(lines[i])) {
        code.push(lines[i])
        i++
      }
      i++ // línea de cierre (o fin del texto)
      blocks.push(
        <pre key={key++} className="ai-code"><code>{code.join('\n')}</code></pre>,
      )
      continue
    }
    // Tabla Markdown | a | b | (P1: requiere fila separadora | --- |)
    if (/^\|.*\|\s*$/.test(line)) {
      const raw: string[] = []
      let j = i
      while (j < lines.length && /^\|.*\|\s*$/.test(lines[j])) {
        raw.push(lines[j])
        j++
      }
      const cells = raw.map((r) => r.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()))
      const isTable = cells.length >= 2 && cells[1].length > 0 && cells[1].every((c) => /^:?-+:?$/.test(c))
      if (isTable) {
        const [head, , ...rest] = cells
        blocks.push(
          <table key={key++} className="ai-table">
            <thead>
              <tr>{head.map((c, ci) => (<th key={ci}>{renderInline(c)}</th>))}</tr>
            </thead>
            {rest.length > 0 && (
              <tbody>
                {rest.map((r, ri) => (
                  <tr key={ri}>{r.map((c, ci) => (<td key={ci}>{renderInline(c)}</td>))}</tr>
                ))}
              </tbody>
            )}
          </table>,
        )
        i = j
        continue
      }
    }
    if (/^[-*+]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*+]\s+/, ''))
        i++
      }
      blocks.push(
        <ul key={key++} className="ai-list">
          {items.map((it, idx) => (
            <li key={idx}>{renderInlineWithCites(it, `ul${key}-${idx}`)}</li>
          ))}
        </ul>,
      )
      continue
    }
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s+/, ''))
        i++
      }
      blocks.push(
        <ol key={key++} className="ai-list">
          {items.map((it, idx) => (
            <li key={idx}>{renderInlineWithCites(it, `ol${key}-${idx}`)}</li>
          ))}
        </ol>,
      )
      continue
    }
    const para: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^[-*+]\s+/.test(lines[i]) &&
      !/^\d+\.\s+/.test(lines[i])
    ) {
      para.push(lines[i])
      i++
    }
    blocks.push(<p key={key++}>{renderInlineWithCites(para.join(' '), `p${key}`)}</p>)
  }
  return <>{blocks}</>
}

type ChatMsg = ChatHistoryMsg

const FOLLOWUP_STOP = new Set([
  'para', 'como', 'cómo', 'este', 'esta', 'esto', 'estos', 'estas', 'entre', 'sobre',
  'desde', 'hasta', 'donde', 'dónde', 'cuando', 'cuándo', 'porque', 'página', 'páginas',
  'documento', 'también', 'puede', 'pueden', 'tiene', 'tienen', 'hace', 'hacen', 'cada',
  'todos', 'todas', 'ello', 'este', 'además', 'mismo', 'misma', 'gran', 'gran',
])

/**
 * Follow-ups dinámicos (P1): propone profundizar en los 2 términos propios
 * más frecuentes de la última respuesta. 100% local, sin LLM.
 */
function suggestFollowUps(text: string): string[] {
  const freq = new Map<string, number>()
  for (const m of text.matchAll(/[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{3,}/g)) {
    const w = m[0].toLowerCase()
    if (FOLLOWUP_STOP.has(w)) continue
    freq.set(w, (freq.get(w) ?? 0) + 1)
  }
  const top = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([w]) => w)
  const out: string[] = []
  if (top[0]) out.push(`Profundiza en ${top[0]}`)
  if (top[1]) out.push(`¿Qué más dice el documento sobre ${top[1]}?`)
  if (out.length === 0) out.push('Dame un ejemplo concreto del documento')
  return out.slice(0, 3)
}

interface DictationResult {
  length: number
  [index: number]: { transcript: string }
  isFinal: boolean
}

interface DictationResultList {
  length: number
  [index: number]: DictationResult
}

interface DictationInstance {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((e: { results: DictationResultList }) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

type DictationCtor = new () => DictationInstance

function getDictationCtor(): DictationCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: DictationCtor; webkitSpeechRecognition?: DictationCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export function ExcelChat({ onOpenFilePicker }: { onOpenFilePicker?: () => void }) {
  const { pdfDoc } = useDashboard()

  const [input, setInput] = useState('')
  const [muted, setMutedState] = useState(getMuted())
  const [ttsSpeaking, setTtsSpeaking] = useState(isSpeaking())
  const [chatLogOpen, setChatLogOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Chat state (self-contained, no external chat SDK)
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [status, setStatus] = useState<'idle' | 'submitted' | 'streaming' | 'done' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [listening, setListening] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const lastQueryRef = useRef('')
  const dictationRef = useRef<DictationInstance | null>(null)

  // Dictado por voz (Fase 24D): Web Speech API, sin deps. Oculto sin soporte.
  const stopDictation = () => {
    try {
      dictationRef.current?.stop()
    } catch {
      /* ignore */
    }
    dictationRef.current = null
    setListening(false)
  }

  const toggleDictation = () => {
    const Ctor = getDictationCtor()
    if (!Ctor || loading) return
    if (listening) {
      stopDictation()
      return
    }
    const rec = new Ctor()
    rec.lang = 'es-ES'
    rec.interimResults = true
    rec.continuous = false
    rec.onresult = (e) => {
      let text = ''
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0]?.transcript ?? ''
      if (text.trim()) setInput(text.trim())
    }
    rec.onend = () => {
      dictationRef.current = null
      setListening(false)
    }
    rec.onerror = () => {
      dictationRef.current = null
      setListening(false)
    }
    try {
      rec.start()
      dictationRef.current = rec
      setListening(true)
    } catch {
      setListening(false)
    }
  }

  useEffect(() => () => {
    try {
      dictationRef.current?.abort()
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    const handleTts = (e: Event) => {
      const detail = (e as CustomEvent<{ speaking: boolean }>).detail
      if (detail) setTtsSpeaking(detail.speaking)
    }
    const handleMuteChange = (e: Event) => {
      const detail = (e as CustomEvent<{ muted: boolean }>).detail
      if (detail !== undefined) setMutedState(detail.muted)
    }
    window.addEventListener('copixi:tts-speaking', handleTts as EventListener)
    window.addEventListener('copixi:tts-muted-change', handleMuteChange as EventListener)
    return () => {
      window.removeEventListener('copixi:tts-speaking', handleTts as EventListener)
      window.removeEventListener('copixi:tts-muted-change', handleMuteChange as EventListener)
    }
  }, [])

  const loading = status === 'submitted' || status === 'streaming'

  useEffect(() => {
    if (loading) setMascotaMood('pensando')
  }, [loading])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, loading])

  const docId = pdfDoc?.docId ?? null

  // Historial por documento (P1): carga al cambiar de PDF…
  useEffect(() => {
    setMessages(docId ? getChatHistory(docId) : [])
    setError(null)
    setStatus('idle')
    setChatLogOpen(false)
    setCopiedId(null)
  }, [docId])

  // …y persiste al completar respuestas (localStorage, truncado en storage.ts).
  useEffect(() => {
    if (docId && messages.length > 0 && (status === 'done' || status === 'idle')) {
      saveChatHistory(docId, messages)
    }
  }, [messages, docId, status])

  async function handleCopy(id: string, text: string) {
    const ok = await copyText(cleanAI(text))
    if (ok) {
      setCopiedId(id)
      setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 2000)
    }
  }

  function handleDownloadMd(msg: ChatMsg) {
    const idx = messages.findIndex((m) => m.id === msg.id)
    const prevUser = [...messages.slice(0, idx)].reverse().find((m) => m.role === 'user')
    const base = (pdfDoc?.filename ?? 'respuesta').replace(/\.pdf$/i, '') || 'respuesta'
    const sources = (msg.citations ?? []).map((c) => `- Pág. ${c.pageNumber}: ${c.snippet}`).join('\n')
    const body = `# ${base}\n\n${prevUser ? `**Pregunta:** ${prevUser.content}\n\n` : ''}**Respuesta:**\n\n${cleanAI(msg.content)}\n\n${sources ? `**Fuentes:**\n\n${sources}\n` : ''}`
    downloadMarkdown(`${base}.md`, body)
  }

  async function runQuery(text: string) {
    if (loading) return
    const trimmed = text.trim()
    if (!trimmed) return
    lastQueryRef.current = trimmed
    setError(null)

    const userMsg: ChatMsg = { id: `u-${Date.now()}`, role: 'user', content: trimmed }
    const assistantMsg: ChatMsg = { id: `a-${Date.now()}`, role: 'assistant', content: '' }
    const history = [...messages, userMsg].slice(-4).map((m) => ({ role: m.role, content: m.content }))

    setMessages((prev) => [...prev, userMsg, assistantMsg])
    setMascotaMood('escuchando')
    setStatus('submitted')

    // Fase 4 — Pipeline de búsqueda: híbrido (Top15 vec + Top15 léxico → RRF → Top3)
    // o fallback léxico Top3 directo. Ver src/lib/ragPipeline.ts + rag.worker.ts.
    let ragHits: RagPipelineHit[] = []
    let searchMode: RagPipelineMode | undefined
    if (pdfDoc || ragClient.getState().chunkCount > 0) {
      setMascotaMood('pensando')
      try {
        const result = await runRagPipeline(trimmed, RAG_TOP_K)
        ragHits = result.hits
        searchMode = result.mode
      } catch (ragErr) {
        console.warn('[ExcelChat] Error en búsqueda RAG local:', ragErr)
      }
    }

    const citations = ragHits.map((h) => ({
      pageNumber: h.pageNumber,
      snippet: String(h.text ?? '').slice(0, 200),
      matchType: h.matchType,
    }))

    const payloadContext = (pdfDoc || ragHits.length > 0)
      ? {
          documentType: 'pdf',
          filename: pdfDoc?.filename ?? ragHits[0]?.docName ?? 'documento.pdf',
          totalPages: pdfDoc?.totalPages ?? Math.max(...ragHits.map((h) => h.pageNumber), 1),
          searchMode,
          ragHits: ragHits.map((h) => ({
            pageNumber: h.pageNumber,
            chunkIndex: h.chunkIndex,
            text: h.text,
            score: h.score,
            matchType: h.matchType,
          })),
        }
      : { hasData: false }

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: history, context: payloadContext }),
        signal: controller.signal,
      })

      if (!res.ok || !res.body) {
        let detail = `HTTP ${res.status}`
        try {
          const j = (await res.json()) as { error?: string; detail?: string }
          if (j?.error) detail = j.detail ? `${j.error}: ${j.detail}` : j.error
        } catch { /* ignore */ }
        throw new Error(detail)
      }

      setStatus('streaming')
      setMascotaMood('pensando')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let acc = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let sep: number
        while ((sep = buffer.indexOf('\n\n')) !== -1) {
          const raw = buffer.slice(0, sep)
          buffer = buffer.slice(sep + 2)
          const line = raw.trim()
          if (!line.startsWith('data:')) continue
          const payload = line.slice(5).trim()
          if (!payload) continue
          try {
            const evt = JSON.parse(payload) as { type: string; delta?: string; message?: string }
            if (evt.type === 'text-delta' && typeof evt.delta === 'string') {
              acc += evt.delta
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsg.id
                    ? { ...m, content: acc, citations: citations.length ? citations : undefined, searchMode }
                    : m
                )
              )
            } else if (evt.type === 'error') {
              throw new Error(evt.message || 'Error del servidor')
            }
          } catch (e) {
            if (e instanceof Error && (e as any).type === 'error') throw e
            /* ignore non-delta / parse noise */
          }
        }
      }

      setStatus('done')
      setMascotaMood('exito')
      if (!getMuted() && acc) speak(cleanAI(acc).slice(0, 300))
    } catch (e) {
      // Detener es una acción del usuario, no un error: limpia sin alarmar.
      if ((e instanceof DOMException && e.name === 'AbortError') || (e instanceof Error && e.name === 'AbortError')) {
        setStatus('idle')
        setMascotaMood('neutro')
        setMessages((prev) => prev.filter((m) => m.id !== assistantMsg.id))
        return
      }
      const msg = e instanceof Error ? e.message : 'Error desconocido'
      setError(msg)
      setMascotaMood('enojado')
      setStatus('error')
      // Drop the empty assistant placeholder so the UI stays clean
      setMessages((prev) => prev.filter((m) => m.id !== assistantMsg.id))
    } finally {
      abortRef.current = null
    }
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || loading) return
    const t = input.trim()
    setInput('')
    void runQuery(t)
  }

  const ask = (q: string) => {
    if (!q || loading) return
    void runQuery(q)
  }

  const stop = () => abortRef.current?.abort()

  const regenerate = () => {
    if (loading) return
    setMessages((prev) => {
      const copy = [...prev]
      if (copy.length && copy[copy.length - 1].role === 'assistant') copy.pop()
      return copy
    })
    if (lastQueryRef.current) void runQuery(lastQueryRef.current)
  }

  const clearChat = () => {
    setMessages([])
    setError(null)
    setStatus('idle')
    setCopiedId(null)
    if (docId) clearChatHistory(docId)
    setMascotaMood('neutro')
  }

  const toggleMute = () => {
    const v = !muted
    setTtsMuted(v)
    setMutedState(v)
  }

  const lastAiMsg = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant' && messages[i].content) return messages[i]
    }
    return null
  }, [messages])

  const cleanedAi = useMemo(() => (lastAiMsg ? cleanAI(lastAiMsg.content) : ''), [lastAiMsg])

  const suggestions = useMemo(() => DEFAULT_SUGGESTIONS, [])

  // Follow-ups dinámicos (P1): solo al terminar una respuesta, derivados de ella.
  const followUps = useMemo(() => {
    if (status !== 'done' || !lastAiMsg?.content || !pdfDoc) return []
    return suggestFollowUps(cleanAI(lastAiMsg.content))
  }, [status, lastAiMsg, pdfDoc])

  return (
    <div className="excel-chat-container" aria-label="compexi Chat">
      <div className="speech-bubble-wrapper">
        <div className={`speech-bubble ${loading ? 'thinking' : ''}`} role="region" aria-live="polite">
          <div className="speech-bubble-tail" aria-hidden />
          <div className="speech-bubble-header">
            <div className="speech-bubble-avatar-title">
              <span className="dot-pulse" aria-hidden />
              <strong>compe</strong>
              <span className="badge-expert">PDF AI Analyst</span>
            </div>
            <div className="speech-bubble-status">
              {ttsSpeaking && !muted && (
                <span className="audio-waves" title="Hablando por voz" aria-label="Hablando por voz">
                  <span className="wave-bar" />
                  <span className="wave-bar" />
                  <span className="wave-bar" />
                </span>
              )}
              {isTtsSupported() && (
                <button
                  type="button"
                  className={`bubble-icon-btn ${muted ? 'muted' : ''}`}
                  onClick={toggleMute}
                  aria-label={muted ? 'Activar voz' : 'Silenciar voz'}
                  title={muted ? 'Activar voz' : 'Silenciar voz'}
                >
                  <i className={`pixelart-icons-font-${muted ? 'volume-x' : 'volume'}`} aria-hidden />
                </button>
              )}
              {ttsSpeaking && (
                <button type="button" className="bubble-icon-btn" onClick={cancelTts} aria-label="Parar audio" title="Parar audio">
                  <i className="pixelart-icons-font-pause" aria-hidden />
                </button>
              )}
            </div>
          </div>

          <div className="speech-bubble-content">
            {loading ? (
              <div className="speech-bubble-thinking">
                <span className="skeleton-dot" />
                <span className="skeleton-dot" />
                <span className="skeleton-dot" />
                <span>Analizando tu documento…</span>
              </div>
            ) : error ? (
              <div className="speech-bubble-error-box" role="alert">
                <div className="error-badge-row">
                  <i className="pixelart-icons-font-alert" aria-hidden />
                  <strong>Error al procesar la respuesta:</strong>
                </div>
                <div className="error-message-text">
                  {error || 'No se pudo conectar con el servicio de IA.'}
                </div>
                <div className="error-help-hint">
                  {error.includes('429') || error.includes('Rate limit') ? (
                    <span>Límite de peticiones alcanzado. Espera un minuto e inténtalo de nuevo.</span>
                  ) : error.includes('404') ? (
                    <span>El endpoint <code>/api/chat</code> no está respondiendo en este entorno (si estás en <code>vite dev</code>, asegúrate de correr con Vercel CLI o configurar la API).</span>
                  ) : error.includes('500') || error.includes('GEMINI_API_KEY') || error.includes('502') ? (
                    <span>El servicio de IA falló o falta configurar <code>GEMINI_API_KEY</code> en tu servidor o Vercel. Reintenta en unos segundos.</span>
                  ) : error.includes('fetch') || error.includes('Failed to fetch') || error.includes('NetworkError') ? (
                    <span>Sin conexión con el servidor. Revisa tu internet y que la app esté desplegada con <code>/api/chat</code> disponible.</span>
                  ) : (
                    <span>Reintenta la consulta. Si persiste, recarga la página y vuelve a subir el PDF.</span>
                  )}
                </div>
                <button type="button" className="btn btn-secondary small" onClick={regenerate} style={{ marginTop: 8 }}>
                  <i className="pixelart-icons-font-reload" aria-hidden /> Reintentar consulta
                </button>
              </div>
            ) : cleanedAi ? (
              <div className="speech-bubble-text">
                {renderRichText(cleanedAi)}
                {lastAiMsg?.citations && lastAiMsg.citations.length > 0 && (
                  <div className="ai-citations-row" aria-label="Fuentes del documento">
                    <span className="citations-label">
                      Fuentes{lastAiMsg.searchMode ? ` · ${lastAiMsg.searchMode === 'hybrid' ? 'híbrida (vectorial + léxica → RRF)' : 'léxica'}` : ''}:
                    </span>
                    {lastAiMsg.citations.map((c, idx) => (
                      <details key={idx} className="citation-badge citation-details">
                        <summary title={c.snippet}>📄 Pág. {c.pageNumber}</summary>
                        <div className="citation-snippet">
                          <q>{c.snippet}</q>
                          {c.matchType && <span className="citation-match"> · {c.matchType}</span>}
                          {' · '}
                          <button
                            type="button"
                            className="citation-goto"
                            onClick={() => gotoPage(c.pageNumber)}
                            aria-label={`Ver página ${c.pageNumber} en el visor`}
                          >
                            Ver página →
                          </button>
                        </div>
                      </details>
                    ))}
                  </div>
                )}
                <div className="ai-actions-row">
                  <button type="button" className="ai-action-btn" onClick={() => lastAiMsg && void handleCopy(lastAiMsg.id, lastAiMsg.content)} aria-label="Copiar respuesta">
                    ⧉ Copiar
                  </button>
                  <button type="button" className="ai-action-btn" onClick={() => lastAiMsg && handleDownloadMd(lastAiMsg)} aria-label="Descargar respuesta en Markdown">
                    ⬇ .md
                  </button>
                  {lastAiMsg && copiedId === lastAiMsg.id && <span className="ai-copied-hint" role="status">¡Copiado!</span>}
                </div>
              </div>
            ) : (
              <div className="speech-bubble-welcome">
                <div className="welcome-header-line">
                  <p>¡Hola! Soy <strong>compe</strong>, tu analista de documentos PDF.</p>
                  {isTtsSupported() && (
                    <button
                      type="button"
                      className="btn-hear-welcome"
                      onClick={() => speak('¡Hola! Soy compe, tu analista de documentos. Arrastra tu archivo PDF para comenzar.')}
                      title="Escuchar saludo"
                      aria-label="Escuchar saludo"
                    >
                      <i className="pixelart-icons-font-volume" aria-hidden /> Escuchar
                    </button>
                  )}
                </div>
                {pdfDoc ? (
                  <>
                    <p className="subtext">
                      He leído y vectorizado <strong>{pdfDoc.filename}</strong> ({pdfDoc.totalPages} páginas · {pdfDoc.chunks.length} fragmentos). Pregúntame cualquier detalle del documento.
                    </p>
                    <button
                      type="button"
                      className="btn btn-secondary small"
                      onClick={() => window.dispatchEvent(new Event('copixi:open-viewer'))}
                    >
                      🔍 Buscar en el documento
                    </button>
                  </>
                ) : (
                  <div className="welcome-dropzone" onClick={onOpenFilePicker} role="button" tabIndex={0}>
                    <div className="dropzone-icon-ring">
                      <i className="pixelart-icons-font-folder" aria-hidden />
                    </div>
                    <div className="dropzone-text">
                      <strong className="dropzone-title">Arrastra y suelta tu PDF aquí</strong>
                      <span className="dropzone-hint">Solo documentos <strong>PDF (.pdf)</strong> · o haz clic para explorar</span>
                    </div>
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      </div>

      {messages.length > 0 && (
        <div className="chat-history-toggle-row">
          <button
            type="button"
            className="btn btn-secondary small"
            onClick={() => setChatLogOpen((o) => !o)}
            aria-expanded={chatLogOpen}
          >
            <i className={`pixelart-icons-font-${chatLogOpen ? 'chevron-up' : 'message'}`} aria-hidden />
            {chatLogOpen ? 'Ocultar historial de chat' : `Ver historial completo (${messages.length})`}
          </button>
          <button
            type="button"
            className="btn btn-secondary small"
            onClick={clearChat}
            title="Limpiar conversación"
          >
            <i className="pixelart-icons-font-trash" aria-hidden /> Limpiar
          </button>
          {onOpenFilePicker && (
            <button
              type="button"
              className="btn btn-secondary small"
              onClick={onOpenFilePicker}
              title="Cargar otro documento PDF"
            >
              <i className="pixelart-icons-font-upload" aria-hidden /> Cambiar archivo
            </button>
          )}
        </div>
      )}

      {chatLogOpen && (
        <div className="chat-expanded-log card" ref={scrollRef} role="log" aria-live="polite">
          {messages.map((m, i) => {
            if (!m.content) return null
            return (
              <div key={i} className={`excel-msg excel-msg-${m.role === 'user' ? 'user' : 'ai'}`}>
                <div className="excel-msg-body">
                  {renderRichText(cleanAI(m.content))}
                  {m.citations && m.citations.length > 0 && (
                    <div className="ai-citations-row" aria-label="Fuentes del documento">
                      <span className="citations-label">
                        Fuentes{m.searchMode ? ` · ${m.searchMode === 'hybrid' ? 'híbrida (vectorial + léxica → RRF)' : 'léxica'}` : ''}:
                      </span>
                      {m.citations.map((c, idx) => (
                        <details key={idx} className="citation-badge citation-details">
                          <summary title={c.snippet}>📄 Pág. {c.pageNumber}</summary>
                          <div className="citation-snippet">
                            <q>{c.snippet}</q>
                            {c.matchType && <span className="citation-match"> · {c.matchType}</span>}
                            {' · '}
                            <button
                              type="button"
                              className="citation-goto"
                              onClick={() => gotoPage(c.pageNumber)}
                              aria-label={`Ver página ${c.pageNumber} en el visor`}
                            >
                              Ver página →
                            </button>
                          </div>
                        </details>
                      ))}
                    </div>
                  )}
                  {m.role === 'assistant' && (
                    <div className="ai-actions-row">
                      <button type="button" className="ai-action-btn" onClick={() => void handleCopy(m.id, m.content)} aria-label="Copiar respuesta">
                        ⧉ Copiar
                      </button>
                      {copiedId === m.id && <span className="ai-copied-hint" role="status">¡Copiado!</span>}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
          {error && (
            <div className="excel-chat-error" role="alert">
              <div>
                <strong>Error en la petición:</strong>
                <p style={{ margin: '4px 0 0', fontSize: 12 }}>{error || 'Error de conexión con el servidor.'}</p>
              </div>
              <button type="button" className="btn btn-secondary small" onClick={regenerate}>Reintentar</button>
            </div>
          )}
        </div>
      )}

      <div className="excel-dock">
        {(followUps.length > 0 ? followUps : suggestions).length > 0 && (
          <div className="smart-suggestions" aria-label={followUps.length > 0 ? 'Preguntas de seguimiento' : 'Sugerencias rápidas'}>
            {(followUps.length > 0 ? followUps : suggestions).map((q, i) => (
              <button key={i} type="button" className="suggestion-chip" onClick={() => ask(q)} disabled={loading}>
                <span className="chip-sparkle" aria-hidden>✦</span> {q}
              </button>
            ))}
          </div>
        )}

        <form className="excel-dock-input" onSubmit={submit}>
          {onOpenFilePicker && (
            <button
              type="button"
              className="dock-attach-btn"
              onClick={onOpenFilePicker}
              title="Subir documento PDF (.pdf)"
              aria-label="Subir PDF"
            >
              <i className="pixelart-icons-font-upload" aria-hidden />
            </button>
          )}
          {getDictationCtor() && (
            <button
              type="button"
              className={`dock-attach-btn dock-mic-btn${listening ? ' recording' : ''}`}
              onClick={toggleDictation}
              disabled={loading}
              title={listening ? 'Detener dictado' : 'Dictar pregunta por voz'}
              aria-label={listening ? 'Detener dictado' : 'Dictar pregunta por voz'}
              aria-pressed={listening}
            >
              <span aria-hidden>{listening ? '⏹' : '🎙️'}</span>
            </button>
          )}
          <input
            className="excel-text-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={pdfDoc ? 'Pregunta sobre tu documento…' : 'Sube un PDF y pregúntame lo que quieras…'}
            aria-label="Escribe tu consulta"
            disabled={loading}
          />
          {loading ? (
            <button type="button" className="btn btn-primary btn-dock" onClick={stop} aria-label="Detener">
              <i className="pixelart-icons-font-close" aria-hidden /> Detener
            </button>
          ) : (
            <button type="submit" className="btn btn-primary btn-dock" disabled={!input.trim()} aria-label="Enviar">
              <i className="pixelart-icons-font-send" aria-hidden /> Enviar
            </button>
          )}
        </form>
      </div>
    </div>
  )
}
