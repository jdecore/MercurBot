/**
 * Pre-warm: embeddings model download at app startup.
 * Intent classification is rule-based (laya.ts) — no model download needed.
 * Also performs one-time cleanup of the legacy Laya ONNX OPFS cache (~424MB).
 */
import { clearLegacyLayaCache } from './laya'

let embeddingsReady = false
let prewarmStarted = false
let embeddingsProgress = 0
let embeddingsMessage = ''
const listeners = new Set<() => void>()

export function onPrewarmProgress(cb: () => void): () => void {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}

function notify() { for (const cb of listeners) cb() }

export function getPrewarmState() {
  return {
    embeddingsReady,
    embeddingsProgress,
    embeddingsMessage,
  }
}

export function isPrewarmStarted(): boolean {
  return prewarmStarted
}

/**
 * Start pre-warm: embeddings model + legacy cache cleanup.
 * Safe to call multiple times (idempotent).
 */
export async function prewarmModels(): Promise<void> {
  if (prewarmStarted) return
  prewarmStarted = true

  // Remove the discarded Laya ONNX model from older versions (best-effort).
  void clearLegacyLayaCache()

  await prewarmEmbeddings()
}

/**
 * Pre-warm the embeddings model by sending PREWARM to the worker.
 * The worker lazy-loads @huggingface/transformers and downloads the model.
 * Progress events flow back through ragClient's progress listener.
 */
function prewarmEmbeddings(): Promise<void> {
  return import('./ragClient').then(({ ragClient }) => {
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
    ragClient.prewarm()
  }).catch(() => {
    /* ragClient not available yet — embeddings will load on first index */
  })
}
