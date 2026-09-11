import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { Row, ColumnMeta, Filter, FilterOperator, Metrics, DatasetProfile, ChartConfig } from '../data/types'
import { profileDataset } from '../data/profiler'
import { computeMetrics } from '../data/statistics'
import { applyFilters } from '../data/transformations'
import { detectAnomaliesZScore } from '../data/anomalyDetection'
import { toTimeSeries, toBarData, suggestCharts } from '../data/chartAdapter'
import { ragSearch, type RagHit } from '../lib/rag'
import { diagnoseDataset, applyCleaningOperations, type CleaningDiagnosis, type CleaningOperation, type CleaningResult } from '../data/cleaner'
import type { RobotUnitId } from '../types/mascota'
import type { PdfExtractResult } from '../data/extractors/pdf'

export type AnalysisMode = 'pipeline' | 'specialist'
export type PipelineStep = 'cleaning' | 'profiling' | 'patterns' | 'charts' | 'strategy'

function looksLikeDate(values: unknown[]): boolean {
  const samples = values.filter((v) => v !== null && v !== "" && v !== undefined).slice(0, 20)
  if (samples.length === 0) return false
  let dateCount = 0
  for (const v of samples) {
    const s = String(v).trim()
    if (!Number.isNaN(Date.parse(s)) && /\d{4}-\d{2}-\d{2}/.test(s)) dateCount++
  }
  return dateCount / samples.length > 0.7
}

function detectDateColumn(columns: ColumnMeta[], rows: Row[]): string | null {
  const dateCol = columns.find((c) => c.type === 'date')
  if (dateCol) return dateCol.name
  for (const c of columns) {
    if (looksLikeDate(rows.map((r) => r[c.name]))) return c.name
  }
  return null
}

function detectNumericColumns(columns: ColumnMeta[]): string[] {
  return columns.filter((c) => c.type === 'number').map((c) => c.name)
}

function detectCategoricalColumns(columns: ColumnMeta[]): string[] {
  return columns.filter((c) => c.type === 'string' && c.distinctCount >= 2 && c.distinctCount <= 20).map((c) => c.name)
}

function pickColumn(names: string[], candidates: string[]): string | null {
  for (const c of candidates) {
    const found = names.find((n) => n.toLowerCase() === c.toLowerCase())
    if (found) return found
  }
  return names.find((n) => candidates.some((c) => n.toLowerCase().includes(c))) ?? null
}

export type FileInfo = { name: string; size: number; rows: number; columns: number } | null

type DashboardState = {
  rawRows: Row[] | null
  fileInfo: FileInfo
  filters: Filter[]
  activeChart: ChartConfig | null
  error: string | null
  loading: boolean
  sortCol: string | null
  sortDir: 'asc' | 'desc'
  searchQuery: string
  embeddingStatus: 'idle' | 'loading' | 'ready' | 'error'
  topSimilarRows: RagHit[] | null
  summary: string | null
  summaryStatus: 'idle' | 'loading' | 'ready' | 'error'
  summaryError: string | null
  analysisMode: AnalysisMode
  activeRobot: RobotUnitId
  pipelineStep: PipelineStep
  cleaningHistory: Row[][]
  lastCleaningResult: CleaningResult | null
  pdfDoc: PdfExtractResult | null
}

type DashboardDerived = {
  profile: DatasetProfile | null
  columns: ColumnMeta[]
  filteredRows: Row[]
  metrics: Metrics | null
  timeSeries: { date: string; value: number }[]
  byCity: { name: string; value: number }[]
  byCategory: { name: string; value: number }[]
  byProduct: { name: string; value: number }[]
  anomalies: ReturnType<typeof detectAnomaliesZScore>
  autoCharts: { config: ChartConfig; data: { name: string; value: number }[] | { x: number; y: number }[] }[]
  nullPercentages: Record<string, number>
  dateRange: { min: string; max: string } | null
  topCategories: Record<string, { name: string; value: number }[]>
  suggestedQuestions: string[]
  dateCol: string | null
  primaryCat: string | null
  catCols: string[]
  numCols: string[]
  salesCol: string | null
  unitsCol: string | null
  customersCol: string | null
  cleaningDiagnosis: CleaningDiagnosis | null
}

type DashboardActions = {
  setDataset: (rows: Row[], fileInfo: FileInfo) => void
  clearDataset: () => void
  addFilter: (f: Filter) => boolean
  removeFilter: (index: number) => void
  clearFilters: () => void
  setActiveChart: (c: ChartConfig | null) => void
  setError: (msg: string | null) => void
  setLoading: (v: boolean) => void
  setSort: (col: string | null, dir?: 'asc' | 'desc') => void
  setSearch: (query: string) => void
  ragQuery: (query: string, topK?: number) => Promise<RagHit[] | null>
  generateSummary: () => Promise<void>
  setSummary: (s: string | null) => void
  setAnalysisMode: (mode: AnalysisMode) => void
  setActiveRobot: (robot: RobotUnitId) => void
  setPipelineStep: (step: PipelineStep) => void
  applyCleaning: (ops: CleaningOperation[]) => CleaningResult
  undoCleaning: () => boolean
  setPdfDoc: (doc: PdfExtractResult | null) => void
}

type DashboardContextValue = DashboardState & DashboardDerived & DashboardActions

const DashboardContext = createContext<DashboardContextValue | null>(null)

const VALID_OPERATORS: FilterOperator[] = ['equals', 'contains', 'gt', 'lt', 'between']

function isValidFilter(filter: Filter, allowedColumns: string[]): { ok: boolean; reason?: string } {
  if (!allowedColumns.includes(filter.column)) return { ok: false, reason: `Column "${filter.column}" not in dataset` }
  if (!VALID_OPERATORS.includes(filter.operator)) return { ok: false, reason: `Operator ${filter.operator} invalid` }
  if (filter.value === null || filter.value === undefined || String(filter.value).trim() === '') {
    return { ok: false, reason: 'Value is empty' }
  }
  if (filter.operator === 'between' && (filter.value2 === null || filter.value2 === undefined || String(filter.value2).trim() === '')) {
    return { ok: false, reason: 'between requires value2' }
  }
  if ((filter.operator === 'gt' || filter.operator === 'lt' || filter.operator === 'between') && Number.isNaN(Number(filter.value))) {
    return { ok: false, reason: `Value "${filter.value}" is not a number for operator ${filter.operator}` }
  }
  return { ok: true }
}

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [rawRows, setRawRows] = useState<Row[] | null>(null)
  const [fileInfo, setFileInfo] = useState<FileInfo>(null)
  const [filters, setFilters] = useState<Filter[]>([])
  const [activeChart, setActiveChart] = useState<ChartConfig | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [sortCol, setSortCol] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [searchQuery, setSearchQuery] = useState('')
  const [embeddingStatus, setEmbeddingStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [topSimilarRows, setTopSimilarRows] = useState<RagHit[] | null>(null)
  const [summary, setSummary] = useState<string | null>(null)
  const [summaryStatus, setSummaryStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [summaryError, setSummaryError] = useState<string | null>(null)

  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>('pipeline')
  const [activeRobot, setActiveRobot] = useState<RobotUnitId>('helix')
  const [pipelineStep, setPipelineStep] = useState<PipelineStep>('cleaning')
  const [cleaningHistory, setCleaningHistory] = useState<Row[][]>([])
  const [lastCleaningResult, setLastCleaningResult] = useState<CleaningResult | null>(null)
  const [pdfDoc, setPdfDocState] = useState<PdfExtractResult | null>(null)

  const profile = useMemo(() => (rawRows ? profileDataset(rawRows) : null), [rawRows])
  const columns = useMemo(() => profile?.columns ?? [], [profile])
  const allowedColumns = useMemo(() => columns.map((c) => c.name), [columns])

  const filteredRows = useMemo(() => (rawRows ? applyFilters(rawRows, filters) : []), [rawRows, filters])
  
  const dateCol = detectDateColumn(columns, rawRows ?? [])
  const numCols = detectNumericColumns(columns)
  const catCols = detectCategoricalColumns(columns)
  const salesCol = pickColumn(numCols, ['sales', 'amount', 'total', 'revenue', 'value', 'price']) ?? numCols[0] ?? null
  const unitsCol = pickColumn(numCols, ['units', 'quantity', 'qty', 'count']) ?? numCols.find((n) => n !== salesCol) ?? numCols[0] ?? null
  const customersCol = pickColumn(numCols, ['customers', 'clients', 'users', 'orders']) ?? numCols.find((n) => n !== salesCol && n !== unitsCol) ?? numCols[0] ?? null

  const metrics = useMemo(() => {
    if (!filteredRows.length) return rawRows ? computeMetrics(filteredRows, salesCol ?? 'sales', unitsCol ?? 'units', customersCol ?? 'customers') : null
    return computeMetrics(filteredRows, salesCol ?? 'sales', unitsCol ?? 'units', customersCol ?? 'customers')
  }, [filteredRows, rawRows, salesCol, unitsCol, customersCol])
  
  const timeSeries = useMemo(() => {
    if (!filteredRows.length || !dateCol) return []
    const valCol = salesCol ?? numCols[0]
    if (!valCol) return []
    return toTimeSeries(filteredRows, dateCol, valCol)
  }, [filteredRows, dateCol, salesCol, numCols])
  
  const primaryCat = catCols[0] ?? null
  
  const byCity = useMemo(() => {
    if (!filteredRows.length || !primaryCat) return []
    const valCol = salesCol ?? numCols[0]
    if (!valCol) return []
    return toBarData(filteredRows, primaryCat, valCol).slice(0, 6)
  }, [filteredRows, primaryCat, salesCol, numCols])
  
  const byCategory = useMemo(() => {
    if (!filteredRows.length || catCols.length < 2) return []
    const valCol = salesCol ?? numCols[0]
    if (!valCol) return []
    return toBarData(filteredRows, catCols[1], valCol).slice(0, 6)
  }, [filteredRows, catCols, salesCol, numCols])
  
  const byProduct = useMemo(() => {
    if (!filteredRows.length || catCols.length < 3) return []
    const valCol = salesCol ?? numCols[0]
    if (!valCol) return []
    return toBarData(filteredRows, catCols[2], valCol).slice(0, 6)
  }, [filteredRows, catCols, salesCol, numCols])
  
  const anomalies = useMemo(() => {
    if (!filteredRows.length) return []
    const valCol = salesCol ?? numCols[0]
    if (!valCol) return []
    return detectAnomaliesZScore(filteredRows, valCol, 2.5).slice(0, 5)
  }, [filteredRows, salesCol, numCols])
  
  const autoCharts = useMemo(() => suggestCharts(columns, filteredRows), [columns, filteredRows])

  const nullPercentages = useMemo(() => {
    if (!profile) return {}
    const out: Record<string, number> = {}
    for (const c of profile.columns) {
      out[c.name] = profile.rowCount > 0 ? Math.round((c.nullCount / profile.rowCount) * 100) : 0
    }
    return out
  }, [profile])

  const dateRange = useMemo(() => {
    if (!rawRows || !dateCol) return null
    const dates = rawRows.map((r) => String(r[dateCol] ?? '')).filter((s) => !Number.isNaN(Date.parse(s)) && /\d{4}-\d{2}-\d{2}/.test(s))
    if (!dates.length) return null
    dates.sort()
    return { min: dates[0], max: dates[dates.length - 1] }
  }, [rawRows, dateCol])

  const topCategories = useMemo(() => {
    if (!columns.length || !filteredRows.length) return {}
    const out: Record<string, { name: string; value: number }[]> = {}
    const valCol = salesCol ?? numCols[0]
    if (!valCol) return out
    for (const c of catCols.slice(0, 5)) {
      out[c] = toBarData(filteredRows, c, valCol).slice(0, 5)
    }
    return out
  }, [columns, filteredRows, catCols, salesCol, numCols])

  const cleaningDiagnosis = useMemo(() => {
    if (!rawRows || !columns.length) return null
    return diagnoseDataset(rawRows, columns)
  }, [rawRows, columns])

  const suggestedQuestions = useMemo(() => {
    if (!columns.length) return []
    const qs: string[] = []
    const valCol = salesCol ?? numCols[0]
    const hasFilters = filters.length > 0
    if (catCols.length && valCol) {
      qs.push(`Show ${valCol} by ${catCols[0]} in a bar chart`)
    }
    if (dateCol && valCol) {
      qs.push(`Show ${valCol} trend over ${dateCol}`)
    }
    if (catCols.length >= 2 && valCol) {
      qs.push(`Compare ${catCols[0]} vs ${catCols[1]} by ${valCol}`)
    }
    if (hasFilters) {
      qs.push('Clear all filters')
    }
    if (anomalies.length) {
      qs.push('Show anomalies in detail')
    }
    return qs.slice(0, 5)
  }, [columns, filters.length, anomalies.length, catCols, dateCol, salesCol, numCols])

  const setDataset = useCallback((rows: Row[], info: FileInfo) => {
    if (!rows.length) { setError('CSV is empty or has no valid rows. Try another file or use demo data.'); return }
    setRawRows(rows)
    setFileInfo(info)
    setFilters([])
    setActiveChart(null)
    setSortCol(null)
    setSortDir('asc')
    setSearchQuery('')
    setError(null)
    setSummary(null)
    setSummaryStatus('idle')
    setSummaryError(null)
    setCleaningHistory([])
    setLastCleaningResult(null)
    setPipelineStep('cleaning')
    setActiveRobot('helix')
  }, [])

  const clearDataset = useCallback(() => {
    setRawRows(null)
    setFileInfo(null)
    setFilters([])
    setActiveChart(null)
    setSortCol(null)
    setSortDir('asc')
    setSearchQuery('')
    setError(null)
    setSummary(null)
    setSummaryStatus('idle')
    setSummaryError(null)
    setCleaningHistory([])
    setLastCleaningResult(null)
    setPdfDocState(null)
  }, [])

  const setPdfDoc = useCallback((doc: PdfExtractResult | null) => {
    setPdfDocState(doc)
    if (doc) {
      setRawRows(null)
      setFileInfo({
        name: doc.filename,
        size: 0,
        rows: doc.chunks.length,
        columns: doc.totalPages,
      })
      setSummary(`Documento PDF analizado: "${doc.filename}". ${doc.totalPages} páginas y ${doc.chunks.length} fragmentos semánticos disponibles para consulta RAG.`)
      setSummaryStatus('ready')
      setError(null)
    }
  }, [])

  const addFilter = useCallback((f: Filter): boolean => {
    const v = isValidFilter(f, allowedColumns)
    if (!v.ok) {
      if (import.meta.env.DEV) console.warn('[Copixi] Filter rejected', f, v.reason)
      setError(`Filter rejected: ${v.reason}`)
      return false
    }
    setFilters((prev) => [...prev, f])
    setError(null)
    return true
  }, [allowedColumns])

  const removeFilter = useCallback((index: number) => {
    setFilters((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const clearFilters = useCallback(() => setFilters([]), [])

  const setSort = useCallback((col: string | null, dir?: 'asc' | 'desc') => {
    setSortCol(col)
    setSortDir(dir ?? (col ? 'asc' : 'asc'))
  }, [])

  const setSearch = useCallback((query: string) => {
    setSearchQuery(query)
  }, [])

  const ragQuery = useCallback(async (query: string, topK = 3): Promise<RagHit[] | null> => {
    if (!rawRows || !columns.length) return null
    try {
      setEmbeddingStatus('loading')
      const result = await ragSearch(rawRows, columns, query, topK)
      setTopSimilarRows(result.hits)
      setEmbeddingStatus('ready')
      return result.hits
    } catch (err) {
      console.warn('[RAG] query failed', err)
      setEmbeddingStatus('error')
      return null
    }
  }, [rawRows, columns])

  const generateSummary = useCallback(async () => {
    if (!rawRows || !columns.length) return
    setSummaryStatus('loading')
    setSummaryError(null)
    try {
      const ctx = {
        rowCount: rawRows.length,
        filteredCount: filteredRows.length,
        columns: columns.map((c) => ({ name: c.name, type: c.type, distinctCount: c.distinctCount })),
        metrics,
        topProducts: byProduct.slice(0, 3),
        salesByCity: byCity.slice(0, 3),
        salesByCategory: byCategory.slice(0, 3),
        trends: timeSeries.slice(0, 4),
        currentFilters: filters,
        autoCharts: autoCharts.slice(0, 4).map((c) => ({ x: c.config.x, y: c.config.y, type: c.config.chartType })),
      }
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'summary', context: ctx }),
      })
      const json = await res.json() as { text?: string; error?: string }
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
      const text = (json.text ?? '').trim()
      if (!text) throw new Error('Empty summary')
      setSummary(text)
      setSummaryStatus('ready')
    } catch (err) {
      setSummaryError(err instanceof Error ? err.message : 'Failed to generate summary')
      setSummaryStatus('error')
    }
  }, [rawRows, columns, filteredRows.length, metrics, byProduct, byCity, byCategory, timeSeries, filters, autoCharts])

  const applyCleaning = useCallback((ops: CleaningOperation[]): CleaningResult => {
    if (!rawRows) {
      return { cleanedRows: [], appliedOperations: [], rowsRemoved: 0, cellsModified: 0, summary: 'No dataset loaded' }
    }
    const result = applyCleaningOperations(rawRows, ops)
    setCleaningHistory((prev) => [...prev, rawRows])
    setRawRows(result.cleanedRows)
    setLastCleaningResult(result)
    return result
  }, [rawRows])

  const undoCleaning = useCallback((): boolean => {
    if (cleaningHistory.length === 0) return false
    const previous = cleaningHistory[cleaningHistory.length - 1]
    if (previous) {
      setRawRows(previous)
      setCleaningHistory((prev) => prev.slice(0, prev.length - 1))
      setLastCleaningResult(null)
      return true
    }
    return false
  }, [cleaningHistory])

  const value: DashboardContextValue = {
    rawRows, fileInfo, filters, activeChart, error, loading, sortCol, sortDir, searchQuery, embeddingStatus, topSimilarRows,
    summary, summaryStatus, summaryError,
    profile, columns, filteredRows, metrics, timeSeries, byCity, byCategory, byProduct, anomalies, autoCharts,
    nullPercentages, dateRange, topCategories, suggestedQuestions,
    dateCol, primaryCat, catCols, numCols, salesCol, unitsCol, customersCol,
    analysisMode, activeRobot, pipelineStep, cleaningHistory, lastCleaningResult, cleaningDiagnosis,
    pdfDoc, setPdfDoc,
    setDataset, clearDataset, addFilter, removeFilter, clearFilters, setActiveChart, setError, setLoading, setSort, setSearch,
    ragQuery, generateSummary, setSummary,
    setAnalysisMode, setActiveRobot, setPipelineStep, applyCleaning, undoCleaning,
  }

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>
}

export function useDashboard() {
  const ctx = useContext(DashboardContext)
  if (!ctx) throw new Error('useDashboard must be used within DashboardProvider')
  return ctx
}
