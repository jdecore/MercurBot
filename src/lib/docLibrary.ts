/**
 * MercurBot — Biblioteca de PDFs recientes (P1).
 *
 * Los bytes del PDF se guardan en OPFS (Origin Private File System, sin
 * límite práctico de 5 MB como localStorage) y solo los metadatos en
 * localStorage. Al cambiar de documento se re-extrae y re-indexa desde los
 * bytes guardados (el worker ya persiste vectores, pero re-indexar es el
 * camino simple y robusto). Todo 100% local, sin backend (§8, §11).
 */

export interface LibDoc {
  id: string
  name: string
  size: number
  addedAt: string
}

const KEY_LIBRARY = 'copixi:doc-library'
const MAX_DOCS = 10

function safeParse(raw: string | null): LibDoc[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw) as LibDoc[]
    return Array.isArray(v) ? v.filter((d) => d && d.id && d.name) : []
  } catch {
    return []
  }
}

export function listLibrary(): LibDoc[] {
  if (typeof localStorage === 'undefined') return []
  return safeParse(localStorage.getItem(KEY_LIBRARY))
}

function writeLibrary(docs: LibDoc[]): void {
  localStorage.setItem(KEY_LIBRARY, JSON.stringify(docs.slice(0, MAX_DOCS)))
}

function opfsSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.storage?.getDirectory
}

async function docsDir(create: boolean) {
  const root = await navigator.storage.getDirectory()
  return root.getDirectoryHandle('copixi_docs', { create })
}

function makeId(file: File): string {
  const base = `${file.name}|${file.size}|${Date.now()}`
  let h = 0
  for (let i = 0; i < base.length; i++) h = (Math.imul(h, 31) + base.charCodeAt(i)) | 0
  return `doc_${Date.now().toString(36)}_${(h >>> 0).toString(36)}`
}

/** Guarda el PDF en la biblioteca. No bloquea al llamador si OPFS falla. */
export async function savePdfToLibrary(file: File): Promise<LibDoc | null> {
  const doc: LibDoc = {
    id: makeId(file),
    name: file.name,
    size: file.size,
    addedAt: new Date().toISOString(),
  }
  try {
    if (!opfsSupported()) return null
    const dir = await docsDir(true)
    const handle = await dir.getFileHandle(`${doc.id}.pdf`, { create: true })
    const writable = await handle.createWritable()
    await writable.write(file)
    await writable.close()
  } catch (err) {
    console.warn('[DocLibrary] OPFS write falló, solo metadatos:', err)
    return null
  }
  const docs = [doc, ...listLibrary().filter((d) => d.id !== doc.id)].slice(0, MAX_DOCS)
  // LRU: borra bytes de los que salen de la lista
  const evicted = listLibrary().filter((d) => !docs.some((k) => k.id === d.id))
  writeLibrary(docs)
  for (const e of evicted) void removePdfBytes(e.id)
  return doc
}

/** Recupera los bytes de un documento guardado (para re-abrir sin re-subir). */
export async function getPdfBytes(id: string): Promise<ArrayBuffer | null> {
  try {
    if (!opfsSupported()) return null
    const dir = await docsDir(false)
    const handle = await dir.getFileHandle(`${id}.pdf`)
    const blob = await handle.getFile()
    return await blob.arrayBuffer()
  } catch {
    return null
  }
}

async function removePdfBytes(id: string): Promise<void> {
  try {
    if (!opfsSupported()) return
    const dir = await docsDir(false)
    await dir.removeEntry(`${id}.pdf`)
  } catch {
    /* ignore */
  }
}

export async function removeFromLibrary(id: string): Promise<LibDoc[]> {
  const docs = listLibrary().filter((d) => d.id !== id)
  writeLibrary(docs)
  await removePdfBytes(id)
  return docs
}
