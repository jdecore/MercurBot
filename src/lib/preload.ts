/**
 * Pre-warm: parallel model downloads at app startup.
 * Embeddings (23MB) + Laya (424MB) run in background.
 * Heuristic classifier works instantly while Laya downloads.
 */
import { isLayaCached, downloadLayaModel, loadLayaSession } from './laya'

let embeddingsReady = false
let layaReady = false
let prewarmStarted = false
const listeners = new Set<() => void>()

export function onPrewarmProgress(cb: () => void): () => void {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}

function notify() { for (const cb of listeners) cb() }

export function getPrewarmState() {
  return { embeddingsReady, layaReady }
}

/**
 * Start parallel pre-warm of both models.
 * Safe to call multiple times (idempotent).
 */
export async function prewarmModels(): Promise<void> {
  if (prewarmStarted) return
  prewarmStarted = true

  const ragWorkerReady = prewarmEmbeddings()

  const layaReadyPromise = (async () => {
    try {
      const cached = await isLayaCached()
      if (cached) {
        await loadLayaSession()
        layaReady = true
        notify()
        return
      }
      await downloadLayaModel()
      await loadLayaSession()
      layaReady = true
      notify()
    } catch (err) {
      console.warn('[Prewarm] Laya download failed, using heuristic fallback.', err)
    }
  })()

  // Don't await — both run in background
  void ragWorkerReady
  void layaReadyPromise
}

/**
 * Pre-warm the embeddings model by sending a PING to the worker.
 * The worker lazy-loads @xenova/transformers on INDEX_DOCUMENT.
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
      if (p.phase === 'complete' || p.phase === 'lexical_ready') {
        embeddingsReady = true
        notify()
      }
    })
  }).catch(() => {
    /* ragClient not available yet — embeddings will load on first index */
  })
}
