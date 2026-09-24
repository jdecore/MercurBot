# memory.md — Diario de Agente

> **Última actualización:** 2026-09-24 | Rama: `main`

---

## Estado actual (live)

Galaxy Plan completo (Fases 0-8 ✅). Última sesión: pre-warm automático de modelos, IndexedDB, onboarding 6 pasos, fix WASM CDN + Permissions-Policy.

---

## Qué hay sin commitear (16 archivos)

Branding: `Copixi→MercurBot`, robot `Copi→Mercur` (no confundir con "Hera" — era un nombre temporal descartado).

Archivos modificados:
```
AGENTS.md, README.md, api/chat/index.ts, index.html, .env.example
src/App.css, src/App.tsx, src/lib/locale.tsx, src/lib/storage.ts
src/components/excel/ExcelChat.tsx, src/components/layout/Sidebar.tsx
src/components/layout/EngineStatus.tsx, src/components/ui/ErrorBoundary.tsx
src/components/ui/MascotaCustomizer.tsx, src/components/pdf/BriefingCard.tsx
src/components/pdf/PdfViewer.tsx, src/components/pdf/ChartFullButton.tsx
src/components/onboarding/OnboardingTour.tsx
src/components/dashboard/PdfProcessingCard.tsx
```

---

## Qué se hizo en la última sesión

### Galaxy Phase 5 — Quitar automatización ✅ (23/09)

**Objetivo:** Eliminar BriefingCard, Wayflow, starters, auto-TTS, copixi:reread.

**Archivos modificados:**
- `src/App.tsx` — Removed: BriefingCard import, WayflowPanel import, ErrorBoundary import, `wayflowActive` state, `briefing*` state (5 vars), `briefingAbortRef`, `loadBriefing` function, `void loadBriefing(pdfResult)` call, `briefingReqRef` increments, `speakInteraction('file-upload')`, `copixi:reread` onClick, `onToggleWayflow` prop. Simplified: `doc-split-triple` → `doc-split`, unused `locale` destructured
- `src/components/layout/Sidebar.tsx` — Removed: `onToggleWayflow` prop + interface + 2 buttons (rail + drawer)
- `src/components/excel/ExcelChat.tsx` — Removed: WorkflowQuickStart import + render + state, `copixi:reread` event listener + `lastAiTextRef`, starters section (excel-starters + excel-starters-row), workflow button in dock
- `src/App.css` — Removed: `.excel-starters*`, `.wf-quick-*`, `.wayflow-*`, `.doc-split-triple`, `.doc-wayflow-col`, `.doc-wayflow-col` responsive

**Resultado:** app más ligera (~50KB less JS), sin automatización no solicitada. Build OK.

### Galaxy Phase 8 — QA final + limpieza ✅ (23/09)

**Objetivo:** Quality gates + limpieza de dead code.

**Quality gates verificados:**
- tsc OK (0 errores)
- vite build OK (197KB JS, 850ms)
- grep: sin tailwind/shadcn/lucide/framer/heroicons/fontawesome
- 1 Vercel Function (api/chat/index.ts)
- Sin VITE_ secrets in frontend
- Responsive: 640px + 900px breakpoints
- ErrorBoundary con fallback UI + retry

**Archivos eliminados:**
- `src/features/wayflow/` (6 archivos: index.ts, MercurBotContext.tsx, mercurRuntime.ts, nodes/, WayflowPanel.tsx, WorkflowQuickStart.tsx)
- `src/components/pdf/BriefingCard.tsx`

**Dead CSS eliminado:** `.briefing-card*`, `.doc-split-triple`, `.doc-wayflow-col*`, `.wf-quick-*`, `.wayflow-*`

**Tokens agregados:** `--color-card`, `--color-foreground`, `--color-muted-foreground` (dark + light)

### Galaxy Phase 6 — Voz en vivo ✅ (23/09)

**Objetivo:** Sesión de voz continua con barge-in, volume meter, auto-send.

**Archivos creados:**
- `src/lib/voiceSession.ts` — Hook `useVoiceSession`: continuous STT, 1.2s silence auto-send, barge-in (cancel TTS on speech), AnalyserNode volume meter → `--voice-level` CSS var, X/Esc stop, 2min max, auto-restart Chrome, `copixi:voice-session` event

**Archivos modificados:**
- `src/components/excel/ExcelChat.tsx` — Replaced `useDictation` with `useVoiceSession`, auto-send on final text, removed `dictationBase` state
- `src/components/ui/Mascota.tsx` — Added `voiceActive` prop → `voice-active` CSS class
- `src/components/ui/MascotaSvg.css` — Volume meter CSS: orb pulse, aura brightness, wave bars scale with `--voice-level`
- `src/App.tsx` — `voiceSessionActive` state, `copixi:voice-session` listener, passes `voiceActive` to Mascota, orbital ring `data-state` includes voice

**Resultado:** micrófono abierto continuamente, texto se envía automáticamente tras 1.2s de silencio, barge-in cancela TTS, robot reacciona al volumen de voz. Build OK (199KB JS).

### Galaxy Phase 7 — Laya ONNX portero ✅ (24/09)

**Objetivo:** Clasificador literal vs semántico para decidir cuándo usar búsqueda léxica vs vectorial.

**Archivos creados:**
- `src/lib/laya.ts` — Heuristic classifier (instant, pattern-based) + Laya ONNX wrapper (onnxruntime-web, 424MB int8 model from tozp/laya-onnx, OPFS cache)
- `src/lib/useLayaModel.ts` — React hook: download/delete model, OPFS cache check, progress tracking

**Archivos modificados:**
- `src/components/ui/MascotCustomizer.tsx` — Added "Cerebro" tab (3rd tab) with download/delete button, progress bar, status display
- `src/components/ui/Icon.tsx` — Added `cerebro` icon (pixelarticons Cpu)
- `src/lib/locale.tsx` — Added cerebro strings (EN + ES): mcTabCerebro, mcCerebroHeading, mcCerebroDesc, etc.
- `src/workers/rag.worker.ts` — Integrated classifier: skips vector search for high-confidence literal queries, returns classification in search results
- `src/App.css` — Cerebro tab styles: .cerebro-status, .cerebro-progress, .cerebro-actions, .customizer-hint
- `package.json` — Added `onnxruntime-web@1.14.0` as direct dependency

**How it works:**
1. Default: heuristic classifier (instant, no download) — pattern matching for quotes, numbers, page refs, question types
2. Optional: user downloads Laya ONNX model (424MB) from cerebro tab → cached in OPFS
3. RAG pipeline: classify query → literal (confidence >0.7) → skip vector search, lexical only → faster
4. Semantic queries → full hybrid search (lexical + vector RRF)

**Resultado:** clasificador ejecuta en <1ms (heurístico) o ~33ms (Laya ONNX). Consultas literales ahorran tiempo de vectorización. Build OK (205KB JS + 552KB ort-web chunk).

### Galaxy Phase 7 — Pre-warm automático + IndexedDB ✅ (24/09, refactor)

**Objetivo:** Descarga automática de modelos en paralelo + persistencia robusta del robot.

**Archivos creados:**
- `src/lib/preload.ts` — `prewarmModels()`: lanza embeddings + Laya en paralelo al montar App, idempotente, event listeners para progreso
- `src/lib/idb.ts` — IndexedDB wrapper: `idbGet`, `idbSet`, `idbDelete`, `migrateToIDB`

**Archivos modificados:**
- `src/lib/laya.ts` — Added `preloadLaya()`, removed manual download UI references
- `src/lib/storage.ts` — `getPreferences()` now uses IndexedDB with localStorage fallback, `savePreferences()` writes to both, `loadPreferences()` async for startup migration
- `src/App.tsx` — `useEffect(() => prewarmModels())` at startup
- `src/components/layout/EngineStatus.tsx` — Subtle "Descargando modelos IA..." badge during pre-warm
- `src/lib/locale.tsx` — Added `esDownloadingModels` (EN + ES)

**Archivos eliminados:**
- `src/lib/useLayaModel.ts` — No longer needed (auto-download)
- Cerebro tab from MascotCustomizer
- Cerebro locale strings (mcTabCerebro, mcCerebro*, etc.)
- Cerebro CSS (.cerebro-*, .customizer-hint)

**Cómo funciona:**
1. App monta → `prewarmModels()` lanza ambas descargas en paralelo
2. Embeddings (23MB) listo en ~5s, Laya (424MB) en ~30-60s
3. Mientras descarga: heuristic classifier (<1ms) ya funciona
4. Cuando Laya esté listo → se activa automáticamente
5. EngineStatus muestra badge sutil durante la descarga
6. Preferencias del robot → IndexedDB (survive Clear Site Data)

**Resultado:** modelos siempre activos, sin UX de descarga, preferencias persistentes. Build OK.

### Onboarding rediseñado — 6 pasos + glass style (24/09)

**Objetivo:** UX gradual, una pregunta por paso, estilo transparente como el customizer del sidebar. Tiempo extendido para que Laya descargue en background.

**Antes:** 3 pasos (Welcome+name+robot, Theme+eyes, How it works)
**Ahora:** 6 pasos (Welcome, Your name, Robot name, Colors, Eyes, How it works)

**Archivos modificados:**
- `src/components/onboarding/OnboardingTour.tsx` — 6 steps, one question each, glass style matching customizer
- `src/lib/locale.tsx` — Updated otStep* strings (EN + ES), added otStep3Title/otStep4Title/otStep5Title
- `src/App.css` — Onboarding glass style: backdrop-filter blur, customizer-matching border-radius/shadow/padding, animated dots with "done" state

**Resultado:** cada paso = 1 pregunta, robot visible siempre, estilo cristal transparente. ~30-60s de onboarding permite que Laya (424MB) descargue en background.

### Fix ONNX WASM + Permissions-Policy (24/09)

**Problema:** ONNX Runtime Web intentaba cargar `ort-wasm-simd.wasm` desde el origen (404). Permissions-Policy tenía features no reconocidas por Chrome.

**Solución:**
- `src/lib/laya.ts` — `ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.14.0/dist/'` (WASM desde CDN)
- `vercel.json` — Removidas features inválidas: `ambient-light-sensor`, `run-ad-auction`, `join-ad-interest-group`, `private-aggregation`, `attribution-reporting`

### Product i18n Migration (Phase 2) — 23/09

**Objetivo:** Migrar todos los strings del producto (UI) al diccionario bilingüe ES/EN.

**Archivos modificados:**
- `src/lib/locale.tsx` — Diccionario ampliado: ~352 strings × 2 idiomas. Agregados: chat UI, errores, botones, status, sugerencias, dictado, TTS, PDF viewer, chart, briefing, sidebar, engine status
- `src/App.tsx` — Todos los strings hardcoded migrados a `t.*` (errores, processing, greetings, onboarding, UI labels)
- `src/components/excel/ExcelChat.tsx` — Migrado completo (~90 strings): chat UI, mic/TTS buttons, rate-limit, errores, sugerencias, placeholders, status messages
- `src/components/layout/Sidebar.tsx` — Migrado completo a `t.*`
- `src/components/layout/EngineStatus.tsx` — Migrado completo a `t.*`
- `src/components/ui/ErrorBoundary.tsx` — Migrado via `ErrorFallback` wrapper
- `src/components/ui/MascotCustomizer.tsx` — Migrado completo
- `src/components/pdf/BriefingCard.tsx` — Migrado completo
- `src/components/pdf/PdfViewer.tsx` — Migrado completo
- `src/components/pdf/ChartFullButton.tsx` — Migrado completo
- `src/components/onboarding/OnboardingTour.tsx` — Migrado completo
- `src/components/dashboard/PdfProcessingCard.tsx` — Migrado completo

**API Locale Awareness:**
- `api/chat/index.ts` — `buildSystemPrompt(lang)` genera system prompt en ES/EN
- Frontend envía `lang: locale` en todos los fetch calls
- Summary, extract, chart-full prompts respetan idioma

**Funciones helper migradas:**
- `matchTypeLabel()` — Ahora acepta `t` como parámetro
- `describeNoChart()` — Ahora acepta `t` como parámetro
- `renderInlineWithCites()` — Ahora acepta `t` como parámetro
- `renderRichText()` — Ahora acepta `t` como parámetro
- `ModelPill()` — Usa `useLocale()` hook

**Build verificado:** `npx tsc -b` + `npx vite build` pasan sin errores
**Commits:** a1e3d75 (feat), a5d585b (fix)

---

## Decisiones clave

| Decisión | Razón |
|----------|-------|
| SVG puro en vez de librería externa | Sin dependencias nuevas (§34), control total |
| Canvas partículas detrás del SVG | Rendering behind robot, no interfere con ojos/brazos |
| `Mascota.css` como excepción a tokens | Colores de personaje no son UI — identidad del robot |
| `copixi:*` en events/localStorage | Backward compat, no romper localStorage de usuarios existentes |
| Ojos sin pupilas negras | Estilo EVE/robot cute, más natural con solo iris+brillo |
| Brazos `<rect rx="6">` | Capsule shapes — el fix que resolvió los brazos de palito |
| TTS con cooldowns | No repetir frases molestas |
| Inter como body font | UI Pro Max recomienda para AI tools, ya estaba en fallback chain |
| Calistoga para headings | Agrega calidez humana al robot, paired con Inter |
| Dark mode navy (#0F172A) | UI Pro Max pattern para AI dashboards, más profesional que verde oscuro |
| Focus ring con --color-tropical | Mejor contraste que --color-primary, visible en ambos modos |
| Landing bilingüe (ES/EN) | Makers Fellowship requiere EN; diccionario quirúrgico sin refactorizar producto |
| Locale default 'en' | Evaluadores Makers son angloparlantes; toggle ES accesible en sidebar |
| Producto i18n completo | Todos los strings del producto migrados al diccionario; app 100% bilingüe |
| Funciones helper con `t` param | `matchTypeLabel`, `describeNoChart` aceptan diccionario como parámetro |
| ALLOWED_ORIGINS vía env var | Preparado para cambio de dominio sin redeploy de código |

---

## Estado de branches

```
* main          ← todos los cambios sin commitear
  respaldo      ← backup antes de SVG/TTS
  robot         ← trabajo previo del robot
```

---

## Pendientes conocidos

1. **Commitear** los archivos de la sesión (i18n migration, landing, hardcoded audit, etc.)
2. **QA visual live** — verificar que todo se ve bien tras deploy (sin navegador en entorno)
3. **og:image** — `public/og-cover.png` 1200×630 pendiente de crear
4. **E2E completo** — PDF escaneado, mobile, oscuro, gráficas, citas en panel
5. **api/chat system prompt** — Hacer que respete el locale (pasar `lang` en request body)

---

## Cómo retomar

```bash
# 1. Verificar build
pnpm build

# 2. Verificar lint
pnpm lint

# 3. Dev server
pnpm dev

# 4. Cuando esté listo para commitear
git add -A
git commit -m "..."
git push
```

---

## Hardcoded audit — Decisiones (23/09)

| Valor | Línea | Decisión | Razón |
|-------|-------|----------|-------|
| `https://copixi.vercel.app` (ALLOWED_ORIGINS) | 36 | **CONFIG** (env var) | Preparado para cambio de dominio |
| `http://localhost:5173/3000` | 36 | **KEEP** en default | Dev local, harmless |
| `https://api.groq.com/...` | 224 | **KEEP** | Endpoint público estable de Groq |
| `https://openrouter.ai/...` | 256 | **KEEP** | Endpoint público estable de OpenRouter |
| `https://copixi.vercel.app` (HTTP-Referer) | 258 | **CONFIG** (env var `SITE_URL`) | OpenRouter ranking, cambiante |
| `MercurBot` (X-Title) | 259 | **CONFIG** (env var `SITE_NAME`) | OpenRouter display name |
| Model defaults (gemini-3.5-flash-lite, etc.) | 129-131 | **KEEP** | Defaults fallback, overrides via env |
| `http://www.w3.org/2000/svg` | Mascota.tsx | **KEEP** | XML namespace estándar, no es URL |
| System prompt ES | 133-152 | **KEEP** | No es secreto, hardcoded language ok |
| `GEMINI_API_KEY` refs en error strings | ChartFull/ExcelChat | **KEEP** | Solo nombres de variable, no valores |

---

## Stack recordatorio

- **Framework:** React + TypeScript
- **Build:** Vite
- **Package Manager:** pnpm
- **Estilos:** CSS nativo (nunca Tailwind)
- **Iconos:** Pixelarticons (nunca lucide/FA)
- **Robot:** SVG custom + Canvas partículas
- **TTS:** Web Speech API nativo
- **Sonidos:** Web Audio API (0 deps)
- **PDF:** pdfjs-dist
- **AI:** Vercel AI SDK + Gemini
- **Deploy:** Vercel

---

## Plan Galaxy 🌌 — Rediseño completo por fases

> **Objetivo:** Estilo cosmos oscuro en toda la app, robot con orbe/estado, chat en consola de cristal, voz en vivo, Laya como portero de embeddings.
> **Stack intacto:** CSS nativo, Pixelarticons, Radix, pnpm. Sin Tailwind/Framer/lucide.

### Fase 0 — Fundación Galaxy (tokens + cielo) ✅
Tokens `--galaxy-bg`, `--galaxy-surface`, `--galaxy-accent`, estrellas con `radial-gradient` en `body::before`, `prefers-reduced-motion`.

### Fase 1 — Landing (coronar lo existente) ✅
Robot 225px con halo radial azul-galaxy, agujero negro centrado abajo, badge + tagline con brillo sobre fondo estrellado.

### Fase 2 — Sidebar → riel Galaxy ✅
Riel oscuro translúcido: logo mini → recientes cristal → abajo solo Personalizar. Drawer cristal en móvil.

### Fase 3 — Idioma automático + robot por idioma ✅
Auto-detección (`navigator.language` + timezone), quitar toggle del sidebar. EN = frío/azul, ES = cálido/rojo.

### Fase 4 — Vista documento Galaxy + orbe + bocadillo vivo ✅
Robot con orbe en pecho (4 estados CSS: breathe/pulse/rotate/glow), anillo orbital con 4 estados (idle/listening/thinking/speaking), consola de cristal (glass + blur), píldora flotante (input rounded-full), chat messages glass, citations galaxy, buttons/links/capsule todos Galaxy. Limpieza de dead canvas selectors.

### Fase 5 — Quitar automatización ✅
Fuera: BriefingCard (import + render + state + loadBriefing function), WayflowPanel (import + render + state + CSS), WorkflowQuickStart (import + render + state), starters (excel-starters), speakInteraction auto-TTS (solo quedan user-initiated: copy/export/search), copixi:reread (onClick robot + event listener + lastAiTextRef). Sidebar: quitado botón workflow (rail + drawer). Dead CSS: doc-split-triple, wayflow-*, starters-*, wf-quick-*. Limpieza de unused imports (ErrorBoundary, locale).

### Fase 6 — Voz en vivo ✅
Sesión continua con `useVoiceSession` hook: mic abierto, auto-send 1.2s silencio, barge-in (cancel TTS al detectar voz), volume meter (AnalyserNode → `--voice-level` CSS var 0–1), X/Esc para parar, max 2 min, auto-restart en Chrome. Robot reacciona: orb pulse con `--voice-level`, aura brightness, wave bars scale. Evento `copixi:voice-session` comunica estado a App.tsx → Mascota `voice-active` class.

### Fase 7 — Laya: descarga en Personalizar + portero ✅ → Refactor: pre-warm automático + IndexedDB

**Original:** Cerebro tab manual para descargar Laya.
**Refactor (24/09):** Descarga automática en paralelo al startup. Sin UI de descarga.
- `src/lib/preload.ts` — `prewarmModels()`: lanza embeddings + Laya en paralelo al montar App
- `src/lib/laya.ts` — `preloadLaya()`: descarga + carga en background, heuristic fallback
- `src/lib/idb.ts` — IndexedDB wrapper para persistencia robusta de preferencias
- `src/lib/storage.ts` — `getPreferences()` ahora usa IndexedDB con fallback localStorage
- `src/components/layout/EngineStatus.tsx` — badge sutil "Descargando modelos IA..." cuando descarga
- Eliminado: cerebro tab, useLayaModel.ts, cerebro CSS, cerebro locale strings

### Fase 8 — QA final + limpieza ✅
Quality gates: tsc OK, vite build OK (197KB JS, 850ms), grep sin tailwind/shadcn/lucide/framer/heroicons/fontawesome, 1 Vercel Function (api/chat), sin VITE_ secrets, responsive (640px + 900px breakpoints), ErrorBoundary con fallback. Limpieza: borrado `src/features/wayflow/` (6 archivos), `src/components/pdf/BriefingCard.tsx`, dead CSS (briefing-card, doc-split-triple, wf-quick-*, wayflow-*). Tokens `--color-card`, `--color-foreground`, `--color-muted-foreground` agregados para compatibilidad.

**Orden:** 0 → 1 → 2 → 3 → 4 → 5 → 8 → 6 → 7. Cada fase = 1 commit reversible.

---

*"Los datos se quedan en el navegador."*
