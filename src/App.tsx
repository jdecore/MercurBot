import { useCallback, useEffect, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import './App.css'
import { parseAnyFile, validateAnyFile } from './data/universalParser'
import { DashboardProvider, useDashboard } from './state/DashboardContext'
import { Mascota } from './components/ui/Mascota'
import { Icon } from './components/ui/Icon'
import { MascotCustomizer } from './components/ui/MascotCustomizer'
import { ExcelChat } from './components/excel/ExcelChat'
import { speak, speakInteraction } from './lib/tts'
import { getPreferences, savePreferences, hasOnboarded, setOnboarded } from './lib/storage'
import type { RobotConfig } from './lib/robotSeed'
import { OnboardingTour } from './components/onboarding/OnboardingTour'
import { type MascotaMood, type RobotUnitId } from './types/mascota'
import { ragClient } from './lib/ragClient'
import { PdfProcessingCard, type PdfProcessingState } from './components/dashboard/PdfProcessingCard'
import { PdfViewerDialog, PdfViewerPanel } from './components/pdf/PdfViewer'
import { BriefingCard } from './components/pdf/BriefingCard'
import { Sidebar } from './components/layout/Sidebar'
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
  const [mascotRobot, setMascotRobot] = useState<RobotUnitId>(() => getPreferences().mascotRobot)
  const [robotConfig, setRobotConfig] = useState(() => getPreferences().robotConfig)
  const [robotName, setRobotName] = useState<string>(() => getPreferences().robotName)
  const [userName, setUserName] = useState<string>(() => getPreferences().userName)
  const [tourOpen, setTourOpen] = useState(() => !hasOnboarded())
  const [pdfProcessing, setPdfProcessing] = useState<PdfProcessingState | null>(null)
  const [briefing, setBriefing] = useState<string | null>(null)
  const [briefingModel, setBriefingModel] = useState<string | undefined>(undefined)
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
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [railCollapsed, setRailCollapsed] = useState(() => getPreferences().sidebarCollapsed)

  // Track setTimeout IDs to clear them on unmount (prevents state updates on
  // unmounted components and memory leaks from lingering closures).
  const cancelTimeoutRef = useRef<number | null>(null)
  const onboardingTimeoutRef = useRef<number | null>(null)

  const toggleRail = useCallback(() => {
    setRailCollapsed((prev) => {
      const next = !prev
      try {
        savePreferences({ ...getPreferences(), sidebarCollapsed: next })
      } catch {
        /* storage lleno o bloqueado: el modo igual aplica en la sesión */
      }
      return next
    })
  }, [])
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
    setBriefingModel(undefined)
    setBriefingLoading(false)
    setPdfProcessing(null)
    setLoading(false)
    setMascotaMood('duda')
    setMascotaSubtitulo('Lectura cancelada.')
    speak('Lectura cancelada.')
    if (cancelTimeoutRef.current !== null) clearTimeout(cancelTimeoutRef.current)
    cancelTimeoutRef.current = window.setTimeout(() => {
      cancelTimeoutRef.current = null
      setMascotaMood('neutro')
      setMascotaSubtitulo('')
    }, 4000)
  }, [setLoading])

  // Briefing proactivo (Fase 24C): 1 llamada tras indexar; si falla, sin tarjeta.
  // Con contador de petición: un briefing tardío nunca pisa a un documento nuevo.
  // Abortable: si el componente se desmonta o el usuario cambia de doc, se cancela.
  const briefingAbortRef = useRef<AbortController | null>(null)
  const loadBriefing = useCallback(async (doc: { filename: string; totalPages: number; chunks: { length: number }; fullText: string }) => {
    const my = ++briefingReqRef.current
    setBriefing(null)
    setBriefingModel(undefined)
    setBriefingLoading(true)
    // Cancel any previous in-flight briefing fetch.
    briefingAbortRef.current?.abort()
    const ctrl = new AbortController()
    briefingAbortRef.current = ctrl
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
        signal: ctrl.signal,
      })
      const json = (await res.json()) as { text?: string; model?: string; error?: string }
      if (my !== briefingReqRef.current) return
      if (res.ok && json.text?.trim()) {
        setBriefing(json.text.trim())
        if (typeof json.model === 'string' && json.model) setBriefingModel(json.model)
      }
    } catch {
      /* degradado silencioso (AbortError incluido) */
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
    setBriefing(null); setBriefingModel(undefined); setBriefingLoading(false)

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
      speakInteraction('file-upload')

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
      // Robot eyes look at PDF panel (right)
      window.dispatchEvent(new CustomEvent('copixi:eye-target', { detail: { direction: 'right' } }))
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
      // Robot eyes look left on error
      window.dispatchEvent(new CustomEvent('copixi:eye-target', { detail: { direction: 'left' } }))
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
    if (onboardingTimeoutRef.current !== null) clearTimeout(onboardingTimeoutRef.current)
    onboardingTimeoutRef.current = window.setTimeout(() => {
      onboardingTimeoutRef.current = null
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

  // El chat publica moods vía `copixi:mascota-mood` (pensando, escuchando,
  // exito, hablando…): este puente los lleva al estado del robot.
  useEffect(() => {
    const handler = (e: Event) => {
      const m = (e as CustomEvent<MascotaMood>).detail
      if (typeof m !== 'string') return
      setMascotaMood(m)
      if (m === 'neutro') setMascotaSubtitulo('')
    }
    window.addEventListener('copixi:mascota-mood', handler as EventListener)
    return () => window.removeEventListener('copixi:mascota-mood', handler as EventListener)
  }, [])

  // Robot con sueño: si no hay actividad del chat en 5 min con documento
  // cargado, el robot se duerme (solo visual; cualquier evento lo despierta
  // porque ExcelChat publica `copixi:engine-status` en cada cambio).
  useEffect(() => {
    if (!hasDocument) return
    let timer: number | null = null
    const arm = () => {
      if (timer !== null) window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        setMascotaMood('dormido')
        setMascotaSubtitulo('')
      }, 5 * 60 * 1000)
    }
    const wake = () => {
      arm()
      setMascotaMood((m) => (m === 'dormido' ? 'neutro' : m))
    }
    arm()
    window.addEventListener('copixi:engine-status', wake as EventListener)
    return () => {
      window.removeEventListener('copixi:engine-status', wake as EventListener)
      if (timer !== null) window.clearTimeout(timer)
    }
  }, [hasDocument])

  // Cleanup timeouts on unmount to prevent state updates on unmounted component.
  useEffect(() => {
    return () => {
      if (cancelTimeoutRef.current !== null) clearTimeout(cancelTimeoutRef.current)
      if (onboardingTimeoutRef.current !== null) clearTimeout(onboardingTimeoutRef.current)
      briefingAbortRef.current?.abort()
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

  // "Nuevo análisis" del sidebar: vuelve al estado vacío sin borrar la
  // biblioteca. El historial del chat es por documento y se recarga solo.
  const newAnalysis = useCallback(() => {
    try {
      abortControllerRef.current?.abort()
    } catch {
      /* ignore */
    }
    abortControllerRef.current = null
    briefingReqRef.current++
    setPdfDoc(null)
    setPdfFile(null)
    setBriefing(null)
    setBriefingModel(undefined)
    setBriefingLoading(false)
    setPdfProcessing(null)
    setError(null)
    setLoading(false)
    setPanelHighlight(null)
    setPanelVisible(true)
    setPanelPage(1)
    setCurrentLibId(null)
    setSidebarOpen(false)
    setMascotaMood('neutro')
    setMascotaSubtitulo('')
  }, [setError, setLoading, setPdfDoc])

  // Fase A — split layout: con documento y panel visible, chat a la
  // izquierda y PDF a la derecha; sin documento (o panel oculto), vista
  // centrada original.
  const showSplit = hasDocument && pdfFile !== null && panelVisible

  const blurActive = () => {
    // El drawer es un Dialog modal: Radix oculta el fondo con aria-hidden al
    // cerrar. Si el foco queda en un botón del drawer, el navegador bloquea
    // el aria-hidden (warning) — se cede el foco antes de cerrar.
    const el = document.activeElement as HTMLElement | null
    if (el && typeof el.blur === 'function') el.blur()
  }

  const sidebar = (
    <Sidebar
      currentId={currentLibId}
      refreshToken={libraryToken}
      hasDocument={hasDocument}
      userName={userName}
      robotName={robotName}
      collapsed={railCollapsed}
      onToggleRail={toggleRail}
      onNewAnalysis={newAnalysis}
      onUpload={() => inputRef.current?.click()}
      onOpenDoc={(doc) => {
        blurActive()
        setSidebarOpen(false)
        void openLibraryDoc(doc.id)
      }}
      onRemoved={() => {
        setCurrentLibId(null)
        setLibraryToken((t) => t + 1)
      }}
      onCustomize={() => {
        blurActive()
        setSidebarOpen(false)
        setCustomizerOpen(true)
      }}
      onHowItWorks={() => {
        blurActive()
        setSidebarOpen(false)
        setTourOpen(true)
      }}
    />
  )

  return (
    <div className="canvas-wrapper">
      <div className={`app-shell${railCollapsed ? ' rail' : ''}`}>
        <aside className={`app-sidebar${railCollapsed ? ' rail' : ''}`} aria-label="Navegación principal">
          <div className="sidebar-brand" aria-label="Copixi AI">
            <span className="brand-mark" aria-hidden>◈</span>
            <span className="brand-title">Copixi</span>
            <span className="brand-sub">tu lector de PDFs</span>
          </div>
          {sidebar}
        </aside>

        <div className="app-main">
          <button
            type="button"
            className="btn btn-secondary small fab-menu"
            onClick={() => setSidebarOpen(true)}
            aria-label="Abrir navegación"
            aria-expanded={sidebarOpen}
          >
            <Icon name="menu" size={16} />
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,application/pdf"
            hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) parseFile(f); e.target.value = '' }}
            aria-hidden
            tabIndex={-1}
          />

      <main className={`main-canvas${showSplit ? ' wide' : ''}`} id="main-content">
        <section
          className={`hero-excel ${dragging ? 'dropping' : ''}`}
          aria-label="Escenario interactivo del Robot Analista"
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          {/* Top Stage: robot único personalizable. Con documento se compacta
              (72px en fila) para devolver espacio vertical al chat; sin
              documento mantiene el héroe grande de bienvenida. */}
          <div className={`mascot-stage${hasDocument ? ' compact' : ''}`}>
            <Mascota
              variant={mascotRobot}
              config={robotConfig}
              mood={mascotaMood}
              subtitulo={hasDocument ? '' : mascotaSubtitulo}
              size={hasDocument ? 72 : 180}
              onClick={() => {
                if (hasDocument) {
                  // Re-lee la última respuesta en voz alta (la sirve ExcelChat).
                  window.dispatchEvent(new CustomEvent('copixi:reread'))
                  return
                }
                speak(`¡Hola${userName ? `, ${userName}` : ''}! Soy ${robotName}. Carga tu documento PDF para comenzar.`)
              }}
            />
            <p className="mascot-greeting" aria-live="polite">
              {hasDocument && pdfDoc
                ? (mascotaSubtitulo || `${robotName} ya leyó ${pdfDoc.filename} — pregúntale lo que quieras. Toca al robot para escuchar la última respuesta.`)
                : `¡Hola${userName ? `, ${userName}` : ''}! Soy ${robotName} — sube un PDF y lo leemos juntos.`}
            </p>
            <div className="customizer-toggle-row">
              <Dialog.Root open={customizerOpen} onOpenChange={setCustomizerOpen}>
                <Dialog.Trigger asChild>
                  <button
                    type="button"
                    className="btn btn-secondary small"
                    title="Cambiar la cara del robot"
                  >
                    ⚙ Personalizar robot
                  </button>
                </Dialog.Trigger>
                <Dialog.Portal>
                  <Dialog.Overlay className="customizer-overlay" />
                  <Dialog.Content
                    className="customizer-card"
                    aria-describedby={undefined}
                    onOpenAutoFocus={(e) => e.preventDefault()}
                  >
                    <div className="customizer-card-head">
                      <div>
                        <Dialog.Title className="customizer-card-title">
                          Personaliza a {robotName || 'tu robot'}
                        </Dialog.Title>
                        <p className="customizer-card-sub">
                          El nombre define su diseño base; cada rasgo se ajusta a mano. Todo se guarda en este navegador.
                        </p>
                      </div>
                      <Dialog.Close className="btn btn-secondary small" aria-label="Cerrar personalización">
                        ✕ Cerrar
                      </Dialog.Close>
                    </div>
                    <MascotCustomizer
                      robot={mascotRobot}
                      robotName={robotName}
                      config={robotConfig}
                      onChange={(robot, rName, cfg) => {
                        setMascotRobot(robot)
                        setRobotName(rName)
                        setRobotConfig(cfg)
                        savePreferences({ ...getPreferences(), mascotRobot: robot, robotName: rName, robotConfig: cfg })
                      }}
                    />
                  </Dialog.Content>
                </Dialog.Portal>
              </Dialog.Root>
            </div>
          </div>

          {/* Interactive PDF Processing Banner with Cancel */}
          {pdfProcessing && (
            <PdfProcessingCard state={pdfProcessing} onCancel={cancelPdfProcessing} />
          )}

          {/* Briefing proactivo (Fase 24C): la IA trabaja antes de que escribas */}
          <div className={showSplit ? 'doc-split' : 'doc-stack'}>
            <div className="doc-chat-col">
              {(briefing || briefingLoading) && (
                <BriefingCard text={briefing} loading={briefingLoading} model={briefingModel} />
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
        </div>{/* /.app-main */}
      </div>{/* /.app-shell */}

      <Dialog.Root open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="sidebar-overlay" />
          <Dialog.Content
            className="sidebar-drawer"
            aria-label="Navegación principal"
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <div className="sidebar-drawer-head">
              <div className="sidebar-brand" aria-label="Copixi AI">
                <span className="brand-mark" aria-hidden>◈</span>
                <span className="brand-title">Copixi</span>
              </div>
              <Dialog.Close className="btn btn-secondary small" aria-label="Cerrar navegación">
                ✕ Cerrar
              </Dialog.Close>
            </div>
            {sidebar}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

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
        // Saltar también cuenta como visto: sin esto el tour reaparecía en
        // cada visita y su overlay bloqueaba toda la UI (incluido el botón
        // Generar gráfica) hasta completarlo. Reabrir con ¿Cómo funciona?
        // sigue disponible porque ese botón fija tourOpen en true.
        onOpenChange={(open) => { if (!open) setOnboarded(); setTourOpen(open) }}
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
