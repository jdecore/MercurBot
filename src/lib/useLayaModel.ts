import { useState, useEffect, useCallback } from 'react'
import {
  isLayaCached,
  getLayaCacheSize,
  downloadLayaModel,
  loadLayaSession,
  deleteLayaCache,
} from './laya'

export interface UseLayaModelResult {
  downloaded: boolean
  loading: boolean
  progress: { phase: string; percent: number } | null
  error: string | null
  sizeBytes: number | null
  download: () => Promise<void>
  deleteModel: () => Promise<void>
}

export function useLayaModel(): UseLayaModelResult {
  const [downloaded, setDownloaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState<{ phase: string; percent: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sizeBytes, setSizeBytes] = useState<number | null>(null)

  // Check cache on mount
  useEffect(() => {
    let cancelled = false
    async function check() {
      try {
        const cached = await isLayaCached()
        if (cancelled) return
        setDownloaded(cached)
        if (cached) {
          const size = await getLayaCacheSize()
          if (!cancelled) setSizeBytes(size)
        }
      } catch {
        /* ignore */
      }
    }
    void check()
    return () => { cancelled = true }
  }, [])

  const download = useCallback(async () => {
    if (loading || downloaded) return
    setLoading(true)
    setError(null)
    setProgress({ phase: 'model', percent: 0 })

    try {
      await downloadLayaModel((phase, percent) => {
        setProgress({ phase, percent })
      })

      // Load the model into ONNX Runtime
      setProgress({ phase: 'loading', percent: 90 })
      await loadLayaSession()

      const size = await getLayaCacheSize()
      setSizeBytes(size)
      setDownloaded(true)
      setProgress(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setProgress(null)
    } finally {
      setLoading(false)
    }
  }, [loading, downloaded])

  const deleteModel = useCallback(async () => {
    try {
      await deleteLayaCache()
      setDownloaded(false)
      setSizeBytes(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  return { downloaded, loading, progress, error, sizeBytes, download, deleteModel }
}
