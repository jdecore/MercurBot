# Bake-off de intenciones (Fase 0→3, 25–26/09/2026)

> **Resultado final:** NO migrar el clasificador ONNX Laya. Veredicto completo:
> `.agents/skills/laya.md` → "Veredicto del bake-off".

## Qué es

Harness offline para comparar candidatos de clasificación de intenciones contra
`classifyHeuristic` con un dataset etiquetado de **120 queries (60 ES / 60 EN)**.
No toca `src/`; los candidatos solo llegan a producción si ganan el bake-off.

## Archivos

| Archivo | Fase | Qué hace |
|---|---|---|
| `dataset.mjs` | 1 | 120 queries con gold: `action`, `searchMode`, `needsWeb`, `isPageRef`, `isSummary` |
| `schema.mjs` | 1 | Espejo del `INTENT_SCHEMA` (histórico) |
| `heuristic.mjs` | 1 | Baseline: réplica de `classifyHeuristic` + defaults de `agentRuntime` |
| `layaML.mjs` | 1 | Adaptador ONNX del candidato killkli (fixes E1–E5) |
| `hier.mjs` | 2 | Clasificador jerárquico (K=2 por rama) |
| `smoke.mjs` | 1 | Gate: adaptadores + dataset (8 OK / 0 FAIL) |
| `verify.mjs` | 0 | Contrato ONNX del modelo killkli (26 OK / 0 FAIL / 1 WARN) |
| `benchmark.mjs` | 2 | 4 configs × 120 con checkpoint `results_fase2.json` |
| `metrics.mjs` | 2 | Reporte → `report_fase2.txt` |
| `rules.mjs` | 3a | **Ganador:** clasificador de `action`+guardrails por reglas |
| `eval_rules.mjs` | 3a | Evalúa reglas vs baseline → `report_fase3.txt` |
| `verify-port.mjs` | 3b | Regresión: `src/shared/lib/laya.ts` == `rules.mjs` en los 120 |
| `verify-debug-checks.mjs` | 3b | Regresión: checks F2/F4 del debugger `testFlow` |

## Resultados (acc sobre 120)

| Campo | baseline | Laya flat·query | **reglas (Fase 3a)** |
|---|---|---|---|
| action | 58.3% | 35.0% | **100%** |
| searchMode (n=70 rag) | 82.9% | 74.3% | **100%** (heuristic v2) |
| needsWeb / isPageRef / isSummary | 90.0 / 86.7 / 90.0 | 87.5 / 86.7 / 91.7 | **100 / 100 / 100** |
| route-exact (5 campos) | 30.8% | 16.7% | **100%** |

> `report_fase2.txt` / `report_fase3.txt` tienen los detalles por idioma y macro-F1.

## Cómo correrlo

```bash
cd .agents/bakeoff

# Solo reglas/baselines (sin modelos, sin dependencias):
node eval_rules.mjs                  # → report_fase3.txt
node --experimental-strip-types verify-port.mjs         # src == harness
node --experimental-strip-types verify-debug-checks.mjs # checks del debugger

# Bake-off ONNX (requiere modelos en ~/model-tests/ y deps):
# npm está caído en este entorno → symlink de node_modules desde la raíz del repo:
ln -sfn ../../node_modules node_modules
node verify.mjs        # Fase 0: contrato ONNX (26 OK)
node smoke.mjs         # Fase 1: adaptadores (8 OK)
node benchmark.mjs flat-q   # Fase 2 (flat-q|flat-doc|hier-q|hier-doc) — reanudable
node metrics.mjs       # Fase 2: → report_fase2.txt
```

## Aprendizajes clave (resumen)

1. **OOD:** Laya evalúa *states de conversación*, no queries sueltas → 47/70 queries
   `rag` clasificadas como `direct`.
2. **E1–E5:** bugs del adaptador ONNX en `laya.ts` original (tokenizer metaspace,
   `qtype` rank-2, CLS undefined, confianza sin calibrar, `marker_pos` hang).
   Hoy irrelevantes: la ruta ONNX fue eliminada de `src/`.
3. La causa raíz de la baja precisión del baseline (58.3%) era la acción siempre
   `rag` — resuelta con reglas sin modelo.
