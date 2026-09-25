# Deployment Skill

## Propósito
Configuración y despliegue en Vercel con CSP y aislamiento cross-origin.

## Archivos clave
- `vercel.json` — headers CSP, COOP, COEP
- `api/chat/index.ts` — Vercel Function proxy para Gemini
- `src/shared/lib/preload.ts` — prewarm de modelos

## Cómo probarlo
1. `vercel dev` para probar localmente
2. Verificar headers en Response:
   - `Cross-Origin-Opener-Policy: same-origin`
   - `Cross-Origin-Embedder-Policy: credentialless`
   - `Content-Security-Policy` con `blob:` y `cdn.jsdelivr.net`
3. Verificar que SharedArrayBuffer está disponible

## Errores comunes
- COEP muy restrictivo: cambiar `require-corp` a `credentialless`
- Fonts bloqueadas: agregar origen a `font-src`
- ONNX JSEP bloqueado: agregar `cdn.jsdelivr.net` a `script-src`
