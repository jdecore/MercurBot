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

/** Persistencia de workflows de Wayflow en OPFS, asociados a un docId. */
export interface WorkflowDef {
  id: string
  name: string
  graph: string
  updatedAt: string
}

const KEY_WORKFLOW_PREFIX = 'copixi:workflows:'

async function workflowsDir(create: boolean) {
  const root = await navigator.storage.getDirectory()
  return root.getDirectoryHandle('copixi_workflows', { create })
}

async function opfsReadJson<T>(handle: FileSystemFileHandle, fallback: T): Promise<T> {
  try {
    const file = await handle.getFile()
    const text = await file.text()
    return JSON.parse(text) as T
  } catch {
    return fallback
  }
}

async function opfsWriteJson(handle: FileSystemFileHandle, value: unknown): Promise<void> {
  const writable = await handle.createWritable()
  await writable.write(JSON.stringify(value))
  await writable.close()
}

function legacyListWorkflows(docId: string): WorkflowDef[] {
  if (typeof localStorage === 'undefined') return []
  const raw = localStorage.getItem(KEY_WORKFLOW_PREFIX + docId)
  if (!raw) return []
  try {
    const v = JSON.parse(raw) as WorkflowDef[]
    return Array.isArray(v) ? v.filter((w) => w && w.id && w.name) : []
  } catch {
    return []
  }
}

export async function listWorkflows(docId: string): Promise<WorkflowDef[]> {
  if (!opfsSupported()) return legacyListWorkflows(docId)
  try {
    const dir = await workflowsDir(false)
    const handle = await dir.getFileHandle(`${docId}.json`)
    return await opfsReadJson(handle, [])
  } catch {
    return legacyListWorkflows(docId)
  }
}

export async function saveWorkflow(docId: string, workflow: WorkflowDef): Promise<void> {
  const current = await listWorkflows(docId)
  const next = [workflow, ...current.filter((w) => w.id !== workflow.id)]
  const trimmed = next.slice(0, 20)
  if (!opfsSupported()) {
    localStorage.setItem(KEY_WORKFLOW_PREFIX + docId, JSON.stringify(trimmed))
    return
  }
  try {
    const dir = await workflowsDir(true)
    const handle = await dir.getFileHandle(`${docId}.json`, { create: true })
    await opfsWriteJson(handle, trimmed)
  } catch {
    localStorage.setItem(KEY_WORKFLOW_PREFIX + docId, JSON.stringify(trimmed))
  }
}

export async function getWorkflow(docId: string, workflowId: string): Promise<WorkflowDef | null> {
  const all = await listWorkflows(docId)
  return all.find((w) => w.id === workflowId) ?? null
}

export async function removeWorkflow(docId: string, workflowId: string): Promise<WorkflowDef[]> {
  const current = await listWorkflows(docId)
  const next = current.filter((w) => w.id !== workflowId)
  if (!opfsSupported()) {
    localStorage.setItem(KEY_WORKFLOW_PREFIX + docId, JSON.stringify(next))
    return next
  }
  try {
    const dir = await workflowsDir(true)
    const handle = await dir.getFileHandle(`${docId}.json`, { create: true })
    await opfsWriteJson(handle, next)
    return next
  } catch {
    localStorage.setItem(KEY_WORKFLOW_PREFIX + docId, JSON.stringify(next))
    return next
  }
}

