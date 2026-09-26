# Embeddings Skill

## Propósito
Modelo de embeddings en WASM para búsqueda vectorial en el browser.

## Archivos clave
- `src/shared/lib/preload.ts` — prewarm en background al startup (solo embeddings)
- `src/entities/rag/worker.ts` — inferencia de embeddings en el worker

## Cómo probarlo
1. Abrir DevTools Console
2. Ejecutar `__merucbot.check()` para ver estado de prewarm
3. Verificar que `embeddingsReady` pasa a `true`
4. Cargar un PDF y verificar que el motor usa modo híbrido

## Errores comunes
- Modelo no cacheado: descarga en primer load (~2-3s)
- Memoria insuficiente: reducir batch size a 4
- Fallback a léxico: se activa automáticamente si WASM falla
