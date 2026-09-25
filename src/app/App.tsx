import { useCallback, useEffect, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import './App.css'
import { parseAnyFile, validateAnyFile } from '../data/universalParser'
import { DashboardProvider, useDashboard } from '../shared/lib/DashboardContext'
import { Mascota } from '../shared/ui/Mascota'
import { Icon } from '../shared/ui/Icon'
import { MascotCustomizer } from '../shared/ui/MascotCustomizer'
import { ExcelChat } from '../widgets/excel/ExcelChat'
import { speak } from '../shared/lib/tts'
import { getPreferences, savePreferences, hasOnboarded, setOnboarded } from '../shared/lib/storage'
import type { RobotConfig } from '../entities/robot/robotSeed'
import { OnboardingTour } from '../widgets/onboarding/OnboardingTour'
import { type MascotaMood, type RobotUnitId } from '../entities/robot/types'
import { ragClient } from '../shared/lib/ragClient'
import { PdfProcessingCard, type PdfProcessingState } from '../widgets/dashboard/PdfProcessingCard'
import { PdfViewerDialog, PdfViewerPanel } from '../widgets/pdf/PdfViewer'
import { Sidebar } from '../widgets/layout/Sidebar'
import { savePdfToLibrary, getPdfBytes, listLibrary } from '../shared/lib/docLibrary'
import { hashPdfFile } from '../shared/lib/fileHash'
import { LocaleProvider, useLocale } from '../shared/lib/locale'
import { BlackHoleUpload } from '../features/pdf-upload/BlackHoleUpload'
import { prewarmModels, getPrewarmState, onPrewarmProgress } from '../shared/lib/preload'
import { initDebug, updateDebugState } from '../shared/lib/debug'

function MainDashboard() {
  const {
    error, setError, setLoading,
    pdfDoc, setPdfDoc,
  } = useDashboard()
  const { t } = useLocale()

  const [dragging, setDragging] = useState(false)
  const [mascotaMood, setMascotaMood] = useState<MascotaMood>('neutro')
  const [mascotaSubtitulo, setMascotaSubtitulo] = useState<string>('')
  const [mascotRobot, setMascotRobot] = useState<RobotUnitId>(() => getPreferences().mascotRobot)
  const [robotConfig, setRobotConfig] = useState(() => getPreferences().robotConfig)
  const [robotName, setRobotName] = useState<string>(() => getPreferences().robotName)
  const [userName, setUserName] = useState<string>(() => getPreferences().userName)
  const [tourOpen, setTourOpen] = useState(() => !hasOnboarded())
  const [pdfProcessing, setPdfProcessing] = useState<PdfProcessingState | null>(null)
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [voiceSessionActive, setVoiceSessionActive] = useState(false)
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

  const speakRef = useRef(speak)

  useEffect(() => {
    speakRef.current = speak
  })

  // Voice session listener (Phase 6): robot shows voice-active state
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ active: boolean }>).detail
      if (detail) setVoiceSessionActive(detail.active)
    }
    window.addEventListener('copixi:voice-session', handler as EventListener)
    return () => window.removeEventListener('copixi:voice-session', handler as EventListener)
  }, [])

  // Mirror prewarm state into debugger (register BEFORE starting prewarm)
  useEffect(() => {
    return onPrewarmProgress(() => {
      updateDebugState({ prewarm: getPrewarmState() })
    })
  }, [])

  // Pre-warm models (embeddings + Laya) in parallel at app startup
  useEffect(() => {
    void prewarmModels()
  }, [])

  // Initialize hidden debugger
  useEffect(() => {
    return initDebug()
  }, [])

  // Track setTimeout IDs to clear them on unmount (prevents state updates on
  // unmounted components and memory leaks from lingering closures).
  const cancelTimeoutRef = useRef<number | null>(null)
  const onboardingTimeoutRef = useRef<number | null>(null)
  const robotMsgTimeoutRef = useRef<number | null>(null)

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
    setPdfProcessing(null)
    setLoading(false)
    setMascotaMood('duda')
    setMascotaSubtitulo(t.readingCancelled)
    speak(t.readingCancelled)
    if (cancelTimeoutRef.current !== null) clearTimeout(cancelTimeoutRef.current)
    cancelTimeoutRef.current = window.setTimeout(() => {
      cancelTimeoutRef.current = null
      setMascotaMood('neutro')
      setMascotaSubtitulo('')
    }, 4000)
  }, [setLoading])

  const parseFile = useCallback(async (file: File) => {
    const valid = validateAnyFile(file)
    if (!valid.valid) { setError(valid.error ?? t.errUnsupportedType); return }
    // Aborta una carga anterior solapada antes de empezar la nueva.
    try {
      abortControllerRef.current?.abort()
    } catch {
      /* ignore */
    }
    abortControllerRef.current = null
    setLoading(true); setError(null)

    try {
      const controller = new AbortController()
      abortControllerRef.current = controller

      setMascotaMood('escaneando')
      setMascotaSubtitulo(t.opening(file.name))
      setPdfProcessing({
        active: true,
        filename: file.name,
        percent: 5,
        phase: 'reading',
        statusText: t.readingPages,
        canCancel: true,
      })
      speak(t.ttsGreeting(file.name))

      // Fase 24A: huella estable → mismo archivo, mismo docId, caché OPFS válida.
      const docId = await hashPdfFile(file)
      if (import.meta.env.DEV) console.log('[MercurBot] docId', docId)

      const parseResult = await parseAnyFile(file, {
        docId,
        signal: controller.signal,
        timeoutMs: 60000,
        onProgress: (p) => {
          setMascotaMood('pensando')
          setMascotaSubtitulo(t.readingPage(p.page, p.totalPages))
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
      setMascotaSubtitulo(t.sortingIdeas)
      setPdfProcessing((prev) => prev ? {
        ...prev,
        percent: 55,
        phase: 'indexing',
        statusText: t.sortingIdeasFull,
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

      // Debugger: RAG indexed
      updateDebugState({ rag: { indexed: true, chunks: pdfResult.chunks.length, lastError: null } })

      // Ready!
      if (!pdfResult.fullText.trim()) {
        throw new Error(t.errScannedPdf)
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
      setPdfProcessing(null)
      abortControllerRef.current = null
    } catch (err) {
      const errName = (err as { name?: string } | null)?.name
      if (errName === 'AbortError') {
        setLoading(false)
        return
      }
      setMascotaMood('duda')
      setPdfProcessing(null)
      abortControllerRef.current = null
      updateDebugState({ rag: { indexed: false, chunks: 0, lastError: err instanceof Error ? err.message : String(err) } })
      const msg = errName === 'PasswordException'
        ? t.errPassword
        : err instanceof Error ? err.message : 'Failed to parse file'
      setError(msg)
      setMascotaSubtitulo(msg)
      // Robot eyes look left on error
      window.dispatchEvent(new CustomEvent('copixi:eye-target', { detail: { direction: 'left' } }))
    } finally {
      setLoading(false)
    }
  }, [setError, setLoading, setPdfDoc, userName])

  // Tutorial de bienvenida (Fase E): guarda nombres + diseño y saluda.
  const finishOnboarding = useCallback((user: string, rName: string, cfg: RobotConfig) => {
    setUserName(user)
    setRobotName(rName)
    setRobotConfig(cfg)
    savePreferences({ ...getPreferences(), userName: user, robotName: rName, robotConfig: cfg })
    setOnboarded()
    const hello = user ? t.onbGreetingWithName(user, rName) : t.onbGreetingNoName(rName)
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

  // Debugger: mirror engine status
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ mode?: 'hybrid' | 'lexical'; model?: string | null; streaming?: boolean }>).detail
      if (detail) {
        updateDebugState({
          engine: {
            mode: detail.mode ?? null,
            model: detail.model ?? null,
            streaming: !!detail.streaming,
          },
        })
      }
    }
    window.addEventListener('copixi:engine-status', handler as EventListener)
    return () => window.removeEventListener('copixi:engine-status', handler as EventListener)
  }, [])

  useEffect(() => {
    const handler = (e: Event) => {
      const status = (e as CustomEvent<string>).detail
      if (status === 'complete') {
        setMascotaMood('exito')
        setMascotaSubtitulo(t.workflowComplete)
    speak(t.workflowComplete)
      } else if (status === 'error') {
        setMascotaMood('duda')
        setMascotaSubtitulo(t.workflowFailed)
        speakRef.current(t.workflowFailed)
      }
    }
    window.addEventListener('copixi:workflow-status', handler as EventListener)
    return () => window.removeEventListener('copixi:workflow-status', handler as EventListener)
  }, [])

  // Robot message event: update subtitle and speak, auto-clear after timeout.
  useEffect(() => {
    const handler = (e: Event) => {
      const text = (e as CustomEvent<{ text: string }>).detail?.text
      if (!text) return
      if (robotMsgTimeoutRef.current !== null) clearTimeout(robotMsgTimeoutRef.current)
      setMascotaSubtitulo(text)
      speak(text)
      robotMsgTimeoutRef.current = window.setTimeout(() => {
        robotMsgTimeoutRef.current = null
        setMascotaSubtitulo('')
      }, 6000)
    }
    window.addEventListener('copixi:robot-message', handler as EventListener)
    return () => window.removeEventListener('copixi:robot-message', handler as EventListener)
  }, [])

  // Cleanup timeouts on unmount to prevent state updates on unmounted component.
  useEffect(() => {
    return () => {
      if (cancelTimeoutRef.current !== null) clearTimeout(cancelTimeoutRef.current)
      if (onboardingTimeoutRef.current !== null) clearTimeout(onboardingTimeoutRef.current)
      if (robotMsgTimeoutRef.current !== null) clearTimeout(robotMsgTimeoutRef.current)
    }
  }, [])

  // Re-abrir un PDF de la biblioteca sin volver a subirlo.
  const openLibraryDoc = useCallback(async (id: string) => {
    const meta = listLibrary().find((d) => d.id === id)
    if (!meta) {
      setError(t.errDocNotInRecents)
      return
    }
    if (id === currentLibId && pdfDoc) return
    setLoading(true)
    setError(null)
    try {
      const bytes = await getPdfBytes(id)
      if (!bytes) throw new Error(t.errDataNotFound)
      skipLibrarySaveRef.current = true
      setCurrentLibId(id)
      await parseFile(new File([bytes], meta.name, { type: 'application/pdf' }))
    } catch (err) {
      skipLibrarySaveRef.current = false
      setError(err instanceof Error ? err.message : t.errCouldNotOpen)
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
        <aside className={`app-sidebar${railCollapsed ? ' rail' : ''}`} aria-label={t.navAria}>
          <div className="sidebar-brand" aria-label="MercurBot AI">
            <div className="brand-mark" aria-hidden>MB</div>
            <span className="brand-title">MercurBot</span>
            <span className="brand-sub">{t.brandSub}</span>
          </div>
          {sidebar}
        </aside>

        <div className="app-main">
          <button
            type="button"
            className="btn btn-secondary small fab-menu"
            onClick={() => setSidebarOpen(true)}
            aria-label={t.openNav}
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
          aria-label={hasDocument ? 'Escenario interactivo del Robot Analista' : 'MercurBot — AI document intelligence'}
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          {/* ─── LANDING (no document) ─── */}
          {!hasDocument && (
            <div className="landing">
              <header className="landing-hero">
                <div className="landing-hero-badge">{t.heroTag}</div>
                <h1 className="landing-hero-title">{t.heroTitle}</h1>
                <p className="landing-hero-sub">{t.heroSub}</p>
                <div className="landing-hero-robot">
                  <Mascota
                    variant={mascotRobot}
                    config={robotConfig}
                    mood={mascotaMood}
                    subtitulo=""
                    size={225}
                  />
                </div>
              </header>
              <div className="landing-blackhole">
                <BlackHoleUpload onFile={parseFile} size={180} />
              </div>
            </div>
          )}

          {/* ─── PRODUCT (with document) ─── */}
          {hasDocument && (
            <div className="mascot-stage compact">
              <div className="robot-orbit" data-state={voiceSessionActive ? 'listening' : mascotaMood === 'pensando' ? 'thinking' : mascotaMood === 'hablando' ? 'speaking' : mascotaMood === 'escuchando' ? 'listening' : 'idle'}>
                <Mascota
                  variant={mascotRobot}
                  config={robotConfig}
                  mood={mascotaMood}
                  subtitulo={mascotaSubtitulo}
                  size={72}
                  voiceActive={voiceSessionActive}
                />
              </div>
              <p className="mascot-greeting" aria-live="polite">
                {mascotaSubtitulo || t.greetingDoc(robotName, pdfDoc?.filename ?? '')}
              </p>
            </div>
          )}

          {/* Customizer dialog (accessible via sidebar) */}
          <Dialog.Root open={customizerOpen} onOpenChange={setCustomizerOpen}>
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
                      {t.customizerTitle(robotName)}
                    </Dialog.Title>
                    <p className="customizer-card-sub">
                      {t.customizerDesc}
                    </p>
                  </div>
                  <Dialog.Close className="btn btn-secondary small" aria-label={t.closeCustomizer}>
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

          {/* Interactive PDF Processing Banner with Cancel */}
          {pdfProcessing && (
            <PdfProcessingCard state={pdfProcessing} onCancel={cancelPdfProcessing} />
          )}

          {/* Briefing proactivo (Fase 24C): la IA trabaja antes de que escribas */}
          <div className={showSplit ? 'doc-split' : 'doc-stack'}>
            <div className="doc-chat-col">

              {hasDocument && pdfFile && !panelVisible && (
                <button
                  type="button"
                  className="btn btn-secondary small"
                  onClick={() => setPanelVisible(true)}
                >
                  <Icon name="file" size={14} /> {t.showDoc}
                </button>
              )}

              {/* Interactive Speech Bubble & Excel Chat & MiniCharts */}
              <ExcelChat />

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
            aria-label={t.navAria}
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <div className="sidebar-drawer-head">
              <div className="sidebar-brand" aria-label="MercurBot AI">
                <div className="brand-mark" aria-hidden>MB</div>
                <span className="brand-title">MercurBot</span>
              </div>
              <Dialog.Close className="btn btn-secondary small" aria-label={t.closeNav}>
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
    <LocaleProvider>
      <DashboardProvider>
        <MainDashboard />
      </DashboardProvider>
    </LocaleProvider>
  )
}

export default App
