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

---

## Pendientes conocidos
1. **Commits:** ~16 archivos sin commitear (i18n migration, branding, dependency updates)
2. **QA visual live:** verificar deploy real
3. **og:image:** public/og-cover.png 1200×630 pendiente
4. **E2E completo:** PDF escaneado, mobile, oscuro, gráficas, citas
5. **api/chat system prompt:** ya respeta locale (lang en request body)

---

## Cómo retomar
```bash
pnpm build
pnpm lint
pnpm dev
```

---

*"Los datos se quedan en el navegador."*
