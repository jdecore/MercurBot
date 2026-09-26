import MiniSearch from 'minisearch'
import type { PdfChunk } from '../pdf/extractors/pdf'
import { classifyHeuristic, type QueryClass } from '../../shared/lib/laya'

export interface WorkerIndexPayload {
  docId: string
  docName: string
  chunks: PdfChunk[]
}

export interface WorkerSearchPayload {
  query: string
  topK?: number
  searchMode?: 'literal' | 'semantic'
}

export interface RagSearchResultItem {
  id: string
  docId: string
  docName: string
  pageNumber: number
  chunkIndex: number
  text: string
  score: number
  matchType: 'hybrid' | 'vector' | 'lexical'
}

export interface WorkerResponse {
  type: 'PROGRESS' | 'INDEX_COMPLETE' | 'SEARCH_RESULTS' | 'STATUS' | 'ERROR'
  payload: any
}

// State
let miniSearch: MiniSearch<PdfChunk> | null = null
let chunkStore = new Map<string, PdfChunk>()
let vectorStore = new Map<string, Float32Array>()
let pipeline: any = null
let modelReady = false
let fallbackLexicalOnly = false

const MODEL_NAME = 'Xenova/all-MiniLM-L6-v2'
const BATCH_SIZE = 8 // Small batch to prevent iOS Safari worker OOM (<128MB)

// Cosine similarity on L2-normalized vectors is simply the dot product
function dotProduct(a: Float32Array, b: Float32Array): number {
  let dot = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
  }
  return dot
}

// L2 Normalization in-place
function normalizeL2(vec: Float32Array): Float32Array {
  let norm = 0
  for (let i = 0; i < vec.length; i++) {
    norm += vec[i] * vec[i]
  }
  norm = Math.sqrt(norm)
  if (norm > 0) {
    for (let i = 0; i < vec.length; i++) {
      vec[i] /= norm
    }
  }
  return vec
}

// Initialize MiniSearch instance
function initMiniSearch(): MiniSearch<PdfChunk> {
  return new MiniSearch<PdfChunk>({
    fields: ['text'],
    storeFields: ['id', 'docId', 'docName', 'pageNumber', 'chunkIndex', 'text', 'tokenCountEstimate'],
    searchOptions: {
      boost: { text: 2 },
      fuzzy: 0.2,
      prefix: true,
    },
  })
}

// Lazy load Transformers pipeline with graceful fallback
async function getPipeline(): Promise<any> {
  if (pipeline) return pipeline
  if (fallbackLexicalOnly) return null

  try {
    self.postMessage({
      type: 'PROGRESS',
      payload: { phase: 'model_download', percent: 10, message: 'Cargando modelo de embeddings...' },
    })

    const { pipeline: createPipeline, env } = await import('@huggingface/transformers')
    env.allowLocalModels = false
    env.allowRemoteModels = true

    // Configure onnxruntime-web single-threaded via transformers.js backend
    // to avoid SharedArrayBuffer (COEP blocks SAB in Vite blob-URL workers)
    if (env.backends?.onnx?.wasm) {
      env.backends.onnx.wasm.numThreads = 1
      env.backends.onnx.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/'
    }

    pipeline = await createPipeline('feature-extraction', MODEL_NAME, {
      progress_callback: (progressInfo: any) => {
        if (progressInfo.status === 'progress') {
          self.postMessage({
            type: 'PROGRESS',
            payload: {
              phase: 'model_download',
              percent: Math.round(progressInfo.progress ?? 0),
              message: `Descargando motor semántico (${Math.round(progressInfo.progress ?? 0)}%)...`,
            },
          })
        } else if (progressInfo.status === 'initiate') {
          self.postMessage({
            type: 'PROGRESS',
            payload: {
              phase: 'model_download',
              percent: 10,
              message: `Descargando ${progressInfo.name || 'modelo'}...`,
            },
          })
        } else if (progressInfo.status === 'done') {
          self.postMessage({
            type: 'PROGRESS',
            payload: {
              phase: 'model_download',
              percent: 90,
              message: `Modelo descargado, inicializando...`,
            },
          })
        }
      },
    })

    modelReady = true
    return pipeline
  } catch (err) {
    console.warn('[RAG Worker] Falló carga de modelo vectorial. Activando Fallback Léxico.', err)
    fallbackLexicalOnly = true
    self.postMessage({
      type: 'PROGRESS',
      payload: { phase: 'complete', percent: 100, message: 'Modo léxico activo (modelo no disponible).' },
    })
    self.postMessage({
      type: 'STATUS',
      payload: { mode: 'lexical_only', reason: 'WASM model failed or memory exceeded' },
    })
    return null
  }
}

// OPFS Persistence Helpers (Origin Private File System inside Worker)
// Formato: header Uint32 [count, dim] + por entrada: id (64 bytes) + vector (dim floats).
// La versión anterior guardaba header [count] con dim implícito 384; el lector
// acepta ambos (Fase 24B).
const LEGACY_DIM = 384

async function saveVectorsToOPFS(docId: string, vectors: Map<string, Float32Array>) {
  try {
    if (!navigator.storage?.getDirectory) return
    if (vectors.size === 0) return
    const root = await navigator.storage.getDirectory()
    const dir = await root.getDirectoryHandle('copixi_vectors', { create: true })
    const fileHandle = await dir.getFileHandle(`${docId}.bin`, { create: true })
    const writable = await fileHandle.createWritable()

    try {
      // Write entry count + vector dim
      const first = vectors.values().next().value as Float32Array | undefined
      const header = new Uint32Array([vectors.size, first?.length ?? 0])
      await writable.write(header)

      for (const [chunkId, vec] of vectors) {
        const idBytes = new TextEncoder().encode(chunkId.padEnd(64, ' '))
        await writable.write(idBytes)
        await writable.write(vec as unknown as BufferSource)
      }
      await writable.close()
    } catch (err) {
      try { await writable.abort() } catch { /* ignore */ }
      throw err
    }
  } catch (err) {
    console.warn('[RAG Worker] OPFS write skipped or unavailable', err)
  }
}

/**
 * Fase 24B: recupera vectores persistidos de un documento ya visto.
 * Retorna null si no hay caché, está corrupta o no cubre todos los chunks
 * actuales (los chunk IDs derivan del docId estable de la Fase 24A).
 */
async function loadVectorsFromOPFS(docId: string): Promise<Map<string, Float32Array> | null> {
  try {
    if (!navigator.storage?.getDirectory) return null
    const root = await navigator.storage.getDirectory()
    const dir = await root.getDirectoryHandle('copixi_vectors')
    const fileHandle = await dir.getFileHandle(`${docId}.bin`)
    const buf = await (await fileHandle.getFile()).arrayBuffer()
    if (buf.byteLength < 8) return null

    const header = new Uint32Array(buf.slice(0, 8))
    const count = header[0]
    const dimFromFile = header[1]
    const isNewFormat =
      dimFromFile > 0 && dimFromFile <= 2048 &&
      buf.byteLength === 8 + count * (64 + dimFromFile * 4)
    const dim = isNewFormat ? dimFromFile : LEGACY_DIM
    const base = isNewFormat ? 8 : 4
    if (!isNewFormat && buf.byteLength !== 4 + count * (64 + dim * 4)) return null
    if (count === 0 || count > 10000) return null

    const out = new Map<string, Float32Array>()
    const decoder = new TextDecoder()
    let offset = base
    for (let i = 0; i < count; i++) {
      const id = decoder.decode(new Uint8Array(buf, offset, 64)).trim()
      offset += 64
      const vec = new Float32Array(buf.slice(offset, offset + dim * 4))
      offset += dim * 4
      if (vec.length !== dim || !id) return null
      out.set(id, vec)
    }
    return out
  } catch {
    return null
  }
}

// Index Document: MiniSearch + Vector Batches
async function handleIndexDocument({ docId, docName, chunks }: WorkerIndexPayload) {
  miniSearch = initMiniSearch()
  chunkStore.clear()
  vectorStore.clear()

  // 1. Index in MiniSearch immediately (< 10ms)
  for (const chunk of chunks) {
    chunkStore.set(chunk.id, chunk)
  }
  miniSearch.addAll(chunks)

  self.postMessage({
    type: 'PROGRESS',
    payload: { phase: 'lexical_ready', percent: 30, message: 'Índice léxico BM25 listo.' },
  })

  // Fase 24B: si los vectores de este documento ya están en OPFS (mismo docId
  // estable de la Fase 24A), se cargan y se salta la vectorización.
  const cached = await loadVectorsFromOPFS(docId)
  if (cached && cached.size === chunks.length && chunks.every((c) => cached.has(c.id))) {
    vectorStore = cached
    self.postMessage({
      type: 'PROGRESS',
      payload: {
        phase: 'vectors_cached',
        percent: 95,
        message: `Búsqueda inteligente recuperada del dispositivo (${cached.size} fragmentos, sin recompute).`,
      },
    })
    self.postMessage({
      type: 'INDEX_COMPLETE',
      payload: { docId, docName, chunkCount: chunks.length, mode: 'hybrid' },
    })
    return
  }

  // 2. Vectorize in small batches (if model available)
  const pipe = await getPipeline()
  if (!pipe) {
    // Only lexical available
    self.postMessage({
      type: 'INDEX_COMPLETE',
      payload: { docId, docName, chunkCount: chunks.length, mode: 'lexical_only' },
    })
    return
  }

  const total = chunks.length
  for (let i = 0; i < total; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE)
    const texts = batch.map((c) => `passage: ${c.text}`)

    try {
      const output = await pipe(texts, { pooling: 'mean', normalize: true })
      const dims = output.dims[1]

      for (let j = 0; j < batch.length; j++) {
        const slice = output.dims.length > 1
          ? output.data.slice(j * dims, (j + 1) * dims)
          : output.data
        const vec = normalizeL2(new Float32Array(Array.from(slice as unknown as number[])))
        vectorStore.set(batch[j].id, vec)
      }
    } catch (batchErr) {
      console.warn(`[RAG Worker] Error en lote ${i}-${i + BATCH_SIZE}`, batchErr)
    }

    const percent = Math.min(99, Math.round(30 + ((i + BATCH_SIZE) / total) * 65))
    self.postMessage({
      type: 'PROGRESS',
      payload: {
        phase: 'vectorizing',
        percent,
        indexed: Math.min(total, i + BATCH_SIZE),
        total,
        message: `Vectorizando fragmentos (${Math.min(total, i + BATCH_SIZE)}/${total})...`,
      },
    })

    // Yield control for GC in worker
    await new Promise((resolve) => setTimeout(resolve, 5))
  }

  // Persist to OPFS in background
  saveVectorsToOPFS(docId, vectorStore)

  self.postMessage({
    type: 'INDEX_COMPLETE',
    payload: { docId, docName, chunkCount: chunks.length, mode: 'hybrid' },
  })
}

// Hybrid Search with RRF (Reciprocal Rank Fusion) + Laya gatekeeper
async function handleSearch({ query, topK = 3, searchMode }: WorkerSearchPayload) {
  if (!miniSearch || chunkStore.size === 0) {
    self.postMessage({ type: 'SEARCH_RESULTS', payload: { query, results: [] } })
    return
  }

  // Use searchMode hint from app-level routing (classifyIntent) when available.
  // Falls back to classifyHeuristic for backward compatibility.
  const queryClass: QueryClass = searchMode === 'literal' ? 'literal'
    : searchMode === 'semantic' ? 'semantic'
    : classifyHeuristic(query)
  const classification = { class: queryClass, confidence: queryClass === 'literal' ? 0.8 : 0.6 }

  // 1. Lexical Search (always runs)
  const lexicalMatches = miniSearch.search(query).slice(0, 15)
  const lexicalRanks = new Map<string, number>()
  lexicalMatches.forEach((m, idx) => lexicalRanks.set(m.id, idx + 1))

  // 2. Vector Search (skip for high-confidence literal queries)
  const vectorRanks = new Map<string, number>()
  const skipVector = queryClass === 'literal' && classification.confidence > 0.7

  if (!skipVector) {
    const pipe = await getPipeline()
    if (pipe && vectorStore.size > 0) {
      try {
        const qOutput = await pipe(`query: ${query}`, { pooling: 'mean', normalize: true })
        const slice = qOutput.dims.length > 1 ? qOutput.data.slice(0, qOutput.dims[1]) : qOutput.data
        const qVec = normalizeL2(new Float32Array(Array.from(slice as unknown as number[])))

        const scored: { id: string; score: number }[] = []
        for (const [id, cVec] of vectorStore) {
          scored.push({ id, score: dotProduct(qVec, cVec) })
        }
        scored.sort((a, b) => b.score - a.score)
        scored.slice(0, 15).forEach((s, idx) => vectorRanks.set(s.id, idx + 1))
      } catch (vErr) {
        console.warn('[RAG Worker] Vector query failed. Usando solo léxico.', vErr)
      }
    }
  }

  // 3. Reciprocal Rank Fusion (RRF)
  const candidateIds = new Set<string>([...lexicalRanks.keys(), ...vectorRanks.keys()])
  const rrfK = 60
  const fusedScores: { id: string; score: number; matchType: 'hybrid' | 'vector' | 'lexical' }[] = []

  for (const id of candidateIds) {
    const lexRank = lexicalRanks.get(id)
    const vecRank = vectorRanks.get(id)

    let score = 0
    let matchType: 'hybrid' | 'vector' | 'lexical' = 'lexical'

    if (lexRank !== undefined && vecRank !== undefined) {
      score = 1.0 / (rrfK + lexRank) + 1.0 / (rrfK + vecRank)
      matchType = 'hybrid'
    } else if (vecRank !== undefined) {
      score = 1.0 / (rrfK + vecRank)
      matchType = 'vector'
    } else if (lexRank !== undefined) {
      score = 1.0 / (rrfK + lexRank)
      matchType = 'lexical'
    }

    fusedScores.push({ id, score, matchType })
  }

  fusedScores.sort((a, b) => b.score - a.score)

  const finalHits: RagSearchResultItem[] = fusedScores.slice(0, topK).map((item) => {
    const chunk = chunkStore.get(item.id)!
    return {
      id: chunk.id,
      docId: chunk.docId,
      docName: chunk.docName,
      pageNumber: chunk.pageNumber,
      chunkIndex: chunk.chunkIndex,
      text: chunk.text,
      score: item.score,
      matchType: item.matchType,
    }
  })

  self.postMessage({
    type: 'SEARCH_RESULTS',
    payload: { query, results: finalHits, classification },
  })
}

// Worker Message Dispatcher
self.onmessage = async (e: MessageEvent) => {
  const { action, payload } = e.data || {}
  try {
    switch (action) {
      case 'INDEX_DOCUMENT':
        await handleIndexDocument(payload)
        break
      case 'SEARCH':
        await handleSearch(payload)
        break
      case 'CLEAR':
        miniSearch = null
        chunkStore.clear()
        vectorStore.clear()
        self.postMessage({ type: 'STATUS', payload: { cleared: true } })
        break
      case 'PING':
        self.postMessage({ type: 'STATUS', payload: { status: 'alive', modelReady, fallbackLexicalOnly } })
        break
      case 'PREWARM': {
        // Send initial progress so the UI shows something is happening
        self.postMessage({
          type: 'PROGRESS',
          payload: { phase: 'model_download', percent: 5, message: 'Descargando motor semántico...' },
        })
        // Heartbeat timer: CDN may lack Content-Length so progress_callback
        // never fires with real percentages. Send fake increments every 2s.
        let pct = 5
        const heartbeat = setInterval(() => {
          pct = Math.min(pct + 3, 90)
          self.postMessage({
            type: 'PROGRESS',
            payload: { phase: 'model_download', percent: pct, message: `Descargando motor semántico (${pct}%)...` },
          })
        }, 2000)
        getPipeline().then((pipe) => {
          clearInterval(heartbeat)
          self.postMessage({
            type: 'PROGRESS',
            payload: { phase: 'complete', percent: 100, message: pipe ? 'Motor semántico listo.' : 'Modo léxico activo.' },
          })
        }).catch(() => {
          clearInterval(heartbeat)
          self.postMessage({
            type: 'PROGRESS',
            payload: { phase: 'complete', percent: 100, message: 'Modo léxico activo.' },
          })
        })
        break
      }
      default:
        console.warn(`[RAG Worker] Acción no reconocida: ${action}`)
    }
  } catch (err) {
    self.postMessage({
      type: 'ERROR',
      payload: { message: err instanceof Error ? err.message : String(err) },
    })
  }
}
