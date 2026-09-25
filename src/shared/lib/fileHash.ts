/**
 * MercurBot — Huella estable de archivo (Fase 24A).
 *
 * FNV-1a sobre `nombre|tamaño|primeros 64 KB|últimos 64 KB`: ~1 ms incluso
 * en PDFs de 30 MB y estable entre sesiones. El hash ES el docId, de modo
 * que el mismo archivo siempre produce los mismos chunk IDs y la caché
 * OPFS de vectores puede acertar (Fase 24B).
 */

const SAMPLE_BYTES = 64 * 1024

function fnv1a(bytes: Uint8Array, seed = 0x811c9dc5): number {
  let h = seed >>> 0
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i]
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

function fnv1aStr(str: string, seed: number): number {
  let h = seed >>> 0
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Huella estable `doc_<base36>` para un archivo. */
export async function hashPdfFile(file: File): Promise<string> {
  const size = file.size
  const head = new Uint8Array(await file.slice(0, SAMPLE_BYTES).arrayBuffer())
  const tail = size > SAMPLE_BYTES
    ? new Uint8Array(await file.slice(size - SAMPLE_BYTES).arrayBuffer())
    : new Uint8Array(0)
  let h = fnv1a(head)
  h = fnv1a(tail, h)
  h = fnv1aStr(`${file.name}|${size}`, h)
  return `doc_${h.toString(36)}`
}
