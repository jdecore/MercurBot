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

## Errores comunes
- No aparece `__merucbot`: verificar que `initDebug()` se llama en App mount
- Estado desactualizado: verificar que `updateDebugState()` se llama en los efectos correspondientes
