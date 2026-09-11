import { useCallback, useRef, useState } from 'react'
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
  const abortControllerRef = useRef<AbortController | null>(null)
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

  const parseFile = useCallback(async (file: File) => {
    const valid = validateAnyFile(file)
    if (!valid.valid) { setError(valid.error ?? 'Tipo de archivo no soportado'); return }
    setLoading(true); setError(null)

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

      const parseResult = await parseAnyFile(file, {
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
      setPdfDoc(pdfResult)
      setMascotaMood('exito')
      const readyMsg = `¡Listo! Ya leí todo el documento (${pdfResult.totalPages} págs · ${pdfResult.chunks.length} fragmentos). Pregúntame lo que necesites.`
      setMascotaSubtitulo(readyMsg)
      speak(`Documento ${file.name} procesado con éxito. Estoy listo para responder tus preguntas.`)
      setPdfProcessing(null)
      abortControllerRef.current = null
    } catch (err) {
      setMascotaMood('duda')
      setPdfProcessing(null)
      abortControllerRef.current = null
      const msg = err instanceof Error ? err.message : 'Failed to parse file'
      setError(msg)
      setMascotaSubtitulo(msg)
    } finally {
      setLoading(false)
    }
  }, [setError, setLoading, setPdfDoc])

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
          </div>

          {/* Interactive PDF Processing Banner with Cancel */}
          {pdfProcessing && (
            <PdfProcessingCard state={pdfProcessing} onCancel={cancelPdfProcessing} />
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
