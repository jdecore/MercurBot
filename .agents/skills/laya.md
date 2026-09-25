# Laya Skill

## Propósito
Clasificador ONNX para determinar si una query es literal o semántica.

## Archivos clave
- `src/shared/lib/laya.ts` — modelo ONNX + heuristic fallback

## Cómo probarlo
1. Preguntar algo literal (ej: "¿Cuál es el precio?")
2. Preguntar algo conceptual (ej: "Resume el documento")
3. Verificar en `EngineStatus` que el modo cambia correctamente

## Errores comunes
- ONNX runtime error: activar heuristic fallback
- Modelo corrupto en OPFS: borrar `laya_model` de OPFS
- JSEP thread fallback: usar `ort-wasm-simd-threaded.asyncify`
