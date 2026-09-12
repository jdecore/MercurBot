import { useEffect, useState } from 'react'
import { listLibrary, removeFromLibrary, type LibDoc } from '../../lib/docLibrary'

interface DocLibraryProps {
  currentId: string | null
  refreshToken: number
  disabled?: boolean
  onOpen: (doc: LibDoc) => void
  onRemoved: () => void
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/**
 * Biblioteca de PDFs recientes (P1): re-abre documentos guardados en OPFS
 * sin volver a subirlos. Solo metadatos en localStorage; bytes en OPFS.
 */
export function DocLibrary({ currentId, refreshToken, disabled, onOpen, onRemoved }: DocLibraryProps) {
  const [docs, setDocs] = useState<LibDoc[]>([])

  useEffect(() => {
    setDocs(listLibrary())
  }, [refreshToken])

  if (docs.length === 0) return null

  const open = (id: string) => {
    if (!id || disabled) return
    const doc = docs.find((d) => d.id === id)
    if (doc) onOpen(doc)
  }

  const removeCurrent = async () => {
    if (!currentId || disabled) return
    setDocs(await removeFromLibrary(currentId))
    onRemoved()
  }

  const currentInLibrary = currentId !== null && docs.some((d) => d.id === currentId)

  return (
    <div className="doc-library" role="group" aria-label="Documentos recientes">
      <select
        className="btn btn-secondary small doc-library-select"
        defaultValue=""
        onChange={(e) => {
          open(e.target.value)
          e.target.value = ''
        }}
        disabled={disabled}
        aria-label="Abrir documento reciente"
        title="Abrir documento reciente sin volver a subirlo"
      >
        <option value="">Recientes…</option>
        {docs.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name} · {fmtSize(d.size)}
          </option>
        ))}
      </select>
      {currentInLibrary && (
        <button
          type="button"
          className="btn btn-secondary small"
          onClick={() => void removeCurrent()}
          disabled={disabled}
          title="Quitar este documento de recientes"
          aria-label="Quitar este documento de recientes"
        >
          ✕
        </button>
      )}
    </div>
  )
}
