import MiniSearch from 'minisearch'
import type { PdfChunk } from '../data/extractors/pdf'
import type { RagSearchResultItem } from '../workers/rag.worker'

export type { RagSearchResultItem }

export interface RagProgressCallback {
  phase: string
  percent: number
  message: string
  indexed?: number
  total?: number
}

export interface RagClientState {
  isIndexing: boolean
  isReady: boolean
  mode: 'hybrid' | 'lexical_only' | 'idle'
  docName: string | null
  chunkCount: number
}

export interface DocSearchHit {
  pageNumber: number
  snippet: string
  chunkId: string
}

class RagClient {
  private worker: Worker | null = null
  private mainThreadMiniSearch: MiniSearch<PdfChunk> | null = null
  private mainThreadChunks = new Map<string, PdfChunk>()
  private state: RagClientState = {
    isIndexing: false,
    isReady: false,
    mode: 'idle',
    docName: null,
    chunkCount: 0,
  }
  private onProgressCb: ((progress: RagProgressCallback) => void) | null = null
  private searchResolvers = new Map<string, (results: RagSearchResultItem[]) => void>()
  private indexResolvers = new Map<string, () => void>()
  private currentDocId: string | null = null
  // true si la última búsqueda se resolvió por el watchdog léxico
  // (el worker tardó > timeoutMs). Sin esto, runRagPipeline reportaba
  // "búsqueda combinada" aunque los hits vinieran de MiniSearch local.
  private lastSearchUsedFallback = false

  constructor() {
    this.initWorker()
  }

  private initWorker() {
    if (typeof window === 'undefined') return

    try {
      this.worker = new Worker(
        new URL('../workers/rag.worker.ts', import.meta.url),
        { type: 'module' }
      )

      this.worker.onmessage = (e: MessageEvent) => {
        const { type, payload } = e.data || {}
        this.handleWorkerMessage(type, payload)
      }

      this.worker.onerror = (err) => {
        console.warn('[RagClient] Worker error detected. Activando fallback principal.', err)
        this.fallbackToMainThread()
      }
    } catch (err) {
      console.warn('[RagClient] No se pudo instanciar Web Worker. Modo directo en hilo principal.', err)
      this.fallbackToMainThread()
    }
  }

  private fallbackToMainThread() {
    this.state.mode = 'lexical_only'
    if (this.worker) {
      try { this.worker.terminate() } catch { /* ignore */ }
      this.worker = null
    }
  }

  private handleWorkerMessage(type: string, payload: any) {
    switch (type) {
      case 'PROGRESS':
        this.onProgressCb?.(payload)
        break

      case 'STATUS':
        if (payload.mode === 'lexical_only') {
          this.state.mode = 'lexical_only'
        }
        break

      case 'INDEX_COMPLETE':
        if (payload.docId !== this.currentDocId) {
          this.indexResolvers.delete(payload.docId)
          break
        }
        this.state.isIndexing = false
        this.state.isReady = true
        this.state.mode = payload.mode
        this.state.docName = payload.docName
        this.state.chunkCount = payload.chunkCount
        this.onProgressCb?.({
          phase: 'complete',
          percent: 100,
          message: `Documento indexado (${payload.chunkCount} fragmentos). Modo: ${payload.mode}.`,
        })
        // Resuelve al llamador que espera la indexación real (no solo el post).
        this.indexResolvers.get(payload.docId)?.()
        this.indexResolvers.delete(payload.docId)
        break

      case 'SEARCH_RESULTS': {
        const { query, results } = payload
        const resolver = this.searchResolvers.get(query)
        if (resolver) {
          this.lastSearchUsedFallback = false
          resolver(results)
          this.searchResolvers.delete(query)
        }
        break
      }

      case 'ERROR':
        console.error('[RagClient] Worker reportó error:', payload)
        this.state.isIndexing = false
        break
    }
  }

  public setProgressListener(cb: (progress: RagProgressCallback) => void) {
    this.onProgressCb = cb
  }

  public async indexDocument(docId: string, docName: string, chunks: PdfChunk[]): Promise<void> {
    this.currentDocId = docId
    this.state.isIndexing = true
    this.state.isReady = false
    this.state.docName = docName
    this.state.chunkCount = chunks.length

    // Limpia resolvers de indexaciones previas (evita que un INDEX_COMPLETE
    // tardío de un documento anterior resuelva la promesa de este nuevo).
    for (const [key] of this.indexResolvers) this.indexResolvers.delete(key)

    // Populate fallback Main Thread MiniSearch
    this.mainThreadChunks.clear()
    this.mainThreadMiniSearch = new MiniSearch<PdfChunk>({
      fields: ['text'],
      storeFields: ['id', 'docId', 'docName', 'pageNumber', 'chunkIndex', 'text', 'tokenCountEstimate'],
      searchOptions: { boost: { text: 2 }, fuzzy: 0.2, prefix: true },
    })
    for (const chunk of chunks) {
      this.mainThreadChunks.set(chunk.id, chunk)
    }
    this.mainThreadMiniSearch.addAll(chunks)

    if (this.worker) {
      this.worker.postMessage({
        action: 'INDEX_DOCUMENT',
        payload: { docId, docName, chunks },
      })
      // Espera a la indexación REAL del worker (antes retornaba al postear,
      // mostrando "¡Listo!" prematuramente y dejando que el complete posterior
      // sobrescribiera el subtítulo). Con timeout de seguridad: el índice
      // léxico local ya quedó usable arriba.
      await new Promise<void>((resolve) => {
        this.indexResolvers.set(docId, resolve)
        setTimeout(() => {
          if (this.indexResolvers.has(docId)) {
            this.indexResolvers.delete(docId)
            resolve()
          }
        }, 180000)
      })
    } else {
      // Main Thread immediate fallback
      this.state.isIndexing = false
      this.state.isReady = true
      this.state.mode = 'lexical_only'
      this.onProgressCb?.({
        phase: 'complete',
        percent: 100,
        message: `Índice léxico listo en modo ligero (${chunks.length} fragmentos).`,
      })
    }
  }

  public async search(query: string, topK = 3, timeoutMs = 8000): Promise<RagSearchResultItem[]> {
    if (!query.trim() || this.state.chunkCount === 0) return []

    // If worker is running, attempt search with Watchdog timeout
    if (this.worker) {
      return new Promise<RagSearchResultItem[]>((resolve) => {
        const timer = setTimeout(() => {
          console.warn('[RagClient] Worker Watchdog timeout excedido. Conmutando a búsqueda léxica local.')
          this.searchResolvers.delete(query)
          this.lastSearchUsedFallback = true
          resolve(this.searchMainThread(query, topK))
        }, timeoutMs)

        this.searchResolvers.set(query, (results) => {
          clearTimeout(timer)
          resolve(results)
        })

        this.worker!.postMessage({
          action: 'SEARCH',
          payload: { query, topK },
        })
      })
    }

    // Direct fallback
    this.lastSearchUsedFallback = true
    return this.searchMainThread(query, topK)
  }

  private searchMainThread(query: string, topK: number): RagSearchResultItem[] {
    if (!this.mainThreadMiniSearch) return []
    const hits = this.mainThreadMiniSearch.search(query).slice(0, topK)
    return hits.map((h) => {
      const chunk = this.mainThreadChunks.get(h.id)!
      return {
        id: chunk.id,
        docId: chunk.docId,
        docName: chunk.docName,
        pageNumber: chunk.pageNumber,
        chunkIndex: chunk.chunkIndex,
        text: chunk.text,
        score: h.score,
        matchType: 'lexical',
      }
    })
  }

  /**
   * Búsqueda en el documento (P1): devuelve coincidencias léxicas ordenadas
   * por página para navegar (click → visor). Síncrona e instantánea sobre el
   * índice MiniSearch del hilo principal.
   */
  public searchPages(query: string, limit = 20): DocSearchHit[] {
    const q = query.trim()
    if (!q || !this.mainThreadMiniSearch) return []
    const hits = this.mainThreadMiniSearch.search(q).slice(0, limit)
    return hits
      .map((h) => {
        const chunk = this.mainThreadChunks.get(h.id)
        if (!chunk) return null
        const text = String(chunk.text ?? '').replace(/\s+/g, ' ').trim()
        return {
          pageNumber: chunk.pageNumber,
          snippet: text.length > 140 ? `${text.slice(0, 140)}…` : text,
          chunkId: chunk.id,
        }
      })
      .filter((h): h is DocSearchHit => h !== null)
      .sort((a, b) => a.pageNumber - b.pageNumber)
  }

  public clear() {
    this.state = {
      isIndexing: false,
      isReady: false,
      mode: 'idle',
      docName: null,
      chunkCount: 0,
    }
    this.currentDocId = null
    this.mainThreadMiniSearch = null
    this.mainThreadChunks.clear()
    this.worker?.postMessage({ action: 'CLEAR' })
  }

  public getState(): RagClientState {
    return { ...this.state }
  }

  /**
   * Textos de los chunks de una página (Fase D): el verificador de gráficas
   * comprueba cada cifra contra ellos. Solo memoria local, sin LLM.
   */
  public getPageTexts(pageNumber: number): string[] {
    const out: string[] = []
    for (const chunk of this.mainThreadChunks.values()) {
      if (chunk.pageNumber === pageNumber && typeof chunk.text === 'string') out.push(chunk.text)
    }
    return out
  }

  /** true si la última búsqueda cayó al fallback léxico (watchdog o sin worker). */
  public didLastSearchUseFallback(): boolean {
    return this.lastSearchUsedFallback
  }
}

// Global Singleton instance for client access
export const ragClient = new RagClient()
