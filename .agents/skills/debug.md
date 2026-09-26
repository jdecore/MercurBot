# Debug Skill

## Propósito
Debugger oculto para verificación en producción sin UI visible.

## Archivos clave
- `src/shared/lib/debug.ts` — implementación del debugger
- `src/app/App.tsx` — integración con `initDebug()` y `updateDebugState()`

## Cómo probarlo
1. Abrir DevTools (F12)
2. En Console, ejecutar `__merucbot.check()`
3. Ejecutar `__merucbot.state()` para ver estado completo
4. Toggle con `Ctrl+Shift+D`

## Comandos disponibles
- `__merucbot.check()` — resumen rápido de estado
- `__merucbot.state()` — estado completo (prewarm, engine, rag)
- `__merucbot.toggle()` — toggle debugger visibility
- `__merucbot.testFlow({ timeout? })` — test de integración por consola:
  - **F0** estado actual · **F1** embeddings prewarm (espera hasta `timeout`s, default 120)
  - **F2** `classifyQuery` (searchMode, 2 queries) · **F3** estado RAG ·
    **F4** `classifyIntent` (action+guardrails, 5 queries)
  - Devuelve tabla con `embeddings/classify/rag/intent`; `PASS`/`SKIP*` cuentan como ok.
  - **Nota:** la opción `{ laya: true }` y los flujos ONNX/Laya se eliminaron (Fase 3, 26/09).

## Estado del prewarm (Fase 3, 26/09)
`getPrewarmState()` solo expone `embeddingsReady / embeddingsProgress / embeddingsMessage`.
Los campos `layaReady/layaError/layaProgress/layaMessage` se eliminaron con la ruta ONNX;
`prewarmModels()` además limpia el caché OPFS legado `copixi_laya` (best-effort).

## Errores comunes
- No aparece `__merucbot`: verificar que `initDebug()` se llama en App mount
- Estado desactualizado: verificar que `updateDebugState()` se llama en los efectos correspondientes
- `testFlow` se corta en F1: embeddings no descarga (red/CSP) — revisar `connect-src` de `vercel.json`
