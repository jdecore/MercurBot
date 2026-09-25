# RAG Skill

## Propósito
Pipeline de búsqueda híbrida (léxico + vectorial) con fallback automático.

## Archivos clave
- `src/features/rag/ragPipeline.ts` — orquestación del pipeline
- `src/entities/rag/worker.ts` — worker Web con MiniSearch + Transformers
- `src/shared/lib/ragClient.ts` — cliente singleton que envuelve el worker
- `src/shared/lib/preload.ts` — prewarm de embeddings + Laya

## Cómo probarlo
1. Cargar un PDF en la app
2. Verificar que `EngineStatus` muestre "híbrida" o "literal"
3. Preguntar algo específico del documento
4. Verificar que las citas `[Pág. N]` navegan correctamente

## Errores comunes
- Worker caído: se activa fallback léxico automáticamente
- ONNX WASM memory exceeded: reducir batch size en `rag.worker.ts`
- OPFS no disponible: se ignora caché y re-vectoriza
