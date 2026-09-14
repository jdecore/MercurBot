import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useDashboard } from '../../state/DashboardContext'
import { speak, getMuted, setMuted as setTtsMuted, isTtsSupported, cancel as cancelTts, isSpeaking } from '../../lib/tts'
import type { MascotaMood } from '../../types/mascota'
import { ragClient } from '../../lib/ragClient'
import { getChatHistory, saveChatHistory, clearChatHistory, type ChatHistoryMsg } from '../../lib/storage'
import { Icon } from '../ui/Icon'
import { runRagPipeline, RAG_TOP_K, type RagPipelineHit, type RagPipelineMode } from '../../lib/ragPipeline'
import { useDictation, getDictationSupport } from '../../lib/dictation'
import { splitChartBlock, stripChartBlock, type ChartSpec } from '../../lib/chartJson'
import { verifyChartSpec } from '../../lib/verifyChart'
import { formatPageRange } from '../../lib/chartFull'
import type { ChartFullResultDetail } from '../pdf/ChartFullButton'

// Fase C: gráfica SVG propia en chunk separado (no engorda el bundle inicial).
const ChartCard = lazy(() => import('../charts/ChartCard'))

function setMascotaMood(m: MascotaMood) {
  window.dispatchEvent(new CustomEvent('copixi:mascota-mood', { detail: m }))
}

type ChatMsg = ChatHistoryMsg

// Defense-in-depth: escapa entidades HTML y neutraliza javascript:/on* antes
// de que el texto toque cualquier renderizado. React ya escapa por defecto,
// pero el LLM puede generar contenido impredecible (HTML, event handlers).
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function neutralizeHtml(str: string): string {
  return str
    .replace(/javascript\s*:/gi, 'blocked:')
    .replace(/on\w+\s*=\s*(['"]).*?\1/gi, '')
    .replace(/<\/?[^>]+>/g, '')
}

// Sanitiza texto del LLM o del usuario antes de renderizar.
// Aplica escape HTML + eliminación de etiquetas/eventos/URLs peligrosas.
export function sanitizeRichText(text: string): string {
  return escapeHtml(neutralizeHtml(text))
}

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

// La voz lee solo la primera frase: suena humano en vez de recitar el informe.
function firstSentence(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  const m = clean.match(/^.{20,}?[.!?…](\s|$)/)
  return (m ? m[0] : clean.slice(0, 180)).trim()
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

function gotoPage(page: number, query?: string) {
  if (Number.isFinite(page) && page > 0) {
    // Fase B: con query (snippet fuente) el visor resalta el fragmento;
    // sin query (pills inline) solo navega a la página.
    window.dispatchEvent(new CustomEvent('copixi:goto-page', { detail: { page, query } }))
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
  const abortRef = useRef<AbortController | null>(null)
  const lastQueryRef = useRef('')
  const [dictationBase, setDictationBase] = useState('')

  // Dictado por voz: Web Speech API nativa (STT del navegador, sin deps).
  // continuous=true + segmentos finales acumulados + errores accionables.
  const {
    listening,
    interim: dictationInterim,
    dictationError,
    toggle: toggleDictation,
    stop: stopDictation,
    clearDictationError,
  } = useDictation({
    lang: 'es-ES',
    onFinalText: (text) => setInput((dictationBase ? dictationBase + ' ' : '') + text),
  })

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

  function isNearBottom(el: HTMLDivElement): boolean {
    return el.scrollHeight - el.scrollTop - el.clientHeight < 120
  }

  useEffect(() => {
    const el = scrollRef.current
    if (el && isNearBottom(el)) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    }
  }, [messages, loading])

  const docId = pdfDoc?.docId ?? null
  const docIdRef = useRef<string | null>(docId)

  // Historial por documento (P1): carga al cambiar de PDF…
  useEffect(() => {
    docIdRef.current = docId
    setMessages(docId ? getChatHistory(docId) : [])
    setError(null)
    setStatus('idle')
    setChatLogOpen(false)
    setCopiedId(null)
    lastQueryRef.current = ''
  }, [docId])

  // Fase E: el resultado del chart-full (botón del panel) entra al chat como
  // mensajes normales: pasa por el mismo pipeline (split → verificar → SVG)
  // y persiste en el historial del documento. Se ignora si cambió el doc.
  useEffect(() => {
    const handler = (e: Event) => {
      const d = (e as CustomEvent<ChartFullResultDetail>).detail
      if (!d || typeof d.text !== 'string' || !d.docId || d.docId !== docIdRef.current) return
      const range = formatPageRange(d.analyzedPages ?? [])
      const scope = d.truncated ? ` (${range} de ${d.totalPages} págs.)` : ` (${range})`
      const now = Date.now()
      setMessages((prev) => [
        ...prev,
        { id: `u-cf-${now}`, role: 'user', content: `Generar gráfica del documento${scope}` },
        { id: `a-cf-${now}`, role: 'assistant', content: d.text, chartPages: d.analyzedPages },
      ])
      setMascotaMood('exito')
    }
    window.addEventListener('copixi:chart-full-result', handler as EventListener)
    return () => window.removeEventListener('copixi:chart-full-result', handler as EventListener)
  }, [])

  // …y persiste al completar respuestas (localStorage, truncado en storage.ts).
  useEffect(() => {
    if (docId && messages.length > 0 && (status === 'done' || status === 'idle')) {
      saveChatHistory(docId, messages)
    }
  }, [messages, docId, status])

  async function handleCopy(id: string, text: string) {
    const ok = await copyText(stripChartBlock(cleanAI(text)))
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
    const body = `# ${base}\n\n${prevUser ? `**Pregunta:** ${prevUser.content}\n\n` : ''}**Respuesta:**\n\n${stripChartBlock(cleanAI(msg.content))}\n\n${sources ? `**Fuentes:**\n\n${sources}\n` : ''}`
    downloadMarkdown(`${base}.md`, body)
  }

  async function runQuery(text: string) {
    if (loading) return
    const trimmed = text.trim()
    if (!trimmed) return

    // Client-side rate limit backup (serverless: server token-bucket is
    // best-effort because Vercel instances don't share memory).
    const RL_KEY = 'copixi:chat:rl'
    const RL_WINDOW = 60_000
    const RL_MAX = 18
    try {
      const raw = localStorage.getItem(RL_KEY)
      const ts = raw ? Number(JSON.parse(raw).ts) : 0
      const count = raw ? Number(JSON.parse(raw).count) : 0
      const now = Date.now()
      if (now - ts < RL_WINDOW && count >= RL_MAX) {
        const wait = Math.ceil((RL_WINDOW - (now - ts)) / 1000)
        setError(`Límite de peticiones alcanzado. Espera ${wait}s e inténtalo de nuevo.`)
        return
      }
      const newCount = now - ts < RL_WINDOW ? count + 1 : 1
      localStorage.setItem(RL_KEY, JSON.stringify({ ts: now, count: newCount }))
    } catch {
      // localStorage full or unavailable: proceed, server still limits
    }

    lastQueryRef.current = trimmed
    setError(null)
    // Fija el documento de la consulta: si el usuario cambia de PDF a mitad
    // de búsqueda/streaming, la respuesta ajena se descarta (no se mezcla).
    const queryDocId = docIdRef.current

    const userMsg: ChatMsg = { id: `u-${Date.now()}`, role: 'user', content: trimmed }
    const assistantMsg: ChatMsg = { id: `a-${Date.now()}`, role: 'assistant', content: '' }
    const history = [...messages, userMsg].slice(-4).map((m) => ({ role: m.role, content: m.content }))

    setMessages((prev) => [...prev, userMsg, assistantMsg])
    setMascotaMood('escuchando')
    setStatus('submitted')

    // Sin índice no hay qué buscar: respuesta local honesta sin quemar cuota
    // de IA (PDF escaneado sin texto o indexación fallida). El LLM sin
    // fragmentos solo puede responder en genérico.
    if (pdfDoc && ragClient.getState().chunkCount === 0) {
      const msg =
        'No pude extraer texto de este documento — parece un PDF escaneado (solo imágenes). ' +
        'Copixi necesita texto para analizar: súbelo con texto seleccionable o pásalo por un OCR antes de cargarlo.'
      setMessages((prev) => prev.map((m) => (m.id === assistantMsg.id ? { ...m, content: msg } : m)))
      setStatus('done')
      setMascotaMood('neutro')
      return
    }

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

    // El documento cambió durante la búsqueda → descarta sin ruido.
    if (docIdRef.current !== queryDocId) {
      setMessages((prev) => prev.filter((m) => m.id !== assistantMsg.id))
      setStatus('idle')
      setMascotaMood('neutro')
      return
    }

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
        // Si el documento cambió a mitad del streaming, corta y descarta.
        if (docIdRef.current !== queryDocId) {
          try { await reader.cancel() } catch { /* ignore */ }
          break
        }
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

      if (docIdRef.current !== queryDocId) {
        setMessages((prev) => prev.filter((m) => m.id !== assistantMsg.id))
        setStatus('idle')
        setMascotaMood('neutro')
        return
      }

      // Flush remanente: si el stream terminó con un evento sin \n\n de cierre,
      // el bucle anterior lo dejó en buffer y no se procesó.
      const tail = buffer.trim()
      if (tail.startsWith('data:')) {
        const payload = tail.slice(5).trim()
        if (payload) {
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
          }
        }
      }

      setStatus('done')
      setMascotaMood('exito')
      if (!getMuted() && acc) speak(firstSentence(stripChartBlock(cleanAI(acc))))
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
    if (listening) stopDictation()
    const t = input.trim()
    setInput('')
    setDictationBase('')
    void runQuery(t)
  }

  const handleMicToggle = () => {
    if (!listening) {
      setDictationBase(input.trim())
      clearDictationError()
    }
    toggleDictation()
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

  const cleanedAi = useMemo(() => {
    const empty = { text: '', chart: null as ChartSpec | null, dropped: 0, total: 0, rejected: false, chartPages: null as number[] | null }
    if (!lastAiMsg) return empty
    const { text, chart: rawChart } = splitChartBlock(lastAiMsg.content)
    // Fase D: ninguna cifra llega al SVG sin existir en el documento.
    // Fase E: chartPages restringe al rango analizado bajo demanda.
    const pages = lastAiMsg.chartPages ?? undefined
    const v = verifyChartSpec(rawChart, (p) => ragClient.getPageTexts(p), pages)
    return {
      text: cleanAI(text),
      chart: v.spec,
      dropped: v.dropped,
      total: v.total,
      rejected: rawChart !== null && v.spec === null,
      chartPages: pages ?? null,
    }
  }, [lastAiMsg])

  return (
    <div className="excel-chat-container" aria-label="Chat de Copixi">
      <div className="speech-bubble-wrapper">
        <div className={`speech-bubble ${loading ? 'thinking' : ''}`} role="region" aria-live="polite">
          <div className="speech-bubble-tail" aria-hidden />

          <div className="speech-bubble-content">
            {loading ? (
              <div className="speech-bubble-thinking">
                <span className="skeleton-dot" />
                <span className="skeleton-dot" />
                <span className="skeleton-dot" />
                <span>Leyendo…</span>
              </div>
            ) : error ? (
              <div className="speech-bubble-error-box" role="alert">
                <div className="error-badge-row">
                  <Icon name="alert" size={16} />
                  <strong>Algo no salió bien:</strong>
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
                  <Icon name="reload" size={14} /> Reintentar consulta
                </button>
              </div>
            ) : cleanedAi.text ? (
              <div className="speech-bubble-text">
                {renderRichText(sanitizeRichText(cleanedAi.text))}
                {lastAiMsg?.citations && lastAiMsg.citations.length > 0 && (
                  <div className="ai-citations-row" aria-label="Fuentes del documento">
                    <span className="citations-label">
                      Lo encontré en{lastAiMsg.searchMode ? ` · ${lastAiMsg.searchMode === 'hybrid' ? 'búsqueda combinada' : 'búsqueda literal'}` : ''}:
                    </span>
                    {lastAiMsg.citations.map((c, idx) => (
                      <details key={idx} className="citation-badge citation-details">
                        <summary title={c.snippet}><Icon name="file" size={14} /> Pág. {c.pageNumber}</summary>
                        <div className="citation-snippet">
                          <q>{c.snippet}</q>
                          {c.matchType && <span className="citation-match"> · {c.matchType}</span>}
                          {' · '}
                          <button
                            type="button"
                            className="citation-goto"
                            onClick={() => gotoPage(c.pageNumber, c.snippet)}
                            aria-label={`Ver página ${c.pageNumber} en el visor`}
                          >
                            Ver página →
                          </button>
                        </div>
                      </details>
                    ))}
                  </div>
                )}
                {cleanedAi.chart && (
                  <>
                    {cleanedAi.dropped > 0 && (
                      <div className="chart-notice" role="status">
                        {cleanedAi.dropped} de {cleanedAi.total} datos no se verificaron en el documento; se muestran solo los verificados.
                      </div>
                    )}
                    <Suspense fallback={<div className="chart-skeleton" role="status">Dibujando gráfica…</div>}>
                      <ChartCard spec={cleanedAi.chart} />
                    </Suspense>
                    {cleanedAi.chartPages && (
                      <div className="chart-scope">Analizado: {formatPageRange(cleanedAi.chartPages)}.</div>
                    )}
                  </>
                )}
                {cleanedAi.rejected && (
                  <div className="chart-notice chart-rejected" role="status">
                    Gráfica descartada: los datos no se verificaron en el documento.
                  </div>
                )}
                <div className="ai-actions-row">
                  <button type="button" className="ai-action-btn" onClick={() => lastAiMsg && void handleCopy(lastAiMsg.id, lastAiMsg.content)} aria-label="Copiar respuesta">
                    <Icon name="copy" size={14} /> Copiar
                  </button>
                  <button type="button" className="ai-action-btn" onClick={() => lastAiMsg && handleDownloadMd(lastAiMsg)} aria-label="Descargar respuesta en Markdown">
                    <Icon name="download" size={14} /> .md
                  </button>
                  {lastAiMsg && copiedId === lastAiMsg.id && <span className="ai-copied-hint" role="status">¡Copiado!</span>}
                </div>
              </div>
            ) : pdfDoc ? (
              <div className="speech-bubble-idle">
                <p>¿Qué quieres saber de <strong>{pdfDoc.filename}</strong>?</p>
              </div>
            ) : (
              <div className="welcome-dropzone" onClick={onOpenFilePicker} role="button" tabIndex={0}>
                <div className="dropzone-icon-ring">
                  <Icon name="folder" size={22} />
                </div>
                <div className="dropzone-text">
                  <strong className="dropzone-title">Suelta tu PDF aquí — lo leo contigo</strong>
                  <span className="dropzone-hint">PDF con texto · o haz clic para buscarlo · nada se sube</span>
                </div>
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
            <Icon name={chatLogOpen ? 'chevron-up' : 'message'} size={14} />
            {chatLogOpen ? 'Ocultar historial de chat' : `Ver historial completo (${messages.length})`}
          </button>
          <button
            type="button"
            className="btn btn-secondary small"
            onClick={clearChat}
            title="Limpiar conversación"
          >
            <Icon name="trash" size={14} /> Limpiar
          </button>
          {onOpenFilePicker && (
            <button
              type="button"
              className="btn btn-secondary small"
              onClick={onOpenFilePicker}
              title="Cargar otro documento PDF"
            >
              <Icon name="upload" size={14} /> Cambiar archivo
            </button>
          )}
        </div>
      )}

      {chatLogOpen && (
        <div className="chat-expanded-log card" ref={scrollRef} role="log" aria-live="polite">
          {messages.map((m, i) => {
            if (!m.content) return null
            // Fase C: la gráfica vive en el mensaje; se extrae antes de sanitizar
            // (el escape HTML rompería el JSON). Función pura, apta en el map.
            const msgSplit = m.role === 'assistant' ? splitChartBlock(m.content) : null
            const msgText = msgSplit ? cleanAI(msgSplit.text) : cleanAI(m.content)
            // Fase D: verificación en vivo contra el índice del documento actual
            // (el historial es por documento, así que el índice corresponde).
            // Fase E: chartPages restringe al rango analizado bajo demanda.
            const msgPages = m.chartPages ?? undefined
            const msgVer = msgSplit?.chart ? verifyChartSpec(msgSplit.chart, (p) => ragClient.getPageTexts(p), msgPages) : null
            const msgRejected = !!msgSplit?.chart && !msgVer?.spec
            return (
              <div key={i} className={`excel-msg excel-msg-${m.role === 'user' ? 'user' : 'ai'}`}>
                <div className="excel-msg-body">
                  {renderRichText(sanitizeRichText(msgText))}
                  {m.citations && m.citations.length > 0 && (
                    <div className="ai-citations-row" aria-label="Fuentes del documento">
                      <span className="citations-label">
                        Lo encontré en{m.searchMode ? ` · ${m.searchMode === 'hybrid' ? 'búsqueda combinada' : 'búsqueda literal'}` : ''}:
                      </span>
                      {m.citations.map((c, idx) => (
                        <details key={idx} className="citation-badge citation-details">
                          <summary title={c.snippet}><Icon name="file" size={14} /> Pág. {c.pageNumber}</summary>
                          <div className="citation-snippet">
                            <q>{c.snippet}</q>
                            {c.matchType && <span className="citation-match"> · {c.matchType}</span>}
                            {' · '}
                            <button
                              type="button"
                              className="citation-goto"
                              onClick={() => gotoPage(c.pageNumber, c.snippet)}
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
                        <Icon name="copy" size={14} /> Copiar
                      </button>
                      {copiedId === m.id && <span className="ai-copied-hint" role="status">¡Copiado!</span>}
                    </div>
                  )}
                  {msgVer?.spec && (
                    <>
                      {msgVer.dropped > 0 && (
                        <div className="chart-notice" role="status">
                          {msgVer.dropped} de {msgVer.total} datos no se verificaron en el documento; se muestran solo los verificados.
                        </div>
                      )}
                      <Suspense fallback={<div className="chart-skeleton" role="status">Dibujando gráfica…</div>}>
                        <ChartCard spec={msgVer.spec} />
                      </Suspense>
                      {msgPages && (
                        <div className="chart-scope">Analizado: {formatPageRange(msgPages)}.</div>
                      )}
                    </>
                  )}
                  {msgRejected && (
                    <div className="chart-notice chart-rejected" role="status">
                      Gráfica descartada: los datos no se verificaron en el documento.
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
        <form className="excel-dock-input" onSubmit={submit}>
          {onOpenFilePicker && (
            <button
              type="button"
              className="dock-attach-btn"
              onClick={onOpenFilePicker}
              title="Subir documento PDF (.pdf)"
              aria-label="Subir PDF"
            >
              <Icon name="upload" size={16} />
            </button>
          )}
          {(() => {
            const support = getDictationSupport()
            const unavailableTitle =
              support === 'no-api'
                ? 'Dictado no disponible en este navegador (ej. Firefox): usa Chrome, Edge o Safari, o escribe la pregunta'
                : support === 'insecure-context'
                  ? 'El dictado requiere HTTPS o localhost: escribe la pregunta o abre la app en conexión segura'
                  : listening
                    ? 'Detener dictado'
                    : 'Dictar pregunta por voz'
            return (
              <button
                type="button"
                className={`dock-attach-btn dock-mic-btn${listening ? ' recording' : ''}`}
                onClick={handleMicToggle}
                disabled={loading || support !== 'supported'}
                title={unavailableTitle}
                aria-label={support === 'supported' ? (listening ? 'Detener dictado' : 'Dictar pregunta por voz') : unavailableTitle}
                aria-pressed={listening}
              >
                <Icon name="mic" size={16} />
              </button>
            )
          })()}
          {isTtsSupported() && (
            <button
              type="button"
              className={`dock-attach-btn${muted ? ' dock-muted' : ''}`}
              onClick={toggleMute}
              title={muted ? 'Activar voz de respuesta' : 'Silenciar voz de respuesta'}
              aria-label={muted ? 'Activar voz de respuesta' : 'Silenciar voz de respuesta'}
              aria-pressed={!muted}
            >
              <Icon name={muted ? 'volume-x' : 'volume'} size={16} />
            </button>
          )}
          {ttsSpeaking && (
            <button
              type="button"
              className="dock-attach-btn"
              onClick={cancelTts}
              title="Parar audio"
              aria-label="Parar audio"
            >
              <Icon name="pause" size={16} />
            </button>
          )}
          <input
            className="excel-text-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={pdfDoc ? 'Pregúntale algo a tu documento…' : 'Sube un PDF y conversamos…'}
            aria-label="Escribe tu consulta"
            disabled={loading}
          />
          {loading ? (
            <button type="button" className="btn btn-primary btn-dock" onClick={stop} aria-label="Detener">
              <Icon name="close" size={16} /> Detener
            </button>
          ) : (
            <button type="submit" className="btn btn-primary btn-dock" disabled={!input.trim()} aria-label="Enviar">
              <Icon name="send" size={16} /> Enviar
            </button>
          )}
        </form>
        {(listening || dictationInterim || dictationError) && (
          <p className="dock-voice-hint" role="status" aria-live="polite">
            {dictationError ? (
              dictationError
            ) : (
              <>
                <span className="dock-voice-dot" aria-hidden="true" />
                Escuchando… {dictationInterim ? `«${dictationInterim}»` : 'habla ahora'}
              </>
            )}
          </p>
        )}
      </div>
    </div>
  )
}
