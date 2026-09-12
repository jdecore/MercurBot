import { useCallback, useEffect, useRef, useState } from 'react'
import './App.css'
import { parseAnyFile, validateAnyFile } from './data/universalParser'
import { DashboardProvider, useDashboard } from './state/DashboardContext'
import { Mascota } from './components/ui/Mascota'
import { MascotCustomizer, type MascotFace } from './components/ui/MascotCustomizer'
import { ExcelChat } from './components/excel/ExcelChat'
import { speak } from './lib/tts'
import { getPreferences, savePreferences, DEFAULT_BLOBATAR_NAME } from './lib/storage'
import { ROBOT_UNITS, type MascotaMood, type RobotUnitId } from './types/mascota'
import { ragClient } from './lib/ragClient'
import { PdfProcessingCard, type PdfProcessingState } from './components/dashboard/PdfProcessingCard'
import { PdfViewerDialog } from './components/pdf/PdfViewer'
import { BriefingCard } from './components/pdf/BriefingCard'
import { DocLibrary } from './components/pdf/DocLibrary'
import { savePdfToLibrary, getPdfBytes, listLibrary } from './lib/docLibrary'
import { hashPdfFile } from './lib/fileHash'

function MainDashboard() {
  const {
    error, setError, setLoading,
    pdfDoc, setPdfDoc,
  } = useDashboard()

  const [dragging, setDragging] = useState(false)
  const [mascotaMood, setMascotaMood] = useState<MascotaMood>('neutro')
  const [mascotaSubtitulo, setMascotaSubtitulo] = useState<string>('')
  const [mascotFace, setMascotFace] = useState<MascotFace>(() => getPreferences().mascotFace)
  const [mascotRobot, setMascotRobot] = useState<RobotUnitId>(() => getPreferences().mascotRobot)
  const [blobatarName, setBlobatarName] = useState<string>(() => getPreferences().blobatarName)
  const [pdfProcessing, setPdfProcessing] = useState<PdfProcessingState | null>(null)
  const [briefing, setBriefing] = useState<string | null>(null)
  const [briefingLoading, setBriefingLoading] = useState(false)
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [viewer, setViewer] = useState<{ open: boolean; page: number }>({ open: false, page: 1 })
  const [currentLibId, setCurrentLibId] = useState<string | null>(null)
  const [libraryToken, setLibraryToken] = useState(0)
  const [customizerOpen, setCustomizerOpen] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)
  const skipLibrarySaveRef = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const hasDocument = Boolean(pdfDoc)
  const mascotMeta = ROBOT_UNITS[mascotRobot] || ROBOT_UNITS.helix

  const cancelPdfProcessing = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    setPdfProcessing(null)
    setLoading(false)
    setMascotaMood('duda')
    setMascotaSubtitulo('Lectura cancelada.')
    speak('Lectura cancelada.')
    setTimeout(() => {
      setMascotaMood('neutro')
      setMascotaSubtitulo('')
    }, 4000)
  }, [setLoading])

  // Briefing proactivo (Fase 24C): 1 llamada tras indexar; si falla, sin tarjeta.
  const loadBriefing = useCallback(async (doc: { filename: string; totalPages: number; chunks: { length: number }; fullText: string }) => {
    setBriefing(null)
    setBriefingLoading(true)
    try {
      const sample = doc.fullText.replace(/\s+/g, ' ').trim().slice(0, 4000)
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'summary',
          context: {
            documentType: 'pdf',
            filename: doc.filename,
            totalPages: doc.totalPages,
            chunks: doc.chunks.length,
            sample,
          },
        }),
      })
      const json = (await res.json()) as { text?: string; error?: string }
      if (res.ok && json.text?.trim()) setBriefing(json.text.trim())
    } catch {
      /* degradado silencioso */
    } finally {
      setBriefingLoading(false)
    }
  }, [])

  const parseFile = useCallback(async (file: File) => {
    const valid = validateAnyFile(file)
    if (!valid.valid) { setError(valid.error ?? 'Tipo de archivo no soportado'); return }
    setLoading(true); setError(null)
    setBriefing(null); setBriefingLoading(false)

    try {
      const controller = new AbortController()
      abortControllerRef.current = controller

      setMascotaMood('escaneando')
      setMascotaSubtitulo(`Iniciando lectura de ${file.name}...`)
      setPdfProcessing({
        active: true,
        filename: file.name,
        percent: 5,
        phase: 'reading',
        statusText: 'Extrayendo páginas y estructura...',
        canCancel: true,
      })
      speak(`Iniciando lectura del documento ${file.name}. Espérame un momento.`)

      // Fase 24A: huella estable → mismo archivo, mismo docId, caché OPFS válida.
      const docId = await hashPdfFile(file)
      if (import.meta.env.DEV) console.log('[Copixi] docId', docId)

      const parseResult = await parseAnyFile(file, {
        docId,
        signal: controller.signal,
        timeoutMs: 60000,
        onProgress: (p) => {
          setMascotaMood('pensando')
          setMascotaSubtitulo(`Leyendo pág. ${p.page} de ${p.totalPages}...`)
          setPdfProcessing((prev) => prev ? {
            ...prev,
            percent: Math.min(50, Math.round(5 + (p.page / (p.totalPages || 1)) * 45)),
            statusText: p.statusText,
          } : null)
        },
      })

      const { pdfResult } = parseResult

      // Vectorize / index via Web Worker RAG
      setMascotaMood('pensando')
      setMascotaSubtitulo(`Indexando ${pdfResult.chunks.length} conceptos clave...`)
      setPdfProcessing((prev) => prev ? {
        ...prev,
        percent: 55,
        phase: 'indexing',
        statusText: `Indexando ${pdfResult.chunks.length} fragmentos en tu dispositivo...`,
      } : null)

      ragClient.setProgressListener((prog) => {
        setPdfProcessing((prev) => prev ? {
          ...prev,
          percent: Math.round(50 + (prog.percent * 0.5)),
          statusText: prog.message,
        } : null)
        setMascotaSubtitulo(prog.message)
      })

      await ragClient.indexDocument(pdfResult.docId, file.name, pdfResult.chunks)

      // Ready!
      if (!pdfResult.fullText.trim()) {
        throw new Error('Este PDF parece escaneado (solo imágenes) y no contiene texto extraíble. Prueba con un PDF con texto seleccionable.')
      }
      setPdfFile(file)
      setPdfDoc(pdfResult)
      // Guardar en biblioteca de recientes (OPFS, sin bloquear).
      // Al re-abrir desde la biblioteca no se duplica la entrada.
      if (skipLibrarySaveRef.current) {
        skipLibrarySaveRef.current = false
      } else {
        void savePdfToLibrary(file).then((d) => {
          if (d) {
            setCurrentLibId(d.id)
            setLibraryToken((t) => t + 1)
          }
        })
      }
      setMascotaMood('exito')
      const readyMsg = `¡Listo! Ya leí todo el documento (${pdfResult.totalPages} págs · ${pdfResult.chunks.length} fragmentos). Pregúntame lo que necesites.`
      setMascotaSubtitulo(readyMsg)
      speak(`Documento ${file.name} procesado con éxito. Estoy listo para responder tus preguntas.`)
      setPdfProcessing(null)
      abortControllerRef.current = null
      void loadBriefing(pdfResult)
    } catch (err) {
      setMascotaMood('duda')
      setPdfProcessing(null)
      abortControllerRef.current = null
      const errName = (err as { name?: string } | null)?.name
      const msg = errName === 'PasswordException'
        ? 'Este PDF está protegido con contraseña. Quítale la protección e inténtalo de nuevo.'
        : err instanceof Error ? err.message : 'Failed to parse file'
      setError(msg)
      setMascotaSubtitulo(msg)
    } finally {
      setLoading(false)
    }
  }, [setError, setLoading, setPdfDoc, loadBriefing])

  // Las citas [Pág. N] del chat abren el visor embebido en esa página.
  useEffect(() => {
    const handler = (e: Event) => {
      const page = (e as CustomEvent<number>).detail
      if (!Number.isFinite(page)) return
      setViewer({ open: true, page: Math.max(1, Math.floor(page as number)) })
    }
    const openHandler = () => setViewer((v) => ({ open: true, page: v.page || 1 }))
    window.addEventListener('copixi:goto-page', handler as EventListener)
    window.addEventListener('copixi:open-viewer', openHandler)
    return () => {
      window.removeEventListener('copixi:goto-page', handler as EventListener)
      window.removeEventListener('copixi:open-viewer', openHandler)
    }
  }, [])

  // Re-abrir un PDF de la biblioteca sin volver a subirlo.
  const openLibraryDoc = useCallback(async (id: string) => {
    const meta = listLibrary().find((d) => d.id === id)
    if (!meta) {
      setError('Ese documento ya no está en recientes. Súbelo de nuevo.')
      return
    }
    if (id === currentLibId && pdfDoc) return
    setLoading(true)
    setError(null)
    try {
      const bytes = await getPdfBytes(id)
      if (!bytes) throw new Error('No se encontraron los datos guardados. Súbelo de nuevo.')
      skipLibrarySaveRef.current = true
      setCurrentLibId(id)
      await parseFile(new File([bytes], meta.name, { type: 'application/pdf' }))
    } catch (err) {
      skipLibrarySaveRef.current = false
      setError(err instanceof Error ? err.message : 'No se pudo abrir el documento.')
      setLoading(false)
    }
  }, [currentLibId, pdfDoc, parseFile, setError, setLoading])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) parseFile(file)
  }, [parseFile])

  return (
    <div className="canvas-wrapper">
      {/* Floating Minimal Controls Bar */}
      <div className="canvas-top-bar" role="navigation" aria-label="Controles rápidos">
        <div className="canvas-brand" aria-label="Copixi AI">
          <span className="brand-mark" aria-hidden>◈</span>
          <span className="brand-title">Copixi</span>
          <span className="brand-badge">Analista de documentos PDF</span>
        </div>

        <div className="canvas-actions">
          {hasDocument && pdfDoc && (
            <div className="dataset-pill" title={pdfDoc.filename}>
              <i className="pixelart-icons-font-file" aria-hidden />
              <span>{pdfDoc.filename} ({pdfDoc.totalPages} págs · {pdfDoc.chunks.length} fragmentos)</span>
            </div>
          )}
          <button
            type="button"
            className="btn btn-secondary small"
            onClick={() => inputRef.current?.click()}
          >
            📄 Cargar PDF
          </button>
          <DocLibrary
            currentId={currentLibId}
            refreshToken={libraryToken}
            onOpen={(doc) => void openLibraryDoc(doc.id)}
            onRemoved={() => {
              setCurrentLibId(null)
              setLibraryToken((t) => t + 1)
            }}
          />
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,application/pdf"
            hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) parseFile(f) }}
          />
        </div>
      </div>

      <main className="main-canvas" id="main-content">
        <section
          className={`hero-excel ${dragging ? 'dropping' : ''}`}
          aria-label="Escenario interactivo del Robot Analista"
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          {/* Top Stage: robot único personalizable (más grande) */}
          <div className="mascot-stage">
            <Mascota
              variant={mascotFace === 'blobatar' ? 'blobatar' : mascotRobot}
              avatarName={blobatarName}
              mood={mascotaMood}
              subtitulo={mascotaSubtitulo}
              size={260}
              onClick={() => speak(mascotFace === 'blobatar'
                ? `¡Hola! Soy ${blobatarName || DEFAULT_BLOBATAR_NAME}, tu avatar analista. Carga tu documento PDF para comenzar.`
                : hasDocument ? `Unidad ${mascotMeta.name} lista. ${mascotMeta.tagline}` : `¡Hola! Soy ${mascotMeta.name}. ${mascotMeta.tagline} Carga tu documento PDF para comenzar.`)}
            />
            <div className="customizer-toggle-row">
              <button
                type="button"
                className="btn btn-secondary small"
                onClick={() => setCustomizerOpen((o) => !o)}
                aria-expanded={customizerOpen}
                title="Cambiar la cara del robot"
              >
                ⚙ Personalizar robot
              </button>
            </div>
            {customizerOpen && (
              <MascotCustomizer
                face={mascotFace}
                robot={mascotRobot}
                name={blobatarName}
                onChange={(face, robot, name) => {
                  setMascotFace(face)
                  setMascotRobot(robot)
                  setBlobatarName(name)
                  savePreferences({ ...getPreferences(), mascotFace: face, mascotRobot: robot, blobatarName: name })
                }}
              />
            )}
          </div>

          {/* Interactive PDF Processing Banner with Cancel */}
          {pdfProcessing && (
            <PdfProcessingCard state={pdfProcessing} onCancel={cancelPdfProcessing} />
          )}

          {/* Briefing proactivo (Fase 24C): la IA trabaja antes de que escribas */}
          {(briefing || briefingLoading) && (
            <BriefingCard text={briefing} loading={briefingLoading} />
          )}

          {/* Interactive Speech Bubble & Excel Chat & MiniCharts */}
          <ExcelChat onOpenFilePicker={() => inputRef.current?.click()} />

          {error && (
            <div role="alert" className="hero-error">
              <i className="pixelart-icons-font-alert" aria-hidden />
              <span>{error}</span>
            </div>
          )}
        </section>
      </main>

      <PdfViewerDialog
        open={viewer.open}
        file={pdfFile}
        page={viewer.page}
        onPageChange={(page) => setViewer((v) => ({ ...v, page }))}
        onOpenChange={(open) => setViewer((v) => ({ ...v, open }))}
      />
    </div>
  )
}

export function App() {
  return (
    <DashboardProvider>
      <MainDashboard />
    </DashboardProvider>
  )
}

export default App
