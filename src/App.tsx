import { useCallback, useEffect, useRef, useState } from 'react'
import './App.css'
import { parseAnyFile, validateAnyFile } from './data/universalParser'
import { DashboardProvider, useDashboard } from './state/DashboardContext'
import { Mascota } from './components/ui/Mascota'
import { Icon } from './components/ui/Icon'
import { MascotCustomizer, type MascotFace } from './components/ui/MascotCustomizer'
import { ExcelChat } from './components/excel/ExcelChat'
import { speak } from './lib/tts'
import { getPreferences, savePreferences, DEFAULT_BLOBATAR_NAME, hasOnboarded, setOnboarded } from './lib/storage'
import type { RobotConfig } from './lib/robotSeed'
import { OnboardingTour } from './components/onboarding/OnboardingTour'
import { type MascotaMood, type RobotUnitId } from './types/mascota'
import { ragClient } from './lib/ragClient'
import { PdfProcessingCard, type PdfProcessingState } from './components/dashboard/PdfProcessingCard'
import { PdfViewerDialog, PdfViewerPanel } from './components/pdf/PdfViewer'
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
  const [robotConfig, setRobotConfig] = useState(() => getPreferences().robotConfig)
  const [robotName, setRobotName] = useState<string>(() => getPreferences().robotName)
  const [userName, setUserName] = useState<string>(() => getPreferences().userName)
  const [tourOpen, setTourOpen] = useState(() => !hasOnboarded())
  const [pdfProcessing, setPdfProcessing] = useState<PdfProcessingState | null>(null)
  const [briefing, setBriefing] = useState<string | null>(null)
  const [briefingLoading, setBriefingLoading] = useState(false)
  const briefingReqRef = useRef(0)
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [viewer, setViewer] = useState<{ open: boolean; page: number }>({ open: false, page: 1 })
  // Fase A — panel lateral: página visible + visibilidad (volver a vista centrada).
  const [panelPage, setPanelPage] = useState(1)
  const [panelVisible, setPanelVisible] = useState(true)
  // Fase B — texto a resaltar en el visor (query + nonce para re-disparar).
  const [panelHighlight, setPanelHighlight] = useState<{ query: string; nonce: number } | null>(null)
  const [currentLibId, setCurrentLibId] = useState<string | null>(null)
  const [libraryToken, setLibraryToken] = useState(0)
  const [customizerOpen, setCustomizerOpen] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)
  const skipLibrarySaveRef = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const hasDocument = Boolean(pdfDoc)

  const cancelPdfProcessing = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    briefingReqRef.current++ // el briefing en vuelo ya no corresponde
    setBriefing(null)
    setBriefingLoading(false)
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
  // Con contador de petición: un briefing tardío nunca pisa a un documento nuevo.
  const loadBriefing = useCallback(async (doc: { filename: string; totalPages: number; chunks: { length: number }; fullText: string }) => {
    const my = ++briefingReqRef.current
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
      if (my !== briefingReqRef.current) return
      if (res.ok && json.text?.trim()) setBriefing(json.text.trim())
    } catch {
      /* degradado silencioso */
    } finally {
      if (my === briefingReqRef.current) setBriefingLoading(false)
    }
  }, [])

  const parseFile = useCallback(async (file: File) => {
    const valid = validateAnyFile(file)
    if (!valid.valid) { setError(valid.error ?? 'Tipo de archivo no soportado'); return }
    briefingReqRef.current++ // invalida briefings en vuelo del documento anterior
    // Aborta una carga anterior solapada antes de empezar la nueva.
    try {
      abortControllerRef.current?.abort()
    } catch {
      /* ignore */
    }
    abortControllerRef.current = null
    setLoading(true); setError(null)
    setBriefing(null); setBriefingLoading(false)

    try {
      const controller = new AbortController()
      abortControllerRef.current = controller

      setMascotaMood('escaneando')
      setMascotaSubtitulo(`Abriendo ${file.name}…`)
      setPdfProcessing({
        active: true,
        filename: file.name,
        percent: 5,
        phase: 'reading',
        statusText: 'Leyendo las páginas…',
        canCancel: true,
      })
      speak(`Voy a leer ${file.name}, dame un momento.`)

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
      setMascotaSubtitulo('Ordenando las ideas…')
      setPdfProcessing((prev) => prev ? {
        ...prev,
        percent: 55,
        phase: 'indexing',
        statusText: 'Ordenando las ideas en tu dispositivo…',
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
      // Fase A: documento nuevo → panel visible desde la página 1.
      setPanelPage(1)
      setPanelVisible(true)
      setPanelHighlight(null)
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
      const readyMsg = userName
        ? `¡Listo, ${userName}! Ya leí ${pdfResult.filename} (${pdfResult.totalPages} págs). Pregúntame lo que quieras.`
        : `¡Listo! Ya leí ${pdfResult.filename} (${pdfResult.totalPages} págs). Pregúntame lo que quieras.`
      setMascotaSubtitulo(readyMsg)
      speak(userName ? `Ya leí tu documento, ${userName}. Pregúntame lo que quieras.` : 'Ya leí tu documento. Pregúntame lo que quieras.')
      setPdfProcessing(null)
      abortControllerRef.current = null
      void loadBriefing(pdfResult)
    } catch (err) {
      const errName = (err as { name?: string } | null)?.name
      if (errName === 'AbortError') {
        setLoading(false)
        return
      }
      setMascotaMood('duda')
      setPdfProcessing(null)
      abortControllerRef.current = null
      const msg = errName === 'PasswordException'
        ? 'Este PDF está protegido con contraseña. Quítale la protección e inténtalo de nuevo.'
        : err instanceof Error ? err.message : 'Failed to parse file'
      setError(msg)
      setMascotaSubtitulo(msg)
    } finally {
      setLoading(false)
    }
  }, [setError, setLoading, setPdfDoc, loadBriefing, userName])

  // Tutorial de bienvenida (Fase E): guarda nombres + diseño y saluda.
  const finishOnboarding = useCallback((user: string, rName: string, cfg: RobotConfig) => {
    setUserName(user)
    setRobotName(rName)
    setRobotConfig(cfg)
    savePreferences({ ...getPreferences(), userName: user, robotName: rName, robotConfig: cfg })
    setOnboarded()
    const hello = user ? `¡Hola, ${user}! Soy ${rName}. Suelta tu PDF y lo leemos juntos.` : `¡Hola! Soy ${rName}. Suelta tu PDF y lo leemos juntos.`
    setMascotaMood('feliz')
    setMascotaSubtitulo(hello)
    speak(hello)
    setTimeout(() => {
      setMascotaMood('neutro')
      setMascotaSubtitulo('')
    }, 6000)
  }, [])

  // Las citas [Pág. N] del chat navegan al panel lateral (Fase A) y, si el
  // panel está oculto, lo reabren. En pantallas estrechas el panel queda
  // apilado debajo del chat y se hace scroll hasta él.
  // Fase B: el evento puede traer `query` (snippet fuente) para resaltar el
  // fragmento; sin query solo se navega. Se acepta número plano (legacy).
  useEffect(() => {
    const handler = (e: Event) => {
      const raw = (e as CustomEvent<number | { page: number; query?: string }>).detail
      const page = typeof raw === 'number' ? raw : raw?.page
      const query = typeof raw === 'object' && raw ? raw.query : undefined
      if (!Number.isFinite(page)) return
      const p = Math.max(1, Math.floor(page as number))
      setPanelPage(p)
      setPanelVisible(true)
      setPanelHighlight(query ? { query, nonce: Date.now() } : null)
      setViewer((v) => ({ ...v, page: p }))
      const reduceMotion =
        typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
      requestAnimationFrame(() => {
        document.getElementById('pdf-panel')?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest' })
      })
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

  // Fase A — split layout: con documento y panel visible, chat a la
  // izquierda y PDF a la derecha; sin documento (o panel oculto), vista
  // centrada original.
  const showSplit = hasDocument && pdfFile !== null && panelVisible

  return (
    <div className="canvas-wrapper">
      {/* Floating Minimal Controls Bar */}
      <div className="canvas-top-bar" role="navigation" aria-label="Controles rápidos">
        <div className="canvas-brand" aria-label="Copixi AI">
          <span className="brand-mark" aria-hidden>◈</span>
          <span className="brand-title">Copixi</span>
          <span className="brand-sub">tu lector de PDFs</span>
        </div>

        <div className="canvas-actions">
          {hasDocument && pdfDoc && (
            <div className="dataset-pill" title={pdfDoc.filename}>
              <Icon name="file" size={14} />
              <span>Leyendo: {pdfDoc.filename} · {pdfDoc.totalPages} págs</span>
            </div>
          )}
          <button
            type="button"
            className="btn btn-secondary small"
            onClick={() => inputRef.current?.click()}
          >
            <Icon name="upload" size={14} /> Cargar PDF
          </button>
          <button
            type="button"
            className="btn btn-secondary small"
            onClick={() => setTourOpen(true)}
            title="Qué es Copixi y cómo se usa"
          >
            ¿Cómo funciona?
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

      <main className={`main-canvas${showSplit ? ' wide' : ''}`} id="main-content">
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
              config={mascotFace === 'robot' ? robotConfig : undefined}
              mood={mascotaMood}
              subtitulo={mascotaSubtitulo}
              size={180}
              onClick={() => speak(mascotFace === 'blobatar'
                ? `¡Hola! Soy ${blobatarName || DEFAULT_BLOBATAR_NAME}, tu avatar analista. Carga tu documento PDF para comenzar.`
                : hasDocument ? `${robotName} listo${userName ? `, ${userName}` : ''}. Pregúntame lo que quieras de tu documento.` : `¡Hola${userName ? `, ${userName}` : ''}! Soy ${robotName}. Carga tu documento PDF para comenzar.`)}
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
                robotName={robotName}
                config={robotConfig}
                onChange={(face, robot, name, rName, cfg) => {
                  setMascotFace(face)
                  setMascotRobot(robot)
                  setBlobatarName(name)
                  setRobotName(rName)
                  setRobotConfig(cfg)
                  savePreferences({ ...getPreferences(), mascotFace: face, mascotRobot: robot, blobatarName: name, robotName: rName, robotConfig: cfg })
                }}
              />
            )}
          </div>

          {/* Interactive PDF Processing Banner with Cancel */}
          {pdfProcessing && (
            <PdfProcessingCard state={pdfProcessing} onCancel={cancelPdfProcessing} />
          )}

          {/* Briefing proactivo (Fase 24C): la IA trabaja antes de que escribas */}
          <div className={showSplit ? 'doc-split' : 'doc-stack'}>
            <div className="doc-chat-col">
              {(briefing || briefingLoading) && (
                <BriefingCard text={briefing} loading={briefingLoading} />
              )}

              {hasDocument && pdfFile && !panelVisible && (
                <button
                  type="button"
                  className="btn btn-secondary small"
                  onClick={() => setPanelVisible(true)}
                >
                  <Icon name="file" size={14} /> Mostrar documento
                </button>
              )}

              {/* Interactive Speech Bubble & Excel Chat & MiniCharts */}
              <ExcelChat onOpenFilePicker={() => inputRef.current?.click()} />

              {error && (
                <div role="alert" className="hero-error">
                  <Icon name="alert" size={16} />
                  <span>{error}</span>
                </div>
              )}
            </div>

            {showSplit && (
              <PdfViewerPanel
                file={pdfFile}
                page={panelPage}
                onPageChange={(p) => {
                  // Navegación manual: limpia el resaltado de la cita anterior.
                  setPanelPage(p)
                  setPanelHighlight(null)
                }}
                onHide={() => setPanelVisible(false)}
                highlight={panelHighlight}
                docPages={pdfDoc?.pages}
                docFilename={pdfDoc?.filename}
                docId={pdfDoc?.docId}
              />
            )}
          </div>
        </section>
      </main>

      <PdfViewerDialog
        open={viewer.open}
        file={pdfFile}
        page={viewer.page}
        onPageChange={(page) => {
          setViewer((v) => ({ ...v, page }))
          setPanelHighlight(null)
        }}
        onOpenChange={(open) => setViewer((v) => ({ ...v, open }))}
        highlight={panelHighlight}
      />

      <OnboardingTour
        open={tourOpen}
        onOpenChange={setTourOpen}
        initialUserName={userName}
        initialRobotName={robotName}
        onFinish={finishOnboarding}
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
