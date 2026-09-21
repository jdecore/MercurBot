import { extractPdf, type PdfExtractOptions, type PdfExtractResult } from './extractors/pdf'

export type { PdfChunk, PdfExtractOptions, PdfExtractProgress, PdfExtractResult, PdfPageText } from './extractors/pdf'

export type UniversalParseResult = {
  rows: null
  source: 'pdf'
  pdfResult: PdfExtractResult
  text: string
  filename: string
}

function extOf(name: string): string {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i).toLowerCase() : ''
}

/**
 * Universal parser — frontend-first (§6), pure browser.
 * MercurBot solo trabaja con PDF (.pdf): extracción de páginas + chunks
 * para búsqueda RAG local. Sin CSV/Excel/Word.
 */
export async function parseAnyFile(file: File, options?: PdfExtractOptions): Promise<UniversalParseResult> {
  const ext = extOf(file.name)
  if (ext === '.pdf') {
    const pdfResult = await extractPdf(file, options)
    return {
      rows: null,
      source: 'pdf',
      pdfResult,
      text: pdfResult.fullText,
      filename: file.name,
    }
  }
  throw new Error(`Tipo no soportado "${ext}". MercurBot solo trabaja con documentos PDF (.pdf).`)
}

export function validateAnyFile(file: File, maxSizeMB = 30): { valid: boolean; error?: string } {
  const ext = extOf(file.name.toLowerCase())
  if (ext !== '.pdf') {
    return { valid: false, error: `Formato no soportado "${ext || 'desconocido'}". Por favor sube un documento PDF (.pdf).` }
  }
  if (file.size === 0) return { valid: false, error: 'El archivo está vacío.' }
  if (file.size > maxSizeMB * 1024 * 1024) return { valid: false, error: `El archivo es muy pesado (máximo ${maxSizeMB} MB).` }
  return { valid: true }
}
