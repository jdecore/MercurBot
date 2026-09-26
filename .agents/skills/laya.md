# Laya Skill

## Propósito
Clasificador ONNX para decidir acción (rag/direct/chart) y modo de búsqueda (literal/semantic)
antes de lanzar el pipeline RAG.

> **Estado: la inferencia ONNX nunca ha corrido con éxito en producción.** Ver `.agents/memory/memory.md`
> → "Laya Fase 0" para la bitácora completa de la verificación. Este skill describe el contrato
> verificado del modelo, no un funcionamiento probado.

## Archivos clave
- `src/shared/lib/laya.ts` — modelo ONNX + tokenizer BPE + prompt renderer + heuristic fallback
- `src/entities/robot/intentSchema.ts` — schema de preguntas (action, searchMode, needsWeb, isPageRef, isSummary)

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

## Laya es English-only y evalúa un STATE, no una QUERY
Las preguntas tipo `noul` formadas como "afirmación vs estado". Pasar la query del usuario como
`state` es un **mismatch de tarea** y es la causa de que `isPageRef` nunca dispare y `searchMode`
acierte ~25%. `isSummary` sí funciona con el phrasing largo y descriptivo actual.

## Cómo probarlo
1. `pnpm dev` → DevTools → `__merucbot.testFlow({ laya: true })` (F3 descarga, F5 routeIntent).
2. En la consola, revisar que `routeIntent` NO devuelve `null` y que los logits no están en ~[0.5, 0.5].
3. Si devuelve `null` → fallback heuristic; el bug sigue presente.

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
