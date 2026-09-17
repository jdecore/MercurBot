/**
 * Chart-JSON nativo (Fase C): schema congelado + parser tolerante.
 *
 * El modelo puede cerrar su respuesta con un bloque ```chart-json; la app lo
 * valida y lo dibuja con SVG propio, sin librerías. Cualquier anomalía
 * (JSON roto, tipo inválido, sin puntos válidos) → null y se muestra solo
 * texto. Nunca lanza.
 *
 * Schema:
 *   { chartType: "bar" | "line", title: string, unit?: string,
 *     data: [{ label: string, value: number, sourcePage: number }] }
 *   máx. 12 puntos, value finito.
 */

export interface ChartPoint {
  label: string
  value: number
  sourcePage: number
}

export interface ChartSpec {
  chartType: 'bar' | 'line'
  title: string
  unit?: string
  data: ChartPoint[]
}

export const CHART_MAX_POINTS = 12
const MAX_TITLE = 120
const MAX_LABEL = 40
const MAX_UNIT = 24

/** Quita caracteres de control (el LLM a veces emite tabs/saltos literales
 * dentro del JSON, lo que rompería JSON.parse). Sin regex de controles. */
function stripControls(s: string): string {
  return [...s]
    .filter((ch) => {
      const c = ch.codePointAt(0) ?? 32
      return c >= 32 && c !== 127
    })
    .join('')
}

/** Limpia texto del modelo: sin controles, recortado. React escapa al render. */
function cleanStr(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null
  const s = stripControls(v).trim()
  if (!s) return null
  return s.length > max ? `${s.slice(0, max)}…` : s
}

function toFiniteNumber(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
  return Number.isFinite(n) ? n : null
}

function toPage(v: unknown): number | null {
  const n = toFiniteNumber(v)
  if (n === null) return null
  const p = Math.floor(n)
  return p >= 1 ? p : null
}

function validateSpec(raw: unknown): ChartSpec | null {
  try {
    if (!raw || typeof raw !== 'object') return null
    const o = raw as Record<string, unknown>
    if (o.chartType !== 'bar' && o.chartType !== 'line') return null
    const title = cleanStr(o.title, MAX_TITLE)
    if (!title) return null
    if (!Array.isArray(o.data) || o.data.length === 0) return null
    const data: ChartPoint[] = []
    for (const p of o.data) {
      if (data.length >= CHART_MAX_POINTS) break
      if (!p || typeof p !== 'object') continue
      const pt = p as Record<string, unknown>
      const label = cleanStr(pt.label, MAX_LABEL)
      const value = toFiniteNumber(pt.value)
      const sourcePage = toPage(pt.sourcePage)
      if (!label || value === null || sourcePage === null) continue
      data.push({ label, value, sourcePage })
    }
    if (data.length === 0) return null
    const unit = o.unit === undefined ? undefined : cleanStr(o.unit, MAX_UNIT) ?? undefined
    return { chartType: o.chartType, title, unit, data }
  } catch {
    return null
  }
}

const FENCE_OPEN_RE = /```chart-json\s*/i

/**
 * Extrae el primer bloque ```chart-json válido. Devuelve el texto sin el
 * bloque + el spec (o null). El cierre es el primer ``` posterior; si no hay
 * cierre, se toma hasta el fin del texto (tolerante al streaming cortado…
 * aunque normalmente el mensaje ya está completo).
 */
export function splitChartBlock(text: string): { text: string; chart: ChartSpec | null } {
  try {
    if (typeof text !== 'string') return { text: '', chart: null }
    const m = FENCE_OPEN_RE.exec(text)
    if (!m) return { text, chart: null }
    const start = m.index
    const bodyStart = start + m[0].length
    const closeIdx = text.indexOf('```', bodyStart)
    const body = (closeIdx === -1 ? text.slice(bodyStart) : text.slice(bodyStart, closeIdx)).trim()
    let spec: ChartSpec | null = null
    try {
      // Tolerancia a comas colgantes (el LLM las emite a menudo).
      const json = stripControls(body).replace(/,(\s*[}\]])/g, '$1')
      spec = validateSpec(JSON.parse(json))
    } catch {
      spec = null
    }
    const end = closeIdx === -1 ? text.length : closeIdx + 3
    const rest = (text.slice(0, start) + text.slice(end)).trim()
    return { text: rest, chart: spec }
  } catch {
    return { text, chart: null }
  }
}

/** Quita el bloque chart-json (para TTS y descarga .md: solo prosa). */
export function stripChartBlock(text: string): string {
  return splitChartBlock(text).text
}
