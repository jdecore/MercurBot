import { useEffect, useMemo, useRef, useState } from 'react'
import { useDashboard } from '../../state/DashboardContext'
import { speak, getMuted, setMuted as setTtsMuted, isTtsSupported, cancel as cancelTts, isSpeaking } from '../../lib/tts'
import type { MascotaMood } from '../../types/mascota'
import { ragClient } from '../../lib/ragClient'
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
const PAGE_CITE_RE = /\[P[áa]g\.?\s*(\d+)\]|\[P[áa]gina\s*(\d+)\]|\[p\.\s*(\d+)\]/gi

function renderInlineWithCites(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  const re = new RegExp(PAGE_CITE_RE.source, 'gi')
  let last = 0
  let m: RegExpExecArray | null
  let key = 0
  while ((m = re.exec(text))) {
    if (m.index > last) nodes.push(...renderInline(text.slice(last, m.index)).map((n, i) => <span key={`${keyPrefix}-t${key}-${i}`}>{n}</span>))
    const page = m[1] ?? m[2] ?? m[3] ?? '?'
    nodes.push(
      <span key={`${keyPrefix}-cite${key++}`} className="citation-badge citation-inline" title={`Fuente verificada: página ${page}`}>
        [Pág. {page}]
      </span>,
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

type ChatMsg = {
  id: string
  role: 'user' | 'assistant'
  content: string
  citations?: { pageNumber: number; snippet: string; matchType?: string }[]
  searchMode?: RagPipelineMode
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
  const abortRef = useRef<AbortController | null>(null)
  const lastQueryRef = useRef('')

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
                  {error.includes('404') ? (
                    <span>El endpoint <code>/api/chat</code> no está respondiendo en este entorno (si estás en <code>vite dev</code>, asegúrate de correr con Vercel CLI o configurar la API).</span>
                  ) : error.includes('500') || error.includes('GEMINI_API_KEY') ? (
                    <span>Falta configurar la variable de entorno <code>GEMINI_API_KEY</code> en tu servidor o Vercel.</span>
                  ) : (
                    <span>Verifica tu conexión y tu clave de Gemini API.</span>
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
                        </div>
                      </details>
                    ))}
                  </div>
                )}
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
                  <p className="subtext">
                    He leído y vectorizado <strong>{pdfDoc.filename}</strong> ({pdfDoc.totalPages} páginas · {pdfDoc.chunks.length} fragmentos). Pregúntame cualquier detalle del documento.
                  </p>
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
                          </div>
                        </details>
                      ))}
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
        {suggestions.length > 0 && (
          <div className="smart-suggestions" aria-label="Sugerencias rápidas">
            {suggestions.map((q, i) => (
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
