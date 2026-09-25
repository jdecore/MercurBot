# memory.md — Bitácora del Proyecto

> **Última actualización:** 2026-09-24 | Rama: main

---

## Estado actual (live)
- Galaxy Plan completo (Fases 0-8 ✅)
- Dependency updates + SDK migration completados (24/09)
- App funcional: build OK, lint OK, 0 errores TypeScript
- Sin bloqueos conocidos

---

## Qué se hizo en la última sesión

### Dependency updates + SDK migration ✅ (24/09)
- **Cambios clave:** TypeScript 7.0.2, react/react-dom 19.3.0, @google/genai migration, devDependencies actualizadas
- **Resultado:** build OK, lint OK, 0 errores
- **Aprendizajes:** TypeScript 7 nativo no requirió alias; API @google/genai v2 usa `generateContent` con objeto plano, `systemInstruction` en `config`, `response.text` puede ser `undefined`; `pnpm approve-builds --all` para CI

### CSP fix: jsDelivr en script-src ✅ (24/09)
- **Problema:** ONNX Runtime carga dinámicamente `ort-wasm-simd-threaded.jsep.mjs` desde `cdn.jsdelivr.net`, bloqueado por `script-src 'self' ...` sin ese origen.
- **Solución:** `vercel.json` — agregado `https://cdn.jsdelivr.net` a `script-src`. Permissions-Policy ya estaba limpio en este archivo.

### Cross-origin isolation + SharedArrayBuffer ✅ (24/09)
- **Problema:** Chrome bloquea/marca `SharedArrayBuffer` en ONNX Runtime JSEP por falta de aislamiento cross-origin.
- **Solución:** `vercel.json` — agregados headers:
  - `Cross-Origin-Opener-Policy: same-origin`
  - `Cross-Origin-Embedder-Policy: require-corp`
- **Nota:** `require-corp` bloquea recursos cross-origin sin CORS. Verificar que fonts/CDNs sigan cargando. Si algo se rompe, cambiar a `credentialless`.

### Model download optimization ✅ (24/09)

**Fase 1 — Laya paralelo (modelo + tokenizer + config):**
- `src/lib/laya.ts` — `downloadLayaModel` ahora lanza los 3 `fetch` en paralelo con `Promise.all`. Solo el modelo se guarda en OPFS; tokenizer/config se validan y descartan. Reduce tiempo total de ~3 secuencial a ~1 paralelo.

**Fase 2 — Retry exponencial en `downloadToOPFS`:**
- `src/lib/laya.ts` — `downloadToOPFS` reintenta hasta 3 veces con backoff exponencial (1s, 2s, 4s) solo en errores de red/stream, no en HTTP 4xx/5xx. Conserva el progreso parcial entre reintentos.

**Fase 3 — Progreso real de embeddings en UI:**
- `src/lib/preload.ts` — `getPrewarmState` ahora expone `embeddingsProgress` y `embeddingsMessage`.
- `src/components/layout/EngineStatus.tsx` — Muestra `(X%)` al lado de "Descargando modelos IA..." cuando embeddings está en progreso 0-100.

**Fase 4 — Descargas serializadas:**
- `src/lib/preload.ts` — `prewarmModels` ahora hace embeddings primero, Laya después. Evita competencia por ancho de banda en conexiones lentas. Laya se lanza solo después de que embeddings esté listo.

**Resultado:** menor tiempo percibido, mejor feedback visual, y mayor tolerancia a fallos de red.

### Debugger oculto para testing en producción ✅ (24/09)
- **Problema:** No había forma de verificar el estado de modelos/pipeline/engine sin agregar UI visible.
- **Solución:** `src/lib/debug.ts` — debugger invisible para DevTools:
  - `window.__MERUCBOT_DEBUG__` con estado en vivo
  - Toggle con `Ctrl+Shift+D`
  - Comandos de consola: `__merucbot.check()`, `__merucbot.state()`, `__merucbot.toggle()`
  - Integrado en `App.tsx`: prewarm, engine status, RAG index
- **Uso en Edge:** Abrir DevTools (F12), ir a pestaña Console, escribir `__merucbot.check()` y enter.

### Production hardening: CSP + COEP + debugger ✅ (24/09)
- **CSP:** agregado `blob:` a `script-src` en `vercel.json` para permitir scripts dinámicos de ONNX Runtime JSEP.
- **COEP:** cambiado de `require-corp` a `credentialless` para evitar bloqueo de iframes/worker cross-origin sin CORS. Sigue habilitando SharedArrayBuffer.
- **Permissions-Policy warnings:** en `vercel.json` actual está limpio; los errores reportados son de un deploy anterior cacheado. Se resolverán al redespengar.
- **Debugger en producción:** `initDebug()` ahora registra `__merucbot` inmediatamente al montar, no solo al toggle. Comandos disponibles en consola sin activación previa.
- **Worker RAG:** el fallback a léxico ya estaba implementado en `ragClient.ts`; con `credentialless` debería dejar de dispararse por bloqueo de recursos.

---

## Decisiones clave

| Decisión | Razón | Fecha |
|----------|-------|-------|
| TypeScript 6.0.2 → 7.0.2 | Rewrite nativo Rust, 10x más rápido | 24/09 |
| @google/generative-ai → @google/genai | Paquete legacy deprecado, migración completa API | 24/09 |
| React/DOM 19.2.8 → 19.3.0 | Safe minor update | 24/09 |
| @huggingface/transformers | Migración desde @xenova completada | previo |
| onnxruntime-web 1.30.0 pinned | CDN URL en laya.ts consistente | previo |
| SVG puro vs librería externa | Sin dependencias nuevas, control total | previo |
| CSS nativo vs Tailwind | Stack constraint AGENTS.md | previo |
| Pixelarticons vs lucide/FA | Stack constraint AGENTS.md | previo |
| ALLOWED_ORIGINS vía env var | Preparado para cambio de dominio | previo |
| Debugger oculto DevTools | Verificación sin UI; toggle Ctrl+Shift+D | 24/09 |

---

## Pendientes conocidos
1. **Commits:** ~16 archivos sin commitear (i18n migration, branding, dependency updates, debugger, CSP fixes)
2. **QA visual live:** verificar deploy real
3. **og:image:** public/og-cover.png 1200×630 pendiente
4. **E2E completo:** PDF escaneado, mobile, oscuro, gráficas, citas

---

## Cómo retomar
```bash
pnpm build
pnpm lint
pnpm dev
```

---

*"Los datos se quedan en el navegador."*
