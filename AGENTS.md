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

## 6. Knowledge Layer: `.agents/`

Esta carpeta es la **fuente de verdad operativa** del proyecto. Cualquier agente que opere sobre este repo debe consumirla antes de decidir o implementar.

### 6.1 Estructura

```
.agents/
├── context/          # Decisiones estables (inmutables)
│   ├── designed.md   # Decisiones de arquitectura inmutables
│   ├── stack.md      # Stack elegido y por qué
│   ├── constraints.md # Restricciones hard del proyecto
│   └── glossary.md   # Terminología del dominio
├── skills/           # Skills específicas del proyecto
│   ├── rag.md        # Cómo funciona el pipeline RAG
│   ├── voice.md      # VoiceSession hook, barge-in, volume meter
│   ├── embeddings.md # Modelo embeddings, descarga, OPFS cache
│   ├── laya.md       # Clasificador ONNX, heuristic fallback
│   ├── deployment.md # Vercel deploy, CSP, COEP, permissions
│   └── debug.md      # Debugger oculto, __merucbot.check()
└── memory/
    └── memory.md     # Bitácora de estado y aprendizajes
```

### 6.2 Reglas de uso obligatorias

1. **Al inicio de toda sesión o tarea:** leer `.agents/memory/memory.md`. Es la fuente de verdad del estado actual.
2. **Antes de implementar una feature:** leer el `skill` correspondiente en `.agents/skills/` si existe.
3. **Antes de tomar una decisión de arquitectura/stack:** leer `.agents/context/`. Las decisiones ahí son inmutables.
4. **Al terminar una tarea:** actualizar `.agents/memory/memory.md` con una entrada nueva que incluya:
   - Qué se hizo
   - Por qué se hizo
   - Resultado (éxito/error/parcial)
   - Aprendizajes o decisiones clave para el futuro
5. **Si `memory.md` excede ~400 líneas:** resumir entradas antiguas (3–5 líneas por sesión), agregar nueva info.
6. **Tono:** técnico, conciso, sin relleno. Otros agentes leerán esto para entender el proyecto.

### 6.3 Cuándo leer cada archivo

| Archivo | Cuándo leerlo |
|---------|---------------|
| `memory/memory.md` | Siempre al inicio. Estado actual, pendientes, cómo retomar. |
| `context/designed.md` | Antes de cambios de arquitectura. Decisiones inmutables. |
| `context/stack.md` | Antes de agregar/quitar dependencias o cambiar frameworks. |
| `context/constraints.md` | Antes de implementar cualquier feature. Restricciones hard. |
| `context/glossary.md` | Cuando aparezcan términos de dominio desconocidos. |
| `skills/*.md` | Cuando vayas a tocar un área específica (RAG, voice, embeddings, laya, deployment, debug). |

### 6.4 Principio rector

> **Si un agente nuevo pregunta por algo que ya está resuelto en `.agents/`, la respuesta está ahí, no en la cabeza de nadie.**

---

## 7. Calidad (antes de marcar done)

```
[ ] tsc + vite build OK
[ ] Sin violaciones de stack
[ ] Sin VITE_ secrets
[ ] Solo 1 Vercel Function
[ ] Responsive OK
[ ] Error handling OK
```

---

## 7.1 Verificación oculta en producción

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

## 7.2 Recomendación: revisión de versiones de dependencias

Se debe mantener awareness del estado de versiones del proyecto, pero sin actualizar ciegamente.

- Revisar periódicamente si las versiones actuales tienen vulnerabilidades conocidas o deprecaciones críticas.
- Antes de aplicar un update mayor, evaluar:
  - Si rompe el stack prohibido.
  - Si requiere migración de API.
  - Si el cambio es safe patch/minor.
- Documentar en `.agents/memory/memory.md` las decisiones de versionado y aprendizajes.
- Si un paquete queda deprecado (como ocurrió con `@google/generative-ai`), priorizar la migración al reemplazo oficial.

---

## 8. Memoria del Agente (`.agents/memory/memory.md`)

`memory.md` es la **bitácora de estado y aprendizajes** del proyecto. Su propósito es que cualquier agente nuevo pueda entender el estado actual, el historial de decisiones, y los errores/éxitos pasados sin tener que reconstruir todo desde cero.

### Reglas de uso

1. **Al inicio de toda sesión:** leer `.agents/memory/memory.md` completo. Es la fuente de verdad del estado del proyecto.
2. **Al terminar una tarea:** actualizar `.agents/memory/memory.md` con una nueva entrada que incluya:
   - Qué se hizo
   - Por qué se hizo
   - Resultado (éxito/error/parcial)
   - Aprendizajes o decisiones clave para el futuro
3. **Si excede ~400 líneas:** resumir entradas antiguas (3–5 líneas por sesión), agregar nueva info
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
|----------|-------|------|
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

---

## 9. Skills específicas del proyecto (`.agents/skills/`)

Además de `memory.md`, existen skills reutilizables por dominio. Si tu tarea toca uno de estos temas, lee el skill antes de implementar:

| Skill | Cuándo usarlo |
|-------|---------------|
| `rag.md` | Vas a modificar el pipeline RAG, indexación, o recuperación de fragmentos |
| `voice.md` | Vas a tocar el hook `VoiceSession`, barge-in, o volume meter |
| `embeddings.md` | Vas a modificar el modelo de embeddings, descarga, o cache OPFS |
| `laya.md` | Vas a modificar el clasificador ONNX Laya o el heuristic fallback |
| `deployment.md` | Vas a modificar el deploy en Vercel, CSP, COEP, o permissions |
| `debug.md` | Vas a modificar el debugger oculto o los comandos de consola |

Si un skill no existe para tu área, crearlo en `.agents/skills/` siguiendo el formato de los demás.

---

## 10. Cómo retomar (comandos)

```bash
pnpm build
pnpm lint
pnpm dev
```
