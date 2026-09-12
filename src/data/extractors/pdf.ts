import * as pdfjsLib from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

// Configure worker src with Vite URL resolution
if (typeof window !== 'undefined' && 'GlobalWorkerOptions' in pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
}

export interface PdfPageText {
  pageNumber: number
  text: string
}

export interface PdfChunk {
  id: string
  docId: string
  docName: string
  pageNumber: number
  chunkIndex: number
  text: string
  tokenCountEstimate: number
}

export interface PdfExtractProgress {
  page: number
  totalPages: number
  percent: number
  statusText: string
}

export interface PdfExtractOptions {
  signal?: AbortSignal
  timeoutMs?: number // Default: 60000 (60s)
  maxPages?: number
  chunkSizeWords?: number // Default ~350 words (~400 tokens)
  overlapWords?: number // Default ~50 words
  onProgress?: (progress: PdfExtractProgress) => void
  /** docId estable (huella del archivo). Si se omite, se genera uno aleatorio. */
  docId?: string
}

export interface PdfExtractResult {
  docId: string
  filename: string
  totalPages: number
  pages: PdfPageText[]
  fullText: string
  chunks: PdfChunk[]
  partial: boolean
}

interface TextItemWithCoords {
  str: string
  x: number
  y: number
  width: number
  height: number
}

/**
 * Extracts and reconstructs text from a single PDF page maintaining spatial order (top-to-bottom, left-to-right).
 */
async function extractPageText(page: any): Promise<string> {
  const content = await page.getTextContent()
  const items: TextItemWithCoords[] = []

  for (const item of content.items) {
    if (!('str' in item) || !item.str) continue
    const transform = item.transform || [1, 0, 0, 1, 0, 0]
    items.push({
      str: item.str,
      x: transform[4] ?? 0,
      y: transform[5] ?? 0,
      width: item.width ?? 0,
      height: item.height ?? 0,
    })
  }

  if (!items.length) return ''

  // Sort top-to-bottom (PDF y is inverted, higher y = higher on page)
  // Group lines within ~6px delta
  items.sort((a, b) => {
    const yDelta = Math.abs(a.y - b.y)
    if (yDelta < 6) {
      return a.x - b.x // same line: left-to-right
    }
    return b.y - a.y // different line: top-to-bottom
  })

  // Assemble into coherent text lines
  const lines: string[] = []
  let currentLine: string[] = []
  let lastY = items[0].y

  for (const it of items) {
    if (Math.abs(it.y - lastY) >= 6) {
      if (currentLine.length) {
        lines.push(currentLine.join(' ').replace(/\s+/g, ' ').trim())
        currentLine = []
      }
      lastY = it.y
    }
    currentLine.push(it.str)
  }

  if (currentLine.length) {
    lines.push(currentLine.join(' ').replace(/\s+/g, ' ').trim())
  }

  return lines.filter(Boolean).join('\n')
}

/**
 * Splits text into overlapping chunks of words with page-aware metadata.
 */
function createChunksFromPages(
  pages: PdfPageText[],
  docId: string,
  docName: string,
  chunkSizeWords = 350,
  overlapWords = 50
): PdfChunk[] {
  const chunks: PdfChunk[] = []
  let globalChunkIndex = 0

  for (const { pageNumber, text } of pages) {
    if (!text.trim()) continue
    const words = text.split(/\s+/)
    if (words.length <= chunkSizeWords) {
      chunks.push({
        id: `${docId}_p${pageNumber}_c${globalChunkIndex}`,
        docId,
        docName,
        pageNumber,
        chunkIndex: globalChunkIndex++,
        text: text.trim(),
        tokenCountEstimate: Math.round(words.length * 1.3),
      })
      continue
    }

    let start = 0
    while (start < words.length) {
      const end = Math.min(start + chunkSizeWords, words.length)
      const chunkWords = words.slice(start, end)
      const chunkText = chunkWords.join(' ').trim()

      if (chunkText.length > 0) {
        chunks.push({
          id: `${docId}_p${pageNumber}_c${globalChunkIndex}`,
          docId,
          docName,
          pageNumber,
          chunkIndex: globalChunkIndex++,
          text: chunkText,
          tokenCountEstimate: Math.round(chunkWords.length * 1.3),
        })
      }

      if (end >= words.length) break
      start += Math.max(1, chunkSizeWords - overlapWords)
    }
  }

  return chunks
}

/**
 * Extracts and chunks text from a PDF file with timeout (default 60s) and abort signal support.
 */
export async function extractPdf(file: File, options: PdfExtractOptions = {}): Promise<PdfExtractResult> {
  const {
    signal,
    timeoutMs = 60000,
    maxPages,
    chunkSizeWords = 350,
    overlapWords = 50,
    onProgress,
    docId: docIdOption,
  } = options

  const docId = docIdOption ?? `doc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  const arrayBuffer = await file.arrayBuffer()

  // Setup timeout & cancellation
  let timeoutId: any = null
  const internalAbortController = new AbortController()

  const handleExternalAbort = () => {
    internalAbortController.abort()
  }

  if (signal) {
    if (signal.aborted) throw new Error('Extracción cancelada por el usuario.')
    signal.addEventListener('abort', handleExternalAbort, { once: true })
  }

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      internalAbortController.abort()
      reject(new Error(`Timeout de extracción excedido (${timeoutMs / 1000}s). El PDF es demasiado complejo o extenso.`))
    }, timeoutMs)
  })

  try {
    const loadingTask = pdfjsLib.getDocument({
      data: arrayBuffer,
      useSystemFonts: true,
    })

    const pdfDoc = await Promise.race([loadingTask.promise, timeoutPromise])
    const totalPages = maxPages ? Math.min(pdfDoc.numPages, maxPages) : pdfDoc.numPages
    const extractedPages: PdfPageText[] = []
    let isPartial = false

    onProgress?.({
      page: 0,
      totalPages,
      percent: 5,
      statusText: `Documento cargado: ${totalPages} páginas. Iniciando lectura...`,
    })

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      if (internalAbortController.signal.aborted || signal?.aborted) {
        isPartial = true
        break
      }

      try {
        const page = await pdfDoc.getPage(pageNum)
        const pageText = await extractPageText(page)
        extractedPages.push({ pageNumber: pageNum, text: pageText })

        const percent = Math.round(5 + (pageNum / totalPages) * 90)
        onProgress?.({
          page: pageNum,
          totalPages,
          percent,
          statusText: `Leyendo página ${pageNum} de ${totalPages}...`,
        })

        // Yield execution to allow UI animation / GC cycle in mobile
        await new Promise((resolve) => setTimeout(resolve, 0))
      } catch (pageErr) {
        console.warn(`[PDF Extractor] Error procesando página ${pageNum}`, pageErr)
      }
    }

    if (!extractedPages.length && isPartial) {
      throw new Error('Extracción cancelada antes de leer la primera página.')
    }

    onProgress?.({
      page: extractedPages.length,
      totalPages,
      percent: 98,
      statusText: 'Estructurando fragmentos semánticos...',
    })

    const chunks = createChunksFromPages(extractedPages, docId, file.name, chunkSizeWords, overlapWords)
    const fullText = extractedPages.map((p) => `--- Página ${p.pageNumber} ---\n${p.text}`).join('\n\n')

    onProgress?.({
      page: extractedPages.length,
      totalPages,
      percent: 100,
      statusText: `¡Listo! ${extractedPages.length} páginas y ${chunks.length} fragmentos extraídos.`,
    })

    return {
      docId,
      filename: file.name,
      totalPages,
      pages: extractedPages,
      fullText,
      chunks,
      partial: isPartial,
    }
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
    if (signal) signal.removeEventListener('abort', handleExternalAbort)
  }
}
