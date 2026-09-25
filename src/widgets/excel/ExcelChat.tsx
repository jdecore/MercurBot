import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useDashboard } from '../../shared/lib/DashboardContext'
import { speak, getMuted, setMuted as setTtsMuted, isTtsSupported, cancel as cancelTts, isSpeaking, speakInteraction } from '../../shared/lib/tts'
import type { MascotaMood } from '../../entities/robot/types'
import { ragClient } from '../../shared/lib/ragClient'
import { getChatHistory, saveChatHistory, clearChatHistory, type ChatHistoryMsg } from '../../shared/lib/storage'
import { Icon } from '../../shared/ui/Icon'
import { runRagPipeline, RAG_TOP_K, type RagPipelineHit, type RagPipelineMode } from '../../features/rag/ragPipeline'
import { getDictationSupport } from '../../shared/lib/dictation'
import { useVoiceSession } from '../../shared/lib/voiceSession'
import { splitChartBlock, stripChartBlock, type ChartSpec } from '../../shared/lib/chartJson'
import { verifyChartSpec } from '../../shared/lib/verifyChart'
import { formatPageRange, countSelectionFigures } from '../../shared/lib/chartFull'
import { pop, chime, startThinking, stopThinking, error as soundError, success as soundSuccess } from '../../shared/lib/sounds'
import type { ChartFullResultDetail } from '../pdf/ChartFullButton'
import { useLocale } from '../../shared/lib/locale'

// Fase C: gráfica SVG propia en chunk separado (no engorda el bundle inicial).
const ChartCard = lazy(() => import('../charts/ChartCard'))

function setMascotaMood(m: MascotaMood) {
  window.dispatchEvent(new CustomEvent('copixi:mascota-mood', { detail: m }))
}

type ChatMsg = ChatHistoryMsg

// Defense-in-depth: neutraliza javascript:/on* y etiquetas antes de que el
// texto toque cualquier renderizado. React ya escapa por defecto, pero el LLM
// puede generar contenido impredecible (HTML, event handlers).
function neutralizeHtml(str: string): string {
  return str
    .replace(/javascript\s*:/gi, 'blocked:')
    .replace(/on\w+\s*=\s*(['"]).*?\1/gi, '')
    .replace(/<\/?[^>]+>/g, '')
}

// Sanitiza texto del LLM o del usuario antes de renderizar.
// Solo neutraliza etiquetas/eventos/URLs peligrosas: NO se escapan entidades
// HTML porque todo se renderiza como nodos de texto React (que ya escapan).
// Escapar aquí causaba doble-escape visible (&#39;, &quot;, &amp;) en cada
// respuesta con apóstrofes, comillas o &.
export function sanitizeRichText(text: string): string {
  return neutralizeHtml(text)
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

// Píldora que indica qué proveedor+modelo generó la respuesta
// (el backend lo informa en el evento `start` del SSE y en los JSON).
export function ModelPill({ model }: { model?: string }) {
  const { t } = useLocale()
  if (!model) return null
  return (
    <span className="model-pill" title={t.modelPill(model)}>
      ✦ {model}
    </span>
  )
}

// Etiqueta humana del tipo de coincidencia RAG (la UI es española,
// el motor devuelve claves técnicas).
export function matchTypeLabel(matchType?: string, t?: ReturnType<typeof useLocale>['t']): string | null {
  if (matchType === 'lexical') return t?.matchLexical ?? 'literal'
  if (matchType === 'vector') return t?.matchVector ?? 'semántica'
  if (matchType === 'hybrid') return t?.matchHybrid ?? 'combinada'
  return matchType || null
}

// La voz lee solo la primera frase: suena humano en vez de recitar el informe.
function firstSentence(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  const m = clean.match(/^.{20,}?[.!?…](\s|$)/)
  return (m ? m[0] : clean.slice(0, 180)).trim()
}

// Nombre corto para el placeholder del dock (sin .pdf, máx. 28 chars).
function truncateName(name: string): string {
  const base = name.replace(/\.pdf$/i, '')
  return base.length > 28 ? `${base.slice(0, 27)}…` : base
}

// Idea 1 — aviso sin gráfica con contexto real: qué alcance se analizó y
// cuántas cifras hay en local (heurística de tokens numéricos, la misma del
// pre-chequeo). Distingue "documento narrativo" de "cifras sin serie".
// Puro, nunca lanza; null si no aplica.
function describeNoChart(pages: number[] | null | undefined, t: ReturnType<typeof useLocale>['t']): string | null {
  if (!pages || pages.length === 0) return null
  const range = formatPageRange(pages)
  let n: number | null = null
  try {
    n = countSelectionFigures(pages.flatMap((p) => ragClient.getPageTexts(p)).map((t) => ({ text: t })))
  } catch {
    n = null
  }
  if (n === null) return t.noChartRange(range)
  if (n === 0) return t.noChartNarrative(range)
  return t.noChartSingular(range, n)
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

function renderInlineWithCites(text: string, keyPrefix: string, t: ReturnType<typeof useLocale>['t']): React.ReactNode[] {
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
        title={t.viewPage(pageNum)}
        aria-label={t.viewPage(pageNum)}
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

function renderRichText(text: string, t: ReturnType<typeof useLocale>['t']): React.ReactNode {
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
          <div key={key++} className="ai-table-wrap">
            <table className="ai-table">
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
            </table>
          </div>,
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
            <li key={idx}>{renderInlineWithCites(it, `ul${key}-${idx}`, t)}</li>
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
            <li key={idx}>{renderInlineWithCites(it, `ol${key}-${idx}`, t)}</li>
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
    blocks.push(<p key={key++}>{renderInlineWithCites(para.join(' '), `p${key}`, t)}</p>)
  }
  return <>{blocks}</>
}

export function ExcelChat({ onOpenFilePicker }: { onOpenFilePicker?: () => void }) {
  const { pdfDoc } = useDashboard()
  const { t, locale } = useLocale()

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

  // Live voice session (Phase 6): continuous mic, auto-send 1.2s silence, barge-in, volume meter
  const {
    active: voiceActive,
    interim: voiceInterim,
    error: voiceError,
    start: startVoice,
    stop: stopVoice,
    clearError: clearVoiceError,
  } = useVoiceSession({
    lang: 'es-ES',
    onFinalText: (text) => {
      // Auto-send recognized text
      setInput('')
      pop()
      window.dispatchEvent(new CustomEvent('copixi:eye-target', { detail: { direction: 'center' } }))
      void runQuery(text)
    },
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
        { id: `u-cf-${now}`, role: 'user', content: `${t.cfTitle}${scope}` },
        { id: `a-cf-${now}`, role: 'assistant', content: d.text, chartPages: d.analyzedPages, model: d.model },
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

  useEffect(() => {
    const handler = (e: Event) => {
      const text = (e as CustomEvent<string>).detail
      if (!text) return
      const msg: ChatMsg = {
        id: `a-wf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        role: 'assistant',
        content: text,
        model: 'workflow',
      }
      setMessages((prev) => [...prev, msg])
    }
    window.addEventListener('copixi:append-message', handler as EventListener)
    return () => window.removeEventListener('copixi:append-message', handler as EventListener)
  }, [])

  useEffect(() => {
    const handler = (e: Event) => {
      const preset = (e as CustomEvent<string>).detail
      if (!preset) return
      const userMsg: ChatMsg = {
        id: `u-wf-${Date.now()}`,
        role: 'user',
        content: `Ejecutar automatización: ${preset}`,
      }
      setMessages((prev) => [...prev, userMsg])
    }
    window.addEventListener('copixi:run-workflow', handler as EventListener)
    return () => window.removeEventListener('copixi:run-workflow', handler as EventListener)
  }, [])

  // EngineStatus (top-bar): publica modo RAG + modelo de la última
  // respuesta + streaming. Solo lectura, sin backend (§8, §11).
  useEffect(() => {
    let last: ChatMsg | null = null
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant' && messages[i].content) {
        last = messages[i]
        break
      }
    }
    window.dispatchEvent(new CustomEvent('copixi:engine-status', {
      detail: {
        mode: last?.searchMode ?? null,
        model: last?.model ?? null,
        streaming: status === 'submitted' || status === 'streaming',
      },
    }))
  }, [messages, status])

  async function handleCopy(id: string, text: string) {
    const ok = await copyText(stripChartBlock(cleanAI(text)))
    if (ok) speakInteraction('copy-response')
    if (ok) {
      setCopiedId(id)
      setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 2000)
    }
  }

  function handleDownloadMd(msg: ChatMsg) {
    const idx = messages.findIndex((m) => m.id === msg.id)
    const prevUser = [...messages.slice(0, idx)].reverse().find((m) => m.role === 'user')
    const base = (pdfDoc?.filename ?? t.docFallback).replace(/\.pdf$/i, '') || t.docFallback
    const sources = (msg.citations ?? []).map((c) => `- Pág. ${c.pageNumber}: ${c.snippet}`).join('\n')
    const body = `# ${base}\n\n${prevUser ? `**Pregunta:** ${prevUser.content}\n\n` : ''}**Respuesta:**\n\n${stripChartBlock(cleanAI(msg.content))}\n\n${sources ? `**Fuentes:**\n\n${sources}\n` : ''}`
    downloadMarkdown(`${base}.md`, body)
    speakInteraction('export')
  }

  async function runQuery(text: string) {
    if (loading) return
    const trimmed = text.trim()
    if (!trimmed) return

    // Abort any in-flight request before starting a new one to prevent
    // concurrent streams corrupting state.
    abortRef.current?.abort()

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
    speakInteraction('search-query')

    // Sin índice no hay qué buscar: respuesta local honesta sin quemar cuota
    // de IA (PDF escaneado sin texto o indexación fallida). El LLM sin
    // fragmentos solo puede responder en genérico.
    if (pdfDoc && ragClient.getState().chunkCount === 0) {
      const msg = t.scannedPdfError
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
          filename: pdfDoc?.filename ?? ragHits[0]?.docName ?? t.docFallback,
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
        body: JSON.stringify({ messages: history, context: payloadContext, lang: locale }),
        signal: controller.signal,
      })

      if (!res.ok || !res.body) {
        let detail = `HTTP ${res.status}`
        try {
          const j = (await res.json()) as { error?: string; detail?: string }
          if (j?.error) detail = `HTTP ${res.status} — ${j.detail ? `${j.error}: ${j.detail}` : j.error}`
        } catch { /* cuerpo no-JSON (p. ej. 504 del gateway): se conserva HTTP status */ }
        throw new Error(detail)
      }

      setStatus('streaming')
      setMascotaMood('pensando')
      startThinking()
      // Robot eyes look down at the response being generated
      window.dispatchEvent(new CustomEvent('copixi:eye-target', { detail: { direction: 'down' } }))

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let acc = ''
      // El backend anuncia el proveedor+modelo en el evento `start`
      // (píldora UI). Se guarda en el mensaje al llegar cada delta.
      let streamModel: string | undefined

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
            const evt = JSON.parse(payload) as { type: string; delta?: string; message?: string; model?: string }
            if (evt.type === 'start' && typeof evt.model === 'string' && evt.model) {
              streamModel = evt.model
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantMsg.id ? { ...m, model: streamModel } : m))
              )
            } else if (evt.type === 'text-delta' && typeof evt.delta === 'string') {
              acc += evt.delta
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsg.id
                    ? { ...m, content: acc, citations: citations.length ? citations : undefined, searchMode, model: streamModel ?? m.model }
                    : m
                )
              )
            } else if (evt.type === 'error') {
              throw new Error(evt.message || t.errServer)
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
            const evt = JSON.parse(payload) as { type: string; delta?: string; message?: string; model?: string }
            if (evt.type === 'start' && typeof evt.model === 'string' && evt.model) {
              streamModel = evt.model
            } else if (evt.type === 'text-delta' && typeof evt.delta === 'string') {
              acc += evt.delta
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsg.id
                    ? { ...m, content: acc, citations: citations.length ? citations : undefined, searchMode, model: streamModel ?? m.model }
                    : m
                )
              )
            } else if (evt.type === 'error') {
              throw new Error(evt.message || t.errServer)
            }
          } catch (e) {
            if (e instanceof Error && (e as any).type === 'error') throw e
          }
        }
      }

      setStatus('done')
      setMascotaMood('exito')
      stopThinking()
      // Robot eyes return to center after response
      window.dispatchEvent(new CustomEvent('copixi:eye-target', { detail: { direction: 'center' } }))
      const hasChart = splitChartBlock(acc).chart
      if (hasChart) soundSuccess()
      else chime()
      if (!getMuted() && acc) speak(firstSentence(stripChartBlock(cleanAI(acc))))
    } catch (e) {
      // Detener es una acción del usuario, no un error: limpia sin alarmar.
      if ((e instanceof DOMException && e.name === 'AbortError') || (e instanceof Error && e.name === 'AbortError')) {
        stopThinking()
        setStatus('idle')
        setMascotaMood('neutro')
        setMessages((prev) => prev.filter((m) => m.id !== assistantMsg.id))
        return
      }
      const msg = e instanceof Error ? e.message : 'Error desconocido'
      setError(msg)
      setMascotaMood('enojado')
      setStatus('error')
      stopThinking()
      soundError()
      // Drop the empty assistant placeholder so the UI stays clean
      setMessages((prev) => prev.filter((m) => m.id !== assistantMsg.id))
    } finally {
      abortRef.current = null
    }
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || loading) return
    if (voiceActive) stopVoice()
    const t = input.trim()
    setInput('')
    pop()
    // Eyes look at chat area (response will appear here)
    window.dispatchEvent(new CustomEvent('copixi:eye-target', { detail: { direction: 'center' } }))
    void runQuery(t)
  }

  const handleMicToggle = () => {
    if (voiceActive) {
      stopVoice()
    } else {
      clearVoiceError()
      startVoice()
    }
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
    const empty = { text: '', chart: null as ChartSpec | null, dropped: 0, total: 0, rejected: false, noChart: false, chartPages: null as number[] | null, noChartText: null as string | null }
    if (!lastAiMsg) return empty
    const { text, chart: rawChart } = splitChartBlock(lastAiMsg.content)
    // Fase D: ninguna cifra llega al SVG sin existir en el documento.
    // Fase E: chartPages restringe al rango analizado bajo demanda.
    const pages = lastAiMsg.chartPages ?? undefined
    const v = verifyChartSpec(rawChart, (p) => ragClient.getPageTexts(p), pages)
    const noChart = rawChart === null && pages !== undefined
    return {
      text: cleanAI(text),
      chart: v.spec,
      dropped: v.dropped,
      total: v.total,
      rejected: rawChart !== null && v.spec === null,
      // El mensaje vino del botón Generar gráfica pero el modelo no devolvió
      // bloque chart-json (sin cifras comparables): aviso honesto con
      // contexto real (idea 1) en vez de silencio.
      noChart,
      chartPages: pages ?? null,
      noChartText: noChart ? describeNoChart(pages, t) : null,
    }
  }, [lastAiMsg])

  if (!pdfDoc) return null

  return (
    <div className="excel-chat-container" aria-label="Chat de MercurBot">
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
                  {error || t.errConnection}
                </div>
                <div className="error-help-hint">
                  {error.includes('429') || error.includes('Rate limit') ? (
                    <span>Límite de peticiones alcanzado. Espera un minuto e inténtalo de nuevo.</span>
                  ) : error.includes('404') ? (
                    <span>El endpoint <code>/api/chat</code> no está respondiendo en este entorno (si estás en <code>vite dev</code>, asegúrate de correr con Vercel CLI o configurar la API).</span>
                  ) : error.includes('500') || error.includes('GEMINI_API_KEY') || error.includes('502') ? (
                    <span>El servicio de IA falló o falta configurar una key en tu servidor o Vercel (<code>GEMINI_API_KEY</code>, <code>GROQ_API_KEY</code> u <code>OPENROUTER_API_KEY</code>). Reintenta en unos segundos.</span>
                  ) : error.includes('504') ? (
                    <span>{t.timeoutError}</span>
                  ) : error.includes('fetch') || error.includes('Failed to fetch') || error.includes('NetworkError') ? (
                    <span>Sin conexión con el servidor. Revisa tu internet y que la app esté desplegada con <code>/api/chat</code> disponible.</span>
                  ) : (
                    <span>{t.retryError}</span>
                  )}
                </div>
                <button type="button" className="btn btn-secondary small" onClick={regenerate} style={{ marginTop: 8 }}>
                  <Icon name="reload" size={14} /> {t.retryBtn}
                </button>
              </div>
            ) : cleanedAi.text ? (
              <div className="speech-bubble-text">
                {renderRichText(sanitizeRichText(cleanedAi.text), t)}
                {lastAiMsg?.citations && lastAiMsg.citations.length > 0 && (
                      <div className="ai-citations-row" aria-label={t.sourcesAria}>
                    <span className="citations-label">
                      Lo encontré en{lastAiMsg.searchMode ? ` · ${lastAiMsg.searchMode === 'hybrid' ? 'búsqueda combinada' : 'búsqueda literal'}` : ''}:
                    </span>
                    {lastAiMsg.citations.map((c, idx) => (
                      <details key={idx} className="citation-badge citation-details">
                        <summary title={c.snippet}><Icon name="file" size={14} /> Pág. {c.pageNumber}</summary>
                        <div className="citation-snippet">
                          <q>{c.snippet}</q>
                            {matchTypeLabel(c.matchType, t) && <span className="citation-match"> · {matchTypeLabel(c.matchType, t)}</span>}
                          {' · '}
                          <button
                            type="button"
                            className="citation-goto"
                            onClick={() => gotoPage(c.pageNumber, c.snippet)}
                              aria-label={t.viewPage(c.pageNumber)}
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
                      {t.chartDiscarded}
                  </div>
                )}
                {cleanedAi.noChart && cleanedAi.noChartText && (
                  <div className="chart-notice" role="status">
                    {cleanedAi.noChartText}
                  </div>
                )}
                <div className="ai-actions-row">
                  <ModelPill model={lastAiMsg?.model} />
                  <button type="button" className="ai-action-btn" onClick={() => lastAiMsg && void handleCopy(lastAiMsg.id, lastAiMsg.content)} aria-label={t.copyResponse}>
                    <Icon name="copy" size={14} /> {t.copyBtn}
                  </button>
                  <button type="button" className="ai-action-btn" onClick={() => lastAiMsg && handleDownloadMd(lastAiMsg)} aria-label={t.downloadMdAria}>
                    <Icon name="download" size={14} /> .md
                  </button>
                  {lastAiMsg && copiedId === lastAiMsg.id && <span className="ai-copied-hint" role="status">¡Copiado!</span>}
                </div>
              </div>
            ) : pdfDoc ? (
              <div className="speech-bubble-idle">
                <p>{t.placeholderDoc(pdfDoc.filename)}</p>
              </div>
            ) : null}

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
            {chatLogOpen ? t.chatLogHide : t.chatLogShow(messages.length)}
          </button>
          <button
            type="button"
            className="btn btn-secondary small"
            onClick={clearChat}
            title={t.clearChatAria}
          >
            <Icon name="trash" size={14} /> {t.clearChat}
          </button>
          {onOpenFilePicker && (
            <button
              type="button"
              className="btn btn-secondary small"
              onClick={onOpenFilePicker}
              title="Cargar otro documento PDF"
            >
              <Icon name="upload" size={14} /> {t.changeFile}
            </button>
          )}
        </div>
      )}

      {chatLogOpen && (
        <div className="chat-expanded-log card" ref={scrollRef} role="log" aria-live="polite">
          {messages.map((m) => {
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
            const msgNoChart = m.role === 'assistant' && !msgSplit?.chart && msgPages !== undefined
            return (
              <div key={m.id} className={`excel-msg excel-msg-${m.role === 'user' ? 'user' : 'ai'}`}>
                <div className="excel-msg-body">
                  {renderRichText(sanitizeRichText(msgText), t)}
                  {m.citations && m.citations.length > 0 && (
                  <div className="ai-citations-row" aria-label={t.sourcesAria}>
                      <span className="citations-label">
                        Lo encontré en{m.searchMode ? ` · ${m.searchMode === 'hybrid' ? 'búsqueda combinada' : 'búsqueda literal'}` : ''}:
                      </span>
                      {m.citations.map((c, idx) => (
                        <details key={idx} className="citation-badge citation-details">
                          <summary title={c.snippet}><Icon name="file" size={14} /> Pág. {c.pageNumber}</summary>
                          <div className="citation-snippet">
                            <q>{c.snippet}</q>
                          {matchTypeLabel(c.matchType, t) && <span className="citation-match"> · {matchTypeLabel(c.matchType, t)}</span>}
                            {' · '}
                            <button
                              type="button"
                              className="citation-goto"
                              onClick={() => gotoPage(c.pageNumber, c.snippet)}
                            aria-label={t.viewPage(c.pageNumber)}
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
                      <ModelPill model={m.model} />
                      <button type="button" className="ai-action-btn" onClick={() => void handleCopy(m.id, m.content)} aria-label="Copiar respuesta">
                        <Icon name="copy" size={14} /> {t.copyBtn}
                      </button>
                      {copiedId === m.id && <span className="ai-copied-hint" role="status">¡Copiado!</span>}
                    </div>
                  )}
                  {msgVer?.spec && (
                    <>
                      {msgVer.dropped > 0 && (
                        <div className="chart-notice" role="status">
                          {t.noDataVerified(msgVer.dropped, msgVer.total)}
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
                    {t.chartDiscarded}
                    </div>
                  )}
                  {msgNoChart && (
                    <div className="chart-notice" role="status">
                      {describeNoChart(msgPages ?? undefined, t) ?? t.noChartRange('the analyzed scope')}
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
                <p style={{ margin: '4px 0 0', fontSize: 12 }}>{error || t.errConnection}</p>
              </div>
              <button type="button" className="btn btn-secondary small" onClick={regenerate}>Reintentar</button>
            </div>
          )}
        </div>
      )}

      <div className="excel-dock">
        <form className="excel-dock-input" onSubmit={submit}>
          {(() => {
            const support = getDictationSupport()
            const unavailableTitle =
              support === 'no-api'
                ? t.dictNoApi
                : support === 'insecure-context'
                  ? t.dictNoHttps
                  : voiceActive
                    ? t.dictStop
                    : t.dictStart
            return (
              <button
                type="button"
                className={`dock-attach-btn dock-mic-btn${voiceActive ? ' recording' : ''}`}
                onClick={handleMicToggle}
                disabled={loading || support !== 'supported'}
                title={unavailableTitle}
                aria-label={support === 'supported' ? (voiceActive ? t.dictStop : t.dictStart) : unavailableTitle}
                aria-pressed={voiceActive}
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
              title={muted ? t.ttsOn : t.ttsOff}
              aria-label={muted ? t.ttsOn : t.ttsOff}
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
              title={t.stopAudio}
              aria-label={t.stopAudio}
            >
              <Icon name="pause" size={16} />
            </button>
          )}
          <input
            className="excel-text-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={pdfDoc ? t.inputPlaceholder(truncateName(pdfDoc.filename)) : t.inputPlaceholderEmpty}
            aria-label={t.inputAria}
            disabled={loading}
          />
          {loading ? (
            <button type="button" className="btn btn-primary btn-dock" onClick={stop} aria-label={t.stopBtn}>
              <Icon name="close" size={16} /> {t.stopBtn}
            </button>
          ) : (
            <button type="submit" className="btn btn-primary btn-dock" disabled={!input.trim()} aria-label={t.sendBtn}>
              <Icon name="send" size={16} /> {t.sendBtn}
            </button>
          )}
        </form>
        {(voiceActive || voiceInterim || voiceError) && (
          <p className="dock-voice-hint" role="status" aria-live="polite">
            {voiceError ? (
              voiceError
            ) : (
              <>
                <span className="dock-voice-dot" aria-hidden="true" />
                {t.listening} {voiceInterim ? `«${voiceInterim}»` : t.speakNow}
              </>
            )}
          </p>
        )}
      </div>
    </div>
  )
}
