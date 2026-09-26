# Laya Skill

## Propósito
Clasificador ONNX para decidir acción (rag/direct/chart) y modo de búsqueda (literal/semantic)
antes de lanzar el pipeline RAG.

> **ESTADO FINAL (26/09): DECIDIDO — NO MIGRAR.** El bake-off completo (Fase 0→2) contra
> `classifyHeuristic` concluyó que ningún candidato Laya supera al baseline en los campos que
> importan. `routeIntent()` queda **descartado** como camino de routing: en producción manda el
> heuristic + defaults (`agentRuntime` → `parseIntentResult(null)`). Números y contexto abajo
> ("Veredicto del bake-off") y en `.agents/memory/memory.md` → "Fase 2".

## Archivos clave
- `src/shared/lib/laya.ts` — modelo ONNX + tokenizer BPE + prompt renderer + heuristic fallback
  (**el ONNX está inoperante y descartado; el código útil que vive aquí es `classifyHeuristic`**)
- `src/entities/robot/intentSchema.ts` — schema de preguntas (action, searchMode, needsWeb, isPageRef, isSummary)

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
- Única excepción con ganancia clara: **`isSummary`** (evaluar si un regex compensa antes que cargar el modelo).
- Requiere: state rico (historial de turnos), re-tuneo de criterios, y los fixes del adaptador:
  **E1** tokenizer metaspace (el `bpeEncode` de `laya.ts` produce ids corruptos para BPE metaspace),
  **E2** `qtype` dims `[n]` (hoy `[n,1]` → `routeIntent` siempre lanza),
  **E3** CLS=`bos_token_id`, **E5** `marker_pos` fuera de rango congela el runtime.
- Artefactos (harness, fuera del repo): `/tmp/opencode/intent-bakeoff/` —
  `verify.mjs` (contrato ONNX), `smoke.mjs` (adaptador), `benchmark.mjs` + `metrics.mjs` →
  `report_fase2.txt`, `results_fase2.json`, `hier.mjs`, `dataset.mjs`, `layaML.mjs`.
  Modelo en `~/model-tests/killkli-laya/`.

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

## Bugs conocidos en `laya.ts`

1. `qtype` se envía como `[n, 1]` (rank-2). El modelo exige rank-1 → `Invalid rank for input: qtype`.
2. `INTENT_SCHEMA.action` tiene 6 opciones. **Imposible** con `Mattepiu` (K=2 máx.).
3. `choice` usa `confidenceFromProbs` (entropía normalizada) contra `CONFIDENCE_THRESHOLD = 0.35`.
   Para K=2 eso exige `p_max ≥ 0.835`. `noul` usa `max(p,1-p)` — métricas inconsistentes entre tipos.
4. `renderOptions` ignora `crit` en el branch de `noul` (la referencia lo usa). Se mantiene genérico
   a propósito: usar `crit` custom empeoró el sanity check del README (0.957 → 0.523).
5. `ort.env.wasm.numThreads = 1` → 6 s por llamada de 4 preguntas. Con 4 hilos: 1.9 s.
6. `parseIntentResult(null)` fuerza `action:'rag'` y `searchMode:'semantic'`, anulando el heuristic.

## Evalúa un STATE, no una QUERY (confirmado a escala en Fase 2)
Las preguntas tipo `noul` están formadas como "afirmación vs estado". Pasar la query del usuario
como `state` es un **mismatch de tarea**: en el bake-off de 120, `state=query` produjo 47/70 `rag`
clasificados como `direct`. `state=doc+query` lo empeoró (guardrails y latencia). El modelo original
(`tozp`) además es **English-only**; `killkli` es multilingüe (ES/EN ok), pero el mismatch de state
persiste — por eso el veredicto es NO MIGRAR.

## Cómo probarlo (histórico — hoy descartado)
1. `pnpm dev` → DevTools → `__merucbot.testFlow({ laya: true })` (F3 descarga, F5 routeIntent).
2. En la consola, revisar que `routeIntent` NO devuelve `null` y que los logits no están en ~[0.5, 0.5].
3. Si devuelve `null` → fallback heuristic; el bug sigue presente (E2: `qtype` rank-2, siempre lanza).
4. **Preferido:** vía offline sin navegador, ver "Test offline" y el harness del bake-off abajo.

## Test offline (sin navegador)
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
