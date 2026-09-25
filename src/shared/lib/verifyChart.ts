/**
 * Verificador determinista de cifras (Fase D): ninguna gráfica muestra un
 * número que no exista en el documento.
 *
 * Cada `value` del chart-JSON debe aparecer como token numérico en el texto
 * de los chunks de su `sourcePage` (índice local en memoria, sin LLM).
 * Normaliza espacios y separadores de miles/decimales es/en (1.234,5 ≙
 * 1,234.5 ≙ 1234.5). Compara tokens completos, no substrings: el valor 100
 * NO se verifica con un "100.000" del texto.
 *
 * Política: punto no verificado → se elimina con aviso; si quedan <2 puntos
 * → se rechaza la gráfica entera con mensaje honesto. Puro y testeable.
 */

import type { ChartSpec } from './chartJson'

/**
 * Canoniza un token numérico: quita separadores de miles (punto o coma
 * seguidos de exactamente 3 dígitos) y unifica el decimal a punto.
 * "1.234,5" → "1234.5" · "1,234.5" → "1234.5" · "100.000" → "100000".
 */
export function canonNumberToken(token: string): string {
  let t = token.replace(/[\s_']/g, '')
  t = t.replace(/[.,](?=\d{3}(\D|$))/g, '')
  return t.replace(/,/g, '.')
}

const NUMBER_TOKEN_RE = /-?\d[\d\s.,]*\d|-?\d/g

export interface ChartVerification {
  /** Spec con solo puntos verificados, o null si se rechaza (<2 puntos). */
  spec: ChartSpec | null
  verified: number
  dropped: number
  total: number
}

export function verifyChartSpec(
  chart: ChartSpec | null,
  getPageTexts: (page: number) => string[],
  /** Fase E: si se indica, solo se aceptan sourcePage dentro del rango enviado. */
  allowedPages?: number[] | null,
): ChartVerification {
  try {
    if (!chart) return { spec: null, verified: 0, dropped: 0, total: 0 }
    const total = chart.data.length
    const allowed = allowedPages && allowedPages.length > 0 ? new Set(allowedPages) : null
    const cache = new Map<number, string[]>()
    const numCache = new Map<number, number[]>()
    const tokensFor = (page: number): string[] => {
      const hit = cache.get(page)
      if (hit) return hit
      const toks: string[] = []
      try {
        for (const text of getPageTexts(page) ?? []) {
          const raw = String(text ?? '').match(NUMBER_TOKEN_RE) ?? []
          for (const r of raw) toks.push(canonNumberToken(r))
        }
      } catch {
        /* página ilegible → sin tokens: sus puntos se descartan */
      }
      cache.set(page, toks)
      return toks
    }
  /** Números de la página como floats (para tolerancia de redondeo). */
  const numbersFor = (page: number): number[] => {
    const hit = numCache.get(page)
    if (hit) return hit
    const nums: number[] = []
    try {
      for (const t of tokensFor(page)) {
        const n = Number(t)
        if (Number.isFinite(n)) nums.push(n)
      }
    } catch {
      /* página ilegible → sin números */
    }
    numCache.set(page, nums)
    return nums
  }
  /**
   * Tolerancia de redondeo del modelo: exacto primero; si falla, se acepta
   * si alguna cifra del documento está dentro de ±(0.5 + 0.5%·|value|).
   * Cubre redondeos típicos (100.4→100, 12.345→12.35) sin aceptar inventos
   * (100 nunca se verifica con 100.000: difieren en 4 órdenes de magnitud).
   */
  const isVerified = (value: number, page: number): boolean => {
    const canon = canonNumberToken(String(value))
    const toks = tokensFor(page)
    if (toks.includes(canon)) return true
    if (!Number.isFinite(value)) return false
    const tol = 0.5 + 0.005 * Math.abs(value)
    return numbersFor(page).some((n) => Math.abs(n - value) <= tol)
  }
    const kept = chart.data.filter(
      (d) => (!allowed || allowed.has(d.sourcePage)) && isVerified(d.value, d.sourcePage),
    )
    const dropped = total - kept.length
    if (kept.length < 2) return { spec: null, verified: 0, dropped: total, total }
    if (dropped === 0) return { spec: chart, verified: total, dropped: 0, total }
    return { spec: { ...chart, data: kept }, verified: kept.length, dropped, total }
  } catch {
    // Fallo inesperado → rechazo seguro: sin verificación no hay gráfica.
    const total = chart?.data.length ?? 0
    return { spec: null, verified: 0, dropped: total, total }
  }
}
