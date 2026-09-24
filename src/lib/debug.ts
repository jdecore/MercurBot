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
    registerConsoleCommands()
  } else {
    log('Merucbot Debugger disabled')
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

  const handler = (e: KeyboardEvent) => {
    if (e.ctrlKey && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
      e.preventDefault()
      setDebugEnabled(!STATE.enabled)
    }
  }
  window.addEventListener('keydown', handler)
  log('MercurBot debugger ready. Press Ctrl+Shift+D to toggle.')
  return () => window.removeEventListener('keydown', handler)
}

function log(...args: any[]): void {
  if (!STATE.enabled) return
  console.log('%c[MERCUCBOT DEBUG]', 'color:#8b5cf6;font-weight:bold', ...args)
}

function registerConsoleCommands(): void {
  const global = typeof window !== 'undefined' ? (window as any) : globalThis

  global.__merucbot = global.__merucbot || {}

  global.__merucbot.check = () => {
    const s = getDebugState()
    console.group('%c[MERCUCBOT] System check', 'color:#8b5cf6;font-weight:bold')
    console.log('Enabled:', s.enabled)
    console.log('Prewarm:', {
      embeddings: s.prewarm.embeddingsReady ? '✅' : '⏳',
      laya: s.prewarm.layaReady ? '✅' : '⏳',
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

  log('Console commands registered: __merucbot.check(), __merucbot.state(), __merucbot.toggle()')
}
