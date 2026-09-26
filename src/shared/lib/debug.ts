/**
 * MercurBot hidden debugger.
 *
 * Features:
 * - `window.__MERUCBOT_DEBUG__` with live state
 * - `__merucbot.check()` console command
 * - Structured console logs for milestones
 * - Hidden toggle: Ctrl+Shift+D
 * - Zero UI impact; only visible in DevTools
 */

export interface DebugState {
  enabled: boolean
  prewarm: {
    embeddingsReady: boolean
    embeddingsProgress: number
    embeddingsMessage: string
  }
  engine: {
    mode: 'hybrid' | 'lexical' | null
    model: string | null
    streaming: boolean
  }
  rag: {
    indexed: boolean
    chunks: number
    lastError: string | null
  }
}

type DebugListener = (state: DebugState) => void

const STATE: DebugState = {
  enabled: false,
  prewarm: {
    embeddingsReady: false,
    embeddingsProgress: 0,
    embeddingsMessage: '',
  },
  engine: {
    mode: null,
    model: null,
    streaming: false,
  },
  rag: {
    indexed: false,
    chunks: 0,
    lastError: null,
  },
}

const listeners = new Set<DebugListener>()

export function setDebugEnabled(enabled: boolean): void {
  STATE.enabled = enabled
  if (enabled) {
    log('MercurBot Debugger enabled', 'use Ctrl+Shift+D to toggle')
    log('Commands:', '__merucbot.check()', '__merucbot.state()', '__merucbot.toggle()')
  } else {
    log('MercurBot Debugger disabled')
  }
  notify()
}

export function isDebugEnabled(): boolean {
  return STATE.enabled
}

export function updateDebugState(partial: Partial<DebugState>): void {
  if (!STATE.enabled) return
  Object.assign(STATE, partial)
  notify()
}

export function getDebugState(): Readonly<DebugState> {
  return STATE
}

export function onDebugStateChange(listener: DebugListener): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

function notify(): void {
  for (const cb of listeners) cb({ ...STATE })
}

export function initDebug(): () => void {
  if (typeof window === 'undefined') return () => {}

  const global = window as any
  global.__MERUCBOT_DEBUG__ = STATE
  global.__merucbot = global.__merucbot || {}
  registerConsoleCommands()

  const handler = (e: KeyboardEvent) => {
    if (e.ctrlKey && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
      e.preventDefault()
      setDebugEnabled(!STATE.enabled)
    }
  }
  window.addEventListener('keydown', handler)
  return () => window.removeEventListener('keydown', handler)
}

function log(...args: any[]): void {
  if (!STATE.enabled) return
  console.log('%c[MERCUCBOT DEBUG]', 'color:#9EE014;font-weight:bold', ...args)
}

function registerConsoleCommands(): void {
  const global = typeof window !== 'undefined' ? (window as any) : globalThis

  global.__merucbot = global.__merucbot || {}

  global.__merucbot.check = () => {
    const s = getDebugState()
    console.group('%c[MERCUCBOT] System check', 'color:#9EE014;font-weight:bold')
    console.log('Enabled:', s.enabled)
    console.log('Prewarm:', {
      embeddings: s.prewarm.embeddingsReady ? '✅' : '⏳',
      embeddingsProgress: `${s.prewarm.embeddingsProgress}%`,
      message: s.prewarm.embeddingsMessage || '-',
    })
    console.log('Engine:', {
      mode: s.engine.mode ?? 'unknown',
      model: s.engine.model ?? 'none',
      streaming: s.engine.streaming,
    })
    console.log('RAG:', {
      indexed: s.rag.indexed ? '✅' : '❌',
      chunks: s.rag.chunks,
      lastError: s.rag.lastError ?? 'none',
    })
    console.groupEnd()
    return s
  }

  global.__merucbot.state = () => {
    console.log('[MERCUCBOT] State:', getDebugState())
    return getDebugState()
  }

  global.__merucbot.toggle = () => {
    setDebugEnabled(!STATE.enabled)
    return STATE.enabled
  }

  registerTestFlow()

  log('Console commands registered: __merucbot.check(), __merucbot.state(), __merucbot.toggle(), __merucbot.testFlow()')
}

/* -------------------------------------------------------------------------- */
/*  __merucbot.testFlow() — console-only integration test                     */
/*  Verifies: prewarm (embeddings) → classifyQuery/classifyIntent (rules) → RAG */
/*  Usage:  __merucbot.toggle()  then  __merucbot.testFlow()                  */
/*  Options:  __merucbot.testFlow({ timeout: 120 })                           */
/*  - timeout: max seconds to wait for embeddings (default: 120)               */
/* -------------------------------------------------------------------------- */

function registerTestFlow(): void {
  const global = typeof window !== 'undefined' ? (window as any) : globalThis

  global.__merucbot.testFlow = async (opts?: { timeout?: number }) => {
    const { timeout = 120 } = opts ?? {}
    const t0 = Date.now()
    const elapsed = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`

    const hdr = (msg: string) =>
      console.log(`%c[MERCUCBOT TEST] ${msg}`, 'color:#9EE014;font-weight:bold')
    const ok = (msg: string) => console.log(`  ✅ ${msg}`)
    const fail = (msg: string) => console.log(`  ❌ ${msg}`)
    const info = (msg: string) => console.log(`  ℹ️  ${msg}`)
    const warn = (msg: string) => console.log(`  ⚠️  ${msg}`)

    const results: Record<string, string> = {}

    /* ---- F0: current state ------------------------------------------------ */
    hdr(`F0 — Estado actual (${elapsed()})`)
    const { isPrewarmStarted, getPrewarmState } = await import('./preload')
    const before = getPrewarmState()
    info(`prewarmStarted: ${isPrewarmStarted()}`)
    info(`embeddings: ${before.embeddingsReady ? '✅ ready' : '⏳ not ready'} (${before.embeddingsProgress}%)`)

    /* ---- F1: embeddings prewarm ------------------------------------------- */
    hdr(`F1 — Embeddings prewarm (${elapsed()})`)
    const { ragClient } = await import('./ragClient')
    const { onPrewarmProgress } = await import('./preload')

    if (before.embeddingsReady) {
      ok('Embeddings ya estaba listo — saltando re-descarga')
      results.embeddings = 'SKIP (ya listo)'
    } else {
      // Subscribe to prewarm events BEFORE re-triggering
      let lastPercent = before.embeddingsProgress
      let lastMessage = before.embeddingsMessage
      const unsub = onPrewarmProgress(() => {
        const s = getPrewarmState()
        lastPercent = s.embeddingsProgress
        lastMessage = s.embeddingsMessage
      })

      // Re-trigger: worker sends heartbeat even if already loading
      ragClient.prewarm()

      // Poll: wait for embeddingsReady or timeout
      const deadline = Date.now() + timeout * 1000
      let done = false
      while (Date.now() < deadline && !done) {
        await new Promise((r) => setTimeout(r, 2000))
        const s = getPrewarmState()
        if (s.embeddingsReady) {
          done = true
        } else if (s.embeddingsProgress !== lastPercent || s.embeddingsMessage !== lastMessage) {
          info(`progreso: ${s.embeddingsProgress}% — ${s.embeddingsMessage || '...'}`)
          lastPercent = s.embeddingsProgress
          lastMessage = s.embeddingsMessage
        }
      }
      unsub()

      const final = getPrewarmState()
      if (final.embeddingsReady) {
        ok(`Embeddings listo en ${elapsed()}`)
        results.embeddings = 'PASS'
      } else {
        fail(`Embeddings NO listo tras ${timeout}s (progress: ${final.embeddingsProgress}%)`)
        results.embeddings = 'FAIL'
      }
    }

    /* ---- F2: classifyQuery (searchMode rules, instant) --------------------- */
    hdr(`F2 — classifyQuery (${elapsed()})`)
    const { classifyQuery } = await import('./laya')
    const testQueries = [
      { q: '¿en qué página está el artículo 3?', expect: 'literal' },
      { q: 'resume este documento', expect: 'semantic' },
    ]
    let classifyOk = true
    for (const { q, expect: exp } of testQueries) {
      const t = Date.now()
      const result = classifyQuery(q)
      const ms = Date.now() - t
      const pass = result.class === exp
      if (pass) {
        ok(`"${q.slice(0, 30)}…" → ${result.class} (${result.method}, ${ms}ms)`)
      } else {
        fail(`"${q.slice(0, 30)}…" → ${result.class} (esperaba ${exp})`)
        classifyOk = false
      }
    }
    results.classify = classifyOk ? 'PASS' : 'FAIL'

    /* ---- F3: RAG state (if indexed) --------------------------------------- */
    hdr(`F3 — RAG state (${elapsed()})`)
    const ragState = ragClient.getState()
    if (ragState.isIndexing) {
      info(`Indexando... (${ragState.chunkCount} chunks, mode: ${ragState.mode})`)
      results.rag = 'INDEXING'
    } else if (ragState.mode !== 'idle') {
      ok(`Indexed: ${ragState.chunkCount} chunks, mode: ${ragState.mode}, doc: ${ragState.docName || '-'}`)
      // Try a search if chunks exist
      if (ragState.chunkCount > 0) {
        try {
          const hits = await ragClient.search('test', 3)
          if (hits.length > 0) {
            ok(`search("test") → ${hits.length} hits, top score: ${hits[0].score.toFixed(4)}, matchType: ${hits[0].matchType}`)
            for (const h of hits) {
              info(`  [Pág.${h.pageNumber}] ${h.text.slice(0, 80)}...`)
            }
            results.rag = 'PASS'
          } else {
            warn('search("test") devolvió 0 hits')
            results.rag = 'NO_HITS'
          }
        } catch (err) {
          fail(`search falló: ${err instanceof Error ? err.message : err}`)
          results.rag = 'FAIL'
        }
      } else {
        info('0 chunks — sube un PDF primero')
        results.rag = 'NO_DATA'
      }
    } else {
      info('Sin indexar — sube un PDF para probar RAG')
      results.rag = 'NO_INDEX'
    }

    /* ---- F4: classifyIntent (rule-based intent routing) -------------------- */
    hdr(`F4 — classifyIntent (${elapsed()})`)
    const { classifyIntent } = await import('./laya')
    const intentTests = [
      { q: '¿en qué página está el artículo 3?', expectAction: 'rag', expectSearch: 'literal', expectPageRef: true },
      { q: 'hola, ¿cómo estás?', expectAction: 'direct', expectPageRef: false },
      { q: 'resume este documento', expectAction: 'rag', expectSearch: 'semantic', expectSummary: true },
      { q: 'haz un gráfico de las ventas', expectAction: 'chart' },
      { q: '¿qué noticias hay hoy?', expectAction: 'web_search', expectWeb: true },
    ]
    let intentOk = true
    for (const { q, expectAction, expectSearch, expectPageRef, expectSummary, expectWeb } of intentTests) {
      const t = Date.now()
      const r = classifyIntent(q)
      const ms = Date.now() - t
      const pass = r.action === expectAction
        && (expectSearch === undefined || r.searchMode === expectSearch)
        && (expectPageRef === undefined || r.isPageRef === expectPageRef)
        && (expectSummary === undefined || r.isSummary === expectSummary)
        && (expectWeb === undefined || r.needsWeb === expectWeb)
      if (pass) {
        ok(`"${q.slice(0, 30)}…" → action=${r.action}(${r.actionConfidence.toFixed(2)}), search=${r.searchMode}(${r.searchModeConfidence.toFixed(2)}), pageRef=${r.isPageRef}, summary=${r.isSummary}, web=${r.needsWeb} [${ms}ms]`)
      } else {
        fail(`"${q.slice(0, 30)}…" → action=${r.action}, search=${r.searchMode}, pageRef=${r.isPageRef}, summary=${r.isSummary}, web=${r.needsWeb} (esperaba ${expectAction}/${expectSearch ?? '?'}/${expectPageRef ?? '?'}/${expectSummary ?? '?'}/${expectWeb ?? '?'}) [${ms}ms]`)
        intentOk = false
      }
    }
    results.intent = intentOk ? 'PASS' : 'FAIL'

    /* ---- Veredicto final -------------------------------------------------- */
    hdr(`VEREDICTO (${elapsed()})`)
    console.table({
      embeddings: results.embeddings || (before.embeddingsReady ? 'PASS (ya listo)' : '?'),
      classify: results.classify || '?',
      rag: results.rag || '?',
      intent: results.intent || '?',
    })
    const allPass = Object.values(results).every((v) => v === 'PASS' || v === 'SKIP' || v?.toString().startsWith('SKIP'))
    if (allPass) {
      ok('Todos los checks pasaron.')
    } else {
      warn('Algunos checks fallaron o están incompletos. Revisa arriba.')
    }

    return results
  }
}
