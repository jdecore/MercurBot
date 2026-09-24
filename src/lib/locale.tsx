/**
 * MercurBot Locale — i18n context + dictionaries (landing + product).
 * All user-facing strings live here. Components use useLocale() to access t.*
 */
import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { getPreferences, savePreferences } from './storage'

export type Locale = 'es' | 'en'

/* ──────────────────────────────────────────────────────────────────────
   AUTO-DETECT: navigator.language + Intl timezone → locale.
   Saved preference overrides auto-detect. No manual toggle on sidebar.
   ────────────────────────────────────────────────────────────────────── */
function detectLocale(): Locale {
  try {
    const lang = (navigator.language || '').toLowerCase().slice(0, 2)
    if (lang === 'es') return 'es'
    if (lang === 'en') return 'en'
    // Fallback: timezone heuristic for Spanish speakers
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''
    if (tz.startsWith('America/') && tz !== 'America/New_York' && tz !== 'America/Los_Angeles') return 'es'
    if (tz === 'Europe/Madrid') return 'es'
  } catch { /* ignore */ }
  return 'en'
}

/* ──────────────────────────────────────────────────────────────────────
   LANDING DICT
   ────────────────────────────────────────────────────────────────────── */
export type LandingDict = {
  heroTag: string; heroTitle: string; heroSub: string; heroCTATry: string; heroCTALearn: string
  howTitle: string; howSteps: { label: string; desc: string }[]
  builtTitle: string; builtName: string; builtTags: string; builtText: string
  evoTitle: string; evoToday: string; evoTodayItems: string[]; evoNext: string; evoNextItems: string[]; evoLater: string; evoLaterItems: string[]
  validTitle: string; validBadge: string; validText: string
  whyTitle: string; whyText: string; whyPath: string[]
  roadTitle: string; roadNow: string; roadNowItems: string[]; roadNext: string; roadNextItems: string[]; roadLater: string; roadLaterItems: string[]
  techTitle: string; techItems: string[]
  builderName: string; builderTags: string; builderTagline: string
  navProduct: string; navHow: string; navChemistry: string; navRoadmap: string; navTry: string
}

/* ──────────────────────────────────────────────────────────────────────
   PRODUCT DICT — every user-facing string in the app
   ────────────────────────────────────────────────────────────────────── */
export type ProductDict = {
  // ── App shell ──
  brandSub: string; navAria: string; openNav: string; closeNav: string
  customizerTitle: (name: string) => string; customizerDesc: string; closeCustomizer: string
  showDoc: string
  // ── Errors ──
  errUnsupportedType: string; errScannedPdf: string; errPassword: string
  errDocNotInRecents: string; errDataNotFound: string; errCouldNotOpen: string
  // ── PDF processing ──
  opening: (name: string) => string; readingPages: string; sortingIdeas: string
  sortingIdeasFull: string; readingPage: (p: number, t: number) => string
  readyWithName: (name: string, file: string, pages: number) => string
  readyNoName: (file: string, pages: number) => string
  ttsReadyWithName: (name: string) => string; ttsReadyNoName: string
  ttsGreeting: (name: string) => string
  // ── Onboarding ──
  onbGreetingWithName: (user: string, rName: string) => string; onbGreetingNoName: (rName: string) => string
  // ── Workflow ──
  workflowComplete: string; workflowFailed: string; readingCancelled: string
  // ── Brand ──
  greetingDoc: (robot: string, file: string) => string
  // ── Chat ──
  chatAria: string; loading: string; errHeading: string; errNoService: string
  err429: string; err404: string; err500: string; err504: string; errNetwork: string; errGeneric: string
  retryBtn: string; sourcesAria: string; sourcesPrefix: string
  pageLabel: (n: number) => string; viewPage: (n: number) => string; viewPageBtn: string
  copyBtn: string; copied: string; copyAria: string; downloadAria: string
  chartRejected: string; chartDrawing: string; chartScope: (s: string) => string
  chartVerifyNotice: (d: number, t: number) => string; noChartData: string
  idlePrompt: (name: string) => string; dropTitle: string; dropHint: string
  showLog: (n: number) => string; hideLog: string; clearChat: string; changeFile: string
  errRequest: string; errConnection: string; retryChat: string
  startersTitle: string; startersDesc: string; startersUpload: string
  suggestSummary: string; suggestSummaryQ: string; suggestCite: string; suggestCiteQ: string
  suggestSearch: string; suggestSearchQ: string; suggestChart: string; suggestChartQ: string
  attachTitle: string; attachAria: string
  dictUnavailable: string; dictInsecure: string; dictStop: string; dictStart: string
  ttsOn: string; ttsOff: string; stopAudio: string; workflowBtn: string; workflowAria: string
  placeholderDoc: (name: string) => string; placeholderNoDoc: string; inputAria: string
  dropOr: string
  stopBtn: string; sendBtn: string; listening: string; speakNow: string; dictNoApi: string; dictNoHttps: string
  noChartRange: (range: string) => string; noChartNarrative: (range: string) => string
  noChartSingular: (range: string, n: number) => string; modelPill: (model: string) => string
  matchLexical: string; matchVector: string; matchHybrid: string
  // ── PDF Viewer ──
  searchPlaceholder: string; searchAria: string; searchResultsAria: string
  searchEmpty: string; pdfLoadError: string; emptyState: string; highlightMiss: string
  pageInfo: (page: number, total: number, name: string) => string
  prevPage: string; prevBtn: string; nextPage: string; nextBtn: string
  viewerTitle: (name: string, page: number) => string
  closeViewer: string; docPanelAria: string; docPanelTitle: string; docFallback: string
  chartDisabledTip: string; chartDisabledAria: string; chartGenBtn: string
  hidePanel: string; hidePanelAria: string; hideBtn: string

  // ── ChartFull ──
  cfScanned: string; cfNoText: string; cf429: string; cf413: string
  cf404: string; cf502: string; cf504: string; cfHttp: (s: number) => string
  cfEmpty: string; cfCatch: string
  cfScopeTrunc: (s: string, t: number) => string; cfScopeFull: (t: number) => string
  cfWarnZero: string; cfWarnLow: (n: number) => string
  cfTitle: string; cfAria: string; cfBtn: string; cfSend: string
  cfConfirmAria: string; cfConsentPrefix: string; cfConsentTrunc: string; cfConsentFull: string; cfConsentSuffix: string
  cfCancel: string; cfWorking: (s: string) => string; cfStop: string; cfFailed: string; cfClose: string; cfRetry: string
  // ── Briefing ──
  briefAria: string; briefTitle: string; briefLoading: string
  // ── Sidebar ──
  sbNewAnalysis: string; sbUpload: string; sbWorkflow: string; sbRecentsExpand: string
  sbCustomize: (user: string, robot: string) => string; sbExpand: string; sbRecents: string
  sbEmpty: string; sbRemove: (name: string) => string; sbPrivacy: string
  sbLocalUser: string; sbReadingPdf: string; sbNoDoc: string; sbCustomizeBtn: string
  sbHowItWorks: string; sbCollapse: string
  // ── Engine Status ──
  esIdleTitle: string; esIdleCompact: string; esIdleFull: string; esDownloadingModels: string
  esStreamTitle: string; esStreamCompact: string; esStreamFull: string
  esModeHybrid: string; esModeLiteral: string; esModeReady: string
  esReadyTitle: (mode: string, model?: string) => string; esIndexedTitle: string
  // ── Onboarding Tour ──
  otEyesRound: string; otEyesVisor: string; otEyesHappy: string; otEyesSleepy: string; otEyesBig: string
  otStep0Title: string; otStep1Title: string; otStep2Title: string; otStep3Title: string; otStep4Title: string; otStep5Title: string; otSrDesc: string
  otIntro: string; otPrivacy: string
  otNameLabel: string; otNamePlaceholder: string; otNameAria: string
  otRobotLabel: string; otRobotAria: string
  otThemesLabel: string; otThemesAria: string; otEyesLabel: string; otEyesAria: string
  otRandomBtn: string
  otStep5Drop: string; otStep5DropSub: string; otStep5Ask: string; otStep5AskSub: string
  otStep5Cite: string; otStep5CiteSub: string
  otClosing: (user: string, robot: string) => string
  otBack: string; otNext: string; otStart: string; otSkipAria: string; otSkip: string
  // ── Mascot Customizer ──
  mcEyesRound: string; mcEyesVisor: string; mcEyesHappy: string; mcEyesSleepy: string; mcEyesBig: string
  mcAccNone: string; mcAccAntenna: string; mcAccFins: string; mcAccHeadphones: string
  mcAccTuft: string; mcAccGlasses: string; mcAccBow: string; mcAccCap: string
  mcAria: string; mcTabsAria: string; mcTabStyle: string; mcTabDetails: string
  mcThemesLabel: string; mcThemesHeading: string; mcThemesAria: string; mcThemeLabel: (l: string) => string
  mcNameAria: string; mcNameHeading: string; mcNameInputAria: string; mcRandomBtn: string; mcRandomLabel: string
  mcDesignAria: string; mcDesignHeading: string; mcDesignLabel: (l: string) => string
  mcEyesHeading: string; mcEyesGroupAria: string
  mcAccHeading: string; mcAccGroupAria: string
  // ── Locale Override ──
  mcLangHeading: string; mcLangGroupAria: string
  mcLangAuto: string; mcLangEs: string; mcLangEn: string
  // ── ErrorBoundary ──
  ebTitle: string; ebMsg: string; ebHint: string; ebRetry: string
  // ── Processing Card ──
  pcProgress: (p: number) => string; pcCancelTitle: string; pcCancelBtn: string
  // ── Dictation ──
  dictMicBlocked: string; dictNoSound: string; dictNoMic: string; dictNeedsNet: string; dictStopped: string
  // ── TTS ──
  ttsCodeSkip: string
  // ── Rag Client ──
  ragReady: string; ragReadyLight: string
  // ── Universal Parser ──
  upUnsupported: (ext: string) => string; upWrongFormat: (ext: string) => string
  upEmpty: string; upTooLarge: (mb: number) => string
  // ── PDF Extractor ──
  peCancelled: string; peTimeout: (s: number) => string; peLoaded: (n: number) => string
  peReading: (p: number, t: number) => string; peCancelledBefore: string
  peStructuring: string; peDone: (n: number) => string
  // ── RAG Worker ──
  rwLoadingModel: string; rwDownloading: (p: number) => string; rwIndexReady: string
  rwCached: (n: number) => string; rwVectorizing: (done: number, total: number) => string
  // ── Match types ──
  matchLiteral: string; matchSemantic: string; matchCombined: string
  // ── Additional Chat Keys ──
  scannedPdfError: string; errServer: string
  timeoutError: string; retryError: string
  chartDiscarded: string; copyResponse: string; downloadMd: string; downloadMdAria: string
  chatLogHide: string; chatLogShow: (n: number) => string
  clearChatAria: string; noDataVerified: (d: number, t: number) => string
  uploadPdf: string; startersGroup: string
  suggestResume: string; suggestResumeQ: string
  changeFileAria: string
  inputPlaceholder: (name: string) => string; inputPlaceholderEmpty: string
}

export type FullDict = LandingDict & ProductDict

/* ──────────────────────────────────────────────────────────────────────
   ENGLISH DICTIONARY
   ────────────────────────────────────────────────────────────────────── */
const enDict: FullDict = {
  // ── Landing ──
  heroTag: 'Your documents, your AI — no hallucinations',
  heroTitle: 'MercurBot',
  heroSub: 'Analyze scientific PDFs, extract knowledge and interact with technical information using LLMs, RAG and AI agents.',
  heroCTATry: 'Try MercurBot',
  heroCTALearn: 'See how it works',
  howTitle: 'How it works',
  howSteps: [
    { label: 'Upload a PDF', desc: 'Drag & drop any scientific or technical document.' },
    { label: 'AI analyzes it', desc: 'RAG indexes pages, chunks text, generates embeddings — all in your browser.' },
    { label: 'Ask anything', desc: 'Get answers with verifiable [Page N] citations from the source document.' },
  ],
  builtTitle: 'What I built',
  builtName: 'Built by Juan Enriquez Ramos',
  builtTags: 'LLMs · RAG · APIs · AI Agents',
  builtText: 'MercurBot started as an experiment in AI-powered document analysis. I designed and developed the full prototype — from the RAG pipeline to the streaming chat interface — using LLMs, RAG, APIs and AI agents.',
  evoTitle: 'From PDF Assistant → Chemistry AI',
  evoToday: 'TODAY',
  evoTodayItems: ['PDF analysis', 'RAG with page citations', 'LLM interaction', 'AI agents'],
  evoNext: 'NEXT',
  evoNextItems: ['Chemistry-specific workflows', 'Scientific literature integration', 'Specialized chemistry tools', 'Decision-making workflows'],
  evoLater: 'LATER',
  evoLaterItems: ['Tool-using AI agents', 'Autonomous chemistry reasoning'],
  validTitle: 'Being tested in the real world',
  validBadge: 'Early validation · Beta',
  validText: 'A chemistry professional currently working in industry is testing MercurBot\'s beta to identify improvements and explore its potential for real-world chemical workflows.',
  whyTitle: 'Why chemistry?',
  whyText: 'MercurBot started as a general PDF AI tool. My background in biochemistry and computational biology led me to explore how it could become a specialized AI tool for chemistry — where domain-specific document analysis creates real value.',
  whyPath: ['Biochemistry', 'Computational Biology', 'AI', 'Chemistry Product'],
  roadTitle: 'Roadmap',
  roadNow: 'Now',
  roadNowItems: ['PDF analysis', 'RAG', 'LLMs'],
  roadNext: 'Next',
  roadNextItems: ['Chemistry workflows', 'Scientific literature', 'Specialized tools'],
  roadLater: 'Later',
  roadLaterItems: ['Tool-using AI agents', 'Decision-making workflows'],
  techTitle: 'Built with',
  techItems: ['LLMs', 'RAG', 'APIs', 'AI Agents'],
  builderName: 'Juan Enriquez Ramos',
  builderTags: 'Biochemistry · Computational Biology · AI',
  builderTagline: 'Building at the intersection of Life Science, AI and Technology.',
  navProduct: 'Product', navHow: 'How it works', navChemistry: 'Chemistry', navRoadmap: 'Roadmap', navTry: 'Try MercurBot',

  // ── App shell ──
  brandSub: 'your PDF reader',
  navAria: 'Main navigation',
  openNav: 'Open navigation',
  closeNav: 'Close navigation',
  customizerTitle: (n: string) => `Customize ${n || 'your robot'}`,
  customizerDesc: 'The name defines its base design; each trait is adjusted manually. Everything is saved in this browser.',
  closeCustomizer: 'Close customization',
  showDoc: 'Show document',
  // ── Errors ──
  errUnsupportedType: 'Unsupported file type',
  errScannedPdf: 'This PDF appears to be scanned (images only) and contains no extractable text. Try a PDF with selectable text.',
  errPassword: 'This PDF is password-protected. Remove the protection and try again.',
  errDocNotInRecents: 'That document is no longer in recents. Upload it again.',
  errDataNotFound: 'Saved data not found. Upload it again.',
  errCouldNotOpen: 'Could not open the document.',
  // ── PDF processing ──
  opening: (n: string) => `Opening ${n}…`,
  readingPages: 'Reading pages…',
  sortingIdeas: 'Organizing ideas…',
  sortingIdeasFull: 'Organizing ideas on your device…',
  readingPage: (p: number, t: number) => `Reading page ${p} of ${t}...`,
  readyWithName: (name: string, file: string, pages: number) => `Ready, ${name}! I read ${file} (${pages} pages). Ask me anything.`,
  readyNoName: (file: string, pages: number) => `Ready! I read ${file} (${pages} pages). Ask me anything.`,
  ttsReadyWithName: (name: string) => `I finished reading your document, ${name}. Ask me anything.`,
  ttsReadyNoName: 'I finished reading your document. Ask me anything.',
  ttsGreeting: (name: string) => `Hello${name ? `, ${name}` : ''}! I'm Mercur. Drop your PDF and we'll read it together.`,
  // ── Onboarding ──
  onbGreetingWithName: (u: string, r: string) => `Hello, ${u}! I'm ${r}. Let's drop your PDF and read it together.`,
  onbGreetingNoName: (r: string) => `Hello! I'm ${r}. Let's drop your PDF and read it together.`,
  // ── Workflow ──
  workflowComplete: 'Automation complete.',
  workflowFailed: 'Automation failed.',
  readingCancelled: 'Reading cancelled.',
  // ── Brand ──
  greetingDoc: (robot: string, file: string) => `${robot} already read ${file} — ask me anything.`,
  // ── Chat ──
  chatAria: 'MercurBot chat',
  loading: 'Reading…',
  errHeading: 'Something went wrong:',
  errNoService: 'Could not connect to the AI service.',
  err429: 'Rate limit reached. Wait a minute and try again.',
  err404: 'The <code>/api/chat</code> endpoint is not responding in this environment (if using <code>vite dev</code>, run with Vercel CLI or configure the API).',
  err500: 'The AI service failed or a server key is missing (<code>GEMINI_API_KEY</code>, <code>GROQ_API_KEY</code> or <code>OPENROUTER_API_KEY</code>). Try again in a few seconds.',
  err504: 'The server took too long to respond (504, timeout). Try again; if you used Generate chart with a large document, try a shorter PDF.',
  errNetwork: 'No connection to the server. Check your internet and that the app is deployed with <code>/api/chat</code> available.',
  errGeneric: 'Retry the query. If it persists, reload the page and re-upload the PDF.',
  sourcesPrefix: 'Found in',
  pageLabel: (n: number) => `Page ${n}`,
  viewPage: (n: number) => `View page ${n} in viewer`,
  viewPageBtn: 'View page →',
  copied: 'Copied!',
  copyAria: 'Copy response',
  downloadAria: 'Download response as Markdown',
  chartRejected: 'Chart discarded: data was not verified in the document.',
  chartDrawing: 'Drawing chart…',
  chartScope: (s: string) => `Analyzed: ${s}.`,
  chartVerifyNotice: (d: number, t: number) => `${d} of ${t} data points were not verified in the document; only verified data is shown.`,
  noChartData: 'The model found no comparable figures in the analyzed scope and did not return a chart.',
  idlePrompt: (n: string) => `What do you want to know about ${n}?`,
  dropTitle: 'Drop your PDF here',
  dropHint: 'Text PDF · or click to browse · nothing is uploaded',
  showLog: (n: number) => `View full chat log (${n})`,
  hideLog: 'Hide chat log',
  errRequest: 'Request error:',
  retryChat: 'Retry',
  startersDesc: 'Upload a PDF and ask in your own words — every answer cites its page.',
  startersUpload: 'Upload my PDF',
  suggestSummary: 'Summarize in 3 points',
  suggestSummaryQ: 'Summarize this document in 3 key points',
  attachTitle: 'Upload PDF document (.pdf)',
  attachAria: 'Upload PDF',
  dictUnavailable: 'Dictation not available in this browser (e.g. Firefox): use Chrome, Edge or Safari, or type the question',
  dictInsecure: 'Dictation requires HTTPS or localhost: type the question or open the app on a secure connection',
  dictStop: 'Stop dictation',
  dictStart: 'Dictate question by voice',
  ttsOn: 'Enable response voice',
  ttsOff: 'Mute response voice',
  stopAudio: 'Stop audio',
  workflowBtn: 'Automations',
  workflowAria: 'Open automations',
  placeholderDoc: (n: string) => `Ask about ${n}… (e.g. Summarize the 3 key points)`,
  placeholderNoDoc: 'Upload a PDF and let\'s chat…',
  dropOr: 'or',
  listening: 'Listening…',
  speakNow: 'speak now',
  dictNoApi: 'Dictation not available in this browser (e.g. Firefox): use Chrome, Edge, or Safari, or type the question',
  dictNoHttps: 'Dictation requires HTTPS or localhost: type the question or open the app over a secure connection',
  stopBtn: 'Stop',
  sendBtn: 'Send',
  noChartRange: (r: string) => `The model found no comparable figures in ${r} and did not return a chart.`,
  noChartNarrative: (r: string) => `I analyzed ${r} and found no figures: the document is narrative with no series to chart. Ask for a summary by stages or bullet points in the chat.`,
  noChartSingular: (r: string, n: number) => `I analyzed ${r} and found ${n} standalone figure${n === 1 ? '' : 's'}, but no comparable series to chart (different units or no evolution). Try a document with tables or ask about the data in the chat.`,
  modelPill: (m: string) => `Generated by ${m}`,
  matchLexical: 'literal',
  matchVector: 'semantic',
  matchHybrid: 'combined',
  timeoutError: 'The server took too long to respond (504, timeout). Retry in a few seconds; if you used Generate chart with a large document, try again or with a shorter PDF.',
  retryError: 'Retry the query. If it persists, reload the page and re-upload the PDF.',
  retryBtn: 'Retry query',
  sourcesAria: 'Document sources',
  copyResponse: 'Copy response',
  copyBtn: 'Copy',
  downloadMd: 'Download response as Markdown',
  downloadMdAria: 'Download response as Markdown',
  clearChat: 'Clear conversation',
  clearChatAria: 'Clear conversation',
  changeFile: 'Change file',
  changeFileAria: 'Upload another PDF document',
  startersTitle: 'Upload a PDF and ask in your own words — each response cites its page.',
  uploadPdf: 'Upload my PDF',
  startersGroup: 'Capabilities: suggested questions',
  suggestResume: 'Summarize in 3 points',
  suggestResumeQ: 'Summarize this document in 3 points',
  suggestCite: 'Ask with citations',
  suggestCiteQ: 'What are the key points? Cite the pages',
  suggestSearch: 'Search the document',
  suggestSearchQ: 'What does the document say about ',
  suggestChart: 'Chart figures',
  suggestChartQ: 'What comparable figures does the document contain? Include the pages',
  inputPlaceholder: (name: string) => `Ask about ${name}… (e.g. Summarize the 3 key points)`,
  inputPlaceholderEmpty: 'Upload a PDF and let\'s chat…',
  inputAria: 'Type your question',
  noDataVerified: (d: number, t: number) => `${d} of ${t} data points were not verified in the document; only verified ones are shown.`,
  chartDiscarded: 'Chart discarded: the data was not verified in the document.',
  scannedPdfError: 'I couldn\'t extract text from this document — it appears to be a scanned PDF (images only). Try a PDF with selectable text.',
  errServer: 'Server error',
  errConnection: 'Could not connect to the AI service.',
  chatLogShow: (n: number) => `View full history (${n})`,
  chatLogHide: 'Hide chat history',

  // ── PDF Viewer ──
  searchPlaceholder: 'Search the document…',
  searchAria: 'Search the document',
  searchResultsAria: 'Pages with matches',
  searchEmpty: 'No matches in the document.',
  pdfLoadError: 'Could not open the PDF.',
  emptyState: 'Upload a PDF to view it here.',
  highlightMiss: 'Fragment not found on this page, check it directly.',
  pageInfo: (page: number, total: number, name: string) => `Page ${page}${total > 0 ? ` of ${total}` : ''} of ${name || 'document'}`,
  prevPage: 'Previous page',
  prevBtn: '← Previous',
  nextPage: 'Next page',
  nextBtn: 'Next →',
  viewerTitle: (name: string, page: number) => `${name || 'Document'} — Page ${page}`,
  closeViewer: 'Close viewer',
  docPanelAria: 'PDF document',
  docPanelTitle: 'Document',
  docFallback: 'document.pdf',
  chartDisabledTip: 'Available when document finishes loading',
  chartDisabledAria: 'Generate chart (loading)',
  chartGenBtn: 'Generate chart',
  hidePanel: 'Hide panel and return to centered view',
  hidePanelAria: 'Hide document panel',
  hideBtn: 'Hide',

  // ── ChartFull ──
  cfScanned: 'This document has no extractable text — it appears to be a scanned PDF (images only). Charts need text: upload with selectable text or run OCR first.',
  cfNoText: 'The document has no analyzable text.',
  cf429: 'Rate limit reached. Wait a minute.',
  cf413: 'Document too large even after pre-selection.',
  cf404: 'No /api backend in this environment (Vite only serves frontend). Use `vercel dev` or `pnpm dev:api` locally to run /api/chat.',
  cf502: 'The AI did not respond (502). Check provider keys in Vercel (GEMINI_API_KEY, GROQ_API_KEY or OPENROUTER_API_KEY) and retry in a few seconds.',
  cf504: 'Generation took too long and the server cut it (504). Usually with large documents: retry in a few seconds (second attempt is often faster) or try a shorter PDF.',
  cfHttp: (s: number) => `Service failed (${s}). Retry in a few seconds.`,
  cfEmpty: 'The model did not return analysis. Retry.',
  cfCatch: 'Generation failed. Retry.',
  cfScopeTrunc: (s: string, t: number) => `Pages ${s} of ${t} will be analyzed (the ones with most figures).`,
  cfScopeFull: (t: number) => `The full document (${t} pages) will be analyzed.`,
  cfWarnZero: 'Note: no figures detected in this scope — the document appears narrative and a chart may not be generated. You can still send it or ask for a stage-by-stage summary in the chat.',
  cfWarnLow: (n: number) => `Note: only ${n} figure${n === 1 ? '' : 's'} detected in this scope — there may not be a comparable series to chart.`,
  cfTitle: 'Generate a chart from the full document (on your command)',
  cfAria: 'Generate full document chart',
  cfBtn: 'Generate chart',
  cfSend: 'Send',
  cfConfirmAria: 'Confirm document submission',
  cfConsentPrefix: 'The text will be sent',
  cfConsentTrunc: 'from the pages with most figures',
  cfConsentFull: 'in full',
  cfConsentSuffix: 'to the AI model. Nothing is stored on servers except the AI provider.',
  cfCancel: 'Cancel',
  cfWorking: (s: string) => `Generating chart… ${s}`,
  cfStop: 'Stop',
  cfFailed: 'Generation failed.',
  cfClose: 'Close',
  cfRetry: 'Retry',

  // ── Briefing ──
  briefAria: 'Document summary',
  briefTitle: 'This document in 3 key points',
  briefLoading: 'Reading the essentials…',

  // ── Sidebar ──
  sbNewAnalysis: 'New analysis',
  sbUpload: 'Upload PDF',
  sbWorkflow: 'Automation',
  sbRecentsExpand: 'Recents — expand menu',
  sbCustomize: (u: string, r: string) => `${u || 'Local reader'} · Customize ${r}`,
  sbExpand: 'Expand menu',
  sbRecents: 'Recent documents',
  sbEmpty: 'No documents yet. Upload your first PDF.',
  sbRemove: (n: string) => `Remove ${n} from recents`,
  sbPrivacy: 'Your PDF never leaves this browser.',
  sbLocalUser: 'Local reader',
  sbReadingPdf: 'reading a PDF',
  sbNoDoc: 'no document',
  sbCustomizeBtn: 'Customize',
  sbHowItWorks: 'How it works',
  sbCollapse: 'Collapse',

  // ── Engine Status ──
  esIdleTitle: 'Upload a PDF to enable local search',
  esIdleCompact: '100% local',
  esIdleFull: '100% local',
  esDownloadingModels: 'Downloading AI models...',
  esStreamTitle: 'The AI is reading your PDF fragments',
  esStreamCompact: 'thinking…',
  esStreamFull: 'thinking…',
  esModeHybrid: 'hybrid',
  esModeLiteral: 'literal',
  esModeReady: 'ready',
  esReadyTitle: (mode: string, model?: string) =>
    `${mode === 'hybrid' ? 'Combined (vectorial + lexical)' : 'literal'} search on your device${model ? ` · last answer: ${model}` : ''}`,
  esIndexedTitle: 'Document indexed on your device. Ask to see the model in use.',

  // ── Onboarding Tour ──
  otEyesRound: 'Round', otEyesVisor: 'Visor', otEyesHappy: 'Happy', otEyesSleepy: 'Sleepy', otEyesBig: 'Big',
  otStep0Title: 'Hi, I\'m your attentive reader',
  otStep1Title: 'What\'s your name?',
  otStep2Title: 'What should I call myself?',
  otStep3Title: 'Choose my colors',
  otStep4Title: 'Pick my eyes',
  otStep5Title: 'That\'s how easy it is',
  otSrDesc: 'Onboarding tour — get to know your AI assistant',
  otIntro: 'I read your PDFs with you and answer pointing to the exact page.',
  otPrivacy: 'Everything happens in your browser — your document is never uploaded to any server.',
  otNameLabel: 'Your name',
  otNamePlaceholder: 'Optional',
  otNameAria: 'Enter your name',
  otRobotLabel: 'My name',
  otRobotAria: 'Enter the robot\'s name',
  otThemesLabel: 'Theme',
  otThemesAria: 'Pick a color theme',
  otEyesLabel: 'Eyes',
  otEyesAria: 'Pick eye style',
  otRandomBtn: '🎲 Surprise me',
  otStep5Drop: 'Drop your PDF here',
  otStep5DropSub: '— I\'ll read it on your device.',
  otStep5Ask: 'Ask me anything',
  otStep5AskSub: '— in your own words.',
  otStep5Cite: 'Tap [Page N]',
  otStep5CiteSub: '— I\'ll show you the exact source.',
  otClosing: (u: string, r: string) => `Nice to meet you, ${u}! I'm ${r}. Let's begin.`,
  otBack: '← Back',
  otNext: 'Next →',
  otStart: 'Let\'s go!',
  otSkipAria: 'Skip tutorial',
  otSkip: 'Skip',

  // ── Mascot Customizer ──
  mcEyesRound: 'Round', mcEyesVisor: 'Visor', mcEyesHappy: 'Happy', mcEyesSleepy: 'Sleepy', mcEyesBig: 'Big',
  mcAccNone: 'None', mcAccAntenna: 'Antenna', mcAccFins: 'Fins', mcAccHeadphones: 'Headphones',
  mcAccTuft: 'Tuft', mcAccGlasses: 'Glasses', mcAccBow: 'Bow', mcAccCap: 'Cap',
  mcAria: 'Customize mascot',
  mcTabsAria: 'Customization options',
  mcTabStyle: 'Style',
  mcTabDetails: 'Details',
  mcThemesLabel: 'Quick themes',
  mcThemesHeading: 'Themes',
  mcThemesAria: 'Prebuilt themes',
  mcThemeLabel: (l: string) => `Theme ${l}`,
  mcNameAria: 'Robot name',
  mcNameHeading: 'My robot is called',
  mcNameInputAria: 'Robot name (defines its base design)',
  mcRandomBtn: 'Generate another design from the name',
  mcRandomLabel: 'Surprise me',
  mcDesignAria: 'Robot design',
  mcDesignHeading: 'Color',
  mcDesignLabel: (l: string) => `Design ${l}`,
  mcEyesHeading: 'Eyes',
  mcEyesGroupAria: 'Robot eyes',
  mcAccHeading: 'Extra',
  mcAccGroupAria: 'Robot accessory',
  // ── Locale Override ──
  mcLangHeading: 'Language',
  mcLangGroupAria: 'Language override',
  mcLangAuto: 'Auto (detect)',
  mcLangEs: 'Español',
  mcLangEn: 'English',

  // ── ErrorBoundary ──
  ebTitle: 'Something went wrong',
  ebMsg: 'Unknown error',
  ebHint: 'Reload the page or re-upload the PDF.',
  ebRetry: 'Retry',

  // ── Processing Card ──
  pcProgress: (p: number) => `${p}% complete`,
  pcCancelTitle: 'Cancel document extraction',
  pcCancelBtn: '✕ Cancel',

  // ── Dictation ──
  dictMicBlocked: 'Microphone blocked: allow mic access in the browser icon and retry.',
  dictNoSound: 'Nothing heard: move closer to the mic and speak a bit louder.',
  dictNoMic: 'No microphone available: connect a mic and retry.',
  dictNeedsNet: 'Dictation needs a connection (Chrome transcribes in the cloud). Check your network or type the question.',
  dictStopped: 'Dictation stopped. Retry or type the question.',

  // ── TTS ──
  ttsCodeSkip: 'code omitted.',

  // ── Rag Client ──
  ragReady: 'Document ready.',
  ragReadyLight: 'Document ready (light mode).',

  // ── Universal Parser ──
  upUnsupported: (ext: string) => `Unsupported type "${ext}". MercurBot only works with PDF documents (.pdf).`,
  upWrongFormat: (ext: string) => `Unsupported format "${ext || 'unknown'}". Please upload a PDF document (.pdf).`,
  upEmpty: 'The file is empty.',
  upTooLarge: (mb: number) => `The file is too large (maximum ${mb} MB).`,

  // ── PDF Extractor ──
  peCancelled: 'Extraction cancelled by user.',
  peTimeout: (s: number) => `Extraction timeout exceeded (${s}s). The PDF is too complex or extensive.`,
  peLoaded: (n: number) => `Document loaded: ${n} pages. Starting read...`,
  peReading: (p: number, t: number) => `Reading page ${p} of ${t}...`,
  peCancelledBefore: 'Extraction cancelled before reading the first page.',
  peStructuring: 'Structuring semantic fragments...',
  peDone: (n: number) => `Done! ${n} pages read.`,

  // ── RAG Worker ──
  rwLoadingModel: 'Loading embeddings model...',
  rwDownloading: (p: number) => `Downloading semantic engine (${p}%)...`,
  rwIndexReady: 'BM25 lexical index ready.',
  rwCached: (n: number) => `Smart search recovered from device (${n} fragments, no recompute).`,
  rwVectorizing: (done: number, total: number) => `Vectorizing fragments (${Math.min(total, done)}/${total})...`,

  // ── Match types ──
  matchLiteral: 'literal',
  matchSemantic: 'semantic',
  matchCombined: 'combined',
}

/* ──────────────────────────────────────────────────────────────────────
   SPANISH DICTIONARY
   ────────────────────────────────────────────────────────────────────── */
const esDict: FullDict = {
  // ── Landing ──
  heroTag: 'Tus documentos, tu IA — sin alucinaciones',
  heroTitle: 'MercurBot',
  heroSub: 'Analiza PDFs científicos, extrae conocimiento e interactúa con información técnica usando LLMs, RAG y agentes de IA.',
  heroCTATry: 'Probar MercurBot',
  heroCTALearn: 'Ver cómo funciona',
  howTitle: 'Cómo funciona',
  howSteps: [
    { label: 'Sube un PDF', desc: 'Arrastra y suelta cualquier documento científico o técnico.' },
    { label: 'La IA lo analiza', desc: 'RAG indexa páginas, segmenta texto, genera embeddings — todo en tu navegador.' },
    { label: 'Pregunta lo que quieras', desc: 'Obtén respuestas con citas verificables [Pág. N] del documento fuente.' },
  ],
  builtTitle: 'Lo que construí',
  builtName: 'Construido por Juan Enriquez Ramos',
  builtTags: 'LLMs · RAG · APIs · Agentes de IA',
  builtText: 'MercurBot comenzó como un experimento en análisis documental con IA. Diseñé y desarrollé el prototipo completo — desde el pipeline RAG hasta la interfaz de chat en streaming — usando LLMs, RAG, APIs y agentes de IA.',
  evoTitle: 'De Asistente PDF → IA para Química',
  evoToday: 'HOY',
  evoTodayItems: ['Análisis de PDFs', 'RAG con citas por página', 'Interacción con LLMs', 'Agentes de IA'],
  evoNext: 'SIGUIENTE',
  evoNextItems: ['Workflows específicos de química', 'Integración con literatura científica', 'Herramientas especializadas de química', 'Workflows de toma de decisiones'],
  evoLater: 'DESPUÉS',
  evoLaterItems: ['Agentes de IA con uso de herramientas', 'Razonamiento químico autónomo'],
  validTitle: 'Siendo probado en el mundo real',
  validBadge: 'Validación temprana · Beta',
  validText: 'Una profesional de química actualmente trabajando en la industria está probando la beta de MercurBot para identificar mejoras y explorar su potencial para flujos de trabajo químicos reales.',
  whyTitle: '¿Por qué química?',
  whyText: 'MercurBot comenzó como una herramienta general de análisis de PDFs con IA. Mi formación en bioquímica y biología computacional me llevó a explorar cómo podría convertirse en una herramienta de IA especializada para la química — donde el análisis documental de dominio específico crea valor real.',
  whyPath: ['Bioquímica', 'Biología Computacional', 'IA', 'Producto de Química'],
  roadTitle: 'Hoja de ruta',
  roadNow: 'Ahora',
  roadNowItems: ['Análisis de PDFs', 'RAG', 'LLMs'],
  roadNext: 'Siguiente',
  roadNextItems: ['Workflows de química', 'Literatura científica', 'Herramientas especializadas'],
  roadLater: 'Después',
  roadLaterItems: ['Agentes de IA con herramientas', 'Workflows de toma de decisiones'],
  techTitle: 'Construido con',
  techItems: ['LLMs', 'RAG', 'APIs', 'Agentes de IA'],
  builderName: 'Juan Enriquez Ramos',
  builderTags: 'Bioquímica · Biología Computacional · IA',
  builderTagline: 'Construyendo en la intersección de Ciencias de la Vida, IA y Tecnología.',
  navProduct: 'Producto', navHow: 'Cómo funciona', navChemistry: 'Química', navRoadmap: 'Hoja de ruta', navTry: 'Probar MercurBot',

  // ── App shell ──
  brandSub: 'tu lector de PDFs',
  navAria: 'Navegación principal',
  openNav: 'Abrir navegación',
  closeNav: 'Cerrar navegación',
  customizerTitle: (n: string) => `Personaliza a ${n || 'tu robot'}`,
  customizerDesc: 'El nombre define su diseño base; cada rasgo se ajusta a mano. Todo se guarda en este navegador.',
  closeCustomizer: 'Cerrar personalización',
  showDoc: 'Mostrar documento',
  // ── Errors ──
  errUnsupportedType: 'Tipo de archivo no soportado',
  errScannedPdf: 'Este PDF parece escaneado (solo imágenes) y no contiene texto extraíble. Prueba con un PDF con texto seleccionable.',
  errPassword: 'Este PDF está protegido con contraseña. Quítale la protección e inténtalo de nuevo.',
  errDocNotInRecents: 'Ese documento ya no está en recientes. Súbelo de nuevo.',
  errDataNotFound: 'No se encontraron los datos guardados. Súbelo de nuevo.',
  errCouldNotOpen: 'No se pudo abrir el documento.',
  // ── PDF processing ──
  opening: (n: string) => `Abriendo ${n}…`,
  readingPages: 'Leyendo las páginas…',
  sortingIdeas: 'Ordenando las ideas…',
  sortingIdeasFull: 'Ordenando las ideas en tu dispositivo…',
  readingPage: (p: number, t: number) => `Leyendo pág. ${p} de ${t}...`,
  readyWithName: (name: string, file: string, pages: number) => `¡Listo, ${name}! Ya leí ${file} (${pages} págs). Pregúntame lo que quieras.`,
  readyNoName: (file: string, pages: number) => `¡Listo! Ya leí ${file} (${pages} págs). Pregúntame lo que quieras.`,
  ttsReadyWithName: (name: string) => `Ya leí tu documento, ${name}. Pregúntame lo que quieras.`,
  ttsReadyNoName: 'Ya leí tu documento. Pregúntame lo que quieras.',
  ttsGreeting: (name: string) => `¡Hola${name ? `, ${name}` : ''}! Soy Mercur. Suelta tu PDF y lo leemos juntos.`,
  // ── Onboarding ──
  onbGreetingWithName: (u: string, r: string) => `¡Hola, ${u}! Soy ${r}. Suelta tu PDF y lo leemos juntos.`,
  onbGreetingNoName: (r: string) => `¡Hola! Soy ${r}. Suelta tu PDF y lo leemos juntos.`,
  // ── Workflow ──
  workflowComplete: 'Automatización completada.',
  workflowFailed: 'La automatización falló.',
  readingCancelled: 'Lectura cancelada.',
  // ── Brand ──
  greetingDoc: (robot: string, file: string) => `${robot} ya leyó ${file} — pregúntale lo que quieras.`,
  // ── Chat ──
  chatAria: 'Chat de MercurBot',
  loading: 'Leyendo…',
  errHeading: 'Algo no salió bien:',
  errNoService: 'No se pudo conectar con el servicio de IA.',
  err429: 'Límite de peticiones alcanzado. Espera un minuto e inténtalo de nuevo.',
  err404: 'El endpoint <code>/api/chat</code> no está respondiendo en este entorno (si estás en <code>vite dev</code>, asegúrate de correr con Vercel CLI o configurar la API).',
  err500: 'El servicio de IA falló o falta configurar una key en tu servidor o Vercel (<code>GEMINI_API_KEY</code>, <code>GROQ_API_KEY</code> u <code>OPENROUTER_API_KEY</code>). Reintenta en unos segundos.',
  err504: 'El servidor tardó demasiado en responder (504, timeout). Reintenta en unos segundos; si usaste Generar gráfica con un documento grande, prueba de nuevo o con un PDF más corto.',
  errNetwork: 'Sin conexión con el servidor. Revisa tu internet y que la app esté desplegada con <code>/api/chat</code> disponible.',
  errGeneric: 'Reintenta la consulta. Si persiste, recarga la página y vuelve a subir el PDF.',
  sourcesPrefix: 'Lo encontré en',
  pageLabel: (n: number) => `Pág. ${n}`,
  viewPage: (n: number) => `Ver página ${n} en el visor`,
  viewPageBtn: 'Ver página →',
  copied: '¡Copiado!',
  copyAria: 'Copiar respuesta',
  downloadAria: 'Descargar respuesta en Markdown',
  chartRejected: 'Gráfica descartada: los datos no se verificaron en el documento.',
  chartDrawing: 'Dibujando gráfica…',
  chartScope: (s: string) => `Analizado: ${s}.`,
  chartVerifyNotice: (d: number, t: number) => `${d} de ${t} datos no se verificaron en el documento; se muestran solo los verificados.`,
  noChartData: 'El modelo no encontró cifras comparables en el alcance analizado y no devolvió gráfica.',
  idlePrompt: (n: string) => `¿Qué quieres saber de ${n}?`,
  dropTitle: 'Suelta tu PDF aquí',
  dropHint: 'PDF con texto · o haz clic para buscarlo · nada se sube',
  showLog: (n: number) => `Ver historial completo (${n})`,
  hideLog: 'Ocultar historial de chat',
  errRequest: 'Error en la petición:',
  retryChat: 'Reintentar',
  startersDesc: 'Sube un PDF y pregunta con tus palabras — cada respuesta cita su página.',
  startersUpload: 'Subir mi PDF',
  suggestSummary: 'Resumir en 3 puntos',
  suggestSummaryQ: 'Resume este documento en 3 puntos',
  attachTitle: 'Subir documento PDF (.pdf)',
  attachAria: 'Subir PDF',
  dictUnavailable: 'Dictado no disponible en este navegador (ej. Firefox): usa Chrome, Edge o Safari, o escribe la pregunta',
  dictInsecure: 'El dictado requiere HTTPS o localhost: escribe la pregunta o abre la app en conexión segura',
  dictStop: 'Detener dictado',
  dictStart: 'Dictar pregunta por voz',
  ttsOn: 'Activar voz de respuesta',
  ttsOff: 'Silenciar voz de respuesta',
  stopAudio: 'Parar audio',
  workflowBtn: 'Automatizaciones',
  workflowAria: 'Abrir automatizaciones',
  placeholderDoc: (n: string) => `Pregunta sobre ${n}… (ej. Resume los 3 puntos clave)`,
  placeholderNoDoc: 'Sube un PDF y conversamos…',
  dropOr: 'o',
  stopBtn: 'Detener',
  sendBtn: 'Enviar',
  listening: 'Escuchando…',
  speakNow: 'habla ahora',
  dictNoApi: 'Dictado no disponible en este navegador (ej. Firefox): usa Chrome, Edge o Safari, o escribe la pregunta',
  dictNoHttps: 'El dictado requiere HTTPS o localhost: escribe la pregunta o abre la app en conexión segura',
  noChartRange: (r: string) => `El modelo no encontró cifras comparables en ${r} y no devolvió gráfica.`,
  noChartNarrative: (r: string) => `Analicé ${r} y no detecté cifras: el documento es narrativo y no hay serie que graficar. Pídeme un resumen por etapas o por puntos en el chat.`,
  noChartSingular: (r: string, n: number) => `Analicé ${r} y detecté ${n} cifra${n === 1 ? '' : 's'} suelta${n === 1 ? '' : 's'}, pero sin serie comparable para graficar (distintas unidades o sin evolución). Prueba con un documento con tablas o pregúntame por los datos en el chat.`,
  modelPill: (m: string) => `Generado por ${m}`,
  matchLexical: 'literal',
  matchVector: 'semántica',
  matchHybrid: 'combinada',
  timeoutError: 'El servidor tardó demasiado en responder (504, timeout). Reintenta en unos segundos; si usaste Generar gráfica con un documento grande, prueba de nuevo o con un PDF más corto.',
  retryError: 'Reintenta la consulta. Si persiste, recarga la página y vuelve a subir el PDF.',
  retryBtn: 'Reintentar consulta',
  sourcesAria: 'Fuentes del documento',
  copyResponse: 'Copiar respuesta',
  copyBtn: 'Copiar',
  downloadMd: 'Descargar respuesta en Markdown',
  downloadMdAria: 'Descargar respuesta en Markdown',
  clearChat: 'Limpiar conversación',
  clearChatAria: 'Limpiar conversación',
  changeFile: 'Cambiar archivo',
  changeFileAria: 'Cargar otro documento PDF',
  startersTitle: 'Sube un PDF y pregunta con tus palabras — cada respuesta cita su página.',
  uploadPdf: 'Subir mi PDF',
  startersGroup: 'Capacidades: preguntas sugeridas',
  suggestResume: 'Resumir en 3 puntos',
  suggestResumeQ: 'Resume este documento en 3 puntos',
  suggestCite: 'Preguntar con citas',
  suggestCiteQ: '¿Cuáles son los puntos clave? Cita las páginas',
  suggestSearch: 'Buscar en el documento',
  suggestSearchQ: '¿Qué dice el documento sobre ',
  suggestChart: 'Graficar cifras',
  suggestChartQ: '¿Qué cifras comparables trae el documento? Incluye las páginas',
  inputPlaceholder: (name: string) => `Pregunta sobre ${name}… (ej. Resume los 3 puntos clave)`,
  inputPlaceholderEmpty: 'Sube un PDF y conversamos…',
  inputAria: 'Escribe tu consulta',
  noDataVerified: (d: number, t: number) => `${d} de ${t} datos no se verificaron en el documento; se muestran solo los verificados.`,
  chartDiscarded: 'Gráfica descartada: los datos no se verificaron en el documento.',
  scannedPdfError: 'No pude extraer texto de este documento — parece un PDF escaneado (solo imágenes). Prueba con un PDF con texto seleccionable.',
  errServer: 'Error del servidor',
  errConnection: 'No se pudo conectar con el servicio de IA.',
  chatLogShow: (n: number) => `Ver historial completo (${n})`,
  chatLogHide: 'Ocultar historial de chat',

  // ── PDF Viewer ──
  searchPlaceholder: 'Buscar en el documento…',
  searchAria: 'Buscar en el documento',
  searchResultsAria: 'Páginas con coincidencias',
  searchEmpty: 'Sin coincidencias en el documento.',
  pdfLoadError: 'No se pudo abrir el PDF.',
  emptyState: 'Carga un PDF para verlo aquí.',
  highlightMiss: 'Fragmento no localizado en esta página, revísala directamente.',
  pageInfo: (page: number, total: number, name: string) => `Página ${page}${total > 0 ? ` de ${total}` : ''} de ${name || 'documento'}`,
  prevPage: 'Página anterior',
  prevBtn: '← Anterior',
  nextPage: 'Página siguiente',
  nextBtn: 'Siguiente →',
  viewerTitle: (name: string, page: number) => `${name || 'Documento'} — Pág. ${page}`,
  closeViewer: 'Cerrar visor',
  docPanelAria: 'Documento PDF',
  docPanelTitle: 'Documento',
  docFallback: 'documento.pdf',
  chartDisabledTip: 'Disponible cuando el documento termine de cargarse',
  chartDisabledAria: 'Generar gráfica del documento (cargando)',
  chartGenBtn: 'Generar gráfica',
  hidePanel: 'Ocultar el panel y volver a la vista centrada',
  hidePanelAria: 'Ocultar panel del documento',
  hideBtn: 'Ocultar',

  // ── ChartFull ──
  cfScanned: 'Este documento no tiene texto extraíble — parece un PDF escaneado (solo imágenes). La gráfica necesita texto: súbelo con texto seleccionable o pásalo por un OCR.',
  cfNoText: 'El documento no tiene texto analizable.',
  cf429: 'Límite de peticiones alcanzado. Espera un minuto.',
  cf413: 'Documento demasiado grande incluso tras la pre-selección.',
  cf404: 'No hay backend /api en este entorno (Vite solo sirve el frontend). En local usa `vercel dev` o `pnpm dev:api` para levantar /api/chat.',
  cf502: 'La IA no respondió (502). Revisa las claves del proveedor en Vercel (GEMINI_API_KEY, GROQ_API_KEY u OPENROUTER_API_KEY) y reintenta en unos segundos.',
  cf504: 'La generación tardó demasiado y el servidor la cortó (504). Suele pasar con documentos grandes: reintenta en unos segundos (a veces el segundo intento responde más rápido) o prueba con un PDF más corto.',
  cfHttp: (s: number) => `El servicio falló (${s}). Reintenta en unos segundos.`,
  cfEmpty: 'El modelo no devolvió análisis. Reintenta.',
  cfCatch: 'Falló la generación. Reintenta.',
  cfScopeTrunc: (s: string, t: number) => `Se analizarán ${s} de ${t} págs. (las de más cifras).`,
  cfScopeFull: (t: number) => `Se analizará el documento íntegro (${t} págs.).`,
  cfWarnZero: 'Aviso: no detecté cifras en este alcance — el documento parece narrativo y es probable que no salga gráfica. Puedes enviarlo igual o pedirme un resumen por etapas en el chat.',
  cfWarnLow: (n: number) => `Aviso: solo detecté ${n} cifra${n === 1 ? '' : 's'} en este alcance — puede no haber serie comparable para graficar.`,
  cfTitle: 'Generar una gráfica a partir del documento completo (bajo tu orden)',
  cfAria: 'Generar gráfica del documento completo',
  cfBtn: 'Generar gráfica',
  cfSend: 'Enviar',
  cfConfirmAria: 'Confirmar envío del documento',
  cfConsentPrefix: 'Se enviará el texto',
  cfConsentTrunc: 'de las páginas con más cifras',
  cfConsentFull: 'completo',
  cfConsentSuffix: 'al modelo de IA. Nada se guarda en servidores salvo el proveedor de IA.',
  cfCancel: 'Cancelar',
  cfWorking: (s: string) => `Generando gráfica… ${s}`,
  cfStop: 'Detener',
  cfFailed: 'Falló la generación.',
  cfClose: 'Cerrar',
  cfRetry: 'Reintentar',

  // ── Briefing ──
  briefAria: 'Resumen del documento',
  briefTitle: 'Este documento en 3 puntos',
  briefLoading: 'Leyendo lo esencial…',

  // ── Sidebar ──
  sbNewAnalysis: 'Nuevo análisis',
  sbUpload: 'Cargar PDF',
  sbWorkflow: 'Automatización',
  sbRecentsExpand: 'Recientes — expandir menú',
  sbCustomize: (u: string, r: string) => `${u || 'Lector local'} · Personalizar ${r}`,
  sbExpand: 'Expandir menú',
  sbRecents: 'Documentos recientes',
  sbEmpty: 'Aún no hay documentos. Carga tu primer PDF.',
  sbRemove: (n: string) => `Quitar ${n} de recientes`,
  sbPrivacy: 'Tu PDF nunca sale de este navegador.',
  sbLocalUser: 'Lector local',
  sbReadingPdf: 'leyendo un PDF',
  sbNoDoc: 'sin documento',
  sbCustomizeBtn: 'Personalizar',
  sbHowItWorks: '¿Cómo funciona?',
  sbCollapse: 'Contraer',

  // ── Engine Status ──
  esIdleTitle: 'Carga un PDF para activar la búsqueda local',
  esIdleCompact: '100% local',
  esIdleFull: 'personalización 100% local',
  esDownloadingModels: 'Descargando modelos IA...',
  esStreamTitle: 'La IA está leyendo los fragmentos de tu PDF',
  esStreamCompact: 'pensando…',
  esStreamFull: 'pensando…',
  esModeHybrid: 'híbrida',
  esModeLiteral: 'literal',
  esModeReady: 'lista',
  esReadyTitle: (mode: string, model?: string) =>
    `Búsqueda ${mode === 'hybrid' ? 'combinada (vectorial + léxica)' : 'literal'} en tu dispositivo${model ? ` · última respuesta: ${model}` : ''}`,
  esIndexedTitle: 'Documento indexado en tu dispositivo. Pregunta para ver el modelo en uso.',

  // ── Onboarding Tour ──
  otEyesRound: 'Redondos', otEyesVisor: 'Visor', otEyesHappy: 'Felices', otEyesSleepy: 'Soñolientos', otEyesBig: 'Grandes',
  otStep0Title: 'Hola, soy tu lector atento',
  otStep1Title: '¿Cómo te llamas?',
  otStep2Title: '¿Cómo me llamo yo?',
  otStep3Title: 'Elige mis colores',
  otStep4Title: 'Elige mis ojos',
  otStep5Title: 'Así de fácil',
  otSrDesc: 'Tutorial de bienvenida — conocé a tu asistente IA',
  otIntro: 'Leo tus PDFs contigo y te respondo señalando la página exacta.',
  otPrivacy: 'Todo pasa en tu navegador — tu documento nunca se sube a ningún servidor.',
  otNameLabel: 'Tu nombre',
  otNamePlaceholder: 'Opcional',
  otNameAria: 'Ingresá tu nombre',
  otRobotLabel: 'Mi nombre',
  otRobotAria: 'Ingresá el nombre del robot',
  otThemesLabel: 'Tema',
  otThemesAria: 'Elegí un tema de color',
  otEyesLabel: 'Ojos',
  otEyesAria: 'Elegí el estilo de ojos',
  otRandomBtn: '🎲 Sorpréndeme',
  otStep5Drop: 'Suelta tu PDF aquí',
  otStep5DropSub: '— lo leo en tu dispositivo.',
  otStep5Ask: 'Pregúntame lo que quieras',
  otStep5AskSub: '— con tus palabras.',
  otStep5Cite: 'Toca [Pág. N]',
  otStep5CiteSub: '— te muestro la fuente exacta.',
  otClosing: (u: string, r: string) => `¡Encantado, ${u}! Soy ${r}. Empecemos.`,
  otBack: '← Atrás',
  otNext: 'Siguiente →',
  otStart: '¡Empezar!',
  otSkipAria: 'Saltar tutorial',
  otSkip: 'Saltar',

  // ── Mascot Customizer ──
  mcEyesRound: 'Redondos', mcEyesVisor: 'Visor', mcEyesHappy: 'Felices', mcEyesSleepy: 'Soñolientos', mcEyesBig: 'Grandes',
  mcAccNone: 'Ninguno', mcAccAntenna: 'Antena', mcAccFins: 'Aletas', mcAccHeadphones: 'Auriculares',
  mcAccTuft: 'Mota', mcAccGlasses: 'Gafas', mcAccBow: 'Lazo', mcAccCap: 'Gorra',
  mcAria: 'Personalizar mascota',
  mcTabsAria: 'Opciones de personalización',
  mcTabStyle: 'Estilo',
  mcTabDetails: 'Detalles',
  mcThemesLabel: 'Temas rápidos',
  mcThemesHeading: 'Temas',
  mcThemesAria: 'Temas prearmados',
  mcThemeLabel: (l: string) => `Tema ${l}`,
  mcNameAria: 'Nombre del robot',
  mcNameHeading: 'Mi robot se llama',
  mcNameInputAria: 'Nombre del robot (define su diseño base)',
  mcRandomBtn: 'Generar otro diseño desde el nombre',
  mcRandomLabel: 'Sorpréndeme',
  mcDesignAria: 'Diseño del robot',
  mcDesignHeading: 'Color',
  mcDesignLabel: (l: string) => `Diseño ${l}`,
  mcEyesHeading: 'Ojos',
  mcEyesGroupAria: 'Ojos del robot',
  mcAccHeading: 'Extra',
  mcAccGroupAria: 'Accesorio del robot',
  // ── Locale Override ──
  mcLangHeading: 'Idioma',
  mcLangGroupAria: 'Forzar idioma',
  mcLangAuto: 'Auto (detectar)',
  mcLangEs: 'Español',
  mcLangEn: 'English',

  // ── ErrorBoundary ──
  ebTitle: 'Algo salió mal',
  ebMsg: 'Error desconocido',
  ebHint: 'Recarga la página o vuelve a subir el PDF.',
  ebRetry: 'Reintentar',

  // ── Processing Card ──
  pcProgress: (p: number) => `${p}% completado`,
  pcCancelTitle: 'Cancelar extracción del documento',
  pcCancelBtn: '✕ Cancelar',

  // ── Dictation ──
  dictMicBlocked: 'Micrófono bloqueado: permite el acceso al micrófono en el icono del navegador y reintenta.',
  dictNoSound: 'No se escuchó nada: acércate al micrófono y habla un poco más alto.',
  dictNoMic: 'Sin micrófono disponible: conecta un micrófono y reintenta.',
  dictNeedsNet: 'El dictado necesita conexión (Chrome transcribe en la nube). Revisa tu red o escribe la pregunta.',
  dictStopped: 'El dictado se detuvo. Reintenta o escribe la pregunta.',

  // ── TTS ──
  ttsCodeSkip: 'código omitido.',

  // ── Rag Client ──
  ragReady: 'Documento listo.',
  ragReadyLight: 'Documento listo (modo ligero).',

  // ── Universal Parser ──
  upUnsupported: (ext: string) => `Tipo no soportado "${ext}". MercurBot solo trabaja con documentos PDF (.pdf).`,
  upWrongFormat: (ext: string) => `Formato no soportado "${ext || 'desconocido'}". Por favor sube un documento PDF (.pdf).`,
  upEmpty: 'El archivo está vacío.',
  upTooLarge: (mb: number) => `El archivo es muy pesado (máximo ${mb} MB).`,

  // ── PDF Extractor ──
  peCancelled: 'Extracción cancelada por el usuario.',
  peTimeout: (s: number) => `Timeout de extracción excedido (${s}s). El PDF es demasiado complejo o extenso.`,
  peLoaded: (n: number) => `Documento cargado: ${n} páginas. Iniciando lectura...`,
  peReading: (p: number, t: number) => `Leyendo página ${p} de ${t}...`,
  peCancelledBefore: 'Extracción cancelada antes de leer la primera página.',
  peStructuring: 'Estructurando fragmentos semánticos...',
  peDone: (n: number) => `¡Listo! ${n} páginas leídas.`,

  // ── RAG Worker ──
  rwLoadingModel: 'Cargando modelo de embeddings...',
  rwDownloading: (p: number) => `Descargando motor semántico (${p}%)...`,
  rwIndexReady: 'Índice léxico BM25 listo.',
  rwCached: (n: number) => `Búsqueda inteligente recuperada del dispositivo (${n} fragmentos, sin recompute).`,
  rwVectorizing: (done: number, total: number) => `Vectorizando fragmentos (${Math.min(total, done)}/${total})...`,

  // ── Match types ──
  matchLiteral: 'literal',
  matchSemantic: 'semántica',
  matchCombined: 'combinada',
}

/* ──────────────────────────────────────────────────────────────────────
   CONTEXT + PROVIDER
   ────────────────────────────────────────────────────────────────────── */
const dicts: Record<Locale, FullDict> = { en: enDict, es: esDict }

type LocaleCtx = {
  locale: Locale
  setLocale: (l: Locale) => void
  t: FullDict
}

const LocaleContext = createContext<LocaleCtx>({
  locale: 'en',
  setLocale: () => {},
  t: enDict,
})

export function useLocale() {
  return useContext(LocaleContext)
}

/** Get current locale from preferences (for use outside React components).
 *  Priority: saved preference > auto-detect > default 'en'. */
export function getLocale(): Locale {
  try {
    const stored = getPreferences()
    if (stored.locale === 'es' || stored.locale === 'en') return stored.locale
  } catch { /* ignore */ }
  return detectLocale()
}

/** Reset locale to auto-detect mode (clears saved preference). */
export function resetLocaleToAuto(): Locale {
  try {
    savePreferences({ ...getPreferences(), locale: undefined })
  } catch { /* ignore */ }
  return detectLocale()
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    try {
      const stored = getPreferences()
      if (stored.locale === 'es' || stored.locale === 'en') return stored.locale
    } catch {}
    return detectLocale()
  })

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l)
    try {
      savePreferences({ ...getPreferences(), locale: l })
    } catch {}
    if (typeof document !== 'undefined') {
      document.documentElement.lang = l
    }
  }, [])

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = locale
    }
  }, [locale])

  return (
    <LocaleContext.Provider value={{ locale, setLocale, t: dicts[locale] }}>
      {children}
    </LocaleContext.Provider>
  )
}
