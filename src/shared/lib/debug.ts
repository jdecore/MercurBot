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
    layaReady: boolean
    embeddingsProgress: number
    embeddingsMessage: string
    layaError: string | null
    layaProgress: number
    layaMessage: string
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
    layaReady: false,
    embeddingsProgress: 0,
    embeddingsMessage: '',
    layaError: null,
    layaProgress: 0,
    layaMessage: '',
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
      laya: s.prewarm.layaReady ? '✅' : '⏳',
      embeddingsProgress: `${s.prewarm.embeddingsProgress}%`,
      message: s.prewarm.embeddingsMessage || '-',
      layaError: s.prewarm.layaError || 'none',
      layaProgress: `${s.prewarm.layaProgress}%`,
      layaMessage: s.prewarm.layaMessage || '-',
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
/*  Verifies: prewarm (embeddings) → classifyQuery (Laya/heuristic) → RAG     */
/*  Usage:  __merucbot.toggle()  then  __merucbot.testFlow()                  */
/*  Options:  __merucbot.testFlow({ laya: true, timeout: 120 })               */
/*  - laya:    download the 424MB Laya model (default: false)                  */
/*  - timeout: max seconds to wait for embeddings (default: 120)               */
/* -------------------------------------------------------------------------- */

function registerTestFlow(): void {
  const global = typeof window !== 'undefined' ? (window as any) : globalThis

  global.__merucbot.testFlow = async (opts?: { laya?: boolean; timeout?: number }) => {
    const { laya: testLaya = false, timeout = 120 } = opts ?? {}
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
    info(`laya: ${before.layaReady ? '✅ ready' : '⏳ not ready'} layaError: ${before.layaError || 'none'}`)

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
        if (final.layaError) fail(`Error: ${final.layaError}`)
        results.embeddings = 'FAIL'
      }
    }

    /* ---- F2: classifyQuery (heuristic, instant) --------------------------- */
    hdr(`F2 — classifyQuery (${elapsed()})`)
    const { classifyQuery } = await import('./laya')
    const testQueries = [
      { q: '¿en qué página está el artículo 3?', expect: 'literal' },
      { q: 'resume este documento', expect: 'semantic' },
    ]
    let classifyOk = true
    for (const { q, expect: exp } of testQueries) {
      const t = Date.now()
      const result = await classifyQuery(q)
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

    /* ---- F3: Laya (optional, 424MB download) ------------------------------ */
    if (testLaya) {
      hdr(`F3 — Laya ONNX download (${elapsed()})`)
      const { isLayaCached, downloadLayaModel, loadLayaSession } = await import('./laya')
      const cached = await isLayaCached()
      info(`cached: ${cached}`)
      try {
        const t = Date.now()
        if (!cached) {
          info('Descargando ~424MB — esto tarda minutos...')
          await downloadLayaModel((phase, pct) => {
            if (phase === 'model' && pct % 10 === 0) info(`  download: ${pct}%`)
          })
        }
        await loadLayaSession()
        ok(`Laya listo en ${((Date.now() - t) / 1000).toFixed(1)}s`)

        // Verify it's actually working
        const r = await classifyQuery('artículo 3')
        if (r.method === 'laya') {
          ok(`classifyQuery usa Laya (class: ${r.class}, conf: ${r.confidence.toFixed(3)})`)
          results.laya = 'PASS'
        } else {
          warn('classifyQuery cayó a heuristic — Laya cargó pero falló la inferencia')
          results.laya = 'PARTIAL'
        }
      } catch (err) {
        fail(`Laya falló: ${err instanceof Error ? err.message : err}`)
        results.laya = 'FAIL'
      }
    } else {
      hdr(`F3 — Laya (${elapsed()})`)
      info('Saltado (usa __merucbot.testFlow({laya:true}) para probar)')
      results.laya = 'SKIP'
    }

    /* ---- F4: RAG state (if indexed) --------------------------------------- */
    hdr(`F4 — RAG state (${elapsed()})`)
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

    /* ---- Veredicto final -------------------------------------------------- */
    hdr(`VEREDICTO (${elapsed()})`)
    console.table({
      embeddings: results.embeddings || (before.embeddingsReady ? 'PASS (ya listo)' : '?'),
      classify: results.classify || '?',
      laya: results.laya || '?',
      rag: results.rag || '?',
    })
    const allPass = Object.values(results).every((v) => v === 'PASS' || v === 'SKIP')
    if (allPass) {
      ok('Todos los checks pasaron.')
    } else {
      warn('Algunos checks fallaron o están incompletos. Revisa arriba.')
    }

    return results
  }
}
