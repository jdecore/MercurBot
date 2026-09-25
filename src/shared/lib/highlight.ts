/**
 * Lógica pura de resaltado de citas (Fase B): dada la lista de textos de la
 * capa de texto de pdf.js y la query (primeras palabras del snippet fuente),
 * devuelve los índices de los spans a marcar. Sin dependencias: testeable en
 * Node sin DOM. Nunca lanza.
 */

export function normText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9ñ\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Estrategia barata: frase completa (8→6→4 palabras) y, si no hay
 * coincidencia, palabras individuales (≥4 letras). Tope de spans para no
 * pintar la página entera de amarillo.
 */
export function matchHighlightSpans(
  divTexts: string[],
  query: string,
  maxSpans = 24,
): number[] {
  try {
    // Frases con todas las palabras (incluidas cortas como "y"/"de": si se
    // quitan, la frase candidata deja de existir en el texto). El filtro de
    // longitud solo aplica al fallback por palabras sueltas.
    const allWords = normText(query)
      .split(' ')
      .filter((w) => w.length > 0)
      .slice(0, 8)
    if (allWords.length === 0 || divTexts.length === 0) return []
    const normDivs = divTexts.map((t) => normText(t))
    const out: number[] = []
    const push = (i: number) => {
      if (out.length < maxSpans && !out.includes(i)) out.push(i)
    }
    const candidates: string[] = []
    if (allWords.length >= 8) candidates.push(allWords.slice(0, 8).join(' '))
    if (allWords.length >= 6) candidates.push(allWords.slice(0, 6).join(' '))
    if (allWords.length >= 4) candidates.push(allWords.slice(0, 4).join(' '))
    if (allWords.length > 0 && allWords.length < 4) candidates.push(allWords.join(' '))
    for (const phrase of candidates) {
      let found = false
      normDivs.forEach((t, i) => {
        if (out.length < maxSpans && t.includes(phrase)) {
          push(i)
          found = true
        }
      })
      if (found) return out
    }
    for (const w of allWords) {
      if (w.length < 4 || out.length >= maxSpans) continue
      const i = normDivs.findIndex((t) => t.includes(w))
      if (i >= 0) push(i)
    }
    return out
  } catch {
    return []
  }
}
