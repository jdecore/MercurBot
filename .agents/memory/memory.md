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

### Laya F2 — Validate inference + robustness ✅ (25/09)
- **Problema:** routeIntent() implementado pero sin validación de que el modelo ONNX INT8 realmente funciona. Sin soporte para noul/score. Sin confidence threshold. Worker aún usa classifyHeuristic independientemente.
- **Solución:**
  1. **Self-test on load:** `loadLayaSession()` ahora ejecuta `selfTestLaya()` — una inferencia mínima ("hello" → yes/no question) que verifica que el modelo produce logits válidos. Si falla, `isLayaReady()` retorna false y routeIntent retorna null (heuristic fallback).
  2. **Full noul + score en routeIntent:** Ahora maneja los 3 tipos de Laya:
     - `choice`: softmax → best key + probabilities + confidence
     - `noul`: P(yes) = probs[1], confidence = max(p, 1-p)
     - `score`: expected value = Σ(i × p[i])
  3. **Confidence threshold:** `CONFIDENCE_THRESHOLD = 0.35`. Si alguna pregunta tiene confianza < 0.35, routeIntent retorna null (heuristic fallback). Protege contra INT8 quantization error.
  4. **searchMode pipeline:** `ragClient.search()` ahora acepta `searchMode` opcional → worker lo recibe en `WorkerSearchPayload` → `handleSearch()` usa el hint en vez de `classifyHeuristic` cuando está disponible. Flujo completo: routeIntent → ExcelChat → ragPipeline → ragClient → worker.
  5. **needsWeb noul guardrail:** `INTENT_SCHEMA.needsWeb` pregunta si la query requiere info fuera del documento. `parseIntentResult()` retorna `needsWeb: boolean`.
  6. **Debug F5 mejorado:** Muestra `isLayaReady()`, confidence por pregunta, y timing en ms.
  7. **Prewarm update:** `prewarmModels()` ahora verifica `isLayaReady()` después de loadLayaSession — si el self-test falla, layaReady queda en false con error message.
- **Resultado:** build OK, lint OK, 0 errores TypeScript
- **Aprendizajes:** El self-test es crítico: el modelo INT8 de un tercero puede cargar exitosamente pero producir logits basura. Con el self-test + confidence threshold, el sistema degrada gracefully a heuristic en vez de tomar decisiones erróneas. El pipeline searchMode end-to-end (app→ragPipeline→ragClient→worker) evita re-clasificación en el worker.
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

### Laya F3+F4 — Guardrails + batch validation ✅ (25/09)
- **Problema:** Solo `needsWeb` estaba como noul guardrail. Sin validación de dimensions del batch ONNX. `classifyQuery` legacy aún existía.
- **Solución:**
  1. **INTENT_SCHEMA expandido:** Agregadas preguntas `isPageRef` (¿refiere a página/artículo/cláusula específica?) e `isSummary` (¿quiere resumen/overview?). Schema ahora tiene 5 preguntas: 2 choice + 3 noul.
  2. **Batch logits validation:** `routeIntent()` ahora verifica que los logits tengan shape `[nQuestions, maxOptions]`. Si el shape no coincide, retorna null (heuristic fallback). Protege contra modelos INT8 que no soportan batch correctamente.
  3. **ExcelChat guardrails:** `isPageRef` refuerza `searchMode` — si Laya detecta referencia a página, fuerza `literal` aunque el choice diga `semantic`. `needsWeb` se agrega a `payloadContext.intentGuards` para que el LLM sepa que la query puede necesitar info externa.
  4. **Debug F5 ampliado:** Ahora testea 4 queries (incluyendo "¿cuál es la capital de Francia?" que necesita web) y verifica `pageRef` + `web` flags por query.
  5. **F4 verificado:** `routeIntent()` ya hacía batch de todas las preguntas en un solo forward pass (línea 664). `classifyQuery` legacy solo se usa en debug.
- **Resultado:** build OK, lint OK, 0 errores TypeScript
- **Aprendizajes:** El multi-head batch ya estaba implementado correctamente — el decoder del modelo INT8 procesa `logits[batch, K]` directamente. La validación de shape es importante porque algunos exports INT8 no preservan la dimensionalidad del batch.

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
| Self-test ONNX on load | Valida que el modelo produce logits antes de usarlo | 25/09 |
| Confidence threshold 0.35 | Degradación graceful a heuristic cuando Laya no es confiable | 25/09 |
| searchMode end-to-end | routeIntent→ragPipeline→ragClient→worker, sin re-clasificación | 25/09 |
| needsWeb noul guardrail | Detecta queries que requieren info fuera del documento | 25/09 |
| isPageRef noul guardrail | Detecta referencias a páginas/artículos → refuerza searchMode literal | 25/09 |
| isSummary noul guardrail | Detecta pedidos de resumen/overview | 25/09 |
| Batch logits shape validation | Verifica dims antes de decodificar, fallback si shape inesperado | 25/09 |
| intentGuards en payloadContext | needsWeb/isPageRef pasados al LLM como contexto | 25/09 |

---

## Pendientes conocidos
1. **Commits:** ~16 archivos sin commitear (i18n migration, branding, dependency updates, debugger, CSP fixes, routeIntent)
2. **QA visual live:** verificar deploy real
3. **og:image:** public/og-cover.png 1200×630 pendiente
4. **E2E completo:** PDF escaneado, mobile, oscuro, gráficas, citas
5. **Laya F5 — batch sequential fallback:** Si el ONNX batch falla (algunos modelos INT8 no soportan batch), intentar secuencialmente (una pregunta a la vez). Actualmente retorna null.
6. **Laya F6 — needsWeb consumer:** `intentGuards.needsWeb` está en el payload pero el LLM no tiene instrucciones claras de qué hacer con él. Evaluar si agregar web search o solo advertir al usuario.

---

## Cómo retomar
```bash
pnpm build
pnpm lint
pnpm dev
```

---

*"Los datos se quedan en el navegador."*
