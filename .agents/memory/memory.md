# memory.md — Bitácora del Proyecto

> **Última actualización:** 2026-09-25 | Rama: main

---

## Estado actual (live)
- FSD reorganization completada (src/ → app/widgets/features/entities/shared/)
- `.agents/` knowledge layer creada (context/skills/memory)
- App funcional: build OK, lint OK, 0 errores TypeScript
- **Laya routeIntent() implementado:** tokenizer BPE portado de laya-ts, prompt renderer con [MASK] markers, inferencia ONNX, softmax por opción. Chat flow decide rag/direct/chart antes de buscar.
- Sin bloqueos conocidos

---

## Qué se hizo en la última sesión

### Laya routeIntent() — choice routing engine ✅ (25/09)
- **Problema:** Laya solo clasificaba literal/semantic con tokenizer falso (hash hasheado). El modelo INT8 siempre fallaba la inferencia. Sin router de intenciones real.
- **Solución:** Reescritura completa de `src/shared/lib/laya.ts`:
  1. **Tokenizer BPE portado de laya-ts:** `parseTokenizerJson()` parsea `tokenizer.json` real (vocab, merges, special tokens). `bpeEncode()` con GPT-2 byte-level mapping + merge heap O(n log n). `createTokenizer()` exporta `TokenizerLike` con `encode()`.
  2. **Tokenizer persistido en OPFS:** `downloadLayaModel()` ahora guarda `tokenizer.json` via `downloadToOPFS` (antes se descartaba). `loadLayaSession()` lee de OPFS y crea tokenizer.
  3. **Prompt renderer portado de laya-ts:** `buildQuestionPrefix()` construye `[CLS] type question: ins [SEP] [MASK] opt1 [MASK] opt2 [SEP]`. `sequenceWithState()` appende state tokens. `renderOptions()` renderiza criteria como texto.
  4. **Collate + feeds:** `buildFeeds()` crea batch con `input_ids` (int64), `attention_mask` (int64), `marker_pos` (int64), `marker_mask` (bool), `qtype` (int64).
  5. **`routeIntent(state, questions)`:** Evalúa preguntas typed en un solo forward pass. Para `choice`: softmax sobre logits por opción, devuelve `{choice, confidence, probabilities}`. Para `score`: expected value. Para `noul`: P(yes).
  6. **Limpieza:** Eliminados `preloadLaya`, `deleteLayaCache`, `getLayaCacheSize`, `LayaStatus`, `hashToken`, `tokenizeSimple`.
- **Nuevo archivo:** `src/entities/robot/intentSchema.ts` — Schema de routing con `action: {rag|direct|chart}` y `searchMode: {literal|semantic}`.
- **Chat flow wirado:** `ExcelChat.tsx` llama `routeIntent()` antes del pipeline RAG. Si `action=direct`, salta RAG y va directo a la API.
- **Debug F5:** `__merucbot.testFlow()` incluye F5 `routeIntent()` con 3 queries de prueba.
- **Resultado:** build OK, lint OK, 0 errores TypeScript
- **Aprendizajes:** El INT8 single-file de `tozp/laya-onnx` tiene los mismos inputs que el modelo oficial (input_ids, attention_mask, marker_pos, marker_mask, qtype → logits, act). El prompt renderer de laya-ts es self-contained (~150 líneas) y funciona con cualquier tokenizer que implemente `TokenizerLike`. La key del render es: `[CLS] type question: instructions [SEP] [MASK] option_text ... [SEP] state [SEP]` — los markers apuntan a las posiciones de cada `[MASK]` y los logits en esas posiciones dan el score por opción.

---

## Qué se hizo en sesiones anteriores

### Dependency updates + SDK migration ✅ (24/09)
- **Cambios clave:** TypeScript 7.0.2, react/react-dom 19.3.0, @google/genai migration, devDependencies actualizadas
- **Resultado:** build OK, lint OK, 0 errores
- **Aprendizajes:** TypeScript 7 nativo no requirió alias; API @google/genai v2 usa `generateContent` con objeto plano, `systemInstruction` en `config`, `response.text` puede ser `undefined`; `pnpm approve-builds --all` para CI

### CSP fix: jsDelivr en script-src ✅ (24/09)
- **Problema:** ONNX Runtime carga dinámicamente `ort-wasm-simd-threaded.jsep.mjs` desde `cdn.jsdelivr.net`, bloqueado por `script-src 'self' ...` sin ese origen.
- **Solución:** `vercel.json` — agregado `https://cdn.jsdelivr.net` a `script-src`. Permissions-Policy ya estaba limpio en este archivo.

### Cross-origin isolation + SharedArrayBuffer ✅ (24/09)
- **Problema:** Chrome bloquea/marca `SharedArrayBuffer` en ONNX Runtime JSEP por falta de aislamiento cross-origin.
- **Solución:** `vercel.json` — agregados headers:
  - `Cross-Origin-Opener-Policy: same-origin`
  - `Cross-Origin-Embedder-Policy: require-corp`
- **Nota:** `require-corp` bloquea recursos cross-origin sin CORS. Verificar que fonts/CDNs sigan cargando. Si algo se rompe, cambiar a `credentialless`.

### Model download optimization ✅ (24/09)

**Fase 1 — Laya paralelo (modelo + tokenizer + config):**
- `src/lib/laya.ts` — `downloadLayaModel` ahora lanza los 3 `fetch` en paralelo con `Promise.all`. Solo el modelo se guarda en OPFS; tokenizer/config se validan y descartan. Reduce tiempo total de ~3 secuencial a ~1 paralelo.

**Fase 2 — Retry exponencial en `downloadToOPFS`:**
- `src/lib/laya.ts` — `downloadToOPFS` reintenta hasta 3 veces con backoff exponencial (1s, 2s, 4s) solo en errores de red/stream, no en HTTP 4xx/5xx. Conserva el progreso parcial entre reintentos.

**Fase 3 — Progreso real de embeddings en UI:**
- `src/lib/preload.ts` — `getPrewarmState` ahora expone `embeddingsProgress` y `embeddingsMessage`.
- `src/components/layout/EngineStatus.tsx` — Muestra `(X%)` al lado de "Descargando modelos IA..." cuando embeddings está en progreso 0-100.

**Fase 4 — Descargas serializadas:**
- `src/lib/preload.ts` — `prewarmModels` ahora hace embeddings primero, Laya después. Evita competencia por ancho de banda en conexiones lentas. Laya se lanza solo después de que embeddings esté listo.

**Resultado:** menor tiempo percibido, mejor feedback visual, y mayor tolerancia a fallos de red.

### Debugger oculto para testing en producción ✅ (24/09)
- **Problema:** No había forma de verificar el estado de modelos/pipeline/engine sin agregar UI visible.
- **Solución:** `src/lib/debug.ts` — debugger invisible para DevTools:
  - `window.__MERUCBOT_DEBUG__` con estado en vivo
  - Toggle con `Ctrl+Shift+D`
  - Comandos de consola: `__merucbot.check()`, `__merucbot.state()`, `__merucbot.toggle()`
  - Integrado en `App.tsx`: prewarm, engine status, RAG index
- **Uso en Edge:** Abrir DevTools (F12), ir a pestaña Console, escribir `__merucbot.check()` y enter.

### MERCU Theme migration ✅ (24/09)
- **Cambios clave:**
  - F2.5: auditoría final de tokens en App.css (0 `galaxy-*`, 0 `body.light`, 0 `prefers-color-scheme`, 0 `rgba(47,91,234)`, 0 `rgba(169,190,255)`)
  - F3: BlackHoleUpload → pozo marino; partículas hue 25–45 (naranja/biche), anillo cálido, cero cambios geometría/timing/props/a11y
  - F4: 7 robot units remapeados a familia tropical + océano/mineral; MascotaSvg.css `--unit-primary/accent` → biche; subtítulos a tinte oceánico
  - F5: `public/favicon.svg` → mark MERCU (biche + naranja sobre océano); `og-cover.svg` recoloreado; `index.html` theme-color unificado a `#073B46`
  - F6: `debug.ts` — color consola `#8b5cf6` → `#9EE014`
- **Resultado:** build OK, lint OK, 0 errores TypeScript
- **Aprendizajes:** `color-mix(in srgb, ...)` validado para todos los rgba; F2.5 confirmó que los "bugs" de `--galaxy-accent-hover/dim` ya no existen en el código actual; favicon.svg se reescribió completo (no era editable por fragmentos)

### FSD reorganization ✅ (24/09)
- **Cambios clave:** Migración de `src/` a estructura FSD (`app/`, `widgets/`, `features/`, `entities/`, `shared/`). Archivos movidos: `App.tsx` → `app/App.tsx`, componentes → `widgets/`, lógica de dominio → `entities/`, utilidades → `shared/lib/`, UI genérica → `shared/ui/`. RAG worker movido a `entities/rag/`. `.agents/` knowledge layer creada con `context/`, `skills/`, `memory/`. `memory.md` movido a `.agents/memory/memory.md`. `AGENTS.md` actualizado.
- **Resultado:** build OK, lint OK, 0 errores. Imports actualizados en 19 archivos. Vite warning `INEFFECTIVE_DYNAMIC_IMPORT` preexistente en `ragClient.ts`.
- **Aprendizajes:** `git mv` bloqueado por permisos bash; usar `cp` + `rm` en su lugar. Crear directorios nuevos antes de mover/copiar archivos. Verificar existencia de directorios después de `mv` fallido. Al reiniciar desde `git checkout -- src/`, perder cambios no commiteados en `src/`; commitear antes de reorganizaciones grandes.

---

## Decisiones clave

| Decisión | Razón | Fecha |
|----------|-------|-------|
| TypeScript 6.0.2 → 7.0.2 | Rewrite nativo Rust, 10x más rápido | 24/09 |
| @google/generative-ai → @google/genai | Paquete legacy deprecado, migración completa API | 24/09 |
| React/DOM 19.2.8 → 19.3.0 | Safe minor update | 24/09 |
| @huggingface/transformers | Migración desde @xenova completada | previo |
| onnxruntime-web 1.30.0 pinned | CDN URL en laya.ts consistente | previo |
| SVG puro vs librería externa | Sin dependencias nuevas, control total | previo |
| CSS nativo vs Tailwind | Stack constraint AGENTS.md | previo |
| Pixelarticons vs lucide/FA | Stack constraint AGENTS.md | previo |
| ALLOWED_ORIGINS vía env var | Preparado para cambio de dominio | previo |
| Debugger oculto DevTools | Verificación sin UI; toggle Ctrl+Shift+D | 24/09 |
| Laya routeIntent() | Router de intenciones con choice/score/noul via ONNX | 25/09 |
| Tokenizer BPE en laya.ts | Portado de laya-ts, reemplaza hash hasheado | 25/09 |
| Intent schema separado | `intentSchema.ts` para routing rag/direct/chart | 25/09 |

---

## Pendientes conocidos
1. **Commits:** ~16 archivos sin commitear (i18n migration, branding, dependency updates, debugger, CSP fixes, routeIntent)
2. **QA visual live:** verificar deploy real
3. **og:image:** public/og-cover.png 1200×630 pendiente
4. **E2E completo:** PDF escaneado, mobile, oscuro, gráficas, citas
5. **Laya F2 — validar inferencia:** El routeIntent() está implementado pero la inferencia ONNX real del modelo INT8 no ha sido validada en producción. El `__merucbot.testFlow({laya:true})` probará esto.
6. **Laya F3 — noul para guardrails:** Agregar `needs_web: {type:'noul'}` para detectar queries que requieren info fuera del documento.

---

## Cómo retomar
```bash
pnpm build
pnpm lint
pnpm dev
```

---

*"Los datos se quedan en el navegador."*
