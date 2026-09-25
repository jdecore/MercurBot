# AGENTS.md — MercurBot

> **LEER ANTES DE MODIFICAR EL PROYECTO.**

---

## 1. Qué es

**AI PDF Analyst.** El usuario carga un PDF, se vectoriza en el navegador, y pregunta lo que quiera con citas verificables `[Pág. N]`.

---

## 2. Stack

| Categoría | Tecnología |
|-----------|------------|
| Framework | React + TypeScript |
| Build | Vite |
| Package Manager | **pnpm** (nunca npm/yarn/bun) |
| Estilos | CSS nativo + CSS Modules |
| UI Primitives | Radix UI |
| Iconos | **Pixelarticons** (nunca lucide/Heroicons/FA) |
| PDF | pdfjs-dist |
| AI | Vercel AI SDK + Gemini API |
| Deploy | Vercel |

---

## 3. Prohibiciones (NO ROMPER)

1. **Sin Tailwind/UnoCSS/Windi** — CSS nativo
2. **Sin shadcn/ui** — Radix UI + CSS propio
3. **Sin lucide/Heroicons/FA** — solo Pixelarticons
4. **Sin backend tradicional** — frontend-first, solo 1 Vercel Function proxy
5. **Sin `VITE_*` secrets** — API keys en server env vars
6. **Sin npm/yarn/bun** — solo pnpm
7. **Sin dependencias nuevas sin justificar**

---

## 4. Privacidad

> **Los datos se quedan en el navegador.**

- Nunca subir el PDF completo a un servidor
- El LLM recibe solo Top 3 fragmentos RAG + contexto agregado
- Excepción: "Generar gráfica" envía texto completo (tope 250KB) bajo consentimiento explícito

---

## 5. Seguridad

- `GEMINI_API_KEY` solo en `api/chat/index.ts` (server)
- Nunca exponer en frontend, logs, o respuestas
- CSP en `vercel.json` con `connect-src` para huggingface/jsdelivr (embeddings + ONNX WASM CDN)
- Permissions-Policy hardened en `vercel.json`

---

## 6. Calidad (antes de marcar done)

```
[ ] tsc + vite build OK
[ ] Sin violaciones de stack
[ ] Sin VITE_ secrets
[ ] Solo 1 Vercel Function
[ ] Responsive OK
[ ] Error handling OK
```

---

## 6.1 Verificación oculta en producción

Toda feature crítica que afecte modelos, pipelines o integraciones externas debe incluir una vía de verificación **sin UI visible**.

- Implementar `src/shared/lib/debug.ts` con:
  - `window.__MERUCBOT_DEBUG__`
  - Toggle oculto: `Ctrl+Shift+D`
  - Comandos de consola: `__merucbot.check()`, `__merucbot.state()`, `__merucbot.toggle()`
- Integrar el debugger en `app/App.tsx` para reflejar:
  - Estado de prewarm (embeddings + Laya)
  - Estado del engine (`hybrid` / `lexical`)
  - Estado de indexación RAG
- Prohibido agregar badges, paneles o tooltips visibles para el usuario final con este fin.

---

## 6.2 Recomendación: revisión de versiones de dependencias

Se debe mantener awareness del estado de versiones del proyecto, pero sin actualizar ciegamente.

- Revisar periódicamente si las versiones actuales tienen vulnerabilidades conocidas o deprecaciones críticas.
- Antes de aplicar un update mayor, evaluar:
  - Si rompe el stack prohibido.
  - Si requiere migración de API.
  - Si el cambio es safe patch/minor.
- Documentar en `.agents/memory/memory.md` las decisiones de versionado y aprendizajes.
- Si un paquete queda deprecado (como ocurrió con `@google/generative-ai`), priorizar la migración al reemplazo oficial.

---

## 7. Memoria del Agente (`memory.md`)

`memory.md` es la **bitácora de estado y aprendizajes** del proyecto. Su propósito es que cualquier agente nuevo pueda entender el estado actual, el historial de decisiones, y los errores/éxitos pasados sin tener que reconstruir todo desde cero.

### Reglas de uso

1. **Al inicio de toda sesión:** leer `memory.md` completo. Es la fuente de verdad del estado del proyecto.
2. **Al terminar una tarea:** actualizar `memory.md` con una nueva entrada que incluya:
   - Qué se hizo
   - Por qué se hizo
   - Resultado (éxito/error/parcial)
   - Aprendizajes o decisiones clave para el futuro
3. **Si excede ~400 líneas:** resumir entradas antiguas (3-5 líneas por sesión), agregar nueva info
4. **Tono:** técnico, conciso, sin relleno. Otros agentes leerán esto para entender el proyecto.

### Estructura recomendada

```
# memory.md — Bitácora del Proyecto

> **Última actualización:** YYYY-MM-DD | Rama: main

---

## Estado actual (live)
- Fase X: [descripción corta]
- Bloqueos conocidos: [lista o "ninguno"]

## Qué se hizo en la última sesión
### [Fecha] — [Tarea corta] ✅/❌/⏸️
- Cambios clave
- Resultado
- Aprendizajes

## Decisiones clave (formato tabla)
| Decisión | Razón | Fecha |
|----------|-------|-------|
| ... | ... | ... |

## Pendientes conocidos
1. ...
2. ...

## Cómo retomar
```bash
pnpm build
pnpm lint
pnpm dev
```
```
