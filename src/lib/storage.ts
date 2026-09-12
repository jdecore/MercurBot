/**
 * Copixi Storage — frontend-first persistence (§31, §32 Fase 5)
 * InsForge-compatible local abstraction: no backend, no secrets,
 * data stays in browser (§8). When InsForge SDK is added, swap impl.
 */
import type { Filter, ChartConfig } from '../data/types'
import type { RobotUnitId } from '../types/mascota'
import { ROBOT_DESIGNS, type RobotConfig } from './robotSeed'

export type SavedDataset = {
  id: string
  name: string
  rowCount: number
  columnCount: number
  createdAt: string
}

export type SavedAnalysis = {
  id: string
  name: string
  datasetName: string
  filters: Filter[]
  chartConfig: ChartConfig | null
  createdAt: string
  // snapshot aggregated metrics (no raw rows §8)
  metricsSnapshot?: { totalSales: number; avgSales: number; rowCount: number }
}

export type Preferences = {
  anomalyThreshold: number
  anomalyMethod: 'zscore' | 'iqr'
  /** Cara de la mascota: robot del ecosistema o avatar personalizable (Blobatar). */
  mascotFace: 'robot' | 'blobatar'
  /** Unidad del robot único personalizable (se conservan las 7 unidades). */
  mascotRobot: RobotUnitId
  /** Nombre semilla del Blobatar (determinista: mismo nombre = mismo avatar). */
  blobatarName: string
  /** Nombre del usuario (tutorial de bienvenida, Fase B). Saludo humano. */
  userName: string
  /** Nombre del robot (semilla de su diseño + cómo te saluda). */
  robotName: string
  /** Diseño del robot: 6 diseños base + mezcla libre rasgo por rasgo. */
  robotConfig: RobotConfig
}

const KEY_ANALYSES = 'copixi:saved_analyses'
const KEY_DATASETS = 'copixi:saved_datasets'
const KEY_PREFS = 'copixi:preferences'
const KEY_HISTORY = 'copixi:history'
const KEY_ONBOARDED = 'copixi:onboarded'

// Tutorial de bienvenida (Fase E): solo primer arranque, reabrible.
export function hasOnboarded(): boolean {
  if (typeof localStorage === 'undefined') return true
  return localStorage.getItem(KEY_ONBOARDED) === '1'
}
export function setOnboarded(): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(KEY_ONBOARDED, '1')
}

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback
  try { return JSON.parse(raw) as T } catch { return fallback }
}

// Analyses
export function getSavedAnalyses(): SavedAnalysis[] {
  if (typeof localStorage === 'undefined') return []
  return safeParse<SavedAnalysis[]>(localStorage.getItem(KEY_ANALYSES), [])
}
export function saveAnalysis(a: SavedAnalysis): void {
  const list = getSavedAnalyses()
  list.unshift(a)
  if (list.length > 20) list.pop()
  localStorage.setItem(KEY_ANALYSES, JSON.stringify(list))
  appendHistory(`Saved analysis "${a.name}"`)
}
export function deleteAnalysis(id: string): void {
  const list = getSavedAnalyses().filter((x) => x.id !== id)
  localStorage.setItem(KEY_ANALYSES, JSON.stringify(list))
}
export function clearAnalyses(): void {
  localStorage.removeItem(KEY_ANALYSES)
}

// Datasets (metadata only, no raw rows stored to respect §8 unless user explicitly saves)
export function getSavedDatasets(): SavedDataset[] {
  if (typeof localStorage === 'undefined') return []
  return safeParse<SavedDataset[]>(localStorage.getItem(KEY_DATASETS), [])
}
export function saveDataset(d: SavedDataset): void {
  const list = getSavedDatasets()
  list.unshift(d)
  if (list.length > 10) list.pop()
  localStorage.setItem(KEY_DATASETS, JSON.stringify(list))
}

// Preferences (anomaly threshold, method, mascot face)
export const DEFAULT_BLOBATAR_NAME = 'compe'
export const DEFAULT_ROBOT_NAME = 'Copi'
const brasita = ROBOT_DESIGNS.brasita
const DEFAULT_PREFS: Preferences = {
  anomalyThreshold: 2.5,
  anomalyMethod: 'zscore',
  mascotFace: 'robot',
  mascotRobot: 'helix',
  blobatarName: DEFAULT_BLOBATAR_NAME,
  userName: '',
  robotName: DEFAULT_ROBOT_NAME,
  robotConfig: { color: brasita.color, eyes: brasita.eyes, accessory: brasita.accessory },
}
export function getPreferences(): Preferences {
  if (typeof localStorage === 'undefined') return DEFAULT_PREFS
  const stored = safeParse<Partial<Preferences>>(localStorage.getItem(KEY_PREFS), {})
  // Fusión profunda de robotConfig: migra prefs viejas sin romper.
  return {
    ...DEFAULT_PREFS,
    ...stored,
    robotConfig: { ...DEFAULT_PREFS.robotConfig, ...(stored.robotConfig ?? {}) },
  }
}
export function savePreferences(p: Preferences): void {
  localStorage.setItem(KEY_PREFS, JSON.stringify(p))
}

// Chat history per document (P1: persists conversation across reloads/switches)
export type ChatHistoryMsg = {
  id: string
  role: 'user' | 'assistant'
  content: string
  citations?: { pageNumber: number; snippet: string; matchType?: string }[]
  searchMode?: 'hybrid' | 'lexical_only'
}

const KEY_CHAT_PREFIX = 'copixi:chat:'
const MAX_HISTORY_MSGS = 30
const MAX_HISTORY_CHARS = 1500

export function getChatHistory(docId: string): ChatHistoryMsg[] {
  if (typeof localStorage === 'undefined') return []
  return safeParse<ChatHistoryMsg[]>(localStorage.getItem(KEY_CHAT_PREFIX + docId), [])
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
}
export function saveChatHistory(docId: string, msgs: ChatHistoryMsg[]): void {
  if (typeof localStorage === 'undefined') return
  const trimmed = msgs.slice(-MAX_HISTORY_MSGS).map((m) => ({
    ...m,
    content: m.content.length > MAX_HISTORY_CHARS ? m.content.slice(0, MAX_HISTORY_CHARS) + '…' : m.content,
    citations: (m.citations ?? []).slice(0, 3),
  }))
  try {
    localStorage.setItem(KEY_CHAT_PREFIX + docId, JSON.stringify(trimmed))
  } catch {
    /* quota: keep in-memory only */
  }
}
export function clearChatHistory(docId: string): void {
  localStorage.removeItem(KEY_CHAT_PREFIX + docId)
}

// History (lightweight event log)
export function getHistory(): string[] {
  if (typeof localStorage === 'undefined') return []
  return safeParse<string[]>(localStorage.getItem(KEY_HISTORY), [])
}
export function appendHistory(entry: string): void {
  const h = getHistory()
  const line = `${new Date().toISOString().slice(0, 16).replace('T',' ')} — ${entry}`
  h.unshift(line)
  if (h.length > 50) h.pop()
  localStorage.setItem(KEY_HISTORY, JSON.stringify(h))
}
export function clearHistory(): void {
  localStorage.removeItem(KEY_HISTORY)
}
