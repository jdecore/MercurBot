# memory.md — Bitácora del Proyecto

> **Última actualización:** 2026-09-26 | Rama: main

---

## Estado actual (live)
- FSD reorganization completada (src/ → app/widgets/features/entities/shared/)
- `.agents/` knowledge layer creada (context/skills/memory)
- App funcional: build OK, lint OK (0 errors, 19 warnings preexistentes), 0 errores TypeScript
- **Bake-off de intenciones RESUELTO (Fase 0→3, 25–26/09):**
  - Fase 0→2: candidato ONNX `killkli/open-jev-laya-multilingual-onnx` verificado y **descartado**
    (**NO MIGRAR**, Opción A aprobada) — no supera al baseline en ningún campo relevante (OOD).
  - **Fase 3a ✅:** clasificador de `action`+guardrails **por reglas** validado offline —
    100% action / 100% guardrails / 100% searchMode (heuristic v2) / **route-exact 100%** (120 queries).
  - **Fase 3b ✅:** port a `src/` + **ruta ONNX eliminada** de `laya.ts` (descarga 424MB, sesión,
    tokenizer, `routeIntent`, `INTENT_SCHEMA`, `parseIntentResult`) y de `preload.ts`/`EngineStatus`/
    `debug.ts`. `agentRuntime` ahora usa `classifyIntent()` → las ramas direct/chart/web_search/mcp/agent
    finalmente quedan alcanzables (antes `action='rag'` siempre porque `routeIntent()` siempre falló).
  - Harness archivado en **`.agents/bakeoff/`** (dataset 120, rules, reportes, verify-port).
- Riesgo pendiente de cachés: `clearLegacyLayaCache()` borra `copixi_laya` OPFS al prewarm.
- **Bloqueos conocidos: ninguno** (npm registry caído — usar symlink de `node_modules` si se necesita pnpm add).

---

## Qué se hizo en la última sesión

### Fase 3 — Reglas en producción + ONNX eliminado ✅ (26/09)
- **Qué (3a, offline):** `rules.mjs` (nuevo) — `classifyActionRules()`/`rulesIntent()` por regex
  ES/EN, precedencia `direct → chart → mcp → agent → web_search → rag`; y heuristic v2 en
  `heuristic.mjs` (patrones sin anclar `^\W*cuánto…`, `\b(artículo|…|point)\s*\d`, `\b(VAT|IVA|porcentaje)\b`).
  Ajustes iterativos sobre los 120: fix de `isSummary` (`&& action !== 'agent'` para "analiza y resume",
  2 errs) y de `searchMode` en "adiós/bye" (gold semantic vs literal — solo se puntúa searchMode donde
  gold action=rag). Resultado: **action 100/100, guardrails 100, searchMode 100, route-exact 100%
  (vs baseline 35%, flat-q 16.7%)**. Robustez ad-hoc 16/18 queries nuevas (los 2 miss → `rag`).
- **Qué (3b, src/):**
  1. `laya.ts` reescrito (825→~155 líneas): `classifyAction`, `classifyIntent`, `classifyQuery`,
     `classifyHeuristic` v2, `clearLegacyLayaCache()`. Borrados: tokenizer/BPE, prompt renderer,
     descarga/OPFS, sesión ORT, `routeIntent`, `softmax`, `confidenceFromProbs`.
  2. `intentSchema.ts` → solo tipos (borrados `INTENT_SCHEMA`, `IntentQuestion`, `parseIntentResult`).
  3. `agentRuntime.ts`: 2 sitios usan `classifyIntent()` (sync, con try/catch→defaults).
  4. `preload.ts`: solo embeddings + `void clearLegacyLayaCache()` al inicio del prewarm.
  5. `EngineStatus.tsx`: sin `layaReady`; `debug.ts`: estado prewarm sin campos `laya*`,
     F3 ONNX eliminado, F5 → F4 `classifyIntent` (5 queries), tabla `embeddings/classify/rag/intent`,
     sin opción `{laya:true}`. Comentarios en `worker.ts`/`ragPipeline.ts` actualizados.
- **Archivos tocados:** `src/shared/lib/{laya,agentRuntime,preload,debug}.ts`,
  `src/entities/robot/intentSchema.ts`, `src/widgets/layout/EngineStatus.tsx`,
  `src/entities/rag/worker.ts` (comentario), `src/features/rag/ragPipeline.ts` (comentario),
  + skills (`laya`, `debug`, `embeddings`, `rag`, `glossary`) y **`.agents/bakeoff/`** (harness
  archivado: dataset, rules, benchmark, reportes, `verify-port.mjs`, README).
- **Resultado:** `pnpm build` OK · `pnpm lint` 0 errors / 19 warnings (preexistentes, ninguno en
  archivos tocados) · `verify-port.mjs` **0 mismatches** src vs harness sobre los 120 ·
  `verify-debug-checks.mjs` F2+F4 **ALL PASS**.
- **Aprendizajes / decisiones:**
  1. **La causa raíz de todo el bake-off era que `routeIntent()` nunca corrió** — el "baseline 58.3%"
     era en realidad la acción congelada en `rag`. Las reglas la arreglan sin modelo (0ms, 0MB).
  2. OJO: validación no independiente — las reglas se ajustaron sobre los mismos 120; si se toca el
     clasificador, evaluar con queries nuevas fuera de muestra.
  3. `onnxruntime-web` **se queda** como dependencia: lo usa embeddings (`worker.ts` →
     `env.backends.onnx.wasm`), igual que el `connect-src` jsdelivr del CSP.
  4. El nombre `laya.ts` es histórico; el módulo ya no contiene Laya (decidido: no renombrar para
     evitar churn en imports — documentado en el header).

### Fase 2 bake-off — Benchmark 120 × 6 sistemas ✅ (26/09) — RECOMENDACIÓN: NO migrar
- **Qué:** `benchmark.mjs` (4 configs × 120, checkpoint en `results_fase2.json`) + `metrics.mjs`
  (→ `report_fase2.txt`). 4 configs = {flat, hier} × {state=query, state=doc+query}, más 2 baselines
  (`heuristic` = classifyHeuristic+defaults, `defaults` = lo que corre hoy en `agentRuntime`).
  Métricas: exact-match + macro-F1 por campo/idioma, searchMode sobre subset rag (n=70),
  route-exact, confusión de action, latencia, y calibración híbrida (umbral + fallback).
- **Resultados (overall; acc/macro-F1):**
  | sistema | action | searchMode | needsWeb | isPageRef | isSummary | route | ms |
  |---|---|---|---|---|---|---|---|
  | BASE heuristic | 58.3/12.3 | **82.9/81.6** | 90.0/47.4 | 86.7/46.4 | 90.0/47.4 | **30.8%** | 0 |
  | BASE defaults (hoy) | 58.3/12.3 | 54.3/35.2 | 90.0/47.4 | 86.7/46.4 | 90.0/47.4 | 21.7% | 0 |
  | flat·query | 35.0/32.9 | 74.3/74.3 | 87.5/46.7 | 86.7/46.4 | **91.7/78.4** | 16.7% | 2161 |
  | flat·doc+query | 40.0/31.6 | 65.7/65.7 | 63.3/42.7 | 56.7/47.6 | 68.3/54.6 | 15.0% | 6301 |
  | hier·query | 27.5/25.7 | 74.3/74.3 | 87.5/46.7 | 86.7/46.4 | 91.7/78.4 | 5.0% | 3004 |
  | hier·doc+query | 15.8/11.8 | 65.7/65.7 | 63.3/42.7 | 56.7/47.6 | 68.3/54.6 | 2.5% | 8157 |
- **Confusión flat·query (filas=gold):** rag 70 → **18 rag / 47 direct**; direct 10→10 ✓;
  chart 12→11 ✓; web 12→8 direct (1 web); mcp 8→2; agent 8→7 direct. O sea: el modelo acierta
  lo obvio (direct, chart) y revienta en lo que requiere "buscar en el documento".
- **Calibración (action+3 guards combinados, fallback al baseline):** baseline=62.5%;
  flat·query mejor 64.6% @ `confMargin≥0.9` (cobertura 22.9%); hier·query 65.4% @ `confEntropy≥0.5`
  (cobertura 22.1%). searchMode: el modelo nunca supera al heuristic (mejor empate 82.9% con t≥0.4).
- **Latencia:** flat·query 2.2s/query; doc+query **3× más lenta** (state≈350tok); hier·query 3.0s
  (cadena secuencial); hier·doc 8.2s.
- **Hallazgos / decisiones:**
  1. **`state=doc+query` empeora todo** (salvo action 40% vs 35% con F1 peor) y cuesta 3× → descartado.
  2. **El árbol jerárquico K=2 es peor que flat** en action (27.5 vs 35.0): los errores se acumulan
     en cadena (rag→web/mcp/agent al azar). Descartado.
  3. **El modelo no supera al baseline en ningún campo salvo `isSummary`** (F1 78.4 vs 47.4, +1.7 acc)
     ni en searchMode (74.3 vs 82.9); route-exact es la mitad (16.7 vs 30.8).
  4. **Causa raíz: OOD.** Laya está entrenado con *states de conversación* (historial de turnos),
     no con queries sueltas de un PDF assistant; con query suelta clasifica `direct` (47/70 rag).
     `agentRuntime` no tiene state rico que pasarle → migrar exige cambiar el contrato de datos.
  5. La confianza **sí** está informativa (accuracy sube con el umbral), pero el techo del hybrid
     (+2.9 pts sobre baseline a cobertura 22%) no justifica 647MB + 2.2s/query.
- **RECOMENDACIÓN al usuario: NO migrar a killkli-Laya** con el schema actual (escenario B
  actualizado): mantener `classifyHeuristic` + defaults. Artefactos por si se retoma:
  `.agents/bakeoff/{benchmark.mjs,metrics.mjs,hier.mjs,results_fase2.json,report_fase2.txt}`.
  **Excepción potencial:** solo `isSummary` (único campo con ganancia clara) — evaluar si compensa
  cargar el modelo por una pregunta binaria que se puede resolver con regex.
- **Decisión del usuario (26/09): OPCIÓN A — NO MIGRAR ✅ implementada:**
  1. `.agents/skills/laya.md` → nueva sección "Veredicto del bake-off (Fase 0→2)" con modelo,
     técnica (*typed questions*), tabla de resultados, causas y cómo reabrir el tema.
  2. `src/shared/lib/laya.ts` → constancia en el header (solo comentario, 0 cambios funcionales)
     de que la ruta ONNX está descartada y que `classifyHeuristic` es el código activo.
  3. `memory.md` → decisión marcada como resuelta. Opciones B/C registradas como descartadas.

### Fase 0 killkli — Laya multilingüe ONNX verificado ✅ (25/09)
- **Qué:** descarga e inferencia real de `killkli/open-jev-laya-multilingual-onnx` (fp16 647MB) en
  `.agents/bakeoff/verify.mjs`, contra `~/model-tests/killkli-laya/`. Sin tocar `src/`.
- **Por qué:** el usuario descartó tozp/Mattepiu/`GLiNER2.5-multi-v1` (extracción) y pidió una
  alternativa ONNX directa multilingüe; único candidato del Jev Decision Index con ONNX publicado,
  multilingüe y typed-decisions.
- **Resultado: 26 OK / 0 FAIL / 1 WARN.** Verificado:
  - **Firma:** `input_ids[batch,seq]`, `marker_pos[batch,options]`, `marker_mask bool`,
    `qtype [batch]` rank-1, `logits[batch,options]`, `act_probs[batch,2]`. **K=2/3/6 OK,
    seq=16/53/512/1024 OK, batch=2 OK.** El K=2 estático de Mattepiu y el seq=512 de tozp **no existen aquí**.
  - **fp16 en WASM sin NaN** (0 fallos en 5 corridas con state de 754 tokens); trunca bien a 1024.
  - **Sanity ES/EN:** noul greeting 0.877/0.897, query factual 0.000/0.000; `action` K=6:
    greeting→direct 0.941/0.971, chart→chart 1.000; `searchMode` literal 0.940 / semantic 0.930.
  - **Carga de sesión 8–10s, rss ~2.8GB, ~0.3–1.1s/pregunta** (seq corta), ~5s con 754 tokens.
- **Aprendizajes (críticos):**
  1. **El tokenizer BPE de `laya.ts` NO sirve para este checkpoint.** Es `metaspace` con
     `normalizer Replace(' ','▁')` + `prepend_scheme: always`, y `bpeEncode()` usa `GPT2_SPLIT`
     (byte-level) ignorando `kind`/`replaces` → ids corruptos (`hola buenos dias` → 51247… en vez
     de 150030…). **Solución verificada:** aplicar `replaces`, prepend `'▁'`, split `/(?=▁)/`,
     BPE por pieza → **4/4 idéntico a transformers.js**. En Fase 1 se usa
     `@huggingface/transformers` (ya es dependencia) o se parchea `bpeEncode` con el branch metaspace.
  2. **`laya_config.json` de killkli: `temperature=[1,1,1]` y `temperature_by_options={}`**
     → probabilidades **sin calibrar**. El umbral de confianza hay que derivarlo del dataset (Fase 2),
     no heredar el 0.35 actual.
  3. **Tokenizer aliases:** `cls=<bos>` (id 2), `sep=<eos>` (id 1), `mask=<mask>` (id 4) —
     `tok.cls_token_id` es `undefined`; usar `bos_token_id` como CLS.
  4. **Mismatch STATE/QUERY persiste** (WARN 1): `"¿Qué dice el artículo 7…?"` con query suelta →
     `direct 0.447` vs `rag 0.417`. Enviando `DOCUMENTO:…\nPREGUNTA:…` como state → `rag 0.663`.
     Laya sigue evaluar un STATE; probar ambos formatos en el bake-off (Fase 2).
  5. **`npm` inaccesible en este entorno (ETIMEDOUT a registry.npmjs.org)** → symlink de
     `node_modules` desde `copixi/` para el harness (`onnxruntime-web` 1.30 + `@huggingface/transformers` 4.3).
  6. fp16 sobre WASM funciona (no hace falta fp32 1.29GB); descarga 647MB en <1 min.
- **Artefactos:** `.agents/bakeoff/{verify.mjs,lib.mjs}` (los ad-hoc `probe_*`/`tok_*` no se archivaron),
  modelo en `~/model-tests/killkli-laya/` + `~/model-tests/hf/killkli--…/` (symlinks p/ transformers.js).

### Fase 1 bake-off — Adaptador flat + baseline + dataset ✅ (26/09)
- **Qué:** corrección de los errores críticos que bloqueaban Fase 1 e implementación de los
  adaptadores del bake-off. Test-only: **0 cambios en `src/`** (los fixes migran a `src/` solo si
  Fase 2 decide por killkli).
- **Errores críticos corregidos (en el harness, `layaML.mjs`):**
  1. **E1 tokenizer metaspace** — `bpeEncode()` de `laya.ts` usa `GPT2_SPLIT` byte-level e ignora
     `kind='metaspace'`/`replaces` → ids corruptos. Fix: `replaces` + prepend `'▁'` + split `'▁'` +
     BPE por pieza. **Verificado: 14/14 strings idénticos a transformers.js** (`verifyTokenizer()`).
  2. **E2 `qtype` rank-2** — `buildFeeds()` de `laya.ts` emite `dims [n,1]`; el modelo lanza
     `ERROR_CODE 2: Invalid rank for input: qtype` → **`routeIntent()` con killkli SIEMPRE fallaría**.
     Fix: `dims [n]`. (Causa raíz documentada; parche en `src/` pendiente de decisión Fase 2.)
  3. **E3 CLS/SEP** — `tok.cls_token_id === undefined` en transformers.js → fallback `bos(2)`/`eos(1)`.
  4. **E4 confianza** — se exportan `confEntropy` (1-H/ln k, rl_common) y `confMargin` (max(p), lo que
     laya.ts usa en noul); **sin umbral**: `temperature=[1,1,1]` sin calibrar → calibración en Fase 2.
  5. **E5 marker_pos ≥ len congela el runtime** (TopK con índice inválido → hang indefinido,
     descubierto empíricamente) → guard que lanza si algún marker queda fuera de rango.
- **Implementación Fase 1** (archivos hoy en `.agents/bakeoff/`):
  `layaML.mjs` (adapter: tokenizer/prompt/session/askBatch/classifyFlat), `heuristic.mjs`
  (baseline = `classifyHeuristic` exacto + defaults de `agentRuntime`, exporta `baselineCurrent`),
  `schema.mjs` (espejo de `INTENT_SCHEMA`), `dataset.mjs` (120 queries: 60 ES/60 EN, 8 categorías
  idénticas por idioma, con `sanityDataset()`), `smoke.mjs` (gate de Fase 1).
- **Resultado: 8 OK / 0 FAIL.** Datos clave:
  - Carga sesión 12–21s; latencia 5 preguntas: **batch 6.2s vs parallel 3.0s** (parallel por
    `Promise.all`; ORT-WASM **serializa** filas del batch y no gana con `numThreads=4` — medido 1t=964ms vs 4t=1000ms).
    Latencia media por query con `mode=parallel`: **~3.3s** (min 2.9 / max 3.7). Gate funcional <5s.
  - Baseline `classifyHeuristic` sobre las 70 queries con `action=rag`: **82.9% exact-match en
    searchMode** (ES 82.9%, EN 82.9%). Action baseline = siempre `rag` (los 5 fields con
    defaults solo detectan `rag`).
  - **Calidad preliminar (no gate, métrica formal en Fase 2):** con `state=query` suelta, `action`
    sobreestima `direct` en queries `rag` (4/12 muestras DIFF, conf 0.26–0.41 — baja confianza
    coincide con los fallos). Reproduce el mismatch STATE/QUERY de Fase 0 → **Fase 2 debe probar
    formatos de state** (`query` vs `DOCUMENTO:…\nPREGUNTA:…`).
- **Aprendizajes:**
  1. `renderOptions` noul = `['false: no, the statement does not hold', 'true: yes, the statement holds']` (fiel a rl_common); no usar `crit` custom (medido en sesión previa: empeora).
  2. El head de `action` (6 criterios largos) llena `head_max_len=256` → L≈170 aunque el state sea corto: la latencia la domina el head, no la query.
  3. Cambiar `HEAD_MAX_LEN` o tope de tokens/opción (48) altera el prompt vs entrenamiento → no tocar sin justificar en Fase 2.

### Laya Fase 0 (viejo) — Verificación exports ONNX tozp/Mattepiu ⛔ (25/09) — RESUMIDO
- **Qué:** análisis de los exports `tozp/laya-onnx` (424MB) y `Mattepiu/laya-onnx` (581MB) con inferencia real. **Resultado: tozp roto** (Reshape con `seq_len` hardcodeada a 512 + head int8 muerto, P≈0.5); **Mattepiu funciona** pero firma estática K=2 (imposible `action` de 6 opciones) e `isPageRef` nunca dispara.
- **Bugs de código confirmados (ya eliminados de `src/` en Fase 3):** `qtype` rank-2 en `buildFeeds` (H1), `CONFIDENCE_THRESHOLD=0.35` inalcanzable para K=2 con entropía normalizada (H7), `numThreads=1` (H8, 6s/query), `parseIntentResult(null)` anulaba el heuristic (H4).
- **Detalles tabulados (firmas, H1–H8, temperaturas):** en git history de este archivo y en `.agents/skills/laya.md` → "Contrato verificado del modelo".
- **Conclusión:** el plan "revertir a tozp" no era viable; de ahí el candidato killkli (Fase 0 killkli) y luego el bake-off.

---

### Laya F2 (viejo) — Validate inference + robustness ✅ (25/09) — RESUMIDO
- **Qué:** self-test ONNX al cargar, soporte `noul`/`score` en `routeIntent`, confidence threshold 0.35, pipeline `searchMode` end-to-end (app→ragPipeline→ragClient→worker), guardrails `needsWeb`, y reescritura con tokenizer BPE/prompt renderer portados de laya-ts.
- **Resultado entonces:** build OK, lint OK. **Todo ese código fue eliminado en Fase 3 (26/09)**; solo sobreviven el pipeline `searchMode` end-to-end y los guardrails, hoy alimentados por `classifyIntent()`.

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

### Model download optimization ✅ (24/09) — RESUMIDO
- **Qué:** descargas paralelas + retry exponencial en `downloadToOPFS`, progreso real de embeddings en UI (`getPrewarmState` + `EngineStatus`), prewarm serializado (embeddings primero).
- **Vigente hoy:** solo lo de embeddings. Las descargas de Laya se eliminaron en Fase 3; `clearLegacyLayaCache()` limpia el caché OPFS legado.

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

### Laya F3+F4 (viejo) — Guardrails + batch validation ✅ (25/09) — RESUMIDO
- **Qué:** `INTENT_SCHEMA` ampliado a 5 preguntas (action/searchMode + needsWeb/isPageRef/isSummary), validación de shape de logits, guardrails de ExcelChat, debug F5. **Código ONNX eliminado en Fase 3**; los 5 campos y sus guardrails persisten como tipos y ahora los producen las reglas.

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
| **Bake-off: NO migrar a Laya ONNX** | Opción A aprobada; Fase 0→2, OOD, no gana en nada relevante | 26/09 |
| **Clasificador de action por reglas (regex ES/EN)** | 100% acc en los 120, 0ms/0MB; precedencia direct→chart→mcp→agent→web→rag | 26/09 |
| **Eliminar ruta ONNX de `src/`** | `routeIntent()` nunca corrió; descarga 424MB al prewarm muerta; caché OPFS se limpia | 26/09 |
| `classifyHeuristic` v2 (searchMode) | Patrones sin anclar + VAT/IVA/artículo-nº → 82.9% → 100% | 26/09 |
| Harness archivado en `.agents/bakeoff/` | `/tmp` es efímero; dataset 120 + reportes + verify-port viven en el repo | 26/09 |
| searchMode end-to-end | app→ragPipeline→ragClient→worker, sin re-clasificación (hoy con hint de `classifyIntent`) | 25/09 |
| needsWeb/isPageRef/isSummary guardrails | Detectan info externa / refs a artículos / pedidos de resumen (hoy por reglas) | 25/09 |
| intentGuards en payloadContext | needsWeb/isPageRef pasados al LLM como contexto | 25/09 |
| ~~Laya routeIntent() / Tokenizer BPE / Self-test ONNX / Confidence threshold / Batch logits validation / Mattepiu / crit custom / K>2~~ | Código eliminado en Fase 3 — ver secciones "Laya F2/F3/F4 (viejo)" | 25/09 |
| Candidato ONNX: `killkli/open-jev-laya-multilingual-onnx` | Único con ONNX publicado + multilingüe + K dinámico; verificado Fase 0, luego descartado | 25/09 |
| Bake-off offline ES+EN antes de tocar `src/` | Usuario pidió test-only; comparar jerárquico K=2 vs flat | 25/09 |
| Descartar `GLiNER2.5-multi-v1` / MoJev / Decision-Kai | Path de extracción o runtime/CoreML no soportado | 25/09 |

---

## Pendientes conocidos
1. ~~**DECISIÓN routing (Fase 2)**~~ **RESUELTA e implementada (26/09): Opción A — NO MIGRAR +
   Fase 3:** reglas en `src/`, ONNX eliminado. Números en `.agents/skills/laya.md` y
   `.agents/bakeoff/report_fase3.txt`.
2. **Si algún día se reabre la ruta ONNX:** partir de `.agents/bakeoff/` (fixes E1–E5 están en
   `layaML.mjs`, ya no hay nada que portar a `src/` porque el código fue borrado).
3. **Commits:** cambios de Fase 3 sin commitear (ver `git status`); revisar diff antes de commitear.
4. **QA visual live:** verificar deploy real
5. **og:image:** public/og-cover.png 1200×630 pendiente
6. **E2E completo:** PDF escaneado, mobile, oscuro, gráficas, citas
7. **Guardrails sin consumir:** `classifyIntent()` produce `needsWeb/isPageRef/isSummary` pero
   **nadie los lee en producción** (solo el debugger). `payloadContext` de `ExcelChat` no los incluye.
   Oportunidades: `isPageRef` → forzar `searchMode='literal'` en RAG; `isSummary`/`needsWeb` →
   contexto al LLM en `/api/chat`. Evaluar si vale la pena (la acción `web_search` ya cubre lo principal).

### Escenarios tras la Fase 0 — CERRADOS (26/09)
Todos evaluados en el bake-off: **A/C/D/E descartados** (E no supera al baseline), **B ejecutado**
pero con más alcance: no solo "quedarse con el heuristic" sino **reglas de `action` (Fase 3)** que
arreglan la causa raíz (acción siempre `rag`). Ver "Fase 3".


---

## Cómo retomar
```bash
pnpm build
pnpm lint
pnpm dev

# Regresión del clasificador (sin dependencias, sin modelos):
node --experimental-strip-types .agents/bakeoff/verify-port.mjs          # src == harness (120)
node --experimental-strip-types .agents/bakeoff/verify-debug-checks.mjs  # checks F2/F4
node .agents/bakeoff/eval_rules.mjs                                      # → report_fase3.txt

# Bake-off ONNX histórico (requiere modelo en ~/model-tests/killkli-laya/ + symlink de node_modules):
cd .agents/bakeoff && ln -sfn ../../node_modules node_modules
node verify.mjs     # Fase 0: contrato ONNX (26 OK)
node smoke.mjs      # Fase 1: adaptadores + dataset (8 OK)
node benchmark.mjs flat-q   # Fase 2 (flat-q|flat-doc|hier-q|hier-doc) — reanudable
node metrics.mjs    # Fase 2: → report_fase2.txt
```

---

*"Los datos se quedan en el navegador."*
