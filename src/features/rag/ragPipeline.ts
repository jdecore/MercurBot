/**
 * MercurBot — Fase 4: Pipeline de Búsqueda RAG.
 *
 * Contrato explícito:
 *  - Modo vectorial activo (worker híbrido): Top 15 vectorial + Top 15
 *    MiniSearch (léxico) → fusión RRF (k=60) → Top 3.
 *    Implementado dentro de `src/workers/rag.worker.ts:handleSearch`.
 *    Este pipeline lo invoca pidiendo `topK=3` al worker.
 *  - Fallback (worker caído / modo lexical_only / timeout): Top 3 de
 *    MiniSearch directo (ver `ragClient.searchMainThread`).
 *
 * Este módulo hace el contrato visible y verificable desde el hilo
 * principal: expone el modo usado, normaliza los hits (página + texto
 * truncado) y garantiza como máximo `topK` fragmentos para inyectar
 * en `/api/chat` (§8: solo fragmentos, nunca el documento completo).
 */

import { ragClient } from '../../shared/lib/ragClient'
import type { RagSearchResultItem } from '../../entities/rag/worker'

export const RAG_TOP_K = 3
export const RAG_CANDIDATES_PER_CHANNEL = 15
/** Máx. caracteres por fragmento enviado al proxy (evita context oversize). */
export const RAG_MAX_CHARS_PER_HIT = 1200

export type RagPipelineMode = 'hybrid' | 'lexical_only'

export interface RagPipelineHit {
  id: string
  docId: string
  docName: string
  pageNumber: number
  chunkIndex: number
  text: string
  score: number
  matchType: 'hybrid' | 'vector' | 'lexical'
}

export interface RagPipelineResult {
  hits: RagPipelineHit[]
  /** Modo efectivo con el que se resolvió la búsqueda. */
  mode: RagPipelineMode
  /** true si se resolvió por el fallback léxico (sin worker / timeout). */
  usedFallback: boolean
}

function normalizeHit(h: RagSearchResultItem): RagPipelineHit {
  const text = String(h.text ?? '').trim().slice(0, RAG_MAX_CHARS_PER_HIT)
  return {
    id: String(h.id ?? ''),
    docId: String(h.docId ?? ''),
    docName: String(h.docName ?? 'documento.pdf'),
    pageNumber: Number.isFinite(Number(h.pageNumber)) ? Number(h.pageNumber) : 1,
    chunkIndex: Number.isFinite(Number(h.chunkIndex)) ? Number(h.chunkIndex) : 0,
    text,
    score: Number.isFinite(Number(h.score)) ? Number(h.score) : 0,
    matchType: h.matchType === 'hybrid' || h.matchType === 'vector' ? h.matchType : 'lexical',
  }
}

/**
 * Ejecuta el pipeline Fase 4 para una consulta.
 *
 * - Si hay chunks indexados: delega en `ragClient.search(query, topK)`.
 *   El worker resuelve híbrido (15+15→RRF→Top3) cuando el modelo vectorial
 *   está listo, o léxico Top3 directo cuando está en `lexical_only`.
 *   El watchdog interno del cliente conmuta a MiniSearch local si el worker
 *   tarda demasiado (fallback).
 * - Sin chunks: retorna lista vacía (el chat cae a contexto tabular/general).
 */
export async function runRagPipeline(query: string, topK: number = RAG_TOP_K): Promise<RagPipelineResult> {
  const q = query.trim()
  if (!q || ragClient.getState().chunkCount === 0) {
    return { hits: [], mode: 'lexical_only', usedFallback: true }
  }
  const stateBefore = ragClient.getState()
  let raw: RagSearchResultItem[] = []
  try {
    raw = await ragClient.search(q, topK)
  } catch (err) {
    console.warn('[ragPipeline] search falló, sin fragmentos:', err)
    return { hits: [], mode: 'lexical_only', usedFallback: true }
  }
  const stateAfter = ragClient.getState()
  // El watchdog del cliente puede resolver con MiniSearch local aunque el
  // modo global siga siendo 'hybrid' (p. ej. el modelo tarda en la primera
  // query). didLastSearchUseFallback() dice la verdad de ESTA búsqueda.
  const fellBack = ragClient.didLastSearchUseFallback()
  const effectiveMode: RagPipelineMode = !fellBack && stateAfter.mode === 'hybrid' ? 'hybrid' : 'lexical_only'
  // Fallback = el cliente ya estaba en léxico, o el worker conmutó por timeout.
  const usedFallback = fellBack || (stateBefore.mode !== 'hybrid' && effectiveMode !== 'hybrid')
  const hits = raw.slice(0, topK).map(normalizeHit).filter((h) => h.text.length > 0)
  return { hits, mode: effectiveMode, usedFallback }
}
