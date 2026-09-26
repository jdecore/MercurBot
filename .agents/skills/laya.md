# Laya Skill

## Propósito
Clasificador de intenciones para decidir acción (`rag/direct/chart/web_search/mcp/agent`) y modo
de búsqueda (`literal/semantic`) antes de lanzar el pipeline RAG. **Hoy: 100% reglas (regex,
0ms, sin modelo).**

> **ESTADO (26/09): FASE 3 COMPLETA.** El bake-off (Fase 0→2) descartó la ruta ONNX de Laya
> (**NO MIGRAR**) y en Fase 3 se hizo el cambio efectivo en `src/`: las reglas de `action` +
> guardrails (validadas offline al 100% sobre los 120) reemplazan a `routeIntent()` — que **nunca
> había funcionado en runtime** y dejaba `action='rag'` siempre (ramas direct/chart/web/mcp/agent
> muertas). La ruta ONNX completa (descarga 424MB en prewarm, sesión, tokenizer, OPFS) fue
> **eliminada**; queda `clearLegacyLayaCache()` que borra el caché legado. Números abajo
> ("Veredicto del bake-off" + "Fase 3") y en `.agents/memory/memory.md`.

## Archivos clave
- `src/shared/lib/laya.ts` — **clasificador activo**: `classifyIntent()` (action+guardrails por
  reglas), `classifyHeuristic()` (searchMode, heuristic v2), `classifyAction()`, `classifyQuery()`
- `src/entities/robot/intentSchema.ts` — solo tipos (`IntentResult`, `ActionChoice`, `SearchModeChoice`)
- `src/shared/lib/agentRuntime.ts` — consume `classifyIntent()` (2 sitios: executeAgent + loop agent)
- `.agents/bakeoff/` — harness offline del bake-off + dataset de 120 + reportes (ver su README)

---

## Fase 3 (26/09): reglas en producción + ONNX eliminado ✅

### Qué se implementó
1. **`classifyAction()` + guardrails por regex (ES/EN)** en `laya.ts`, precedencia
   `direct → chart → mcp → agent → web_search → rag`; `classifyIntent()` compone action +
   `classifyHeuristic()` (v2) + `needsWeb = (action==='web_search')` + `isPageRef` + `isSummary`
   (`&& action !== 'agent'`: "analiza … y resume" no es pedido de resumen).
2. **Heuristic v2 (searchMode):** patrones sin anclar (`^\W*cuánto…`), `\b(artículo|…|point)\s*\d`,
   `\b(porcentaje|percentage|VAT|IVA)\b` → 82.9% → **100%**.
3. **Ruta ONNX eliminada:** de `laya.ts` se borraron tokenizer/BPE, prompt renderer, descarga/OPFS,
   sesión ORT, `routeIntent()`, `parseIntentResult()`, `INTENT_SCHEMA`. `preload.ts` ya no
   descarga Laya (solo embeddings); `EngineStatus`/`debug.ts` sin estado `laya*`.
4. **Cache legado:** `prewarmModels()` llama `clearLegacyLayaCache()` (borra dir OPFS `copixi_laya`,
   best-effort).

### Resultado (mismo dataset de 120 — ver `.agents/bakeoff/report_fase3.txt`)
| campo | baseline | **reglas** |
|---|---|---|
| action (acc / F1) | 58.3 / 12.3 | **100 / 100** (matriz limpia, 0 errores) |
| searchMode (n=70 rag) | 82.9 | **100** |
| needsWeb / isPageRef / isSummary | 90 / 86.7 / 90 | **100 / 100 / 100** |
| route-exact (5 campos) | 35.0% | **100%** |

- **Nota de método:** el dataset se usó también para ajustar las reglas (iteración sobre los
  mismos 120) — validación fuera de muestra pendiente si se toca el clasificador. Robustez
  ad-hoc: 16/18 queries nuevas (los 2 miss caen a `rag`, el default seguro).
- **Port verificado:** `node --experimental-strip-types .agents/bakeoff/verify-port.mjs` →
  0 diferencias src vs harness; `verify-debug-checks.mjs` → checks F2/F4 del debugger PASS.

---

## Veredicto del bake-off (Fase 0→2, 25–26/09): NO MIGRAR

### Qué se evaluó
- **Modelo candidato:** `killkli/open-jev-laya-multilingual-onnx` — export ONNX **fp16 (647 MB)** de
  Laya con encoder **`jhu-clsp/mmBERT-base`** (multilingüe ES/EN, BPE 256k *metaspace*), firma
  dinámica real: seq ≤1024, K ≥2, `qtype` rank-1. Verificado con 26/27 checks (Fase 0).
- **Técnica:** *typed questions* — la tarea se escribe como pregunta en natural language con
  etiquetas-descripción en el prompt (`[CLS] choice question: … [SEP] [MASK] opción: desc … [SEP] state`),
  un logit por marcador `[MASK]` → softmax → K dinámico. Tipos: `choice` (K opciones), `noul`
  (afirmación true/false), `score`. Confianza = entropía normalizada `1−H/ln K`, **sin calibrar**
  (`temperature=1.0`). Se ejecuta en navegador con ONNX Runtime Web (WASM, 4 hilos).
- **Método:** dataset supervisado **120 queries (60 ES/60 EN)** etiquetadas × 6 sistemas
  (flat, jerárquico K=2, × 2 formatos de `state` + 2 baselines), exact-match/macro-F1 por campo e
  idioma, matriz de confusión, calibración con umbral+fallback. Test-only: **`src/` no se tocó**.

### Resultado (overall, acc / macro-F1)
| sistema | action | searchMode | isSummary | route-exact | latencia |
|---|---|---|---|---|---|
| BASE heuristic (classifyHeuristic+defaults) | **58.3/12.3** | **82.9/81.6** | 90.0/47.4 | **30.8%** | 0 |
| flat · state=query | 35.0/32.9 | 74.3/74.3 | **91.7/78.4** | 16.7% | 2.2 s |
| flat · state=doc+query | 40.0/31.6 | 65.7/65.7 | 68.3/54.6 | 15.0% | 6.3 s |
| jerárquico · query | 27.5/25.7 | 74.3/74.3 | 91.7/78.4 | 5.0% | 3.0 s |
| jerárquico · doc+query | 15.8/11.8 | 65.7/65.7 | 68.3/54.6 | 2.5% | 8.2 s |

### Por qué
1. **OOD (causa raíz):** Laya se entrenó con *states de conversación* (turnos de diálogo), no con
   queries sueltas de un asistente de PDF. Confusión flat·query: de 70 gold `rag` → **18 rag / 47 direct**.
   `agentRuntime` no tiene state rico que pasarle; cambiarlo tocaría el contrato de datos.
2. El modelo **pierde** en action, searchMode y route-exact; gana solo en `isSummary` (F1 78.4 vs 47.4).
3. **Híbrido con umbral:** techo 65.4% (action+guards) vs baseline 62.5%… **pero a solo 22% de
   cobertura** — no justifica 647 MB + 2.2 s/query.
4. `state=doc+query` empeora guardrails y cuesta 3×; el **árbol jerárquico K=2 es peor que flat**
   (errores acumulados en cadena). Ambos descartados.

### Si algún día se retoma
- **NO retomar por `isSummary`:** Fase 3 lo resolvió con regex (`isSummary` 100% en los 120).
- Requiere: state rico (historial de turnos), re-tuneo de criterios, y los fixes del adaptador:
  **E1** tokenizer metaspace, **E2** `qtype` dims `[n]` (el código original emite `[n,1]` → siempre
  lanza), **E3** CLS=`bos_token_id`, **E5** `marker_pos` fuera de rango congela el runtime.
  **Estos fixes ya NO existen en `src/`** (la ruta ONNX se borró) — si se reabre, partir del harness.
- Artefactos: **`.agents/bakeoff/`** (dentro del repo) — `verify.mjs`, `smoke.mjs`, `benchmark.mjs`,
  `metrics.mjs` → `report_fase2.txt`/`results_fase2.json`, `rules.mjs`, `eval_rules.mjs` →
  `report_fase3.txt`, `dataset.mjs`, `layaML.mjs`, `hier.mjs`. Ver su `README.md`.
  Modelo en `~/model-tests/killkli-laya/` (fuera del repo).

---


## Contrato verificado del modelo (Fase 0, 25/09)

Comparación de los dos exports disponibles, leída del protobuf ONNX:

| | `tozp/laya-onnx` (actual, 424 MB) | `Mattepiu/laya-onnx` int8 (581 MB) |
|---|---|---|
| `input_ids`, `attention_mask` | dinámico ✅ | dinámico ✅ |
| `marker_pos`, `marker_mask` | `num_markers` simbólico ✅ | **estático `2`** ❌ |
| `qtype` | rank-1 ✅ | rank-1 ✅ |
| nº de opciones (K) | cualquiera (firma) | **exactamente 2** |
| longitud de secuencia | **exactamente 512** (Reshape horneado) | cualquiera ✅ |
| calidad int8 | muerta (P≈0.5 siempre) | correcta ✅ |
| 2ª salida | `act` | `linear_123` (**sin softmax**) |
| latencia wasm | ~12 s/pregunta | ~1.9 s (4 preguntas, 4 hilos) |

- `tokenizer.json` de ambos repos es **byte-idéntico** (sha256 `6c8aaa9a…`).
- La referencia oficial es `convaiinnovations/laya` → `rl_common.py` (`build_sequence`, `collate_items`,
  `render_options`, `confidence_from_probs`, `temp_bucket`) y `rl_agent_config.json` (temperaturas,
  `max_len=512`, `head_max_len=192`).

## Bugs históricos de la ruta ONNX (código eliminado en Fase 3)

> Todo el código afectado por estos bugs fue **borrado de `src/`** (26/09). Se listan como
> referencia si algún día se reabre la ruta ONNX.

1. `qtype` se enviaba como `[n, 1]` (rank-2). El modelo exige rank-1 → `Invalid rank for input: qtype`.
2. `INTENT_SCHEMA.action` tiene 6 opciones. **Imposible** con `Mattepiu` (K=2 máx.).
3. `choice` usaba `confidenceFromProbs` (entropía normalizada) contra `CONFIDENCE_THRESHOLD = 0.35`.
   Para K=2 eso exige `p_max ≥ 0.835`. `noul` usaba `max(p,1-p)` — métricas inconsistentes entre tipos.
4. `renderOptions` ignoraba `crit` en el branch de `noul` (la referencia lo usa). Se mantenía genérico
   a propósito: usar `crit` custom empeoró el sanity check del README (0.957 → 0.523).
5. `ort.env.wasm.numThreads = 1` → 6 s por llamada de 4 preguntas. Con 4 hilos: 1.9 s.
6. `parseIntentResult(null)` forzaba `action:'rag'` y `searchMode:'semantic'`, anulando el heuristic.

## Evalúa un STATE, no una QUERY (confirmado a escala en Fase 2)
Las preguntas tipo `noul` están formadas como "afirmación vs estado". Pasar la query del usuario
como `state` es un **mismatch de tarea**: en el bake-off de 120, `state=query` produjo 47/70 `rag`
clasificados como `direct`. `state=doc+query` lo empeoró (guardrails y latencia). El modelo original
(`tozp`) además es **English-only**; `killkli` es multilingüe (ES/EN ok), pero el mismatch de state
persiste — por eso el veredicto es NO MIGRAR.

## Cómo probarlo
1. **Online:** `pnpm dev` → DevTools → `__merucbot.testFlow()` → F2 (searchMode) y F4
   (`classifyIntent`, 5 queries) deben dar PASS. `__merucbot.check()` muestra prewarm (embeddings).
2. **Offline (regresión del port):** `node --experimental-strip-types .agents/bakeoff/verify-port.mjs`
   → 0 mismatches sobre los 120; `verify-debug-checks.mjs` → PASS.
3. **Eval completa:** `node .agents/bakeoff/eval_rules.mjs` → `report_fase3.txt`.

## Test offline (histórico)
En `/tmp/opencode/laya-verify/` con `onnxruntime-web` (build node: `dist/ort.node.min.js`),
una copia de `laya.ts` con `export` añadidos, y `probe_onnx.py` para leer las dims del protobuf.
Los scripts existentes: `inspect.mjs` (rank/K/batch probe), `sanity.mjs` (ejemplo del README),
`e2e.mjs` (schema de la app EN/ES), `tozp_test.mjs` (restricción de 512), `prompt_probe.mjs` (sweep de prompts).

## Errores comunes
- `Invalid rank for input: qtype Got: 2 Expected: 1` → `qtype` debe ser 1-D.
- `Got invalid dimensions for input: marker_pos ... Expected: 2` → la pregunta tiene K≠2; solo
  funciona con 2 opciones. Rediseñar como preguntas binarias.
- `input_shape_size == requested_shape_size was false` con `{45,1,1024}` → `{512,16,64}`: export de
  `tozp`, exige seq_len exactamente 512.
- `Expected shape from model of {1,2} does not match actual shape of {N,2} for output linear_123`:
  warning benigno del export de Mattepiu, la segunda salida está mal declarada. No afecta `logits`.
- Modelo corrupto en OPFS: borrar el directorio `copixi_laya`.
- JSEP thread fallback: `ort-wasm-simd-threaded.asyncify`.
