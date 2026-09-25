/**
 * Gráfica del documento completo bajo demanda (Fase E): selección
 * determinista de páginas para enviar al modelo solo cuando el usuario lo
 * ordena con el botón "Generar gráfica".
 *
 * - Si el texto cabe en el tope, se envía íntegro (sin truncado ciego).
 * - Si excede, pre-selección determinista: páginas con más cifras/tablas
 *   (densidad de tokens numéricos vía regex), nunca truncado ciego.
 * - El resultado informa qué páginas se analizaron; el verificador solo
 *   acepta sourcePage dentro de ese rango (ver verifyChartSpec).
 * Puro y testeable. Nunca lanza.
 */

export const CHART_FULL_MAX_CHARS = 250_000
/** Reserva por página para el envoltorio `[Pág. N]: """..."""` del prompt. */
const PAGE_OVERHEAD = 64

export interface ChartFullPage {
  page: number
  text: string
}

export interface ChartFullSelection {
  pages: ChartFullPage[]
  /** Páginas analizadas, orden ascendente (para el aviso honesto). */
  analyzedPages: number[]
  /** true si no cupo todo y hubo pre-selección. */
  truncated: boolean
  totalPages: number
  totalChars: number
}

const NUMBER_TOKEN_RE = /-?\d[\d\s.,]*\d|-?\d/g

function cleanPageText(text: string): string {
  return String(text ?? '').replace(/\s+/g, ' ').trim()
}

function numberDensity(text: string): number {
  try {
    return text.match(NUMBER_TOKEN_RE)?.length ?? 0
  } catch {
    return 0
  }
}

/**
 * Conteo de cifras en una selección (ideas 1+3): cuántos tokens numéricos
 * hay en las páginas que se van a analizar / se analizaron. Sirve para el
 * pre-chequeo honesto ("documento narrativo, casi sin cifras") y para el
 * aviso con contexto real cuando el modelo no devuelve gráfica.
 * Puro, nunca lanza.
 */
export function countSelectionFigures(pages: { text: string }[] | null | undefined): number {
  try {
    if (!Array.isArray(pages)) return 0
    let n = 0
    for (const p of pages) {
      if (!p || typeof p.text !== 'string') continue
      n += numberDensity(p.text)
    }
    return n
  } catch {
    return 0
  }
}

export function selectChartFullPages(
  all: { pageNumber: number; text: string }[],
  maxChars = CHART_FULL_MAX_CHARS,
): ChartFullSelection {
  try {
    const cleaned = (Array.isArray(all) ? all : [])
      .filter((p) => p && Number.isFinite(Number(p.pageNumber)))
      .map((p) => ({ page: Number(p.pageNumber), text: cleanPageText(p.text) }))
      .filter((p) => p.text.length > 0)
    const totalPages = cleaned.length
    const totalChars = cleaned.reduce((a, p) => a + p.text.length, 0)
    if (cleaned.length === 0) {
      return { pages: [], analyzedPages: [], truncated: false, totalPages: 0, totalChars: 0 }
    }
    if (totalChars + cleaned.length * PAGE_OVERHEAD <= maxChars) {
      return {
        pages: cleaned,
        analyzedPages: cleaned.map((p) => p.page).sort((a, b) => a - b),
        truncated: false,
        totalPages,
        totalChars,
      }
    }
    // Pre-selección determinista: más cifras primero, hasta llenar el tope.
    // Desempate estable por número de página (orden determinista).
    const scored = cleaned
      .map((p) => ({ ...p, score: numberDensity(p.text) }))
      .sort((a, b) => b.score - a.score || a.page - b.page)
    const picked: typeof scored = []
    let used = 0
    for (const p of scored) {
      const cost = p.text.length + PAGE_OVERHEAD
      if (used + cost > maxChars) continue
      picked.push(p)
      used += cost
    }
    if (picked.length === 0) {
      // Todas las páginas exceden solas el tope (caso extremo): se recorta
      // solo la de mayor densidad en vez de enviar un cuerpo sobre el tope.
      const top = scored[0]
      picked.push({ ...top, text: top.text.slice(0, Math.max(0, maxChars - PAGE_OVERHEAD)) })
    }
    const finalPages = [...picked]
    finalPages.sort((a, b) => a.page - b.page)
    return {
      pages: finalPages.map((p) => ({ page: p.page, text: p.text })),
      analyzedPages: finalPages.map((p) => p.page).sort((a, b) => a - b),
      truncated: true,
      totalPages,
      totalChars,
    }
  } catch {
    return { pages: [], analyzedPages: [], truncated: false, totalPages: 0, totalChars: 0 }
  }
}

/** "págs. 1-3, 5" para el aviso honesto de alcance. */
export function formatPageRange(pages: number[]): string {
  const sorted = [...new Set(pages)].filter((n) => Number.isFinite(n)).sort((a, b) => a - b)
  if (sorted.length === 0) return '—'
  const ranges: string[] = []
  let start = sorted[0]
  let prev = sorted[0]
  for (let i = 1; i <= sorted.length; i++) {
    const cur = sorted[i]
    if (cur === prev + 1) {
      prev = cur
      continue
    }
    ranges.push(start === prev ? String(start) : `${start}-${prev}`)
    start = cur
    prev = cur
  }
  return `págs. ${ranges.join(', ')}`
}
