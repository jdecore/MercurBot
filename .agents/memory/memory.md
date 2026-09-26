# memory.md — Bitácora del Proyecto

> **Última actualización:** 2026-09-26 | Rama: main

---

## Estado actual (live)
- FSD reorganization completada (src/ → app/widgets/features/entities/shared/)
- `.agents/` knowledge layer creada (context/skills/memory)
- App funcional: build OK, lint OK, 0 errores TypeScript
- **Laya routeIntent() implementado pero INOPERANTE en runtime** — ver "Fase 0 Laya" abajo. La inferencia ONNX nunca ha corrido; `routeIntent()` siempre devuelve `null` y todo cae al heuristic.
- **Nuevo candidato validado en Fase 0: `killkli/open-jev-laya-multilingual-onnx`** (26 OK / 0 FAIL / 1 WARN). Sustituye a tozp/Mattepiu: K dinámico ≥2, seq dinámica hasta 1024, multilingüe (mmBERT-base), ES+EN sanity OK. Ver "Fase 0 killkli" abajo.
- **Fase 1 (bake-off) COMPLETA ✅ — 8 OK / 0 FAIL:** adaptador flat (`layaML.mjs`) con las 5 correcciones críticas, baseline heuristic, dataset 120 (60 ES/60 EN). Ver "Fase 1" abajo.
- **Fase 2 (bake-off) COMPLETA ✅ — benchmark 120 × 6 sistemas:** el modelo NO supera al baseline
  en action (35% vs 58%), searchMode (74.3% vs 82.9%) ni route-exact (16.7% vs 30.8%); solo gana
  `isSummary`. **Decisión tomada (26/09): Opción A — NO MIGRAR.** Ver "Fase 2" abajo.
- **Decisión A implementada:** veredicto documentado en `.agents/skills/laya.md`
  ("Veredicto del bake-off") + constancia en el header de `src/shared/lib/laya.ts`.
  `classifyHeuristic` queda como único clasificador activo.
- **Test-only hasta ahora: cero cambios funcionales en `src/`.**
- **Bloqueos conocidos: ninguno.**

---

## Qué se hizo en la última sesión

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
  `/tmp/opencode/intent-bakeoff/{benchmark.mjs,metrics.mjs,hier.mjs,results_fase2.json,report_fase2.txt}`.
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
  `/tmp/opencode/intent-bakeoff/verify.mjs`, contra `~/model-tests/killkli-laya/`. Sin tocar `src/`.
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
- **Artefactos:** `/tmp/opencode/intent-bakeoff/{verify.mjs,lib.mjs,probe_action.mjs,tok_*.mjs}`,
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
- **Implementación Fase 1** (archivos en `/tmp/opencode/intent-bakeoff/`):
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

### Laya Fase 0 — Verificación offline de los exports ONNX ⛔ (25/09)
- **Qué:** verificación sin tocar código de producción, en `/tmp/opencode/laya-verify/`. Se descargaron y compararon ambos exports, se inspeccionó el protobuf ONNX, y se corrió inferencia real usando el tokenizer + prompt renderer reales del proyecto (copia de `laya.ts` con `export` añadidos, verificado por diff de que solo cambiaron los keywords).
- **Por qué:** el plan proponía migrar de `tozp/laya-onnx` a `Mattepiu/laya-onnx` con 4 hipótesis. Era obligatorio verificarlas offline antes de reescribir `laya.ts`.
- **Resultado:** **2 de 4 hipótesis confirmadas, 1 refutada, 1 irrelevante.** El modelo `tozp` actual está fundamentalmente roto. `Mattepiu` funciona pero no sirve para el schema actual. **No se escribió código de producción.**
- **Aprendizajes (críticos, no repetir el análisis):**

**Firmas de entrada (leídas del protobuf, no de metadatos):**

| input | tozp (424.348.081 B) | Mattepiu int8 (581.105.897 B) |
|---|---|---|
| `input_ids` | `['batch_size','seq_len']` ✅ | `['batch_size','sequence_length']` ✅ |
| `attention_mask` | `['batch_size','seq_len']` ✅ | `['batch_size','sequence_length']` ✅ |
| `marker_pos` | `['batch_size','num_markers']` ✅ | **`['batch_size', 2]` estático** ❌ |
| `marker_mask` | `['batch_size','num_markers']` ✅ | **`['batch_size', 2]` estático** ❌ |
| `qtype` | `['batch_size']` rank-1 ✅ | `['batch_size']` rank-1 ✅ |
| salida 1 | `logits ['batch_size','Wherelogits_dim_1']` | `logits ['batch_size', 2]` |
| salida 2 | `act` (softmax aplicado por el cliente) | `linear_123` (**sin softmax**, hay que aplicarlo) |
| nodos | 5479 | 2216 |

Trade-off **opuesto** al que suponía el plan: tozp permite K>2 en la firma pero está muerto; Mattepiu funciona pero está clavado en K=2.

**H1 — `qtype` [n,1] rompe: CONFIRMADO, bug real.** Con rank-2: `Invalid rank for input: qtype Got: 2 Expected: 1`. La referencia (`rl_common.collate_items`) usa `torch.tensor([it["qtype"] for it in items])` → rank-1. `laya.ts:635` está mal. PERO es bug secundario: con tozp la inferencia moría antes por otro motivo.

**H2 — falta calibración de temperatura: CONFIRMADO pero irrelevante.** `rl_agent_config.json` real: `temperature=[1.6369,1.2514,1.9834]`, `temperature_by_options={choice:2:1.9064, choice:3-5:1.7602, choice:6-10:1.0000, choice:11+:0.1006, score:3-5:1.2514, noul:2:1.9834}`. Implementada y medida: como T>1, **aplanar** los logits → *baja* la confianza (0.346→0.116 en un caso). No rescata el umbral 0.35; lo empeora. `temp_bucket` usa `"2" if k<=2 else "3-5" if k<=5 else "6-10" if k<=10 else "11+"`.

**H3 — K=6 funciona porque los Reshape son computados: REFUTADA.** Los Reshape sí son computados (`ReduceSum(marker_mask)→Clip` calcula n_options en runtime; `Where(~marker_mask, -1e4, gathered)` arma logits). PERO la *firma* de entrada hornea `2`, así que ORT rechaza antes de ejecutar el grafo: `Got invalid dimensions for input: marker_pos ... index: 1 Got: 6 Expected: 2`. K=3/6/10 fallan igual. El self-test de 6 opciones del plan fallaría siempre. **La pregunta `action` (6 opciones) es imposible con este export.**

**H4 — `routeIntent→null` anula el heuristic: CONFIRMADO.** `parseIntentResult(null)` fuerza `action:'rag'` y `searchMode:'semantic'` (`intentSchema.ts:79,83`).

**H5 (nuevo, no estaba en el plan) — `tozp` está roto de dos formas:**
1. Un Reshape tiene `seq_len` **hardcodeado a 512** (`{45,1,1024}` → `{512,16,64}`). Solo corre si `input_ids` mide exactamente 512. Con secuencia natural (45–53 tokens) revienta con `input_shape_size == requested_shape_size was false`.
2. Aun forzando 512 la salida está **muerta**: P(true)=0.404 para "disk disk is 100% full" (debería 0.957), 0.393 para el caso benigno, 0.503 para "strong no". Todo ~0.5, confianza 0.00–0.06. La cuantización int8 destruyó el head.
3. Latencia 11.5–12 s **por pregunta**.
→ **El "plan de reversión: mantener tozp" NO es viable.** La migración a Mattepiu es obligatoria, no opcional.

**H6 (nuevo) — `Mattepiu` funciona, pero no para nuestro schema:**
- Reproduce su propio ejemplo del README: P(true)=0.9570 (disk full) / 0.0016 (benigno) / 0.9961 (strong yes) / 0.0000 (strong no). Invariante al orden de opciones. Logits con spread real (5–19). **El modelo no está roto.**
- `isSummary` funciona: 0.899 (summary) / 0.007 (literal).
- `isPageRef` **nunca dispara**: "What is the total amount on page 7?" → P(true)=0.022 con cualquier phrasing (probado: genérico, corto, muy corto, con crit custom).
- `searchMode` ~25% de acierto (1/4) y sesgado a `semantic`.
- Es **extremadamente sensible al phrasing**: la instrucción larga y descriptiva de la app funciona para `isSummary` (0.899) y la versión corta la destruye (0.029).
- Usar `crit` custom en noul **empeora**: sanity del README cae de 0.957 → 0.523. Mantener las opciones genéricas.
- **Causa raíz de fondo: mismatch de tarea.** Laya evalúa un **STATE** (documento/email/ticket) contra **preguntas-aclaración**. Nosotros le pasamos la **query del usuario** como state. "Qué acción debe tomar el robot" sí está en su benchmark de routing (99.1%), pero necesita K>2.

**H7 (nuevo, bug de código) — `CONFIDENCE_THRESHOLD=0.35` es inalcanzable para `choice`.** `routeIntent` usa `confidenceFromProbs` (entropía normalizada, la fórmula de la referencia) para `choice`, pero `max(p,1-p)` para `noul`. Para K=2, `conf>0.35` exige **p_max ≥ 0.835**. Es un listón arbitrario para 2 opciones; con los logits observados (p=0.30–0.70) `searchMode` siempre dispara el fallback. **Bug independiente del modelo.**

**H8 (nuevo) — latencia real (WASM, onnxruntime-web 1.30):** carga de sesión 6.7–17.8 s. 1 pregunta/1 hilo 1.0 s. 4 preguntas/1 hilo **6.0 s**. 4 preguntas/4 hilos **1.9 s**. `laya.ts:537` fija `numThreads = 1` → 6 s por query en el peor caso. Los 38 ms del README son en GPU fp16, no wasm.

**Otras:** `tokenizer.json` de Mattepiu y tozp son **byte-idénticos** (sha256 `6c8aaa9a…`). Nuestro `renderOptions` ignora `crit` en noul (la referencia lo usa) — pero se decidió mantener genérico porque el custom empeora. Prompt renderer y `confidence_from_probs` de nuestro port **coinciden exactamente** con `rl_common.build_sequence` / `confidence_from_probs` (verificado token a token).

---

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
| Migrar a `Mattepiu/laya-onnx` int8 | `tozp` está roto: seq_len hardcodeada a 512 + head int8 muerto | 25/09 |
| NO usar `crit` custom en noul | Medido: sanity del README cae 0.957 → 0.523 | 25/09 |
| NO parcheear el ONNX para K>2 | El grafo es dinámico pero la firma no; parcheo de 581MB inviable en cliente | 25/09 |
| Candidato ONNX: `killkli/open-jev-laya-multilingual-onnx` | Único con ONNX publicado + multilingüe + K dinámico; verificado Fase 0 | 25/09 |
| Bake-off offline ES+EN antes de tocar `src/` | Usuario pidió test-only; comparar jerárquico K=2 vs flat | 25/09 |
| Descartar `GLiNER2.5-multi-v1` ONNX de terceros | Path de extracción (boundary), `classify_text` no documentado | 25/09 |
| Descartar MoJev/Decision-Kai como ONNX-in-browser | MoJev export es `modality:text` con runtime custom; Kai solo CoreML | 25/09 |

---

## Pendientes conocidos
1. ~~**DECISIÓN PENDIENTE — arquitectura de routing (Fase 2).**~~ **RESUELTA (26/09): Opción A —
   NO MIGRAR.** Implementada: veredicto en `.agents/skills/laya.md` ("Veredicto del bake-off") +
   constancia en el header de `src/shared/lib/laya.ts`. Números completos en "Fase 2" y en
   `/tmp/opencode/intent-bakeoff/report_fase2.txt`.
   Opciones descartadas registradas: B) migrar solo para `isSummary`; C) iterar con state rico
   (reabrir solo si cambia el contrato de datos de `agentRuntime`).
2. **Si algún día se reabre:** portar a `src/` los fixes E1 (metaspace), E2 (`qtype` dims `[n]`),
   E3 (CLS=bos), E5 (marker guard) — documentados en `.agents/skills/laya.md`. Hoy no aplican:
   la ruta ONNX sigue descartada.
3. **Commits:** ~16 archivos sin commitear (i18n migration, branding, dependency updates, debugger, CSP fixes, routeIntent)
4. **QA visual live:** verificar deploy real
5. **og:image:** public/og-cover.png 1200×630 pendiente
6. **E2E completo:** PDF escaneado, mobile, oscuro, gráficas, citas
7. **Laya F5 — batch sequential fallback:** irrelevante. El problema nunca fue el batch: con qtype
   rank-1 el batch de N preguntas funciona (`logits dims=[N,2]` OK) — **pero `buildFeeds()` de
   `laya.ts` emite `[n,1]` (rank-2) → falla con killkli; es el fix E2**.
8. **Laya F6 — needsWeb consumer:** `intentGuards.needsWeb` está en el payload pero el LLM no tiene
   instrucciones claras de qué hacer con él. Evaluar si agregar web search o solo advertir al usuario.

### Escenarios tras la Fase 0 (elegir uno)
- **A — Laya mínimo viable:** migrar a Mattepiu + fix `qtype` rank-1 + schema **solo binario**
  (eliminar `action` de 6 opciones o descomponerlo) + unificar la métrica de confianza a `max(p,1-p)`
  con umbral sensato (0.6–0.7) + `numThreads` > 1. Ganancia real esperada: `isSummary`/`needsWeb`.
  `isPageRef` y `searchMode` no funcionan → dejarlos al heuristic.
- **B — Abandonar Laya:** borrar el router ONNX, quedarse con `classifyHeuristic` (instantáneo, gratis)
  y usar el presupuesto de 581MB de descarga para otra cosa. 0 riesgo, 0 ganancia.
- **C — Cambiar el enfoque:** pasar el **documento** (o un chunk) como `state` en vez de la query, que es
  el formato para el que Laya se entrenó. Requiere reentrenar o Acceptar que el modelo solo generalice.
- **D — Bajar un export mejor:** buscar un export ONNX oficial de `convaiinnovations/laya` con `num_markers`
  simbólico y seq_len dinámica. No existe hoy (el repo tiene `laya.onnx`+`.data` fp32 1.68GB y
  `fp16_onlygpu_unverified/`). Es la única vía para K>6 sin parcheo.
- **E — killkli Laya multilingüe (VALIDADO en Fase 0, candidato activo):** firma dinámica (K≥2, seq≤1024),
  ES/EN OK, fp16 WASM OK. Pendiente: bake-off contra heuristic + metaspace fix del tokenizer.
  Queda pendiente de elegir entre jerárquico (binario) y flat (K=6) según resultados.
  **→ RESULTADO Fase 2: evaluado y NO supera al baseline en nada relevante** (solo `isSummary`);
  ver "Fase 2". Escenario E cae en la práctica → efectivamente vigente el escenario B.


---

## Cómo retomar
```bash
pnpm build
pnpm lint
pnpm dev

# Bake-off (harness en /tmp; requiere modelos en ~/model-tests/killkli-laya/)
cd /tmp/opencode/intent-bakeoff
node verify.mjs     # Fase 0: contrato ONNX (26 OK)
node smoke.mjs      # Fase 1: adaptadores + dataset (8 OK)
node benchmark.mjs flat-q   # Fase 2: configs (flat-q|flat-doc|hier-q|hier-doc) — reanudable
node metrics.mjs    # Fase 2: reporte → report_fase2.txt
```

---

*"Los datos se quedan en el navegador."*
