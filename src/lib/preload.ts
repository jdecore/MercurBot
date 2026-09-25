/**
 * Pre-warm: parallel model downloads at app startup.
 * Embeddings (23MB) + Laya (424MB) run in background.
 * Heuristic classifier works instantly while Laya downloads.
 */
import { isLayaCached, downloadLayaModel, loadLayaSession } from './laya'

let embeddingsReady = false
let layaReady = false
let prewarmStarted = false
let embeddingsProgress = 0
let embeddingsMessage = ''
let layaError: string | null = null
const listeners = new Set<() => void>()

export function onPrewarmProgress(cb: () => void): () => void {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}

function notify() { for (const cb of listeners) cb() }

export function getPrewarmState() {
  return {
    embeddingsReady,
    layaReady,
    embeddingsProgress,
    embeddingsMessage,
    layaError,
  }
}

/**
 * Start sequential pre-warm: embeddings first, then Laya.
 * Safe to call multiple times (idempotent).
 */
export async function prewarmModels(): Promise<void> {
  if (prewarmStarted) return
  prewarmStarted = true

  await prewarmEmbeddings()

  try {
    const cached = await isLayaCached()
    if (cached) {
      await loadLayaSession()
      layaReady = true
      layaError = null
      notify()
      return
    }
    await downloadLayaModel()
    await loadLayaSession()
    layaReady = true
    layaError = null
    notify()
  } catch (err) {
    layaError = err instanceof Error ? err.message : String(err)
    console.warn('[Prewarm] Laya download failed, using heuristic fallback.', err)
    notify()
  }
}

/**
 * Pre-warm the embeddings model by sending a PING to the worker.
 * The worker lazy-loads @huggingface/transformers on INDEX_DOCUMENT.
 * We trigger a lightweight load here so the model downloads in background.
 */
function prewarmEmbeddings(): Promise<void> {
  // Import ragClient and trigger a soft init
  return import('./ragClient').then(({ ragClient }) => {
    // The worker is already created in RagClient constructor.
    // Send a PING to ensure it's alive, then let the model download
    // happen naturally on first INDEX_DOCUMENT. For true pre-warm,
    // we send a fake index that gets replaced later.
    ragClient.setProgressListener((p) => {
      if (p.phase === 'model_download' && typeof p.percent === 'number') {
        embeddingsProgress = p.percent
        embeddingsMessage = p.message || ''
        notify()
      }
      if (p.phase === 'complete' || p.phase === 'lexical_ready') {
        embeddingsReady = true
        embeddingsProgress = 100
        notify()
      }
    })
  }).catch(() => {
    /* ragClient not available yet — embeddings will load on first index */
  })
}
